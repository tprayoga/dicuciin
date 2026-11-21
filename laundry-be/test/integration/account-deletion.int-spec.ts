/**
 * Batch 6 — hapus akun mandiri (aplikasi & web) pada PostgreSQL nyata via
 * HTTP + JWT asli. WhatsApp tiruan.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import {
  AccountDeletionStatus,
  BookingStatus,
  LedgerDirection,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  UserRole,
  WalletType,
} from '@prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { JwtStrategy } from '../../src/modules/auth/jwt.strategy';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { OtpService } from '../../src/modules/auth/otp.service';
import { WhatsappService } from '../../src/modules/notifications/whatsapp.service';
import { AccountDeletionController } from '../../src/modules/account/account-deletion.controller';
import { AccountDeletionService, DELETED_NAME } from '../../src/modules/account/account-deletion.service';
import { createMachine, createOutlet, resetDb } from './helpers';

const ACCESS = 'acc-del-access';
const REFRESH = 'acc-del-refresh';
const PASSWORD = 'Rahasia123!';
const env: Record<string, string | undefined> = {};
const sent: { phone: string; message: string }[] = [];

describe('Batch 6 — hapus akun mandiri (PostgreSQL nyata)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({})],
      controllers: [AuthController, AccountDeletionController],
      providers: [
        PrismaService,
        JwtStrategy,
        AuthService,
        OtpService,
        AccountDeletionService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string, d?: any) =>
              env[k] ?? ({ JWT_ACCESS_SECRET: ACCESS, JWT_REFRESH_SECRET: REFRESH, BCRYPT_SALT_ROUNDS: '4' } as any)[k] ?? d,
          },
        },
        {
          provide: WhatsappService,
          useValue: {
            isConfigured: () => true,
            devFallbackAllowed: () => true,
            sendText: async (phone: string, message: string) => void sent.push({ phone, message }),
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    await app.listen(0, '127.0.0.1');
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
  });
  afterAll(() => app.close());

  beforeEach(async () => {
    await resetDb(prisma);
    for (const k of Object.keys(env)) delete env[k];
    env.ACCOUNT_DELETION_ENABLED = 'true';
    sent.length = 0;
  });

  const data = (r: any) => r.body?.data ?? r.body;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  let seq = 0;
  async function customer(opts: { balance?: number; phone?: string } = {}) {
    seq++;
    const phone = opts.phone ?? `0812${String(70000000 + seq)}`;
    const user = await prisma.user.create({
      data: {
        name: `Budi ${seq}`,
        email: `budi${seq}@uji.test`,
        phone: phone.replace(/^0/, '62'),
        role: UserRole.CUSTOMER,
        passwordHash: bcrypt.hashSync(PASSWORD, 4),
        avatarUrl: '/uploads/a.jpg',
        phoneVerifiedAt: new Date(),
        customer: {
          create: {
            memberCode: `MBR-${seq}-${Date.now()}`,
            gender: 'Laki-laki',
            occupation: 'Pekerja',
            birthDate: new Date('1995-05-05'),
            walletPinHash: 'pin-hash',
            wallet: { create: { balance: new Prisma.Decimal(opts.balance ?? 0), pointBalance: 40 } },
            addresses: {
              create: { label: 'Rumah', recipientName: 'Budi', phone, address: 'Jl. Melati 1', city: 'Bandung', province: 'Jabar' },
            },
          },
        },
      },
      include: { customer: { include: { wallet: true } } },
    });
    return { user, customer: user.customer!, wallet: user.customer!.wallet!, phone };
  }
  async function login(identifier: string, password = PASSWORD) {
    const r = await http().post('/auth/login').send({ identifier, password });
    return r;
  }
  async function session(c: { phone: string }) {
    const r = await login(c.phone);
    expect(r.status).toBe(201);
    return data(r) as { accessToken: string; refreshToken: string };
  }
  const del = (token: string, body: Record<string, unknown>) =>
    http().post('/account/deletion').set(bearer(token)).send(body);

  async function paidHistory(c: any) {
    const outlet = await createOutlet(prisma);
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}-${seq}`,
        outletId: outlet.id,
        customerId: c.customer.id,
        sourcePlatform: 'MOBILE_APP',
        status: OrderStatus.COMPLETED,
        totalAmount: new Prisma.Decimal(20000),
      },
    });
    await prisma.payment.create({
      data: { orderId: order.id, paymentNumber: `PAY-${order.orderNumber}`, paymentMethod: PaymentMethod.WALLET, amount: new Prisma.Decimal(20000), status: PaymentStatus.PAID, paidAt: new Date() },
    });
    await prisma.walletLedger.create({
      data: {
        walletId: c.wallet.id,
        walletType: WalletType.MAIN_BALANCE,
        direction: LedgerDirection.DEBIT,
        amount: new Prisma.Decimal(20000),
        balanceBefore: new Prisma.Decimal(20000),
        balanceAfter: new Prisma.Decimal(0),
        referenceType: 'PAYMENT',
        orderId: order.id,
      },
    });
    return { order, outlet };
  }

  it('pratinjau: penghalang & poin/bonus yang akan hangus', async () => {
    const c = await customer({ balance: 15000 });
    const s = await session(c);
    const r = await http().get('/account/deletion/preview').set(bearer(s.accessToken));
    expect(r.status).toBe(200);
    expect(data(r).canDeleteNow).toBe(false);
    expect(data(r).blockers).toEqual([expect.objectContaining({ code: 'WALLET_BALANCE', amount: 15000 })]);
    expect(data(r).forfeited.pointBalance).toBe(40);
  });

  it('re-autentikasi: tanpa ketik HAPUS → 400; kata sandi salah → 400 dan ikut penguncian login', async () => {
    const c = await customer();
    const s = await session(c);
    expect((await del(s.accessToken, { password: PASSWORD, confirm: 'hapus dong' })).status).toBe(400);
    expect((await del(s.accessToken, { password: 'salah-salah', confirm: 'HAPUS' })).status).toBe(400);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: c.user.id } });
    expect(after.deletedAt).toBeNull();
    expect(after.failedLoginAttempts).toBe(1);
  });

  it('tanpa penghalang → data pribadi dianonimkan, semua sesi dicabut, catatan keuangan tetap, audit tercatat', async () => {
    const c = await customer();
    const { order } = await paidHistory(c);
    const s1 = await session(c);
    const s2 = await session(c);
    const r = await del(s1.accessToken, { password: PASSWORD, confirm: 'HAPUS', reason: 'Tidak dipakai lagi' });
    expect(r.status).toBe(200);
    expect(data(r).status).toBe(AccountDeletionStatus.COMPLETED);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.user.id }, include: { customer: { include: { addresses: true } } } });
    expect(u).toEqual(
      expect.objectContaining({ name: DELETED_NAME, email: null, phone: null, avatarUrl: null, isActive: false }),
    );
    expect(u.deletedAt).toBeTruthy();
    expect(bcrypt.compareSync(PASSWORD, u.passwordHash)).toBe(false);
    expect(u.customer).toEqual(expect.objectContaining({ birthDate: null, gender: null, occupation: null, walletPinHash: null }));
    expect(u.customer!.addresses[0]).toEqual(expect.objectContaining({ recipientName: DELETED_NAME, phone: '-', address: '[dihapus]' }));

    // Sesi: access token kedua sesi langsung ditolak; refresh juga.
    expect((await http().get('/auth/me').set(bearer(s1.accessToken))).status).toBe(401);
    expect((await http().get('/auth/me').set(bearer(s2.accessToken))).status).toBe(401);
    expect((await http().post('/auth/refresh').send({ refreshToken: s2.refreshToken })).status).toBe(401);
    expect((await login(c.phone)).status).toBe(401);

    // Catatan keuangan utuh.
    expect(await prisma.order.count({ where: { id: order.id, customerId: c.customer.id } })).toBe(1);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.walletLedger.count({ where: { walletId: c.wallet.id } })).toBe(1);
    expect(await prisma.wallet.count({ where: { id: c.wallet.id } })).toBe(1);
    // Audit tanpa data pribadi.
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCOUNT_DELETED', entityId: c.user.id } });
    expect(JSON.stringify(audit.changes)).not.toMatch(/Budi|budi|0812|62812/);
    expect(await prisma.accountDeletionRequest.count({ where: { userId: c.user.id, status: AccountDeletionStatus.COMPLETED } })).toBe(1);
  });

  it('nomor yang dihapus bisa mendaftar lagi sebagai akun baru', async () => {
    const c = await customer();
    const s = await session(c);
    await del(s.accessToken, { password: PASSWORD, confirm: 'HAPUS' });
    const rq = await http().post('/auth/otp/request').send({ phone: c.phone, purpose: 'REGISTER' });
    expect(rq.status).toBe(201);
  });

  it.each([
    ['saldo', async (c: any) => prisma.wallet.update({ where: { id: c.wallet.id }, data: { balance: new Prisma.Decimal(5000) } }), 'WALLET_BALANCE'],
    ['order belum selesai', async (c: any) => {
      const o = await createOutlet(prisma);
      await prisma.order.create({ data: { orderNumber: `O-${Date.now()}`, outletId: o.id, customerId: c.customer.id, sourcePlatform: 'MOBILE_APP', status: OrderStatus.PAID } });
    }, 'ORDER_IN_PROGRESS'],
    ['order menunggu bayar', async (c: any) => {
      const o = await createOutlet(prisma);
      await prisma.order.create({ data: { orderNumber: `O-${Date.now()}`, outletId: o.id, customerId: c.customer.id, sourcePlatform: 'MOBILE_APP', status: OrderStatus.WAITING_PAYMENT } });
    }, 'ORDER_AWAITING_PAYMENT'],
    ['booking aktif', async (c: any) => {
      const o = await createOutlet(prisma);
      const m = await createMachine(prisma, o.id);
      await prisma.machineBooking.create({ data: { customerId: c.customer.id, deviceId: m.id, status: BookingStatus.RESERVED, bookingCode: `BK-${Date.now()}`, reservedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) } as any });
    }, 'ACTIVE_BOOKING'],
  ])('penghalang %s → PENDING_REVIEW, akun TETAP aktif & data utuh', async (_l, setup, code) => {
    const c = await customer();
    await setup(c);
    const s = await session(c);
    const r = await del(s.accessToken, { password: PASSWORD, confirm: 'HAPUS' });
    expect(r.status).toBe(200);
    expect(data(r).status).toBe(AccountDeletionStatus.PENDING_REVIEW);
    expect(data(r).blockers.map((b: any) => b.code)).toContain(code);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.user.id } });
    expect(u.isActive).toBe(true);
    expect(u.deletedAt).toBeNull();
    expect(u.phone).toBeTruthy();
    expect((await http().get('/auth/me').set(bearer(s.accessToken))).status).toBe(200);
    // Diajukan ulang → tetap satu permintaan terbuka.
    await del(s.accessToken, { password: PASSWORD, confirm: 'HAPUS' });
    expect(await prisma.accountDeletionRequest.count({ where: { userId: c.user.id, status: AccountDeletionStatus.PENDING_REVIEW } })).toBe(1);
  });

  it('admin: selesaikan permintaan hanya setelah penghalang tuntas; bukan admin → 403', async () => {
    const c = await customer({ balance: 5000 });
    const s = await session(c);
    const req = data(await del(s.accessToken, { password: PASSWORD, confirm: 'HAPUS' }));
    const owner = await prisma.user.create({ data: { name: 'Owner', email: 'o@uji.test', role: UserRole.OWNER, passwordHash: bcrypt.hashSync(PASSWORD, 4) } });
    const ownerToken = data(await login('o@uji.test')).accessToken;

    expect((await http().get('/account/admin/deletion-requests').set(bearer(s.accessToken))).status).toBe(403);
    const list = await http().get('/account/admin/deletion-requests?status=PENDING_REVIEW').set(bearer(ownerToken));
    expect(data(list)).toHaveLength(1);

    const early = await http().post(`/account/admin/deletion-requests/${req.requestId}/complete`).set(bearer(ownerToken)).send({});
    expect(early.status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: c.user.id } })).deletedAt).toBeNull();

    // Saldo dikembalikan lewat jalur resmi (di luar test ini) → saldo 0.
    await prisma.wallet.update({ where: { id: c.wallet.id }, data: { balance: new Prisma.Decimal(0) } });
    const done = await http().post(`/account/admin/deletion-requests/${req.requestId}/complete`).set(bearer(ownerToken)).send({ note: 'Saldo dikembalikan via transfer' });
    expect(done.status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.user.id } });
    expect(u.deletedAt).toBeTruthy();
    expect(u.phone).toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCOUNT_DELETED', entityId: c.user.id } });
    expect(audit.userId).toBe(owner.id);
    expect((await http().post(`/account/admin/deletion-requests/${req.requestId}/complete`).set(bearer(ownerToken)).send({})).status).toBe(409);
  });

  it('akun staf tidak bisa menghapus diri sendiri dari aplikasi', async () => {
    await prisma.user.create({ data: { name: 'Kasir', email: 'k@uji.test', role: UserRole.CASHIER, passwordHash: bcrypt.hashSync(PASSWORD, 4) } });
    const t = data(await login('k@uji.test')).accessToken;
    expect((await del(t, { password: PASSWORD, confirm: 'HAPUS' })).status).toBe(403);
  });

  it('jalur WEB: OTP WhatsApp → token → akun dihapus; token salah/nomor lain ditolak', async () => {
    const c = await customer();
    const other = await customer();
    const rq = await http().post('/auth/otp/request').send({ phone: c.phone, purpose: 'ACCOUNT_DELETION' });
    expect(rq.status).toBe(201);
    const code = sent[sent.length - 1].message.match(/(\d{4})/)![1];
    const rv = await http().post('/auth/otp/verify').send({ phone: c.phone, code, purpose: 'ACCOUNT_DELETION' });
    const token = data(rv).verificationToken;

    // Token REGISTER / nomor lain tidak berlaku.
    expect((await http().post('/account/deletion/web').send({ phone: other.phone, verificationToken: token, confirm: 'HAPUS' })).status).toBe(400);
    expect((await http().post('/account/deletion/web').send({ phone: c.phone, verificationToken: 'palsu', confirm: 'HAPUS' })).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.user.id } })).deletedAt).toBeNull();

    const r = await http().post('/account/deletion/web').send({ phone: c.phone, verificationToken: token, confirm: 'HAPUS', reason: 'web' });
    expect(r.status).toBe(200);
    expect(data(r).status).toBe(AccountDeletionStatus.COMPLETED);
    expect((await prisma.accountDeletionRequest.findFirstOrThrow({ where: { userId: c.user.id } })).channel).toBe('WEB');
    // Token dipakai lagi → akun sudah tidak ada.
    expect((await http().post('/account/deletion/web').send({ phone: c.phone, verificationToken: token, confirm: 'HAPUS' })).status).toBe(400);
    // OTP hapus akun untuk nomor tak terdaftar → 404.
    expect((await http().post('/auth/otp/request').send({ phone: '081299990000', purpose: 'ACCOUNT_DELETION' })).status).toBe(404);
  });

  it('5 permintaan hapus PARALEL → tepat satu penghapusan & satu audit', async () => {
    const c = await customer();
    const s = await session(c);
    const rs = await Promise.all(Array.from({ length: 5 }, () => del(s.accessToken, { password: PASSWORD, confirm: 'HAPUS' })));
    const ok = rs.filter((r) => r.status === 200 && data(r).status === AccountDeletionStatus.COMPLETED);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(await prisma.auditLog.count({ where: { action: 'ACCOUNT_DELETED', entityId: c.user.id } })).toBe(1);
    expect(await prisma.accountDeletionRequest.count({ where: { userId: c.user.id, status: AccountDeletionStatus.COMPLETED } })).toBe(1);
  });

  it.each([['false'], [undefined]])('fitur belum diaktifkan owner (ACCOUNT_DELETION_ENABLED=%s) → 403 dengan arahan ke layanan pelanggan', async (value) => {
    env.ACCOUNT_DELETION_ENABLED = value;
    const c = await customer();
    const s = await session(c);
    const r = await del(s.accessToken, { password: PASSWORD, confirm: 'HAPUS' });
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/layanan pelanggan/);
  });
});
