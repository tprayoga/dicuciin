/**
 * SECURITY HOTFIX (commit 2, opsional) — otorisasi keuangan & mesin pada
 * PostgreSQL nyata dengan skema production.
 *
 *  K1/K9: pelanggan menambah saldo sendiri tanpa pembayaran.
 *  K3:    pelanggan me-refund order sendiri ke saldo.
 *  K4:    nominal bayar-saldo dari klien (order lunas dengan Rp0).
 *  K6:    pelanggan membaca/memakai dompet pelanggan lain.
 *  K10:   pelanggan mengirim perintah ke mesin.
 */
import * as bcrypt from 'bcrypt';
import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import { ACCESS_SECRET, Harness, body, createHarness, resetDb } from './harness';

describe('SECURITY HOTFIX — otorisasi keuangan & mesin (skema production)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.app.close());
  beforeEach(async () => {
    await resetDb(h.prisma);
    jest.clearAllMocks();
  });

  const short = () => Math.random().toString(36).slice(2, 8);
  async function makeUser(role: UserRole) {
    return h.prisma.user.create({
      data: { name: role, email: `${short()}@uji.test`, role, passwordHash: bcrypt.hashSync('x', 4) },
    });
  }
  async function makeCustomer(balance = 50000) {
    const user = await makeUser(UserRole.CUSTOMER);
    const customer = await h.prisma.customer.create({
      data: { userId: user.id, memberCode: `MBR-${short()}`, wallet: { create: { balance: new Prisma.Decimal(balance) } } },
      include: { wallet: true },
    });
    return { user, customer };
  }
  async function makeOrder(customerId: string, total = 20000) {
    const outlet = await h.prisma.outlet.create({
      data: { name: `O ${short()}`, code: `O-${short()}`, address: 'Jl', phone: '0800' },
    });
    return h.prisma.order.create({
      data: {
        orderNumber: `ORD-${short()}`,
        outletId: outlet.id,
        customerId,
        sourcePlatform: 'MOBILE_APP',
        status: OrderStatus.WAITING_PAYMENT,
        subtotal: new Prisma.Decimal(total),
        totalAmount: new Prisma.Decimal(total),
      },
    });
  }
  const auth = (u: { id: string; email: string | null; role: UserRole }) => ({
    Authorization: `Bearer ${h.jwt.sign({ sub: u.id, email: u.email, role: u.role }, { secret: ACCESS_SECRET, expiresIn: '15m' })}`,
  });
  const balance = async (customerId: string) =>
    Number((await h.prisma.wallet.findUniqueOrThrow({ where: { customerId } })).balance);

  it('K1: pelanggan top-up saldo SENDIRI tanpa bayar → 403, saldo tetap', async () => {
    const c = await makeCustomer(0);
    const r = await h.http().post(`/wallets/customer/${c.customer.id}/topup`).set(auth(c.user)).send({ amount: 1_000_000 });
    expect(r.status).toBe(403);
    expect(await balance(c.customer.id)).toBe(0);
  });

  it('K9: pelanggan /transactions/topup → 403; admin tetap bisa (top-up manual)', async () => {
    const c = await makeCustomer(0);
    const r = await h.http().post('/transactions/topup').set(auth(c.user)).send({ customerId: c.customer.id, amount: 1_000_000 });
    expect(r.status).toBe(403);
    expect(h.mocks.transactions.topUp).not.toHaveBeenCalled();
    const owner = await makeUser(UserRole.OWNER);
    const ok = await h.http().post('/transactions/topup').set(auth(owner)).send({ customerId: c.customer.id, amount: 10000 });
    expect(ok.status).toBe(201);
  });

  it('K1: admin tetap bisa top-up manual lewat /wallets', async () => {
    const c = await makeCustomer(0);
    const owner = await makeUser(UserRole.OWNER);
    const r = await h.http().post(`/wallets/customer/${c.customer.id}/topup`).set(auth(owner)).send({ amount: 10000 });
    expect(r.status).toBe(201);
    expect(await balance(c.customer.id)).toBe(10000);
  });

  it('K3: pelanggan me-refund order sendiri ke saldo → 403', async () => {
    const c = await makeCustomer(0);
    const o = await makeOrder(c.customer.id);
    const r = await h.http().post(`/wallets/customer/${c.customer.id}/refund`).set(auth(c.user)).send({ orderId: o.id, description: 'x' });
    expect(r.status).toBe(403);
    expect(await balance(c.customer.id)).toBe(0);
  });

  it('K6: pelanggan membaca dompet & riwayat pelanggan lain → 403; miliknya sendiri → 200; kasir → 200', async () => {
    const a = await makeCustomer();
    const b = await makeCustomer();
    const cashier = await makeUser(UserRole.CASHIER);
    expect((await h.http().get(`/wallets/customer/${b.customer.id}`).set(auth(a.user))).status).toBe(403);
    expect((await h.http().get(`/wallets/customer/${b.customer.id}/transactions`).set(auth(a.user))).status).toBe(403);
    expect((await h.http().get(`/wallets/customer/${a.customer.id}`).set(auth(a.user))).status).toBe(200);
    expect((await h.http().get(`/wallets/customer/${a.customer.id}/transactions`).set(auth(a.user))).status).toBe(200);
    expect((await h.http().get(`/wallets/customer/${b.customer.id}`).set(auth(cashier))).status).toBe(200);
  });

  it('K6: pelanggan membayar dengan SALDO pelanggan lain → 403, saldo korban utuh', async () => {
    const attacker = await makeCustomer(0);
    const victim = await makeCustomer(50000);
    const o = await makeOrder(attacker.customer.id);
    const r = await h.http().post(`/wallets/customer/${victim.customer.id}/pay`).set(auth(attacker.user)).send({ orderId: o.id, amount: 20000 });
    expect(r.status).toBe(403);
    expect(await balance(victim.customer.id)).toBe(50000);
  });

  it('K4: nominal dari klien diabaikan — "bayar Rp0" memotong total order dari server', async () => {
    const c = await makeCustomer(50000);
    const o = await makeOrder(c.customer.id, 20000);
    const r = await h.http().post(`/wallets/customer/${c.customer.id}/pay`).set(auth(c.user)).send({ orderId: o.id, amount: 0 });
    expect(r.status).toBe(201);
    expect(await balance(c.customer.id)).toBe(30000);
    expect((await h.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(OrderStatus.PAID);
    expect(body(r).order.status).toBe(OrderStatus.PAID);
  });

  it('K4: saldo kurang dari total order → ditolak walau klien mengirim nominal kecil', async () => {
    const c = await makeCustomer(1000);
    const o = await makeOrder(c.customer.id, 20000);
    const r = await h.http().post(`/wallets/customer/${c.customer.id}/pay`).set(auth(c.user)).send({ orderId: o.id, amount: 1 });
    expect(r.status).toBe(400);
    expect(await balance(c.customer.id)).toBe(1000);
    expect((await h.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(OrderStatus.WAITING_PAYMENT);
  });

  it('K4: order dibatalkan tidak bisa dibayar saldo', async () => {
    const c = await makeCustomer(50000);
    const o = await makeOrder(c.customer.id, 20000);
    await h.prisma.order.update({ where: { id: o.id }, data: { status: OrderStatus.CANCELLED } });
    const r = await h.http().post(`/wallets/customer/${c.customer.id}/pay`).set(auth(c.user)).send({ orderId: o.id, amount: 20000 });
    expect(r.status).toBe(409);
    expect(await balance(c.customer.id)).toBe(50000);
  });

  it('K4: 6 pembayaran saldo PARALEL untuk order yang sama → tepat satu debit', async () => {
    const c = await makeCustomer(100000);
    const o = await makeOrder(c.customer.id, 20000);
    const rs = await Promise.all(
      Array.from({ length: 6 }, () =>
        h.http().post(`/wallets/customer/${c.customer.id}/pay`).set(auth(c.user)).send({ orderId: o.id, amount: 20000 }),
      ),
    );
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await balance(c.customer.id)).toBe(80000);
  });

  it('K10: pelanggan mengirim perintah / heartbeat ke mesin → 403; teknisi → diteruskan', async () => {
    const c = await makeCustomer();
    expect((await h.http().post('/iot/devices/dev-1/commands').set(auth(c.user)).send({ command: 'START' })).status).toBe(403);
    expect((await h.http().post('/iot/devices/dev-1/heartbeat').set(auth(c.user)).send({})).status).toBe(403);
    expect(h.mocks.iot.sendCommand).not.toHaveBeenCalled();
    const tech = await makeUser(UserRole.TECHNICIAN);
    expect((await h.http().post('/iot/devices/dev-1/commands').set(auth(tech)).send({ command: 'START' })).status).toBe(201);
    expect(h.mocks.iot.sendCommand).toHaveBeenCalledTimes(1);
  });
});
