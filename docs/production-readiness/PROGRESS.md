# PROGRESS — Di.Cuciin Production Readiness

Status: NOT_STARTED · IN_PROGRESS · IMPLEMENTED · TESTED · BLOCKED · ACCEPTED
Terakhir diperbarui: 19 Nov 2026

| Fase | Temuan | Status | Bukti |
|---|---|---|---|
| Baseline audit | — | TESTED | [00-baseline-audit.md](00-baseline-audit.md) |
| **0 — Security hotfix** | K1, K3–K7 + K8–K12 | **TESTED** (mock + PostgreSQL nyata) · belum deploy | [01](01-security-hotfix.md), [07](07-test-matrix.md) |
| **1 — Batch 1** | **K2, T2** + kebijakan outlet | **TESTED** (PostgreSQL nyata) · belum deploy | [02](02-booking-payment-architecture.md), [07](07-test-matrix.md), [08](08-migration-rollback.md) |
| 1 — Batch 2 | T3 (sisa UI), T4, T5, T9, T10, S1 (sisa), S2 (sisa), S4 | NOT_STARTED | — |
| 2 — Top-up Midtrans & PIN | K1 (fitur), S5 | NOT_STARTED | — |
| 3 — Auth & akun | T1, T6, T7, T11 | NOT_STARTED | — |
| 4 — Kualitas alur | T8, S3, S6–S8, R1–R5, R7 | NOT_STARTED | — |
| 5 — Rilis & operasional | R6 + checklist | IN_PROGRESS (checklist: [06](06-production-deployment.md)) | — |

## Quality gate (19 Nov 2026)

| Gate | Perintah | Hasil |
|---|---|---|
| Unit test backend | `cd laundry-be && npx jest` | **261/261 lulus** (24 suite) |
| Integration PostgreSQL nyata | `TEST_DATABASE_URL=… npm run test:integration` | **40/40 lulus** (4 suite) |
| Otorisasi & kepemilikan | unit HTTP 56 + service 27 + PostgreSQL 11 | lulus |
| Konkurensi booking | 8 paralel slot sama → 1 sukses | lulus |
| Keamanan aktivasi QR | scan sebelum bayar / orang lain / mesin lain / PAID palsu / replay / paralel | lulus |
| Bayar-sebelum-aktivasi | saldo, QRIS+webhook, saldo+voucher | lulus |
| Regresi Admin (API) | 16 endpoint × 2 role | lulus |
| Regresi Kiosk (API) | `/kiosks/device/*` tanpa JWT | lulus |
| Typecheck / build backend | `tsc --noEmit`, `npm run build` | exit 0 |
| Skema ↔ migrasi | `prisma migrate diff` | kosong |
| Flutter | `flutter analyze`, `flutter build web --release` | bersih / berhasil |
| E2E Midtrans sandbox (kode baru) | — | **NOT_VERIFIED** (belum deploy) |
| Perangkat IoT fisik, app di perangkat, UI admin di browser | — | **NOT_VERIFIED** |

Lingkungan uji: Docker `postgres:16-alpine` (`dicuciin-test-pg`, `127.0.0.1:55499/dicuciin_test`), terpisah dari DB development (`laundry-postgres`) dan server.

## Gate Fase 0

- [x] Customer A tidak bisa mengakses resource customer B (mock + PostgreSQL)
- [x] Tidak bisa mengubah user lain / eskalasi role
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
- [x] Semua jalur aktivasi diaudit (02 §Verifikasi)
- [ ] E2E sandbox dengan kode baru — NOT_VERIFIED
- [ ] **ACCEPTED** — butuh deploy + E2E sandbox + uji perangkat

## Temuan baru

| Temuan | Status |
|---|---|
| K8–K12 (sapuan Fase 0) | TESTED |
| Nomor order/member ganda saat paralel (`generateDailySequence`) | TESTED (diperbaiki: tabel `daily_sequences`) |
| Event `RUNNING` mengubah booking CANCELLED → IN_USE | TESTED (diperbaiki) |
| START FAILED tidak bisa dicoba ulang | TESTED (diperbaiki, ≤3) |
| `IotService.sendCommand` (admin) tidak mempublikasikan ke MQTT; antrean `iot-command` stub | Dicatat (bukan celah; fitur admin belum berfungsi) |
| Kiosk `/pricing/calculate` 401 (token perangkat bukan JWT) — sudah ada sebelumnya | NOT_STARTED |
| Kiosk: order kiosk tidak terikat mesin → mesin tidak menyala setelah bayar (sudah ada sebelumnya) | NOT_STARTED |

## Keputusan owner yang tertunda

1. Kebijakan refund (sementara: admin saja; pelanggan → WhatsApp; booking yang sudah dibayar tidak bisa dibatalkan sendiri).
2. Pembersihan booking lama tanpa order (lihat 08 §Data lama).
3. Penugasan outlet untuk semua staf sebelum deploy (staf tanpa outlet → 403 di laporan).
4. Top-up, package name, jam operasional per outlet.

## Commit (lokal, belum di-push)

Lihat `git log --oneline main..feat/production-readiness`.
