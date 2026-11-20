/**
 * Normalisasi nomor HP user lama ke format kanonik 628… (Batch 5 — T6, lihat
 * docs/production-readiness/21-auth-account.md).
 *
 * DEFAULT = DRY-RUN (baca-saja). Laporan JSON ke --out (default
 * ./phone-normalization-<timestamp>.json) + ringkasan di konsol.
 *
 *   npx ts-node scripts/normalize-user-phones.ts                         # dry-run
 *   npx ts-node scripts/normalize-user-phones.ts --apply --actor "owner"  # terapkan
 *
 * --apply hanya mengubah baris NORMALIZE (tidak bentrok). Baris CONFLICT
 * (nomor sama di lebih dari satu akun) dan INVALID dilaporkan untuk ditangani
 * manual. Jalankan --apply di production HANYA dengan persetujuan owner,
 * setelah laporan dry-run ditinjau dan backup DB dibuat.
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import {
  applyPhoneNormalization,
  buildPhoneNormalizationReport,
} from '../src/modules/users/phone-normalization';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const prisma = new PrismaClient();
  const apply = process.argv.includes('--apply');
  const actor = arg('--actor');
  if (apply && !actor) {
    throw new Error('--apply wajib disertai --actor "<nama penanggung jawab>"');
  }
  const out =
    arg('--out') ?? `phone-normalization-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  try {
    const report = await buildPhoneNormalizationReport(prisma);
    console.log(`\n[phone normalization] mode: ${apply ? 'APPLY' : 'DRY-RUN (baca-saja)'}`);
    console.table(report.totals);
    const conflicts = report.rows.filter((r) => r.category === 'CONFLICT');
    if (conflicts.length) {
      console.log('Nomor yang sama di lebih dari satu akun (tangani manual):');
      console.table(conflicts.map((r) => ({ userId: r.userId, role: r.role, phone: r.phone, canonical: r.canonical })));
    }
    let result: unknown = null;
    if (apply) {
      result = await applyPhoneNormalization(prisma, report, actor!);
      console.log('Diterapkan:', result);
    }
    writeFileSync(out, JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', report, result }, null, 2));
    console.log(`Laporan: ${out}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
