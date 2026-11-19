# 08 — Migrasi & Rollback

## Migrasi Fase 1 Batch 1 (urutan diterapkan `prisma migrate deploy`)

| Migrasi | Isi | Sifat | Rollback |
|---|---|---|---|
| `20261119120000_booking_hold_status` | `ALTER TYPE "BookingStatus" ADD VALUE 'HOLD'` | Aditif | PostgreSQL tidak bisa menghapus nilai enum dengan mudah. Biarkan nilai tetap ada (aman untuk kode lama yang tidak memakainya); pastikan tidak ada baris `HOLD` sebelum rollback kode: `UPDATE machine_bookings SET status='CANCELLED' WHERE status='HOLD';` |
| `20261119120100_booking_order_fk` | (1) kosongkan `orderId` yatim; (2) FK `machine_bookings.orderId → orders.id ON DELETE SET NULL` | Aditif + pembersihan referensi yatim (data saat ini: kolom selalu NULL) | `ALTER TABLE machine_bookings DROP CONSTRAINT "machine_bookings_orderId_fkey";` |
| `20261119120200_daily_sequences` | Tabel `daily_sequences` (penghitung nomor order/member) | Aditif | `DROP TABLE daily_sequences;` — kode lama tidak memakainya |

Verifikasi skema ↔ migrasi: `prisma migrate diff --from-url <test-db> --to-schema-datamodel prisma/schema.prisma` → **kosong** (dijalankan 19 Nov di DB uji).

## Prosedur

1. Backup database sebelum migrate (sudah dilakukan otomatis oleh `deploy/scripts/deploy-update.sh`).
2. `deploy-update.sh` membangun dulu, baru migrate (build gagal → skema tidak maju).
3. Rollback kode: deploy commit sebelumnya. Migrasi di atas kompatibel mundur (kode lama tidak membaca `HOLD`, FK, atau `daily_sequences`), kecuali butir `HOLD` di atas.

## Data lama

- Booking `RESERVED`/`IN_USE` tanpa `orderId` (dibuat app lama) **tidak bisa** lagi dipakai untuk membuka mesin. Sebelum deploy, jalankan laporan dry-run:
  ```sql
  SELECT id, "deviceId", "customerId", status, "expiresAt" FROM machine_bookings
  WHERE "orderId" IS NULL AND status IN ('RESERVED','IN_USE');
  ```
  Keputusan pembersihan (CANCELLED/DONE) menunggu persetujuan owner — tidak dijalankan otomatis.
