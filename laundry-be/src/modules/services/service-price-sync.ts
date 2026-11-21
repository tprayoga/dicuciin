/**
 * Harga per-outlet (`ServicePrice`) adalah sumber harga untuk order, kiosk, dan
 * aplikasi (`GET /services/prices?outletId=`). Admin hanya mengatur harga dasar
 * layanan (`Service.basePrice`), jadi baris per-outlet dibuat & disinkronkan
 * otomatis di sini (temuan uji 2026-11-21: outlet/layanan baru dari admin tidak
 * bisa dipesan karena belum punya baris harga).
 *
 * Aturan:
 *  - layanan baru ber-`basePrice` → baris harga di SEMUA outlet;
 *  - outlet baru → baris harga untuk semua layanan aktif ber-`basePrice`;
 *  - `basePrice` berubah → baris yang masih sama dengan harga dasar lama ikut
 *    berubah; harga yang sudah disesuaikan khusus per-outlet tidak disentuh.
 *  - Tidak pernah menimpa baris yang sudah ada (`skipDuplicates`).
 */
import { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

const DEFAULTS = { pricingType: 'FIXED', unit: 'cycle' } as const;

export async function ensurePricesForService(
  db: Db,
  service: { id: string; basePrice: Prisma.Decimal | number | null },
) {
  if (service.basePrice == null) return 0;
  const outlets = await db.outlet.findMany({ select: { id: true } });
  if (outlets.length === 0) return 0;
  const res = await db.servicePrice.createMany({
    data: outlets.map((o) => ({
      serviceId: service.id,
      outletId: o.id,
      price: service.basePrice!,
      ...DEFAULTS,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function ensurePricesForOutlet(db: Db, outletId: string) {
  const services = await db.service.findMany({
    where: { isActive: true, basePrice: { not: null } },
    select: { id: true, basePrice: true },
  });
  if (services.length === 0) return 0;
  const res = await db.servicePrice.createMany({
    data: services.map((s) => ({
      serviceId: s.id,
      outletId,
      price: s.basePrice!,
      ...DEFAULTS,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function syncBasePriceChange(
  db: Db,
  serviceId: string,
  oldBase: Prisma.Decimal | null,
  newBase: Prisma.Decimal | number | null,
) {
  if (newBase == null) return;
  if (oldBase != null && !new Prisma.Decimal(newBase).eq(oldBase)) {
    await db.servicePrice.updateMany({
      where: { serviceId, price: oldBase },
      data: { price: newBase },
    });
  }
  await ensurePricesForService(db, { id: serviceId, basePrice: newBase });
}
