/**
 * Skrip audit baca-saja: menemukan jejak eksploitasi & TIDAK mengubah data
 * (PostgreSQL nyata, skema production).
 */
import { DeviceType, LedgerDirection, OrderStatus, PaymentMethod, PaymentStatus, Prisma, PrismaClient, UserRole, WalletType } from '@prisma/client';
import { buildAudit } from '../../scripts/audit-privileged-accounts';
import { resetDb } from './harness';

describe('SECURITY HOTFIX — skrip audit akun (baca-saja)', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());
  beforeEach(() => resetDb(prisma));

  const short = () => Math.random().toString(36).slice(2, 8);

  async function snapshotCounts() {
    const tables = ['users', 'customers', 'wallets', 'wallet_ledgers', 'payments', 'orders', 'order_status_logs', 'iot_commands', 'refresh_tokens', 'outlet_users'];
    const out: Record<string, number> = {};
    for (const t of tables) {
      const [r] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "${t}"`);
      out[t] = Number(r.n);
    }
    const [h] = await prisma.$queryRawUnsafe<{ h: string }[]>(
      `SELECT md5(string_agg(id || role::text || "isActive"::text || coalesce(email,''), ',' ORDER BY id)) AS h FROM users`,
    );
    out.usersHash = h.h as any;
    return out;
  }

  it('menandai akun dan jejak eksploitasi; data tidak berubah', async () => {
    const outlet = await prisma.outlet.create({ data: { name: 'O', code: 'OUT-1', address: 'Jl', phone: '0800' } });

    // Akun sah: SUPER_ADMIN & kasir dengan outlet.
    await prisma.user.create({ data: { name: 'SA', email: 'sa@uji.test', role: UserRole.SUPER_ADMIN, passwordHash: 'x' } });
    await prisma.user.create({
      data: { name: 'Kasir', email: 'k@uji.test', role: UserRole.CASHIER, passwordHash: 'x', outletUsers: { create: { outletId: outlet.id } } },
    });
    // V1: SUPER_ADMIN lewat registrasi publik (tanpa outlet, tanpa profil).
    await prisma.user.create({ data: { name: 'Evil1', email: 'evil1@uji.test', role: UserRole.OWNER, passwordHash: 'x' } });
    // V2: pelanggan menaikkan role sendiri (masih punya profil customer + nomor OTP).
    const escalated = await prisma.user.create({
      data: { name: 'Evil2', phone: '081200000009', phoneVerifiedAt: new Date(), role: UserRole.SUPER_ADMIN, passwordHash: 'x' },
    });
    await prisma.customer.create({ data: { userId: escalated.id, memberCode: 'MBR-EVIL' } });
    // Staf tanpa outlet.
    await prisma.user.create({ data: { name: 'Op', email: 'op@uji.test', role: UserRole.OPERATOR, passwordHash: 'x' } });

    // K1: pelanggan dengan kredit TOPUP.
    const cu = await prisma.user.create({ data: { name: 'C', email: 'c@uji.test', role: UserRole.CUSTOMER, passwordHash: 'x' } });
    const cust = await prisma.customer.create({
      data: { userId: cu.id, memberCode: 'MBR-1', wallet: { create: { balance: new Prisma.Decimal(1_000_000) } } },
      include: { wallet: true },
    });
    await prisma.walletLedger.create({
      data: {
        walletId: cust.wallet!.id,
        walletType: WalletType.MAIN_BALANCE,
        direction: LedgerDirection.CREDIT,
        amount: new Prisma.Decimal(1_000_000),
        balanceBefore: new Prisma.Decimal(0),
        balanceAfter: new Prisma.Decimal(1_000_000),
        referenceType: 'TOPUP',
      },
    });
    // K4: bayar saldo Rp0 untuk order Rp20.000. K3: refund dicatat pelanggan.
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${short()}`,
        outletId: outlet.id,
        customerId: cust.id,
        sourcePlatform: 'MOBILE_APP',
        status: OrderStatus.REFUNDED,
        totalAmount: new Prisma.Decimal(20000),
      },
    });
    await prisma.payment.create({
      data: { orderId: order.id, paymentNumber: `PAY-${short()}`, paymentMethod: PaymentMethod.WALLET, amount: new Prisma.Decimal(0), status: PaymentStatus.PAID, paidAt: new Date() },
    });
    await prisma.orderStatusLog.create({ data: { orderId: order.id, status: OrderStatus.REFUNDED, createdBy: cu.id } });
    // K10: perintah mesin manual.
    const dev = await prisma.iotDevice.create({
      data: { outletId: outlet.id, deviceCode: 'W-1', deviceType: Object.values(DeviceType)[0], name: 'Mesin 1' },
    });
    await prisma.iotCommand.create({ data: { deviceId: dev.id, command: 'START' } });

    const before = await snapshotCounts();
    const report = await buildAudit(prisma);
    const after = await snapshotCounts();
    expect(after).toEqual(before);

    const byEmailOrName = (k: string) => report.privilegedAccounts.find((a) => a.email === k || a.name === k)!;
    expect(byEmailOrName('Evil2').severity).toBe('HIGH');
    expect(byEmailOrName('Evil2').flags).toEqual(expect.arrayContaining(['HAS_CUSTOMER_PROFILE', 'PHONE_VERIFIED_VIA_OTP', 'TOP_PRIVILEGE']));
    expect(byEmailOrName('evil1@uji.test').flags).toContain('TOP_PRIVILEGE');
    expect(byEmailOrName('op@uji.test').severity).toBe('MEDIUM');
    expect(byEmailOrName('k@uji.test').flags).not.toContain('STAFF_WITHOUT_OUTLET');
    expect(report.privilegedAccounts.some((a) => a.role === UserRole.CUSTOMER)).toBe(false);

    expect(report.topupCredits).toEqual([expect.objectContaining({ memberCode: 'MBR-1', credits: 1, total: '1000000.00' })]);
    expect(report.underpaidWalletPayments).toHaveLength(1);
    expect(report.refundsByCustomers).toEqual([expect.objectContaining({ actorUserId: cu.id, actorRole: 'CUSTOMER' })]);
    expect(report.manualMachineCommands).toEqual([expect.objectContaining({ deviceCode: 'W-1', command: 'START' })]);
  });

  it('--since menandai akun yang dibuat setelah tanggal tertentu', async () => {
    await prisma.user.create({ data: { name: 'Lama', email: 'lama@uji.test', role: UserRole.OWNER, passwordHash: 'x', createdAt: new Date('2025-01-01') } });
    await prisma.user.create({ data: { name: 'Baru', email: 'baru@uji.test', role: UserRole.OWNER, passwordHash: 'x' } });
    const report = await buildAudit(prisma, new Date('2026-01-01'));
    const baru = report.privilegedAccounts.find((a) => a.name === 'Baru')!;
    const lama = report.privilegedAccounts.find((a) => a.name === 'Lama')!;
    expect(baru.flags).toContain('CREATED_AFTER_SINCE');
    expect(lama.flags).not.toContain('CREATED_AFTER_SINCE');
  });

  it('transaksi audit benar-benar READ ONLY: penulisan di dalamnya ditolak database', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.user.create({ data: { name: 'X', email: 'x@uji.test', passwordHash: 'x' } });
      }),
    ).rejects.toThrow(/read-only/i);
    expect(await prisma.user.count()).toBe(0);
  });
});
