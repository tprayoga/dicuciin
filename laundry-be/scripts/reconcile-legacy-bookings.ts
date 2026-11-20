/**
 * Rekonsiliasi booking lama tanpa order (Batch 1.5 — lihat
 * docs/production-readiness/12-legacy-booking-reconciliation.md).
 *
 * DEFAULT = DRY-RUN (baca-saja). Menulis laporan JSON ke --out (default
 * ./legacy-bookings-<timestamp>.json) dan ringkasan ke konsol.
 *
 *   npx ts-node scripts/reconcile-legacy-bookings.ts                # dry-run
 *   npx ts-node scripts/reconcile-legacy-bookings.ts --out r.json   # dry-run, file tertentu
 *   npx ts-node scripts/reconcile-legacy-bookings.ts --apply --actor "nama-owner"
 *
 * --apply hanya menjalankan EXPIRE/CANCEL yang aman (tidak pernah IN_USE,
 * tidak pernah menghapus), per baris dengan pemeriksaan ulang + AuditLog.
 * Jalankan --apply di production HANYA dengan persetujuan owner, setelah
 * laporan dry-run ditinjau dan backup DB dibuat.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import {
  applyLegacyBookingActions,
  buildLegacyBookingReport,
} from "../src/modules/bookings/legacy-booking-reconciliation";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const prisma = new PrismaClient();
  const apply = process.argv.includes("--apply");
  const actor = arg("--actor");
  if (apply && !actor) {
    throw new Error('--apply wajib disertai --actor "<nama penanggung jawab>"');
  }
  const out =
    arg("--out") ??
    `legacy-bookings-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  try {
    const report = await buildLegacyBookingReport(prisma);
    console.log(
      `\n[legacy bookings] mode: ${apply ? "APPLY" : "DRY-RUN (baca-saja)"}`,
    );
    console.table(report.totals);
    console.table(report.actions);
    console.log(
      `Pembayaran PAID atas order batal/refund: ${report.paidOnClosedOrders.length}`,
    );
    let result: unknown = null;
    if (apply) {
      result = await applyLegacyBookingActions(prisma, report, actor!);
      console.log("Diterapkan:", result);
    }
    writeFileSync(
      out,
      JSON.stringify(
        { mode: apply ? "APPLY" : "DRY_RUN", report, result },
        null,
        2,
      ),
    );
    console.log(`Laporan: ${out}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
