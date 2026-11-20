# 08 — Migrasi & Rollback

## Migrasi Fase 1 Batch 1 (urutan diterapkan `prisma migrate deploy`)

| Migrasi | Isi | Sifat | Rollback |
|---|---|---|---|
| `20261119120000_booking_hold_status` | `ALTER TYPE "BookingStatus" ADD VALUE 'HOLD'` | Aditif | PostgreSQL tidak bisa menghapus nilai enum dengan mudah. Biarkan nilai tetap ada (aman untuk kode lama yang tidak memakainya); pastikan tidak ada baris `HOLD` sebelum rollback kode: `UPDATE machine_bookings SET status='CANCELLED' WHERE status='HOLD';` |
| `20261119120100_booking_order_fk` | (1) kosongkan `orderId` yatim; (2) FK `machine_bookings.orderId → orders.id ON DELETE SET NULL` | Aditif + pembersihan referensi yatim (data saat ini: kolom selalu NULL) | `ALTER TABLE machine_bookings DROP CONSTRAINT "machine_bookings_orderId_fkey";` |
| `20261119120200_daily_sequences` | Tabel `daily_sequences` (penghitung nomor order/member) | Aditif | `DROP TABLE daily_sequences;` — kode lama tidak memakainya |
| `20261120090000_kiosk_booking_pin_lockout` (Batch 1.5) | `machine_bookings.customerId` DROP NOT NULL (booking tamu kiosk); `customers.walletPinFailedAttempts` (default 0), `customers.walletPinLockedUntil` | Aditif / melonggarkan | Kolom PIN: `ALTER TABLE customers DROP COLUMN "walletPinFailedAttempts", DROP COLUMN "walletPinLockedUntil";` (kode lama tidak memakainya). `customerId`: **sebelum** rollback kode, booking tamu harus ditutup — kode lama mengira kolom ini selalu terisi: `UPDATE machine_bookings SET status='CANCELLED' WHERE "customerId" IS NULL AND status IN ('HOLD','RESERVED');` lalu periksa sisa `IN_USE` secara manual. Mengembalikan NOT NULL hanya bila tidak ada baris NULL. |

Verifikasi skema ↔ migrasi: `prisma migrate diff --from-url <test-db> --to-schema-datamodel prisma/schema.prisma` → **kosong** (dijalankan 19 Nov di DB uji).

## Prosedur

1. Backup database sebelum migrate (sudah dilakukan otomatis oleh `deploy/scripts/deploy-update.sh`).
2. `deploy-update.sh` membangun dulu, baru migrate (build gagal → skema tidak maju).
3. Rollback kode: deploy commit sebelumnya. Migrasi di atas kompatibel mundur (kode lama tidak membaca `HOLD`, FK, atau `daily_sequences`), kecuali butir `HOLD` di atas.

## Data lama

Booking tanpa order dari app lama: gunakan skrip rekonsiliasi (dry-run default, `--apply` hanya EXPIRE/CANCEL aman + AuditLog) — lihat **12-legacy-booking-reconciliation.md**. Tidak ada pembersihan otomatis tanpa persetujuan owner.
