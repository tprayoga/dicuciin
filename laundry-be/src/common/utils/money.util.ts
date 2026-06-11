import { Prisma } from '@prisma/client';

/**
 * Helper uang berbasis Prisma.Decimal — uang disimpan sebagai DECIMAL(14,2) di DB
 * (bukan Float) agar tidak ada drift floating point. Gunakan helper ini untuk
 * aritmatika uang pada jalur tulis (order/wallet), dan `toNum` untuk
 * mengonversi nilai uang ke number pada jalur baca/laporan (display saja).
 */

/** Buat Decimal dari number/string/Decimal. */
export const D = (v: Prisma.Decimal.Value): Prisma.Decimal => new Prisma.Decimal(v);

/** Bulatkan ke 2 desimal (satuan rupiah/cent) — dipakai sebelum simpan. */
export const money = (v: Prisma.Decimal.Value): Prisma.Decimal =>
  new Prisma.Decimal(v).toDecimalPlaces(2);

/**
 * Konversi aman ke number untuk perhitungan display/laporan.
 * Decimal | number | null | undefined → number (null → 0).
 */
export const toNum = (
  v: Prisma.Decimal | number | null | undefined,
): number => {
  if (v == null) return 0;
  return typeof v === 'number' ? v : v.toNumber();
};
