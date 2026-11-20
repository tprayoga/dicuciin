-- Batch 3: harga terpadu (snapshot + reservasi voucher/kuota) dan durasi booking.
-- Aditif: kolom nullable, tanpa backfill, tanpa menghapus data.
-- AlterTable
ALTER TABLE "machine_bookings" ADD COLUMN     "durationMinutes" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "pricingReleasedAt" TIMESTAMP(3),
ADD COLUMN     "pricingSnapshot" JSONB;

