/**
 * AUDIT AKUN & JEJAK EKSPLOITASI — BACA-SAJA (security hotfix).
 *
 * Mencari tanda pemanfaatan celah yang ditutup hotfix:
 *   V1/V2  akun berhak istimewa yang dibuat lewat registrasi publik atau
 *          dinaikkan sendiri lewat PATCH /users/:id
 *   K1/K9  kredit saldo TOPUP (production belum punya top-up berbayar → setiap
 *          kredit TOPUP adalah top-up manual admin ATAU eksploitasi)
 *   K3     refund ke saldo yang dicatat oleh akun pelanggan
 *   K4     pembayaran saldo yang lebih kecil dari total order
 *   K10    perintah mesin manual (tanpa order)
 *
 * TIDAK mengubah data: semua kueri berjalan di dalam transaksi PostgreSQL
 * `READ ONLY` (penulisan apa pun akan ditolak database). Keluaran: ringkasan
 * di konsol + JSON (berisi data pribadi — simpan aman, jangan dibagikan).
 *
 *   DATABASE_URL=... npx ts-node scripts/audit-privileged-accounts.ts \
 *     --out /root/audit-<tanggal>.json --i-have-owner-approval
 *
 * Menjalankan di production WAJIB dengan persetujuan owner (data pribadi).
 */
import { PrismaClient, UserRole } from '@prisma/client';
import { writeFileSync } from 'fs';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const STAFF_ROLES: UserRole[] = [
  UserRole.ADMIN_OUTLET,
  UserRole.CASHIER,
  UserRole.OPERATOR,
  UserRole.TECHNICIAN,
];

export interface AccountFinding {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  phoneVerifiedAt: Date | null;
  hasCustomerProfile: boolean;
  outlets: string[];
  lastTokenIssuedAt: Date | null;
  activeRefreshTokens: number;
  flags: string[];
  severity: 'HIGH' | 'MEDIUM' | 'REVIEW';
}

export async function buildAudit(prisma: PrismaClient, since?: Date) {
  return prisma.$transaction(async (tx) => {
    // Jaminan database: transaksi ini tidak bisa menulis apa pun.
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');

    const users = await tx.user.findMany({
      where: { role: { not: UserRole.CUSTOMER } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        phoneVerifiedAt: true,
        customer: { select: { id: true } },
        outletUsers: { select: { outlet: { select: { code: true } } } },
        refreshTokens: {
          select: { createdAt: true, revokedAt: true, expiresAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const now = new Date();
    const accounts: AccountFinding[] = users.map((u) => {
      const flags: string[] = [];
      // Profil customer / nomor terverifikasi OTP hanya tercipta lewat
      // registrasi pelanggan → akun ini dulunya pelanggan lalu role-nya naik.
      if (u.customer) flags.push('HAS_CUSTOMER_PROFILE');
      if (u.phoneVerifiedAt) flags.push('PHONE_VERIFIED_VIA_OTP');
      if (STAFF_ROLES.includes(u.role) && u.outletUsers.length === 0) flags.push('STAFF_WITHOUT_OUTLET');
      if (u.role === UserRole.SUPER_ADMIN || u.role === UserRole.OWNER) flags.push('TOP_PRIVILEGE');
      if (since && u.createdAt >= since) flags.push('CREATED_AFTER_SINCE');
      const severity: AccountFinding['severity'] =
        u.customer || u.phoneVerifiedAt
          ? 'HIGH'
          : flags.includes('STAFF_WITHOUT_OUTLET') || flags.includes('CREATED_AFTER_SINCE')
            ? 'MEDIUM'
            : 'REVIEW';
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        phoneVerifiedAt: u.phoneVerifiedAt,
        hasCustomerProfile: !!u.customer,
        outlets: u.outletUsers.map((o) => o.outlet.code),
        lastTokenIssuedAt: u.refreshTokens[0]?.createdAt ?? null,
        activeRefreshTokens: u.refreshTokens.filter((t) => !t.revokedAt && t.expiresAt > now).length,
        flags,
        severity,
      };
    });

    const topupCredits = await tx.$queryRaw<
      { customerId: string; memberCode: string; credits: bigint; total: string; first: Date; last: Date }[]
    >`
      SELECT c.id AS "customerId", c."memberCode", COUNT(*) AS credits,
             SUM(l.amount)::text AS total, MIN(l."createdAt") AS first, MAX(l."createdAt") AS last
      FROM wallet_ledgers l
      JOIN wallets w ON w.id = l."walletId"
      JOIN customers c ON c.id = w."customerId"
      WHERE l."referenceType" = 'TOPUP' AND l.direction = 'CREDIT'
      GROUP BY c.id, c."memberCode"
      ORDER BY SUM(l.amount) DESC`;

    const underpaidWalletPayments = await tx.$queryRaw<
      { orderNumber: string; orderTotal: string; paid: string; paidAt: Date | null; customerId: string | null }[]
    >`
      SELECT o."orderNumber", o."totalAmount"::text AS "orderTotal", p.amount::text AS paid,
             p."paidAt", o."customerId"
      FROM payments p JOIN orders o ON o.id = p."orderId"
      WHERE p."paymentMethod" = 'WALLET' AND p.status = 'PAID' AND p.amount < o."totalAmount"
      ORDER BY p."paidAt" DESC NULLS LAST`;

    const refundsByCustomers = await tx.$queryRaw<
      { orderNumber: string; refundedAt: Date; actorUserId: string; actorRole: string }[]
    >`
      SELECT o."orderNumber", s."createdAt" AS "refundedAt", u.id AS "actorUserId", u.role::text AS "actorRole"
      FROM order_status_logs s
      JOIN orders o ON o.id = s."orderId"
      JOIN users u ON u.id = s."createdBy"
      WHERE s.status = 'REFUNDED' AND u.role = 'CUSTOMER'
      ORDER BY s."createdAt" DESC`;

    const manualMachineCommands = await tx.$queryRaw<
      { deviceCode: string; command: string; status: string; createdAt: Date }[]
    >`
      SELECT d."deviceCode", c.command, c.status, c."createdAt"
      FROM iot_commands c JOIN iot_devices d ON d.id = c."deviceId"
      WHERE c."orderId" IS NULL
      ORDER BY c."createdAt" DESC
      LIMIT 500`;

    const roleCounts = await tx.user.groupBy({ by: ['role'], _count: { _all: true } });

    return {
      generatedAt: now.toISOString(),
      since: since?.toISOString() ?? null,
      roleCounts: Object.fromEntries(roleCounts.map((r) => [r.role, r._count._all])),
      privilegedAccounts: accounts,
      topupCredits: topupCredits.map((t) => ({ ...t, credits: Number(t.credits) })),
      underpaidWalletPayments,
      refundsByCustomers,
      manualMachineCommands,
    };
  });
}

async function main() {
  if (!process.argv.includes('--i-have-owner-approval')) {
    throw new Error(
      'Audit membaca data pribadi. Jalankan hanya dengan persetujuan owner dan flag --i-have-owner-approval.',
    );
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi');
  const sinceArg = arg('--since');
  const since = sinceArg ? new Date(sinceArg) : undefined;
  if (since && Number.isNaN(since.getTime())) throw new Error('--since harus tanggal ISO, mis. 2026-01-01');
  const out = arg('--out') ?? `privileged-accounts-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  const prisma = new PrismaClient();
  try {
    const report = await buildAudit(prisma, since);
    console.log('\n[audit akun istimewa] mode: BACA-SAJA (transaksi READ ONLY)');
    console.table(report.roleCounts);
    console.table(
      report.privilegedAccounts.map((a) => ({
        severity: a.severity,
        role: a.role,
        aktif: a.isActive,
        dibuat: a.createdAt.toISOString().slice(0, 10),
        email: a.email,
        flags: a.flags.join(','),
      })),
    );
    console.log(`Akun HIGH (dulu pelanggan, kini berhak istimewa): ${report.privilegedAccounts.filter((a) => a.severity === 'HIGH').length}`);
    console.log(`Pelanggan dengan kredit TOPUP: ${report.topupCredits.length}`);
    console.log(`Pembayaran saldo < total order: ${report.underpaidWalletPayments.length}`);
    console.log(`Refund yang dicatat akun pelanggan: ${report.refundsByCustomers.length}`);
    console.log(`Perintah mesin manual (tanpa order): ${report.manualMachineCommands.length}`);
    writeFileSync(out, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(`Laporan (berisi data pribadi, izin file 600): ${out}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
