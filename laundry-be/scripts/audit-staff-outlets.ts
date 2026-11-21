/**
 * Audit penugasan outlet staf (BACA-SAJA) — Batch 1.5 Prioritas 4.
 *
 *   npx ts-node scripts/audit-staff-outlets.ts [--out staff-outlets.json]
 *
 * Tidak mengubah data. Penugasan outlet dilakukan owner lewat panel admin.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { auditStaffOutlets } from "../src/common/auth/staff-outlet-audit";

async function main() {
  const prisma = new PrismaClient();
  const i = process.argv.indexOf("--out");
  const out = i >= 0 ? process.argv[i + 1] : undefined;
  try {
    const report = await auditStaffOutlets(prisma);
    console.log("\n[audit outlet staf] BACA-SAJA");
    console.table(report.summary);
    console.table(
      report.rows
        .filter((r) => r.finding !== "OK")
        .map((r) => ({
          nama: r.name,
          role: r.role,
          aktif: r.isActive,
          outlet: r.outlets.map((o) => o.name).join(", ") || "-",
          temuan: r.finding,
        })),
    );
    if (out) {
      writeFileSync(out, JSON.stringify(report, null, 2));
      console.log(`Laporan: ${out}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
