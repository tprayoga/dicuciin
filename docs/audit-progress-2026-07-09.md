# Di.Cuciin — Development Progress Audit (Evidence-Based)

> **Tanggal audit:** 2026-07-09
> **Sifat:** Read-only. Semua penilaian bersumber dari implementasi nyata di repository (bukan README/asumsi).
> **Cakupan:** Backend API, Web Admin, Mobile Customer, Kiosk, Database, IoT, Security, DevOps, Testing, Dokumentasi.
> **Metode verifikasi:** pembacaan source code + `npx jest` (20 suite / 141 test **lolos**), analisis skema Prisma, konfigurasi bootstrap, guard, dan integrasi API tiap platform.

---

## 0. Ringkasan Angka Nyata (bukti terukur)

| Metrik | Nilai | Sumber |
|---|---|---|
| Modul backend | 28 | `laundry-be/src/modules/*` |
| Model + enum Prisma | 61 model + 20 enum | `prisma/schema.prisma` (1.277 baris) |
| Migrasi DB | 23 | `prisma/migrations/` |
| Endpoint REST | 161 | `@Get/@Post/@Patch/@Put/@Delete` di controller |
| Anotasi Swagger (`@ApiOperation`) | 189 | controller |
| Endpoint dengan `@Roles` | 57 | RBAC eksplisit |
| Endpoint `@Public` | 21 | auth/webhook/kiosk device |
| Unit test | 141 test / 20 suite — **semua lolos** | `npx jest` |
| LOC backend (tanpa test) | ±14.079 | `wc -l` |
| LOC test backend | ±3.168 | 20 file `.spec.ts` |
| Web Admin | 14 halaman, ±5.775 LOC | Nuxt 4 |
| Mobile Customer | 50 file, ±17.562 LOC | Flutter |
| Kiosk | ±4.261 LOC | Flutter |
| Index/unique DB | 146 | schema |
| `onDelete` FK | 62 | schema |
| E2E / integration test | **0** | tidak ada `test/*.e2e-spec.ts` |

**Kesimpulan angka:** ini **bukan prototype**. Ini MVP fungsional besar dengan logika bisnis nyata dan tersambung end-to-end di 4 platform. Kelemahan utama terkonsentrasi di **payment gateway nyata, testing e2e, dan hardening DevOps/CI** — bukan di kelengkapan fitur inti.

---

## 1. Progress Development Keseluruhan

**Estimasi progress: ± 74%** (menuju production-ready 100%).

| Platform | Progress | Alasan (bukti) |
|---|---|---|
| Backend API | **85%** | 28 modul nyata, RBAC, throttling per-endpoint, transaksi atomik, 141 test lolos. Kurang: gateway pembayaran nyata, e2e, sebagian queue processor masih stub. |
| Web Admin | **74%** | 14 halaman pakai API nyata (`useApi`), auth middleware, CRUD lengkap. Halaman `marketing` (40 baris) & `staff-performance` (74 baris) tipis; promo-loyalty punya field ber-TODO. |
| Mobile Customer | **74%** | Auth OTP/password, order, wallet, PIN, loyalty, booking mesin — semua nyata. Kurang: push notification (tanpa FCM), auto-refresh 401, hampir tanpa test. |
| Kiosk | **70%** | Alur tunggal (pilih mesin → checkout → QRIS) + login member fungsional. Tergantung gateway mock; cakupan fitur sempit (by design). |
| Database | **88%** | 61 model, indexing & relasi matang, uang pakai `Decimal`, soft-delete/`isActive`. |
| API | **84%** | REST konsisten, versioning `/api/v1`, Swagger, validasi ketat. Kurang: standardisasi pagination lintas semua list. |
| Security | **68%** | Fondasi kuat (helmet, CORS whitelist, bcrypt, JWT rotation, throttle auth). Kurang: gateway asli, secret default di `.env.example`, tanpa audit-log akses. |
| Testing | **42%** | 141 unit test bagus, tapi **nol** e2e/integration; mobile/kiosk praktis tanpa test. |
| DevOps | **55%** | Deploy jalan (PM2+Nginx+SSH), tapi CI tanpa gate build/test/lint, single VM, tanpa monitoring/backup terdokumentasi. |

---

## 2. Fitur: Selesai / Sebagian / Belum

### ✅ Selesai (nyata & teruji)
- **Auth & Authorization:** OTP WhatsApp (provider Fonnte, fallback log dev) + password, JWT access/refresh **rotation**, `RolesGuard` (RBAC), throttle ketat per-endpoint auth (login 3/menit, register 5/menit, dst — `auth.controller.ts:27-67`), bcrypt.
- **Wallet:** saldo, top-up, pembayaran **atomik** (`updateMany` dengan `balance: { gte }` + `idempotencyKey`, `wallets.service.ts:226`), refund, PIN wallet, riwayat transaksi, ledger.
- **Order laundry:** DRAFT → … → COMPLETED, status log, cancel; tersambung mobile & kiosk.
- **Promo + Voucher + Point/Loyalty + Membership Tier + Happy Hour:** engine pricing terpadu (`pricing`, `promos`, `vouchers`, `points`, `memberships`, `campaigns`) dengan banyak unit test.
- **B2B partner pricing:** rule + usage tracking + backfill script.
- **IoT mesin:** MQTT command/event, binding command↔order.
- **Reports/Dashboard:** ringkasan finansial nyata dari DB.

### 🟡 Sebagian (jalan tapi belum lengkap)
- **Payments:** pembayaran **wallet nyata**; **QRIS/VA = `MockPaymentGateway`** (dikonfirmasi lewat endpoint `simulate`). Webhook punya verifikasi secret (`payments.controller.ts:44-51`) tapi belum ke provider asli.
- **Notifications:** `WhatsAppService` siap (Fonnte); **email/SMS/FCM masih TODO** di queue processor (`notification.processor.ts:29-39`, `notifications.service.ts:23`).
- **Admin promo-loyalty:** ada field placeholder ber-TODO ("Monthly Voucher Benefit", "Active Period API" — `promotion-loyalty/index.vue:1058,1074`).

### ❌ Belum dibuat / tidak ditemukan
- Integrasi payment gateway sungguhan (Midtrans/Xendit/Doku) → **tidak bisa terima uang QRIS/VA nyata**.
- Push notification mobile (tanpa dependency `firebase`/FCM di `pubspec.yaml`).
- E2E/integration test backend (folder test kosong) & widget test mobile/kiosk berarti (hanya 2 file test).
- Monitoring/observability, backup/restore, disaster recovery terdokumentasi.

---

## 3. Kualitas per Domain (skor 0–100)

| Domain | Skor | Catatan bukti |
|---|---:|---|
| **Architecture** | 82 | NestJS modular per-domain, DI konsisten, `common/` (guards/filters/interceptors/pipes). Belum full-DDD/repository layer (service akses Prisma langsung — pragmatis, tapi coupling ke ORM). |
| **Backend** | 85 | Global `ValidationPipe` (`whitelist+forbidNonWhitelisted`), `GlobalExceptionFilter`, `TransformInterceptor`, throttler, prefix `/api/v1`. |
| **Frontend Web** | 72 | Nuxt 4 + Pinia + Nuxt UI, `useApi` unwrap `.data`, auth global middleware. Beberapa halaman tipis + TODO field. |
| **Mobile** | 74 | Provider state, `flutter_secure_storage`, refresh token tersimpan, empty-state konsisten ("Belum ada …"). Tanpa auto-retry 401 & push. |
| **Business Logic** | 80 | Transaksi atomik, idempotency, engine promo terpadu (menghindari duplikasi logika promo). Ada **duplikasi service wallet** (`WalletService` vs `WalletsService`). |
| **Database** | 88 | Uang `Decimal` (migrasi `money_float_to_decimal`), 146 index/unique, 62 `onDelete`, soft-delete. |
| **API** | 84 | Konsisten & terdokumentasi Swagger. Pagination/filtering belum seragam di semua list. |
| **UI** | 72 | Nuxt UI (admin) & sistem maskot + `AppColors` (mobile) → konsisten; tanpa design-system token formal. |
| **UX** | 70 | Empty/loading/error state ada; flow order/bayar jelas. Onboarding & feedback error masih dasar. |
| **Security** | 68 | Lihat §5. Kuat di fondasi, lemah di gateway asli + secret hygiene + audit-log akses. |
| **Performance** | 72 | Kompresi, index DB, transaksi terarah. Belum ada caching Redis untuk read-heavy, potensi N+1 pada beberapa `include`. |
| **Testing** | 42 | 141 unit test lolos, tapi nol e2e; mobile/kiosk hampir tanpa test. |
| **DevOps** | 55 | Deploy SSH+PM2+Nginx jalan; CI tanpa quality gate; single VM. |
| **Maintainability** | 74 | Modular & konsisten; hambatan: duplikasi wallet, TODO tersebar, coupling Prisma. |
| **Scalability** | 68 | BullMQ+Redis siap horizontal untuk job; tapi single-VM & tanpa container app image. |
| **Documentation** | 78 | `docs/` kaya (promo-loyalty, IoT, scheduler, deployment), Swagger. Kurang: ERD & runbook produksi. |
| **Code Quality** | 78 | Penamaan jelas, komentar bermakna (ID), lint+prettier tersedia. TODO & duplikasi menurunkan nilai. |
| **OVERALL** | **74** | MVP fungsional mendekati UAT-ready. |

---

## 4. Database (detail)

- **Kekuatan:** 61 model/20 enum saling relasi, uang pakai `Decimal` (menghindari galat float), 146 index/unique, 62 aturan `onDelete`, ledger sebagai source-of-truth (`WalletLedger`, `PointLedger`), audit field (`AuditLog`, `OrderStatusLog`, `PricingCalculationLog`).
- **Transaksi & konkurensi:** `$transaction` dipakai di 14 modul; pola anti-overspend atomik pada wallet (updateMany + guard saldo). Idempotency key pada transaksi wallet.
- **Risiko/bottleneck:** beberapa query list memakai `include` bersarang → potensi N+1 saat data besar; belum ada strategi caching read. Tidak ada ERD tergambar (hanya schema Prisma).

---

## 5. Security (OWASP-oriented)

| Aspek | Status | Bukti |
|---|---|---|
| Password hash | ✅ bcrypt | `auth.service.ts`, `otp.service.ts` |
| JWT + refresh rotation | ✅ | model `RefreshToken`, endpoint `/auth/refresh` |
| Rate limiting | ✅ global + per-endpoint auth | `ThrottlerGuard` + `@Throttle` |
| Input validation | ✅ ketat | `ValidationPipe whitelist+forbidNonWhitelisted` |
| CORS | ✅ whitelist + wildcard, tolak di prod | `main.ts` |
| Security headers | ✅ helmet | `main.ts` |
| SQL injection | ✅ rendah (Prisma parametrized) | — |
| Secret hygiene | ⚠️ | `.env` di-`.gitignore` (baik), **tapi** `.env.example` berisi secret default "change-this" → risiko bila dipakai apa adanya |
| Webhook auth | 🟡 | verifikasi `x-webhook-secret` ada, tapi belum HMAC dari provider asli |
| Broken access control | ⚠️ | RBAC role-only; **outlet-scoping manual** (hanya 16 service menyebut `outletId`) → cek konsistensi agar STAFF outlet A tak akses data outlet B |
| Audit trail akses | ❌ | `AuditLog` model ada, belum menyeluruh mencatat akses sensitif |
| Payment integrity | ❌ | gateway mock → tidak bisa validasi pembayaran nyata |

---

## 6. Frontend Web (Nuxt Admin)

- 14 halaman **semua konsumsi API nyata** via `useApi` (mis. `dashboard.vue:27` → `/orders/summary/dashboard`).
- Auth via `auth.global.ts` (SSR redirect → login, client cek `authStore`).
- **Halaman tipis / perlu dilengkapi:** `marketing/index.vue` (40 baris), `staff-performance/index.vue` (74 baris).
- **Placeholder ber-TODO:** `promotion-loyalty/index.vue` (benefit voucher bulanan & active period belum ada API).
- Tidak ada mock-data hardcoded pada page utama (data dari API).

## 7. Mobile & Kiosk (Flutter)

- **Mobile:** Provider + `http` + `flutter_secure_storage`; base URL via `--dart-define` (`app_config.dart`, default `10.0.2.2`). Auth OTP/password nyata, order, wallet+PIN, promo, booking mesin, member dashboard — semua tersambung API. Empty-state konsisten.
- **Gap mobile:** tanpa **push notification/FCM**, tanpa **interceptor auto-refresh 401** (refresh manual di controller), hanya 2 file test.
- **Kiosk:** alur tunggal mesin→checkout→QRIS + login member; guest-first. Tergantung gateway mock.

---

## 8. GAP ANALYSIS

| Area | Existing | Missing | Impact | Priority |
|---|---|---|---|---|
| Payment gateway | Mock QRIS/VA + wallet nyata | Integrasi provider asli + webhook HMAC | Tidak bisa terima uang → **blocker revenue** | **Critical** |
| Testing | 141 unit test | E2E/integration + test mobile | Regresi lintas modul lolos | **Critical** |
| CI/CD | Deploy SSH | Gate build+test+lint sebelum deploy | Kode rusak bisa ke prod | **High** |
| Secret mgmt | `.env` ignored | Secret manager + rotasi + hapus default | Kebocoran kredensial | **High** |
| Wallet service duplikat | 2 service | Konsolidasi ke satu | Inkonsistensi saldo | **High** |
| Push notification | WA OTP | FCM/APNs mobile | Retensi & update order lemah | Medium |
| Observability | Health endpoint | Logging terpusat, metrics, alert | MTTR tinggi saat insiden | Medium |
| Backup/DR | — | Backup DB terjadwal + restore drill | Kehilangan data | High |
| Outlet-scoping | manual sebagian | Guard/policy konsisten | Broken access control | Medium |
| Notifikasi email/SMS | stub TODO | Provider integrasi | Fitur pasif | Low |

---

## 9. FEATURE MATRIX

| Feature | Backend | Web | Mobile | Status | % |
|---|---|---|---|---|---|
| Auth (OTP+password+JWT rotation) | ✅ | ✅ | ✅ | Done | 95 |
| RBAC / Roles | ✅ | ✅ | n/a | Done | 85 |
| Wallet + top-up + PIN | ✅ | 🟡 | ✅ | Done | 90 |
| Order laundry flow | ✅ | ✅ | ✅ | Done | 88 |
| Promo/Voucher/Point/Tier/HappyHour | ✅ | ✅ | ✅ | Done | 85 |
| B2B pricing | ✅ | 🟡 | n/a | Partial | 75 |
| Booking mesin + IoT | ✅ | ✅ | ✅ | Partial | 78 |
| Kiosk flow | ✅ | n/a | ✅(kiosk) | Partial | 72 |
| **Payment QRIS/VA nyata** | 🟡 mock | 🟡 | 🟡 | **Partial** | 40 |
| Reports/Dashboard | ✅ | ✅ | 🟡 | Done | 80 |
| Notifications (WA) | ✅ | — | 🟡 | Partial | 55 |
| Notifications (email/SMS/FCM) | ❌ stub | — | ❌ | Not Started | 10 |
| E2E testing | ❌ | ❌ | ❌ | Not Started | 5 |

---

## 10. TECHNICAL DEBT

**Critical**
- Payment gateway mock → integrasi provider asli (est. 8–12 hari).
- Nol e2e test → bangun harness e2e backend + smoke CI (est. 6–10 hari).

**High**
- Duplikasi `WalletService`/`WalletsService` → konsolidasi (est. 2–3 hari).
- CI tanpa quality gate → tambah job build/test/lint sebelum deploy (est. 1–2 hari).
- Secret default `.env.example` + secret manager (est. 1–2 hari).

**Medium**
- Outlet-scoping tidak konsisten → policy/guard terpusat (est. 3–4 hari).
- Queue processor stub (email/SMS/FCM) (est. 3–5 hari).
- N+1 & caching read (est. 3–5 hari).

**Low**
- TODO field admin promo-loyalty; halaman marketing/staff-performance tipis (est. 2–4 hari).

---

## 11. BUG / RISIKO POTENSIAL (dari source)

1. **Concurrency wallet:** pola atomik sudah benar (`updateMany gte`) — **rendah**; pastikan semua jalur debit memakai pola ini (bukan hanya `wallets.service.ts`).
2. **Duplicate wallet logic:** dua service → risiko dua jalur update saldo tak sinkron.
3. **Permission leak:** RBAC role-only tanpa outlet-scoping menyeluruh → STAFF lintas-outlet.
4. **Payment integrity:** konfirmasi via `simulate` → di produksi harus mustahil dipanggil klien.
5. **Refresh 401 mobile:** tanpa interceptor → sesi bisa "putus" walau refresh token valid.
6. **Webhook:** secret statis, belum HMAC per-payload → replay risk.
7. **Scalability:** single-VM PM2, tanpa image container app → sulit scale-out.

---

## 12. ROADMAP (prioritas: impact × risk × dependency)

**Sprint 1 — Monetisasi & Kepercayaan**
- Integrasi payment gateway nyata (QRIS/VA) + webhook HMAC + idempoten.
- Konsolidasi service wallet.
- CI quality gate (build+test+lint) sebelum deploy.

**Sprint 2 — Keandalan**
- Harness e2e backend (auth→order→pay→refund) + jalankan di CI.
- Outlet-scoping guard konsisten + audit-log akses sensitif.
- Secret manager + hapus default `.env.example`.

**Sprint 3 — Pengalaman & Retensi**
- Push notification FCM (order status, promo) + interceptor auto-refresh 401 mobile.
- Lengkapi admin marketing/staff-performance & field promo-loyalty ber-TODO.
- Queue processor email/SMS nyata.

**Sprint 4 — Operasional Produksi**
- Observability (log terpusat, metrics, alert), backup DB terjadwal + restore drill.
- Containerize app + strategi scale-out; performance pass (caching read, N+1).

---

## 13. FINAL SCORECARD

| | Skor |
|---|---:|
| Architecture | 82 |
| Backend | 85 |
| Frontend Web | 72 |
| Mobile | 74 |
| Business Logic | 80 |
| Database | 88 |
| API | 84 |
| UI | 72 |
| UX | 70 |
| Security | 68 |
| Performance | 72 |
| Testing | 42 |
| DevOps | 55 |
| Maintainability | 74 |
| Scalability | 68 |
| Documentation | 78 |
| Code Quality | 78 |
| **OVERALL** | **74** |

---

## 14. KESIMPULAN

1. **Progress keseluruhan: ± 74%.** MVP fungsional lintas 4 platform dengan logika bisnis nyata dan 141 unit test lolos.
2. **Layak UAT? → Ya, bersyarat.** Alur inti (auth, order, wallet, loyalty) dapat di-UAT sekarang; UAT pembayaran harus pakai **sandbox gateway**, bukan mock.
3. **Siap staging? → Ya (dengan catatan).** Sudah ada pipeline deploy; wajib tambahkan CI quality gate + secret non-default lebih dulu.
4. **Siap production? → Belum.** Blocker: (a) payment gateway nyata, (b) e2e test, (c) hardening DevOps/secret/observability/backup.

### 10 Risiko Terbesar
1. Payment gateway mock (blocker revenue).
2. Nol e2e/integration test.
3. CI tanpa quality gate → deploy kode rusak.
4. Secret default di `.env.example`.
5. Duplikasi service wallet → inkonsistensi saldo.
6. Outlet-scoping RBAC tak konsisten (broken access control).
7. Endpoint `simulate` pembayaran di jalur produksi.
8. Tanpa monitoring/observability → MTTR tinggi.
9. Tanpa backup/DR terdokumentasi.
10. Single-VM tanpa container app → skala & resiliensi terbatas.

### 20 Pekerjaan Prioritas Tertinggi
1. Integrasi payment gateway nyata + webhook HMAC.
2. Idempotensi & rekonsiliasi pembayaran.
3. Nonaktifkan `simulate` di produksi.
4. Konsolidasi WalletService.
5. Harness e2e backend + smoke CI.
6. CI gate build/test/lint pra-deploy.
7. Secret manager + hapus default env.
8. Outlet-scoping guard terpusat.
9. Audit-log akses sensitif.
10. Interceptor auto-refresh 401 mobile.
11. Push notification FCM.
12. Queue processor email/SMS nyata.
13. Lengkapi admin marketing & staff-performance.
14. Selesaikan field promo-loyalty ber-TODO.
15. ERD & runbook produksi.
16. Backup DB terjadwal + restore drill.
17. Observability (log/metrics/alert).
18. Perbaikan N+1 + caching read Redis.
19. Standardisasi pagination/filtering API.
20. Containerize app + rencana scale-out.

### Estimasi Effort menuju 100% Production-Ready
**± 45–60 person-days (≈ 4 sprint / 2 developer).** Jalur kritis: payment gateway (8–12 hari) + e2e/CI (7–12 hari) + hardening DevOps/security (10–15 hari).

### Rekomendasi berdampak terbesar
1. **Selesaikan pembayaran nyata** — membuka pendapatan; tanpa ini produk tak bisa go-live komersial.
2. **Bangun e2e + CI gate** — mengunci kualitas dan mencegah regresi saat kecepatan development tinggi.
3. **Hardening security/DevOps** (secret, outlet-scoping, audit-log, backup, observability) — prasyarat operasional produksi.
4. **Bereskan technical debt struktural** (duplikasi wallet, TODO tersebar) — menjaga maintainability sebelum tim membesar.
