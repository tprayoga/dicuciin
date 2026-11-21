/**
 * Lengkapi harga per-outlet (ServicePrice) yang belum ada untuk data lama —
 * temuan uji 2026-11-21: outlet/layanan yang dibuat dari admin sebelum
 * sinkronisasi otomatis tidak punya baris harga sehingga tidak bisa dipesan.
 *
 * DEFAULT = DRY-RUN (baca-saja): menampilkan pasangan outlet × layanan aktif
 * (ber-basePrice) yang belum punya harga. Tidak pernah mengubah harga yang ada.
 *
 *   npx ts-node scripts/backfill-service-prices.ts           # dry-run
 *   npx ts-node scripts/backfill-service-prices.ts --apply   # buat baris yang kurang
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const apply = process.argv.includes('--apply');
  try {
    const [outlets, services, existing] = await Promise.all([
      prisma.outlet.findMany({ select: { id: true, name: true } }),
      prisma.service.findMany({
        where: { isActive: true, basePrice: { not: null } },
        select: { id: true, name: true, basePrice: true },
      }),
      prisma.servicePrice.findMany({ select: { serviceId: true, outletId: true } }),
    ]);
    const have = new Set(existing.map((e) => `${e.serviceId}:${e.outletId}`));
    const missing = outlets.flatMap((o) =>
      services
        .filter((s) => !have.has(`${s.id}:${o.id}`))
        .map((s) => ({ outlet: o.name, outletId: o.id, service: s.name, serviceId: s.id, price: s.basePrice! })),
    );
    console.log(`\n[backfill service prices] mode: ${apply ? 'APPLY' : 'DRY-RUN (baca-saja)'}`);
    console.log(`outlet: ${outlets.length}, layanan aktif ber-harga: ${services.length}, baris harga kurang: ${missing.length}`);
    if (missing.length) console.table(missing.map(({ outlet, service, price }) => ({ outlet, service, price: price.toString() })));
    if (apply && missing.length) {
      const res = await prisma.servicePrice.createMany({
        data: missing.map((m) => ({
          serviceId: m.serviceId,
          outletId: m.outletId,
          price: m.price,
          pricingType: 'FIXED',
          unit: 'cycle',
        })),
        skipDuplicates: true,
      });
      console.log(`dibuat: ${res.count} baris`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
