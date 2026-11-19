-- Fase 1 Batch 1 (T2): booking WAJIB berelasi dengan order (FK nyata).
-- Bersihkan referensi yatim lebih dulu (orderId menunjuk order yang tidak ada)
-- agar pembuatan FK tidak gagal. Pada data saat ini kolom ini selalu NULL.
UPDATE "machine_bookings"
SET "orderId" = NULL
WHERE "orderId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "orders" o WHERE o."id" = "machine_bookings"."orderId");

ALTER TABLE "machine_bookings"
  ADD CONSTRAINT "machine_bookings_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
