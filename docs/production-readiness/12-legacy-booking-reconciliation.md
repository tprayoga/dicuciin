# 12 — Rekonsiliasi Booking Lama (Fase 1 Batch 1.5)

Status: **TESTED** di PostgreSQL uji · **belum dijalankan** di data development/production (lihat "Belum dijalankan").

## Latar

Sebelum Batch 1, `POST /bookings` membuat booking **tanpa order** (aplikasi lama + "Booking & Pakai"). Migrasi Batch 1 `booking_order_fk` juga mengosongkan `orderId` yang menunjuk order yang sudah tidak ada. Booking seperti ini tidak lagi bisa membuka mesin (scan wajib order PAID), tetapi selama `expiresAt` belum lewat ia masih memegang slot mesin.

## Alat

| Berkas | Fungsi |
|---|---|
| `laundry-be/src/modules/bookings/legacy-booking-reconciliation.ts` | Klasifikasi + penerapan aksi aman |
| `laundry-be/scripts/reconcile-legacy-bookings.ts` | CLI. **Default dry-run (baca-saja)**, menulis laporan JSON |
| `npm run reconcile:legacy-bookings` | alias |

```bash
# Dry-run (aman, baca-saja) — laporan ke file
npx ts-node scripts/reconcile-legacy-bookings.ts --out legacy-$(date +%F).json
# Terapkan (HANYA dengan persetujuan owner, setelah review dry-run + backup DB)
npx ts-node scripts/reconcile-legacy-bookings.ts --apply --actor "<nama owner>" --out legacy-apply.json
```

`--apply` tanpa `--actor` ditolak.

## Klasifikasi

| Kategori | Kriteria | Aksi |
|---|---|---|
| `IN_USE_NO_ORDER` | IN_USE tanpa order | **MANUAL_REVIEW** — tidak pernah otomatis (mesin bisa sedang berputar) |
| `IN_USE_CLOSED_ORDER` | IN_USE, order CANCELLED/REFUNDED | **MANUAL_REVIEW** |
| `ACTIVE_NO_ORDER` | HOLD/RESERVED tanpa order, belum kedaluwarsa | NONE — tidak bisa dipakai & kedaluwarsa sendiri |
| `ABANDONED_NO_ORDER` | HOLD/RESERVED tanpa order, sudah kedaluwarsa | **EXPIRE** (→ `EXPIRED`); MANUAL_REVIEW bila ada bukti mesin berjalan |
| `ACTIVE_CLOSED_ORDER` | HOLD/RESERVED, order CANCELLED/REFUNDED | **CANCEL** (→ `CANCELLED`); MANUAL_REVIEW bila ada bukti mesin berjalan |
| `HISTORICAL_NO_ORDER` | DONE/CANCELLED/EXPIRED tanpa order | NONE — arsip dipertahankan |
| `PAID_ORDER_BOOKING_LOST` | Order PAID, booking CANCELLED, mesin tak pernah START | **MANUAL_REVIEW** — jadwalkan ulang / refund |

Tambahan laporan: `paidOnClosedOrders` — pembayaran PAID atas order CANCELLED/REFUNDED (perlu refund manual; bisa muncul dari QRIS yang dibayar setelah order dibatalkan).

"Bukti mesin berjalan" = perintah START berstatus PUBLISHED/ACKED/RUNNING pada mesin itu, atau event terakhir mesin adalah RUNNING/STARTED. Dicek **per mesin** (konservatif).

## Jaminan keamanan (semua diuji)

- Dry-run tidak menulis apa pun (diuji: snapshot tabel identik).
- Tidak pernah menghapus booking, order, atau payment (diuji: jumlah baris sama).
- Tidak pernah mengubah booking IN_USE atau booking dengan bukti mesin berjalan.
- Hanya dua transisi: `EXPIRE` dan `CANCEL`. Per baris di dalam transaksi dengan **pemeriksaan ulang**: bila status berubah sejak dry-run → dilewati (`skipped`).
- Setiap perubahan dicatat di `audit_logs` (`LEGACY_BOOKING_EXPIRE` / `LEGACY_BOOKING_CANCEL`, actor, kategori, alasan).
- Idempoten: menjalankan ulang tidak mengubah apa pun lagi.

## Belum dijalankan (NOT_VERIFIED)

| Lingkungan | Alasan |
|---|---|
| Production | Butuh persetujuan owner (perintah dry-run di atas aman dijalankan di server; `--apply` menunggu keputusan). |
| DB development lokal | `.env` menunjuk `localhost:5432` yang di mesin ini adalah kontainer `hwms-postgres` (proyek lain), sedangkan `laundry-postgres` ada di `:55432`. Tidak menebak database/kredensial; jalankan dengan `DATABASE_URL` yang benar. |

## Prosedur yang disarankan

1. Setelah backend baru dideploy: jalankan dry-run di server, simpan JSON.
2. Owner meninjau `MANUAL_REVIEW` (cek mesin fisik untuk IN_USE) dan `paidOnClosedOrders` (refund).
3. Bila setuju: backup DB → `--apply --actor`.
4. Simpan kedua file JSON sebagai bukti audit.
