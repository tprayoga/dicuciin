/**
 * Backfill (Fase 2 unifikasi ledger) — migrasi histori `wallet_transactions`
 * lama ke `wallet_ledgers` (SSoT). Jalankan SEKALI saat cutover, SEBELUM
 * endpoint histori dialihkan membaca `wallet_ledgers` (T6), agar riwayat lama
 * tidak hilang.
 *
 * Aman & idempoten:
 *  - Melewati baris yang `idempotencyKey`-nya sudah ada di ledger (kembaran
 *    dual-write dari transaksi baru → sudah tercatat, jangan digandakan).
 *  - Melewati baris yang sudah pernah dimigrasi (`migrated-wt-<id>`).
 *  - `createMany({ skipDuplicates })` sebagai jaring pengaman terakhir.
 *
 * Pemakaian:
 *   npx ts-node scripts/backfill-wallet-transactions-to-ledger.ts [--dry]
 *   npm run backfill:wallet-ledger -- --dry
 */
import { PrismaClient } from '@prisma/client';
import {
  walletTransactionToLedgerInput,
  MIGRATED_WT_PREFIX,
} from '../src/modules/wallets/wallet-history.mapper';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry');
  const mode = dryRun ? 'DRY-RUN (tidak menulis)' : 'LIVE';
  console.log(`\n[backfill wallet_transactions → wallet_ledgers] mode: ${mode}\n`);

  // Kumpulkan seluruh idempotencyKey ledger yang sudah ada untuk dedup.
  const existingLedgers = await prisma.walletLedger.findMany({
    select: { idempotencyKey: true },
  });
  const existingKeys = new Set(
    existingLedgers
      .map((l) => l.idempotencyKey)
      .filter((k): k is string => !!k),
  );

  const txns = await prisma.walletTransaction.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const toCreate: ReturnType<typeof walletTransactionToLedgerInput>[] = [];
  let skippedTwin = 0;
  let skippedMigrated = 0;

  for (const wt of txns) {
    // Sudah ada di ledger sebagai kembaran dual-write (key asli sama)?
    if (wt.idempotencyKey && existingKeys.has(wt.idempotencyKey)) {
      skippedTwin++;
      continue;
    }
    // Sudah pernah dimigrasi sebelumnya?
    if (existingKeys.has(`${MIGRATED_WT_PREFIX}${wt.id}`)) {
      skippedMigrated++;
      continue;
    }
    toCreate.push(walletTransactionToLedgerInput(wt));
  }

  console.log(`Total wallet_transactions : ${txns.length}`);
  console.log(`Sudah tercatat (twin)     : ${skippedTwin}`);
  console.log(`Sudah dimigrasi           : ${skippedMigrated}`);
  console.log(`Akan dibuat di ledger     : ${toCreate.length}`);

  if (!dryRun && toCreate.length > 0) {
    const res = await prisma.walletLedger.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
    console.log(`\nDibuat: ${res.count} baris wallet_ledgers.`);
  }

  // Validasi ringkas: bandingkan running-balance MAIN dari ledger vs wallet.balance.
  const wallets = await prisma.wallet.findMany({
    select: { id: true, balance: true, customerId: true },
  });
  let mismatches = 0;
  for (const w of wallets) {
    const agg = await prisma.walletLedger.groupBy({
      by: ['direction'],
      where: { walletId: w.id, walletType: 'MAIN_BALANCE' },
      _sum: { amount: true },
    });
    let credit = 0;
    let debit = 0;
    for (const g of agg) {
      const s = Number(g._sum.amount ?? 0);
      if (g.direction === 'CREDIT') credit = s;
      else debit = s;
    }
    const derived = credit - debit;
    const cached = Number(w.balance);
    // Catatan: bila ada mutasi BONUS yang ikut memengaruhi balance historis, atau
    // engine ledger, selisih bisa muncul — ditandai untuk ditinjau, bukan fatal.
    if (Math.abs(derived - cached) > 0.001) {
      mismatches++;
      console.log(
        `  ⚠ wallet ${w.id} (cust ${w.customerId ?? '-'}): ledger MAIN=${derived} vs cache balance=${cached}`,
      );
    }
  }
  console.log(
    `\nValidasi: ${wallets.length - mismatches}/${wallets.length} wallet konsisten (MAIN ledger vs cache).`,
  );
  console.log('Selesai.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
