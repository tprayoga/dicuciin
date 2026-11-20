# PROGRESS — Di.Cuciin Production Readiness

Status: NOT_STARTED · IN_PROGRESS · IMPLEMENTED · TESTED · BLOCKED · ACCEPTED
Terakhir diperbarui: 19 Nov 2026

| Fase | Temuan | Status | Bukti |
|---|---|---|---|
| Baseline audit | — | TESTED | [00-baseline-audit.md](00-baseline-audit.md) |
| **0 — Security hotfix** | K1, K3–K7 + K8–K12 | **TESTED** (mock + PostgreSQL nyata) · belum deploy | [01](01-security-hotfix.md), [07](07-test-matrix.md) |
| **1 — Batch 1** | **K2, T2** + kebijakan outlet | **TESTED** (PostgreSQL nyata) · belum deploy | [02](02-booking-payment-architecture.md), [07](07-test-matrix.md), [08](08-migration-rollback.md) |
| **1 — Batch 1.5** | Kompatibilitas kiosk, rekonsiliasi booking lama, kompatibilitas deployment, outlet staf | **TESTED** (PostgreSQL nyata) · belum deploy | [10](10-kiosk-compatibility.md), [11](11-deployment-compatibility.md), [12](12-legacy-booking-reconciliation.md), [07](07-test-matrix.md) |
| 1 — Batch 2 | T3 (sisa UI), T4, T5, T9, T10, S1 (sisa), S2 (sisa), S4 | NOT_STARTED — menunggu persetujuan gate 1.5 | — |
| 2 — Top-up Midtrans & PIN | K1 (fitur), S5 | NOT_STARTED | — |
| 3 — Auth & akun | T1, T6, T7, T11 | NOT_STARTED | — |
| 4 — Kualitas alur | T8, S3, S6–S8, R1–R5, R7 | NOT_STARTED | — |
| 5 — Rilis & operasional | R6 + checklist | IN_PROGRESS ([06](06-production-deployment.md), [11](11-deployment-compatibility.md)) | — |

## Quality gate (19 Nov 2026, setelah Batch 1.5)

| Gate | Perintah | Hasil |
|---|---|---|
| Unit test backend | `cd laundry-be && npx jest` | **255/255 lulus** (24 suite) |
| Integration PostgreSQL nyata | `TEST_DATABASE_URL=… npm run test:integration` | **79/79 lulus** (7 suite) |
| Integrasi pembayaran kiosk | `kiosk-compat.int-spec.ts` | 22/22 |
| Autentikasi perangkat (token kiosk asli + JWT asli) | idem | lulus |
| Otorisasi lintas outlet | `authorization.int-spec.ts` | lulus |
| Konkurensi booking (mobile 8×, kiosk 8×) | idem | 1 sukses / 7 ditolak |
| Aktivasi ganda (webhook ganda, retry paralel, scan ulang) | idem | tetap 1 START |
| Kompatibilitas app mobile lama | `mobile-compat.int-spec.ts` | 13/13 |
| Rekonsiliasi & audit outlet | `legacy-reconciliation.int-spec.ts` | 4/4 |
| Uji mutasi (8 perbaikan) | lihat 07 | semua tertangkap |
| Gate Fase 0 (K1, K3–K12) & Batch 1 (K2, T2) | suite yang sama | lulus |
| Typecheck / build backend | `tsc --noEmit`, `npm run build` | exit 0 |
| Skema ↔ migrasi | `prisma migrate diff --exit-code` | kosong |
| Flutter mobile | `flutter analyze`, `flutter test`, `flutter build web --release` | bersih / lulus / sukses |
| Flutter kiosk | `flutter analyze`, `flutter test`, `flutter build web --release` | bersih / lulus / sukses |
| Admin | `npm run build` | sukses (tidak ada test otomatis) |
| E2E Midtrans sandbox (kode baru) | — | **NOT_VERIFIED** (belum deploy) |
| Perangkat IoT fisik, kiosk fisik, app di HP, UI admin di browser | — | **NOT_VERIFIED** |
| Laporan rekonsiliasi & audit outlet pada data nyata | — | **NOT_VERIFIED** (production butuh izin; `.env` dev menunjuk DB proyek lain) |

Lingkungan uji: Docker `postgres:16-alpine` (`dicuciin-test-pg`, `127.0.0.1:55499/dicuciin_test`), terpisah dari DB development dan server.
"START" di test = perintah tercatat + dikirim ke broker MQTT tiruan — bukan verifikasi perangkat fisik.

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

## Keputusan owner yang tertunda

1. Kebijakan refund (termasuk pembayaran yang masuk setelah order batal).
2. Rekonsiliasi booking lama di production (review dry-run, lalu `--apply`).
3. Penugasan outlet untuk semua staf aktif sebelum deploy.
4. `BOOKING_HOLD_MINUTES` selama masa transisi app lama.
5. Top-up, package name, jam operasional per outlet.

## Commit (lokal, belum di-push)

Lihat `git log --oneline main..feat/production-readiness`.
