/**
 * SECURITY HOTFIX — regresi eskalasi hak akses akun (PostgreSQL nyata, skema
 * production, HTTP + JWT asli).
 *
 *  V1: POST /auth/register publik menerima `role` apa pun; selain CUSTOMER
 *      verifikasi OTP dilewati → siapa pun bisa membuat SUPER_ADMIN.
 *  V2: PATCH /users/:id tanpa @Roles → user mana pun (termasuk pelanggan)
 *      bisa mengubah role/password/isActive user mana pun.
 *  V3: GET /users/:id tanpa @Roles → data user lain terbaca.
 *  V4: OWNER bisa membuat/mengubah SUPER_ADMIN.
 */
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { ACCESS_SECRET, Harness, body, createHarness, resetDb } from './harness';

const PASSWORD = 'Rahasia123!';
const PRIVILEGED = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.ADMIN_OUTLET,
  UserRole.CASHIER,
  UserRole.OPERATOR,
  UserRole.TECHNICIAN,
];

describe('SECURITY HOTFIX — eskalasi hak akses akun (skema production)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.app.close());
  beforeEach(async () => {
    await resetDb(h.prisma);
    h.sentOtp.length = 0;
  });

  const userCount = () => h.prisma.user.count();
  const nonCustomerCount = () => h.prisma.user.count({ where: { role: { not: UserRole.CUSTOMER } } });

  async function makeUser(role: UserRole, extra: { phone?: string } = {}) {
    return h.prisma.user.create({
      data: {
        name: `U ${role}`,
        email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@uji.test`,
        phone: extra.phone,
        role,
        passwordHash: bcrypt.hashSync(PASSWORD, 4),
      },
    });
  }
  const tokenFor = (u: { id: string; email: string | null; role: UserRole }) =>
    h.jwt.sign({ sub: u.id, email: u.email, role: u.role }, { secret: ACCESS_SECRET, expiresIn: '15m' });
  const auth = (u: any) => ({ Authorization: `Bearer ${tokenFor(u)}` });

  async function verificationToken(phone: string) {
    const rq = await h.http().post('/auth/otp/request').send({ phone, purpose: 'REGISTER' });
    expect(rq.status).toBe(201);
    const code = h.sentOtp[h.sentOtp.length - 1].message.match(/(\d{4})/)![1];
    const rv = await h.http().post('/auth/otp/verify').send({ phone, code, purpose: 'REGISTER' });
    expect(rv.status).toBe(201);
    return body(rv).verificationToken as string;
  }

  // ===================================================================== V1
  describe('V1 — registrasi publik', () => {
    it.each(PRIVILEGED)('role %s TANPA OTP (cukup email) → 403, tidak ada user dibuat', async (role) => {
      const r = await h.http().post('/auth/register').send({
        name: 'Penyusup',
        email: 'evil@uji.test',
        password: PASSWORD,
        role,
      });
      expect(r.status).toBe(403);
      expect(await userCount()).toBe(0);
    });

    it.each(PRIVILEGED)('role %s DENGAN token OTP sah tetap 403 (OTP tidak membuka role istimewa)', async (role) => {
      const token = await verificationToken('081200000001');
      const r = await h.http().post('/auth/register').send({
        name: 'Penyusup',
        phone: '081200000001',
        password: PASSWORD,
        role,
        verificationToken: token,
      });
      expect(r.status).toBe(403);
      expect(await userCount()).toBe(0);
    });

    it.each([
      ['null', null],
      ['huruf kecil', 'super_admin'],
      ['array', [UserRole.SUPER_ADMIN]],
      ['objek', { role: UserRole.SUPER_ADMIN }],
      ['angka', 0],
      ['spasi', ' SUPER_ADMIN'],
    ])('nilai role tak terduga (%s) → ditolak (400/403), tidak ada user dibuat', async (_label, role) => {
      const r = await h.http().post('/auth/register').send({
        name: 'Penyusup',
        email: 'evil@uji.test',
        password: PASSWORD,
        role,
      });
      expect([400, 403]).toContain(r.status);
      expect(await userCount()).toBe(0);
    });

    it.each([
      ['isActive', { isActive: true }],
      ['passwordHash', { passwordHash: 'x' }],
      ['phoneVerifiedAt', { phoneVerifiedAt: new Date().toISOString() }],
      ['outletId', { outletId: 'x' }],
    ])('field tambahan %s → 400 (forbidNonWhitelisted), tidak ada user dibuat', async (_l, extra) => {
      const r = await h.http().post('/auth/register').send({
        name: 'Penyusup',
        email: 'evil@uji.test',
        password: PASSWORD,
        ...extra,
      });
      expect(r.status).toBe(400);
      expect(await userCount()).toBe(0);
    });

    it('CUSTOMER: tanpa nomor HP / tanpa token / token nomor lain → ditolak', async () => {
      expect(
        (await h.http().post('/auth/register').send({ name: 'A', email: 'a@uji.test', password: PASSWORD })).status,
      ).toBe(400);
      expect(
        (await h.http().post('/auth/register').send({ name: 'A', phone: '081200000002', password: PASSWORD })).status,
      ).toBe(400);
      const other = await verificationToken('081200000003');
      const r = await h.http().post('/auth/register').send({
        name: 'A',
        phone: '081200000002',
        password: PASSWORD,
        verificationToken: other,
      });
      expect(r.status).toBe(400);
      const forged = h.jwt.sign(
        { phone: '081200000002', purpose: 'REGISTER', scope: 'otp_verified' },
        { secret: ACCESS_SECRET },
      );
      const r2 = await h.http().post('/auth/register').send({
        name: 'A',
        phone: '081200000002',
        password: PASSWORD,
        verificationToken: forged,
      });
      expect(r2.status).toBe(400);
      expect(await userCount()).toBe(0);
    });

    it('kompatibel app: CUSTOMER dengan OTP sah (role dikirim CUSTOMER atau tidak dikirim) → 201, role CUSTOMER + customer + wallet', async () => {
      const t1 = await verificationToken('081200000004');
      const r1 = await h.http().post('/auth/register').send({
        name: 'Pelanggan Satu',
        phone: '081200000004',
        password: PASSWORD,
        verificationToken: t1,
      });
      expect(r1.status).toBe(201);
      expect(body(r1).user.role).toBe(UserRole.CUSTOMER);
      expect(body(r1).user.passwordHash).toBeUndefined();

      const t2 = await verificationToken('081200000005');
      const r2 = await h.http().post('/auth/register').send({
        name: 'Pelanggan Dua',
        phone: '081200000005',
        password: PASSWORD,
        role: UserRole.CUSTOMER,
        verificationToken: t2,
      });
      expect(r2.status).toBe(201);

      expect(await nonCustomerCount()).toBe(0);
      expect(await h.prisma.customer.count()).toBe(2);
      expect(await h.prisma.wallet.count()).toBe(2);
      // Catatan: login pada detik yang sama dengan register menghasilkan JWT
      // identik → bentrok tokenHash (500). Bug lama production (bukan bagian
      // hotfix ini; diperbaiki di Batch 5 dengan jti acak) → beri jeda >1 dtk.
      await new Promise((r) => setTimeout(r, 1100));
      const login = await h.http().post('/auth/login').send({ identifier: '081200000004', password: PASSWORD });
      expect(login.status).toBe(201);
      expect(h.jwt.decode(body(login).accessToken)!['role']).toBe(UserRole.CUSTOMER);
    });

    it('20 percobaan registrasi role istimewa PARALEL → semua 403, tidak ada akun', async () => {
      const rs = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          h.http().post('/auth/register').send({
            name: 'Penyusup',
            email: `evil${i}@uji.test`,
            password: PASSWORD,
            role: PRIVILEGED[i % PRIVILEGED.length],
          }),
        ),
      );
      expect(rs.every((r) => r.status === 403)).toBe(true);
      expect(await userCount()).toBe(0);
    });
  });

  // ===================================================================== V2
  describe('V2 — PATCH /users/:id', () => {
    it('pelanggan menaikkan role DIRINYA → 403, role di DB tetap CUSTOMER', async () => {
      const c = await makeUser(UserRole.CUSTOMER);
      for (const role of PRIVILEGED) {
        const r = await h.http().patch(`/users/${c.id}`).set(auth(c)).send({ role });
        expect(r.status).toBe(403);
      }
      expect((await h.prisma.user.findUniqueOrThrow({ where: { id: c.id } })).role).toBe(UserRole.CUSTOMER);
    });

    it('pelanggan mengubah password / isActive / outlet dirinya → 403', async () => {
      const c = await makeUser(UserRole.CUSTOMER);
      for (const payload of [{ password: 'PasswordBaru1' }, { isActive: false }, { outletId: 'x' }, { shiftName: 'pagi' }]) {
        expect((await h.http().patch(`/users/${c.id}`).set(auth(c)).send(payload)).status).toBe(403);
      }
    });

    it('pelanggan/staf mengubah user LAIN (ambil alih akun admin) → 403, password admin tidak berubah', async () => {
      const admin = await makeUser(UserRole.SUPER_ADMIN);
      for (const role of [UserRole.CUSTOMER, UserRole.CASHIER, UserRole.OPERATOR, UserRole.TECHNICIAN, UserRole.ADMIN_OUTLET]) {
        const actor = await makeUser(role);
        for (const payload of [{ password: 'Diambil1234' }, { name: 'X' }, { isActive: false }, { email: 'x@uji.test' }]) {
          const r = await h.http().patch(`/users/${admin.id}`).set(auth(actor)).send(payload);
          expect(r.status).toBe(403);
        }
      }
      const after = await h.prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
      expect(bcrypt.compareSync(PASSWORD, after.passwordHash)).toBe(true);
      expect(after.isActive).toBe(true);
    });

    it('kompatibel app lama: pelanggan mengubah nama/email DIRINYA dengan payload {name, email, phone sama} → 200', async () => {
      const c = await makeUser(UserRole.CUSTOMER, { phone: '081211112222' });
      const r = await h.http().patch(`/users/${c.id}`).set(auth(c)).send({
        name: 'Nama Baru',
        email: 'baru@uji.test',
        phone: '081211112222',
      });
      expect(r.status).toBe(200);
      const after = await h.prisma.user.findUniqueOrThrow({ where: { id: c.id } });
      expect(after.name).toBe('Nama Baru');
      expect(after.email).toBe('baru@uji.test');
      expect(after.role).toBe(UserRole.CUSTOMER);

      // email null (app mengirim null bila kosong) → email lama dipertahankan.
      const r2 = await h.http().patch(`/users/${c.id}`).set(auth(c)).send({ name: 'Nama Lagi', email: null, phone: '081211112222' });
      expect(r2.status).toBe(200);
      expect((await h.prisma.user.findUniqueOrThrow({ where: { id: c.id } })).email).toBe('baru@uji.test');

      const r3 = await h.http().patch(`/users/${c.id}`).set(auth(c)).send({ name: 'X Y', phone: '089999999999' });
      expect(r3.status).toBe(400);
    });

    it('OWNER tidak bisa mengubah akun SUPER_ADMIN, memberi role SUPER_ADMIN, atau membuat SUPER_ADMIN', async () => {
      const owner = await makeUser(UserRole.OWNER);
      const superAdmin = await makeUser(UserRole.SUPER_ADMIN);
      const cashier = await makeUser(UserRole.CASHIER);
      expect((await h.http().patch(`/users/${superAdmin.id}`).set(auth(owner)).send({ password: 'Diambil1234' })).status).toBe(403);
      expect((await h.http().patch(`/users/${cashier.id}`).set(auth(owner)).send({ role: UserRole.SUPER_ADMIN })).status).toBe(403);
      expect((await h.http().patch(`/users/${owner.id}`).set(auth(owner)).send({ role: UserRole.SUPER_ADMIN })).status).toBe(403);
      const create = await h.http().post('/users').set(auth(owner)).send({
        name: 'SA Baru',
        email: 'sa@uji.test',
        password: PASSWORD,
        role: UserRole.SUPER_ADMIN,
      });
      expect(create.status).toBe(403);
      expect(await h.prisma.user.count({ where: { role: UserRole.SUPER_ADMIN } })).toBe(1);
    });

    it('fungsi admin tetap berjalan: OWNER mengelola kasir; SUPER_ADMIN mengelola siapa pun', async () => {
      const owner = await makeUser(UserRole.OWNER);
      const sa = await makeUser(UserRole.SUPER_ADMIN);
      const cashier = await makeUser(UserRole.CASHIER);
      expect((await h.http().patch(`/users/${cashier.id}`).set(auth(owner)).send({ name: 'Kasir A', role: UserRole.OPERATOR })).status).toBe(200);
      expect((await h.http().patch(`/users/${owner.id}`).set(auth(sa)).send({ isActive: true })).status).toBe(200);
      const created = await h.http().post('/users').set(auth(owner)).send({
        name: 'Kasir Baru',
        email: 'kasir@uji.test',
        password: PASSWORD,
        role: UserRole.CASHIER,
      });
      expect(created.status).toBe(201);
      expect((await h.http().post('/users').set(auth(sa)).send({ name: 'SA2', email: 'sa2@uji.test', password: PASSWORD, role: UserRole.SUPER_ADMIN })).status).toBe(201);
    });

    it('POST /users oleh pelanggan/staf → 403', async () => {
      for (const role of [UserRole.CUSTOMER, UserRole.CASHIER, UserRole.ADMIN_OUTLET]) {
        const actor = await makeUser(role);
        const r = await h.http().post('/users').set(auth(actor)).send({
          name: 'X',
          email: `x-${role}@uji.test`,
          password: PASSWORD,
          role: UserRole.SUPER_ADMIN,
        });
        expect(r.status).toBe(403);
      }
    });
  });

  // ===================================================================== V3
  describe('V3 — GET /users/:id', () => {
    it('pelanggan membaca user lain → 403; diri sendiri → 200; admin → 200', async () => {
      const a = await makeUser(UserRole.CUSTOMER);
      const b = await makeUser(UserRole.CUSTOMER);
      const owner = await makeUser(UserRole.OWNER);
      expect((await h.http().get(`/users/${b.id}`).set(auth(a))).status).toBe(403);
      expect((await h.http().get(`/users/${owner.id}`).set(auth(a))).status).toBe(403);
      expect((await h.http().get(`/users/${a.id}`).set(auth(a))).status).toBe(200);
      expect((await h.http().get(`/users/${b.id}`).set(auth(owner))).status).toBe(200);
    });
  });
});
