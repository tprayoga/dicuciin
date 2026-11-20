# PROGRESS — Di.Cuciin Production Readiness

Status: NOT_STARTED · IN_PROGRESS · IMPLEMENTED · TESTED · BLOCKED · ACCEPTED
Terakhir diperbarui: 20 Nov 2026

| Fase | Temuan | Status | Bukti |
|---|---|---|---|
| Baseline audit | — | TESTED | [00-baseline-audit.md](00-baseline-audit.md) |
| **0 — Security hotfix** | K1, K3–K7 + K8–K12 | **TESTED** (mock + PostgreSQL nyata) · belum deploy | [01](01-security-hotfix.md), [07](07-test-matrix.md) |
| **1 — Batch 1** | **K2, T2** + kebijakan outlet | **TESTED** (PostgreSQL nyata) · belum deploy | [02](02-booking-payment-architecture.md), [07](07-test-matrix.md), [08](08-migration-rollback.md) |
| **1 — Batch 1.5** | Kompatibilitas kiosk, rekonsiliasi booking lama, kompatibilitas deployment, outlet staf | **TESTED** (PostgreSQL nyata) · belum deploy | [10](10-kiosk-compatibility.md), [11](11-deployment-compatibility.md), [12](12-legacy-booking-reconciliation.md), [07](07-test-matrix.md) |
| **1 — Batch 2** | **T4, T5, T9, S2** + rekonsiliasi keuangan & refund | **TESTED** (PostgreSQL nyata; Midtrans sandbox NOT_VERIFIED) · belum deploy | [13](13-payment-lifecycle.md), [14](14-booking-scheduler.md), [15](15-financial-reconciliation.md), [16](16-batch2-test-report.md) |
| 1 — Batch 3 (sisa) | T3 (sisa UI), T10, S1 (sisa), S4 | NOT_STARTED | — |
| 2 — Top-up Midtrans & PIN | K1 (fitur), S5 | NOT_STARTED | — |
| 3 — Auth & akun | T1, T6, T7, T11 | NOT_STARTED | — |
| 4 — Kualitas alur | T8, S3, S6–S8, R1–R5, R7 | NOT_STARTED | — |
| 5 — Rilis & operasional | R6 + checklist | IN_PROGRESS ([06](06-production-deployment.md), [11](11-deployment-compatibility.md)) | — |

## Quality gate (20 Nov 2026, setelah Batch 2)

| Gate | Hasil |
|---|---|
| Unit backend (`npx jest`) | **262/262** (24 suite) |
| Integration PostgreSQL nyata (`npm run test:integration`) | **120/120** (10 suite); suite konkurensi diulang 3× → stabil |
| `tsc --noEmit`, `npm run build` | exit 0 |
| `prisma migrate diff` | kosong |
| Flutter mobile / kiosk: analyze, test, build web | bersih / lulus / sukses |
| Admin `npm run build` | sukses |
| Gate Fase 0 (K1–K12), Batch 1 (K2, T2), Batch 1.5 | tetap lulus (suite yang sama) |
| E2E Midtrans sandbox (kode Batch 1–2) | **NOT_VERIFIED** (belum deploy) |
| IoT fisik, kiosk fisik, app di HP, UI admin di browser, Redis/BullMQ production | **NOT_VERIFIED** |

Rincian: [16-batch2-test-report.md](16-batch2-test-report.md). Lingkungan uji: Docker `postgres:16-alpine` (`127.0.0.1:55499/dicuciin_test`), terpisah dari DB development, DB proyek lain, dan server.

## Gate Fase 0

- [x] Customer A tidak bisa mengakses resource customer B (mock + PostgreSQL)
- [x] Tidak bisa mengubah user lain / eskalasi role (termasuk jalur edit profil app lama)
- [x] Tidak bisa mengakses daftar admin
- [x] Tidak bisa top-up langsung (2 jalur)
- [x] Tidak bisa mengubah status pembayaran order
- [x] Tidak bisa refund mandiri
- [x] Fungsi admin tetap jalan (API)
- [ ] **ACCEPTED** — butuh deploy + smoke test + rilis app

## Gate Fase 1 Batch 1

- [x] Scan QR sebelum bayar tidak bisa mengaktifkan mesin
- [x] Pelanggan yang membayar hanya bisa mengaktifkan mesin terkait
- [x] Booking bentrok ditolak (termasuk paralel)
- [x] Saldo & Midtrans memakai order yang sama; tanpa order/booking ganda
- [x] Webhook/pembayaran ganda tanpa efek ganda
- [x] Semua jalur aktivasi diaudit (02 §Verifikasi; + jalur kiosk di 10)
- [ ] E2E sandbox dengan kode baru — NOT_VERIFIED
- [ ] **ACCEPTED** — butuh deploy + E2E sandbox + uji perangkat

## Gate Batch 1.5 (kompatibilitas)

- [x] `/pricing/calculate` kiosk tidak lagi 401 — tanpa mematikan guard JWT global
- [x] Order kiosk terikat mesin; tanpa mesin ditolak sebelum bayar
- [x] Order kiosk dibayar → mesin START sekali, hanya dengan Payment PAID terverifikasi
- [x] Checkout saldo kiosk wajib PIN (dengan penguncian)
- [x] App mobile lama: alur utama tetap berfungsi tanpa membuka kembali aktivasi tanpa bayar
- [x] Booking lama: dry-run + apply aman (tanpa hapus, IN_USE tidak disentuh, AuditLog)
- [x] Audit outlet staf (baca-saja); staf tanpa outlet gagal aman (403)
- [x] Rencana deploy terkoordinasi + matriks kompatibilitas (11)
- [ ] Owner: penugasan outlet, kebijakan refund, review dry-run production
- [ ] **ACCEPTED** — butuh deploy + kiosk/IoT fisik + E2E sandbox

## Gate Batch 2 (keuangan & operasional)

- [x] Ganti metode QRIS/VA/saldo pada order yang sama; ≤1 percobaan aktif (unik DB)
- [x] Kedaluwarsa ditentukan server (verifikasi provider), klien tidak menebak
- [x] Order tidak pernah dilunasi dua kali; dana ekstra → rekonsiliasi
- [x] Order batal tidak bisa kembali PAID (kode + trigger DB)
- [x] Scheduler HOLD/penyelesaian/pemulihan idempoten & aman multi-worker
- [x] Refund: customer mengajukan, hanya owner/super admin menyetujui & mengeksekusi, tepat sekali, teraudit
- [ ] Midtrans sandbox (expire/status) — NOT_VERIFIED
- [ ] **ACCEPTED** — butuh deploy + sandbox + uji perangkat + kebijakan refund owner

## Temuan baru

| Temuan | Status |
|---|---|
| K8–K12 (sapuan Fase 0) | TESTED |
| Nomor order/member ganda saat paralel (`generateDailySequence`) | TESTED (tabel `daily_sequences`) |
| Event `RUNNING` mengubah booking CANCELLED → IN_USE | TESTED |
| START FAILED tidak bisa dicoba ulang | TESTED (≤3) |
| `IotService.sendCommand` (admin) tidak mempublikasikan ke MQTT; antrean `iot-command` stub | Dicatat (fitur admin belum berfungsi) |
| Kiosk `/pricing/calculate` 401 | **TESTED** (Batch 1.5) |
| Kiosk: order tidak terikat mesin / mesin tidak menyala setelah bayar | **TESTED** (Batch 1.5) |
| **Kritis**: bayar saldo di kiosk tanpa PIN (saldo siapa pun bisa dipakai) | **TESTED** (Batch 1.5 — PIN + lockout) |
| Kiosk bisa membaca status pembayaran/mesin kiosk lain | **TESTED** (Batch 1.5) |
| Order dibatalkan lalu dibayar → hidup lagi jadi PAID; batal vs webhook berbalapan | **TESTED** (Batch 1.5 — kunci baris, refund manual) |
| Rute bayar saldo lama tidak menaikkan booking & tidak mencegah bayar dobel dengan QRIS | **TESTED** (Batch 1.5 — jalur tunggal) |
| Guest kiosk + `customerLookup` QRIS: atribusi poin ke customer tanpa PIN | Dicatat (Batch 2) |
| App lama: reservasi > 10 menit sebelum order → tidak terikat | Dicatat (mitigasi `BOOKING_HOLD_MINUTES` transisi) |
| Pembayaran kedua (QR lama tetap dibayar) diabaikan tanpa catatan | **TESTED** (Batch 2 — rekonsiliasi) |
| `simulate` & `/payments/webhook` bisa melunasi tanpa bayar di non-produksi walau Midtrans aktif | **TESTED** (Batch 2 — hanya gateway mock) |
| Refund admin me-refund pembayaran terakhir & tidak melepas booking | **TESTED** (Batch 2) |
| `markPublished` baca-lalu-tulis → publikasi START ganda bila paralel | **TESTED** (Batch 2 — klaim atomik) |
| START tanpa ACK tidak pernah bisa dicoba ulang | **TESTED** (Batch 2 — TIMEOUT) |

## Keputusan owner yang tertunda

1. Kebijakan refund (termasuk pembayaran ganda/setelah batal, `PAID_NOT_USED`, refund langsung oleh ADMIN_OUTLET) — lihat 15.
2. Rekonsiliasi booking lama di production (review dry-run, lalu `--apply`).
3. Penugasan outlet untuk semua staf aktif sebelum deploy.
4. `BOOKING_HOLD_MINUTES` selama masa transisi app lama.
5. Top-up, package name, jam operasional per outlet.

## Commit (lokal, belum di-push)

Lihat `git log --oneline main..feat/production-readiness`.
