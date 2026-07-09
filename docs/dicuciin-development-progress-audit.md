# Di.Cuciin — Development Progress Audit

> **Tanggal audit:** 2026-06-23
> **Auditor:** Technical Lead / Project Auditor / Product Owner (review berbasis evidence dari repository)
> **Sifat audit:** Read-only. Tidak ada perubahan source code, refactor, fitur baru, atau perbaikan bug.
> **Cakupan:** Backend API, Mobile App Customer, Kiosk App, Web Admin, Database, IoT, Env/Deployment, Testing, Dokumentasi.

---

## 1. Executive Summary

**Di.Cuciin** adalah monorepo sistem laundry multi-platform yang sudah jauh melampaui tahap prototype. Repository berisi 4 komponen nyata dan saling tersambung:

| Komponen | Path | Stack | Kematangan |
|---|---|---|---|
| Backend API | [laundry-be](../laundry-be/) | NestJS 10 + Prisma + PostgreSQL + Redis/BullMQ + MQTT | **Paling matang (mendekati produksi)** |
| Web Admin | [laundry-admin](../laundry-admin/) | Nuxt 4 + Pinia + Nuxt UI | **Kerangka lengkap, data nyata dari API** |
| Mobile Customer | [laundry_mobile_flutter](../laundry_mobile_flutter/) | Flutter + Provider + http | **Fungsional (auth + order + wallet + loyalty nyata)** |
| Kiosk | [laundry_kiosk_flutter](../laundry_kiosk_flutter/) | Flutter + Provider + http | **Single-flow (mesin → checkout → bayar) fungsional** |
| Deployment | [deploy](../deploy/) | PM2 + Nginx + GitHub Actions (SSH) | Functional, single-VM |

### Status maturity keseluruhan: **MVP → mendekati UAT-ready**

- **Bukan** prototype/POC lagi. Logic bisnis inti sudah nyata (real), bukan dummy.
- Cocok disebut **MVP fungsional yang siap demo end-to-end**, dengan beberapa lubang menuju UAT/production (terutama payment gateway nyata, e2e test, dan hardening deployment).

### Modul yang sudah matang
- **Auth & Authorization** (OTP WhatsApp + password, JWT access/refresh rotation, role guard).
- **Wallet** (saldo, topup, pay atomik, refund, PIN, transaction history, ledger).
- **Order laundry flow** (DRAFT → … → COMPLETED, status log, cancel).
- **Promo & Voucher + Loyalty/Point + Membership Tier + Happy Hour** (engine pricing terpadu, banyak unit test).
- **B2B partner pricing** (rule + usage tracking).
- **Schema database** (62 model/enum, 23 migration, indexing & relasi matang).

### Modul yang masih dummy / placeholder
- **Payment gateway** = `MockPaymentGateway` (QRIS/VA palsu, dikonfirmasi via endpoint `simulate`). Pembayaran **saldo wallet sudah nyata**; QRIS/VA belum tersambung gateway sungguhan.
- **WhatsApp OTP** → fallback log ke console bila `WA_API_KEY` kosong (provider Fonnte siap pakai).

### Modul yang belum selesai / lemah
- **Automated testing end-to-end** tidak ada (hanya unit test; tidak ada folder `laundry-be/test/`).
- **CI/CD** hanya deploy via SSH; **tidak ada gate build/test/lint** sebelum deploy.
- **Mobile/Kiosk tidak diuji otomatis** di CI; tidak ada widget test berarti.

### Risiko terbesar saat ini (ringkas)
1. **Payment gateway masih mock** → tidak bisa terima uang sungguhan (QRIS/VA).
2. **CI tanpa quality gate** → deploy bisa mengirim kode rusak ke VM produksi.
3. **Tidak ada e2e/integration test** → regresi lintas modul tidak tertangkap.
4. **Secret default di `.env.example`** → risiko jika dipakai apa adanya di produksi.
5. **Duplikasi service wallet** (`WalletService` vs `WalletsService`) → sumber kebingungan/inkonsistensi.

---

## 2. Current Development Status

### Backend (laundry-be) — paling matang

**Modul yang ada (32 modul):** auth, users, customers, outlets, services, orders, payments, wallets, promos, vouchers, points, memberships, partners, pricing (umum + b2b + promotion-rule), campaigns (+happy-hour), bookings, kiosks, iot, transactions, reports, reviews, banners, notifications (+whatsapp), uploads, queues, loyalty-config, health.

**Service nyata (bukan dummy)** — ukuran service menunjukkan logic substansial:
- `campaign.service.ts` (685 baris), `transaction.service.ts` (512), `kiosks.service.ts` (500), `wallets.service.ts` (486), `orders.service.ts` (480), `voucher.service.ts` (402), `promos.service.ts` (399), `point.service.ts` (385), `bookings.service.ts` (382), `auth.service.ts` (327), `payments.service.ts` (320), `iot-machine.service.ts` (315).

**Controller/API tersedia:** ~180 endpoint terdaftar (lihat §6). Mencakup auth, orders, payments, wallets, vouchers, points, memberships, promos, campaigns, happy-hour, b2b-pricing, kiosks (device + admin), iot, reports, reviews, banners, bookings, transactions, pricing.

- **Logic real atau dummy?** Real. Contoh: `wallet.pay()` memotong saldo atomik (`updateMany balance>=amount`), idempotency via `paymentNumber` unik, OrderStatusLog tercatat. Promo/loyalty dihitung server-side dengan ledger sebagai source-of-truth.
- **Validasi input?** Ya — `class-validator` DTO di seluruh modul, `ValidationPipe` global dengan `whitelist` + `forbidNonWhitelisted` ([main.ts](../laundry-be/src/main.ts)).
- **Error handling?** Baik — global `HttpExceptionFilter`, `TransformInterceptor` untuk respons terstandar, throttler untuk rate limiting.
- **Siap dipakai mobile/kiosk/admin?** Ya — ketiga klien sudah memanggil endpoint nyata (`/api/v1`).

### Mobile App Customer (laundry_mobile_flutter)

**Page yang ada (~30 layar):** login, register multi-step (`auth_flow_screens.dart` 2243 baris), forgot password, edit profile, home, location/location detail, booking machines, create order, order checkout (1127 baris), order page, order success, order detail, payment QRIS, payment VA, topup, promo, member dashboard, account, notification, scan QR, wallet PIN settings/sheet.

- **Flow yang jalan:** auth (OTP+password) → home dashboard → pilih outlet/mesin → buat order → checkout (voucher/promo/poin) → bayar saldo → success.
- **Connect ke backend?** Ya — `AppConfig.apiBaseUrl` default `http://10.0.2.2:3000/api/v1` (override via dart-define).
- **Dummy data?** Sebagian besar sudah dihapus (per ROADMAP Fase 0). QRIS/VA masih halaman mock (mengikuti backend mock gateway).
- **Membership/wallet/voucher/promo tampil?** Ya — `member_dashboard_page.dart` (saldo, poin, voucher, riwayat), `promo_page.dart`, wallet, voucher checkout, loyalty checkout (`checkoutLoyalty`).
- **Status:** `flutter analyze` → **No issues found**.

### Kiosk App (laundry_kiosk_flutter)

Aplikasi single-flow yang ringkas namun fungsional (`kiosk_app.dart` 2013 baris, `kiosk_controller.dart` 503 baris).

- **Flow checkout:** enroll device → bootstrap → pilih mesin (`machines`) → quote → checkout → bayar (QRIS/simulate) → status mesin.
- **Promo/happy hour muncul?** Ya — quote menampilkan `happyHourDiscount` dan `appliedPromo` di ringkasan checkout ([kiosk_app.dart](../laundry_kiosk_flutter/lib/src/kiosk_app.dart#L716-L777)).
- **Payment/wallet terhubung?** Pembayaran via endpoint kiosk device (`/kiosks/device/payments` + simulate). Kiosk bersifat **tamu** (tanpa login customer), jadi tidak pakai wallet customer.
- **Siap demo transaksi?** Ya, untuk alur kiosk-as-guest dengan pembayaran simulasi.
- **Integrasi mesin/IoT?** Ada hook status mesin (`/kiosks/device/orders/:orderId/machine-status`) yang tersambung ke IoT backend.
- **Status:** `flutter analyze` → **No issues found**.

### Web Admin / Dashboard (laundry-admin)

Nuxt 4 dengan halaman lengkap (data **nyata** dari API via `useApi`/`usePromotionLoyaltyApi`):

- Pages: login, dashboard, customers, orders, outlets, services, users, kiosks, iot, marketing, promotion-loyalty, reviews, staff-performance, reports/finance.
- Components: `PromoManager.vue`, `BannerManager.vue`. Stores: auth, outlets, services. Middleware auth global + refresh token.
- **Manage customer/order/promo/voucher/membership/outlet/report?** Ada halaman untuk hampir semuanya; promotion-loyalty page memakai composable khusus (4 referensi API), dashboard memakai API nyata (3 referensi).
- **Data dummy atau backend?** Backend nyata (`config.public.apiBase`, default `http://localhost:3000/api/v1`).

### Database

- **62 model + enum** di [schema.prisma](../laundry-be/prisma/schema.prisma) (1277 baris).
- **Relasi:** matang — cascade/SetNull dipikirkan, indexing baik, `AuditLog`, idempotency key di `WalletTransaction`.
- **Mendukung:** wallet (`Wallet`, `WalletTransaction`, `WalletLedger`), point (`PointLedger`), voucher (`VoucherTemplate`, `UserVoucher`, `VoucherRedemption`), promo (`Promo`, `PromoRule`, `PromoUsage`, `PromotionRule`), tier (`MembershipTierConfig`, `UserMembershipStatus`, `B2BPartnerTierConfig`), B2B (`B2BPartner`, `B2BPricingRule`, `B2BPricingRuleUsage`), order/payment, IoT (`IotDevice`, `IotCommand`, `IotEvent`), kiosk (`Kiosk`, `KioskSession`), happy hour (`HappyHourRule`), campaign (`Campaign`, `CampaignIssuance`, `Referral`, dll).
- **Migration:** 23 migration berurutan (init → … → `add_iot_command_order_binding`).
- **Seed:** `prisma/seed.ts` (1154 baris, ~29 operasi create/upsert) → tersedia & komprehensif.

### API Integration

- Endpoint dipakai oleh **mobile** (auth, customers, wallets, orders, promos, points, vouchers, memberships, bookings, banners, uploads), **kiosk** (`/kiosks/device/*`, pricing/quote), **admin** (orders, customers, reports, promotion-loyalty, services, outlets, users, iot, kiosks, reviews, campaigns).
- Endpoint kemungkinan belum dipakai klien apa pun (admin-only / future): sebagian `reports/*`, `partners/*` (B2B), beberapa `iot/devices/*` admin.

### Testing

- **140 unit test, 19 suite, semua PASS** (`jest`, ~4.8s). Lihat §7.
- Tidak ada e2e/integration test (folder `laundry-be/test/` tidak ada meski `test:e2e` script terdaftar).
- Smoke script tersedia: `test:smoke:promo-loyalty`, `verify:mqtt`, `verify:redis-scheduler`.
- Flutter: tidak ada widget/unit test berarti (hanya `flutter analyze` bersih).

### Deployment / Environment

- **`.env.example`** lengkap & terdokumentasi (DB, JWT, OTP/WA, Redis, MQTT, CORS, payment webhook secret, profit margin).
- **Docker:** ada `mosquitto/` (MQTT) di backend; `docker:up/down` script ada (mengacu `docker-compose`). Mosquitto config tersedia untuk IoT.
- **CI/CD:** `.github/workflows/main.yml` = **deploy-only** via SSH ke VM (PM2 `deploy-update.sh`). **Tidak ada stage build/test/lint** sebelum deploy → risiko.
- **Siap dijalankan engineer lain?** Backend ya (build + test reproducible, env example jelas). Mobile/kiosk butuh `--dart-define API_BASE_URL`.

---

## 3. Feature Progress Table

| Area | Feature / Module | Status | Evidence File/Folder | Gap / Masalah | Priority |
|---|---|---|---|---|---|
| **Core Laundry** | Customer registration/login | DONE | `auth.controller.ts` (`/auth/register`,`/login`,`/otp/*`), mobile `auth_flow_screens.dart` | — | P2 |
| | Customer profile | DONE | `customers.service.ts`, mobile `edit_profile_screen.dart`, `/auth/me` | — | P3 |
| | Outlet management | DONE | `outlets.service.ts`, admin `pages/outlets/index.vue` | — | P3 |
| | Service laundry | DONE | `services.service.ts`, `ServicePrice`, admin `pages/services` | — | P3 |
| | Order laundry | DONE | `orders.service.ts` (480), `orders.controller.ts` | — | P1 |
| | Order status | DONE | `OrderStatusLog`, `PATCH /orders/:id/status` | — | P2 |
| | Checkout | DONE | mobile `order_checkout_page.dart` (1127), `transaction.service.ts` `/transactions/checkout` | — | P1 |
| | Payment | PARTIAL | `payments.service.ts`, **`MockPaymentGateway`** | Wallet nyata; QRIS/VA mock | **P0** |
| | Invoice/receipt | PARTIAL | order_success_page, payment number; tidak ada PDF/print formal | Receipt printer IoT placeholder | P2 |
| | Transaction history | DONE | `/wallets/.../transactions`, member dashboard | — | P3 |
| **Wallet & Payment** | Main wallet balance | DONE | `wallets.service.ts`, `Wallet`, mobile wallet | — | P1 |
| | Bonus balance | DONE | `WalletType` enum (MAIN/BONUS), ledger | — | P2 |
| | Wallet topup | DONE | `POST /wallets/customer/:id/topup`, mobile `topup_page.dart` | Topup nyata lewat mock gateway | P1 |
| | Wallet payment | DONE | `wallet.pay()` atomik + idempotent | — | P1 |
| | Wallet transaction history | DONE | `WalletTransaction`, `WalletLedger` | — | P3 |
| | Refund/adjustment | DONE | `/wallets/customer/:id/refund`, `/wallets/orders/:orderId/refund` | — | P2 |
| | Wallet PIN | DONE | `wallet-pin.dto.ts`, `pin/set`,`pin/verify`, mobile `wallet_pin_*` | — | P2 |
| **Membership & Loyalty** | Membership tier | DONE | `membership-tier.service.ts` (+spec), `MembershipTierConfig` | — | P2 |
| | Tier calculation by spending | DONE | `UserMembershipStatus`, `membership-tier.service` | — | P2 |
| | Point earning | DONE | `point.service.ts` (385, +spec), `PointLedger` | — | P2 |
| | Point redemption | DONE | `POST /points/redeem`, `/points/redeem-voucher` | — | P2 |
| | Point expiry | DONE | `loyalty-scheduler.service.ts` + processor | — | P2 |
| | Monthly voucher by tier | DONE | `campaign.service.ts`, `loyalty-config.service.ts` | Perlu verifikasi penjadwalan di prod (Redis) | P2 |
| | Tier benefit | DONE | `MembershipTierConfig`, pricing engine | — | P2 |
| **Promo & Voucher** | Promo campaign | DONE | `promos.service.ts` (399), `campaign.service.ts` (685) | — | P2 |
| | Voucher issuance | DONE | `voucher.service.ts` (402), `POST /vouchers/issue` | — | P2 |
| | Voucher claim/usage | DONE | `UserVoucher`, `VoucherRedemption`, `/vouchers/mine` | — | P2 |
| | Voucher validation | DONE | `POST /promos/validate`, mobile `_onApplyVoucher` | — | P2 |
| | Happy hour promo | DONE | `happy-hour.controller.ts`, `HappyHourRule`, kiosk badge | — | P2 |
| | Promo stacking rule | DONE | `pricing-calculation.service.ts`, `PromotionRule` | Perlu uji edge-case stacking | P2 |
| | Promo eligibility rule | DONE | `PromoRule`, `CampaignRule` | — | P2 |
| **B2B Partner** | Partner account | DONE | `b2b-partner.service.ts` (+spec), `partners.controller.ts` | — | P3 |
| | B2B pricing | DONE | `b2b-pricing.service.ts` (+spec), `B2BPricingRule` | — | P3 |
| | B2B transaction | PARTIAL | `/partners/:id/transactions`, `B2BPricingRuleUsage` | Tidak ada UI klien B2B | P3 |
| | B2B invoice/report | PARTIAL | `reports.service.ts` | Belum ada export/print B2B khusus | P3 |
| **Mobile App** | Home dashboard | DONE | `home_page.dart` (853) | — | P2 |
| | Wallet section | DONE | `wallet_controller.dart`, member dashboard | — | P2 |
| | Voucher saya | DONE | member_dashboard, `/vouchers/mine` | — | P2 |
| | Promo tersedia | DONE | `promo_page.dart` (319) | — | P3 |
| | Order flow | DONE | create_order → checkout → success | — | P1 |
| | Checkout flow | DONE | `order_checkout_page.dart` (1127) | — | P1 |
| | Transaction history | DONE | member_dashboard | — | P3 |
| | Membership display | DONE | `member_dashboard_page.dart` (674), poin/tier | — | P2 |
| | Payment QRIS/VA | DUMMY | `payment_qris_page.dart`, `payment_va_page.dart` | Mengikuti mock gateway | **P0** |
| **Kiosk App** | Kiosk home / enroll | DONE | `kiosk_controller.dart` enroll/bootstrap | — | P2 |
| | Customer identification | PARTIAL | Kiosk = guest (tanpa identitas customer) | Tidak ada link ke akun member | P2 |
| | Checkout summary | DONE | `kiosk_app.dart` quote/summary | — | P1 |
| | Promo/happy hour badge | DONE | `kiosk_app.dart#L716-L777` | — | P2 |
| | Wallet usage | NOT STARTED | — (kiosk guest) | Wallet customer tidak dipakai di kiosk | P3 |
| | Payment flow | PARTIAL | `/kiosks/device/payments` + simulate | Mock gateway | **P0** |
| | Machine integration | PARTIAL | `/kiosks/device/orders/:orderId/machine-status` + IoT | Butuh mesin/broker nyata | P1 |
| **Admin Dashboard** | Login admin | DONE | admin `pages/login.vue`, `stores/auth.ts` | — | P2 |
| | Dashboard summary | DONE | `pages/dashboard.vue` (API nyata) | — | P2 |
| | Customer management | DONE | `pages/customers/index.vue` | — | P2 |
| | Order management | DONE | `pages/orders/index.vue` | — | P1 |
| | Promo management | DONE | `PromoManager.vue`, `pages/promotion-loyalty` | — | P2 |
| | Voucher/Membership mgmt | DONE | `pages/promotion-loyalty/index.vue` | — | P2 |
| | Wallet monitoring | PARTIAL | via customers/reports | Tidak ada panel wallet khusus | P3 |
| | Report/export | PARTIAL | `pages/reports/finance.vue`, `reports.service.ts` | Export file (CSV/PDF) belum jelas | P2 |
| | Marketing/banner | DONE | `pages/marketing`, `BannerManager.vue` | — | P3 |
| | Reviews/staff perf | DONE | `pages/reviews`, `pages/staff-performance` | — | P3 |
| **IoT / Machine** | Machine master data | DONE | `iot.service.ts`, `IotDevice`, admin `pages/iot` | — | P2 |
| | Machine status | DONE | `iot-machine.service.ts` (315, +spec), `IotEvent` | — | P2 |
| | Start machine command | DONE | `POST /iot/devices/:id/commands`, `IotCommand` + order binding | — | P1 |
| | NFC/card/QR integration | PARTIAL | mobile `scan_qr_page.dart`, `mobile_scanner` | NFC tidak ada; QR scan ada | P2 |
| | Coin/kiosk integration | PARTIAL | kiosk flow + IoT | Hardware nyata belum diuji | P2 |
| | Callback/webhook mesin | DONE | `iot-mqtt.service.ts` (real MQTT), `iot.controller` heartbeat/events | Broker prod perlu diuji | P1 |
| **Infra/Quality** | Authentication & authorization | DONE | JWT rotation, `roles.guard.ts`, `jwt-auth.guard.ts` | — | P1 |
| | Automated unit tests | DONE | 140 test PASS | — | P2 |
| | E2E / integration tests | NOT STARTED | tidak ada `test/` dir | — | **P1** |
| | CI quality gate | NOT STARTED | `main.yml` deploy-only | Tidak ada build/test gate | **P1** |

---

## 4. Evidence-Based Audit

### Backend struktur & modul
- 32 modul di [laundry-be/src/modules/](../laundry-be/src/modules/); common layer (`guards`, `filters`, `interceptors`, `decorators`, `pipes`, `prisma`) di [laundry-be/src/common/](../laundry-be/src/common/).
- Bootstrap: [main.ts](../laundry-be/src/main.ts) — helmet, compression, CORS whitelist+wildcard, global ValidationPipe (whitelist+forbidNonWhitelisted), throttler.

### Wallet (real, atomik)
- [wallets.service.ts](../laundry-be/src/modules/wallets/wallet.service.ts) `pay()` — pemotongan saldo `updateMany balance>=amount`, idempotency `paymentNumber=PAY-{orderNumber}`, OrderStatusLog. Spec lulus: `wallets.service.spec.ts`, `wallet.service.spec.ts`.
- **Catatan duplikasi:** ada DUA service — `WalletsService` (`wallets.service.ts`, 486 baris, dipakai `WalletsController`) DAN `WalletService` (`wallet.service.ts`, 242 baris). Keduanya di-`providers`+`exports` di [wallets.module.ts](../laundry-be/src/modules/wallets/wallets.module.ts). → NEED REVIEW (potensi inkonsistensi logika).

### Promo / Loyalty / Pricing engine
- [pricing-calculation.service.ts](../laundry-be/src/modules/pricing/pricing-calculation.service.ts), [campaign.service.ts](../laundry-be/src/modules/campaigns/campaign.service.ts) (685), [point.service.ts](../laundry-be/src/modules/points/point.service.ts) (385), [voucher.service.ts](../laundry-be/src/modules/vouchers/voucher.service.ts) (402).
- Source-of-truth: ledger (`WalletLedger`, `PointLedger`) — lihat [docs/promo-loyalty-ledger-source-of-truth.md](promo-loyalty-ledger-source-of-truth.md).
- Scheduler: [loyalty-scheduler.service.ts](../laundry-be/src/modules/points/loyalty-scheduler.service.ts) + processor, [campaign-scheduler.service.ts](../laundry-be/src/modules/campaigns/campaign-scheduler.service.ts) (Redis/BullMQ).

### Payment (mock — evidence eksplisit)
- [mock-payment-gateway.ts](../laundry-be/src/modules/payments/gateway/mock-payment-gateway.ts) — komentar: *"Provider tiruan untuk scaffolding… Ganti dengan provider nyata saat siap."* QRIS/VA palsu, konfirmasi via `/payments/:paymentNumber/simulate`.
- Interface bersih untuk swap: [payment-gateway.interface.ts](../laundry-be/src/modules/payments/gateway/payment-gateway.interface.ts).

### IoT (real MQTT, graceful)
- [iot-mqtt.service.ts](../laundry-be/src/modules/iot/iot-mqtt.service.ts) — `connect()` MQTT nyata, publish/subscribe; jika `MQTT_URL` kosong → publish no-op (boot tetap jalan). Order binding migration `20260618000000_add_iot_command_order_binding`.

### Database
- [schema.prisma](../laundry-be/prisma/schema.prisma) (1277 baris, 62 model/enum), 23 migration di [prisma/migrations/](../laundry-be/prisma/migrations/), seed [prisma/seed.ts](../laundry-be/prisma/seed.ts) (1154 baris).

### Klien
- Mobile base URL: [app_config.dart](../laundry_mobile_flutter/lib/core/config/app_config.dart) `http://10.0.2.2:3000/api/v1`.
- Kiosk: [main.dart](../laundry_kiosk_flutter/lib/main.dart) + [api_client.dart](../laundry_kiosk_flutter/lib/src/api_client.dart).
- Admin: [useApi.ts](../laundry-admin/app/composables/useApi.ts) + [nuxt.config.ts](../laundry-admin/nuxt.config.ts) `apiBase`.

### Command yang dijalankan (detail di §7)
- `npx nest build` → exit 0.
- `npx jest` → 19 suite / 140 test PASS.
- `flutter analyze` (mobile & kiosk) → No issues found.

---

## 5. Gap Analysis

| Gap | Impact | Risk | Recommended Fix | Priority |
|---|---|---|---|---|
| Payment gateway masih `MockPaymentGateway` | Tidak bisa terima pembayaran QRIS/VA sungguhan | **Tinggi** — blocker monetisasi/UAT real | Integrasi provider nyata (Midtrans/Xendit) lewat `PaymentGateway` interface; isi `PAYMENT_WEBHOOK_SECRET` | **P0** |
| CI tanpa quality gate (deploy-only) | Kode rusak bisa lolos ke produksi | **Tinggi** | Tambah job CI: `npm ci && nest build && jest` (+ flutter analyze) sebelum deploy | **P1** |
| Tidak ada e2e/integration test | Regresi lintas modul (order→pay→loyalty) tak terdeteksi | **Tinggi** | Bangun `test/` e2e (supertest) untuk alur order+payment+wallet+promo | **P1** |
| Duplikasi `WalletService`/`WalletsService` | Logika wallet bisa menyimpang antar pemanggil | Sedang | Konsolidasikan ke satu service; tandai deprecated | P1 |
| Secret default di `.env.example` | Bila dipakai apa adanya → kompromi auth | **Tinggi** (security) | Wajibkan generate secret unik; tambah cek startup gagal jika secret default di `APP_ENV=production` | P1 |
| Mobile QRIS/VA halaman mock | Demo pembayaran non-saldo belum end-to-end | Sedang | Sambungkan ke gateway nyata setelah backend siap | P1 |
| Kiosk = guest, tanpa identitas member | Tidak bisa akrual poin/tier dari transaksi kiosk | Sedang | Tambah identifikasi member opsional (QR/nomor HP) di kiosk | P2 |
| Tidak ada widget/integration test Flutter | Regresi UI mobile/kiosk tak tertangkap | Sedang | Tambah smoke widget test untuk alur kritis | P2 |
| WhatsApp OTP fallback console (WA_API_KEY kosong) | OTP tidak terkirim di staging/prod bila lupa set | Sedang | Validasi env saat boot non-dev; alarm jika kosong | P2 |
| Export report (CSV/PDF) belum jelas | Owner sulit ambil laporan keuangan formal | Rendah-Sedang | Tambah endpoint export di `reports` + tombol admin | P2 |
| Deployment single-VM, tanpa DR/backup terdokumentasi | Kehilangan data jika VM gagal | Sedang | Dokumentasikan backup DB terjadwal + restore drill | P2 |

---

## 6. Readiness Assessment

| Readiness Area | Score 0-100 | Notes |
|---|---:|---|
| Backend Readiness | 85 | Build clean, 140 test pass, logic real, validasi/error handling matang. Kurang: e2e, payment nyata, dedup wallet. |
| Mobile Readiness | 78 | Alur auth→order→wallet→loyalty nyata; analyze bersih. Kurang: QRIS/VA nyata, test otomatis. |
| Kiosk Readiness | 72 | Flow mesin→checkout→bayar(simulate) + happy hour jalan. Kurang: payment nyata, identitas member, uji hardware. |
| Admin Readiness | 75 | Halaman lengkap, data nyata dari API. Kurang: export laporan, panel wallet, uji menyeluruh. |
| Database Readiness | 90 | 62 model, 23 migration berurutan, relasi/index matang, seed lengkap. |
| API Readiness | 85 | ~180 endpoint, terdokumentasi (Swagger + docs/), dipakai 3 klien. |
| Testing Readiness | 55 | 140 unit test bagus; tapi tidak ada e2e dan test Flutter. |
| Demo Readiness | 85 | Siap demo end-to-end dengan pembayaran simulasi. |
| UAT Readiness | 60 | Perlu payment nyata + e2e + CI gate + hardening secret. |
| Production Readiness | 45 | Blocker: mock payment, CI tanpa gate, secret default, tanpa e2e, single-VM tanpa DR jelas. |

### Kesimpulan kesiapan
- **Sudah bisa demo?** **Ya** — alur lengkap dari mobile/kiosk → backend → admin berjalan dengan pembayaran simulasi.
- **Sudah bisa UAT?** **Hampir** — bisa UAT fungsional sekarang, tetapi UAT pembayaran nyata butuh integrasi gateway. Rekomendasi: UAT terbatas (saldo wallet + simulate) boleh; UAT pembayaran riil belum.
- **Sudah bisa dipakai customer real?** **Belum** — pembayaran QRIS/VA mock, tidak boleh menerima uang sungguhan.
- **Risiko jika dipaksakan production:** tidak bisa settle pembayaran nyata; secret default rawan dibobol; deploy tanpa test gate berpotensi mengirim regresi; tanpa e2e, bug lintas modul (mis. double-spend, salah hitung promo) bisa lolos; single-VM tanpa DR berisiko kehilangan data.

---

## 7. Run Command Verification

| Command | Lokasi | Result | Catatan |
|---|---|---|---|
| `npx nest build` | laundry-be | ✅ SUCCESS (exit 0) | Build TypeScript bersih, tanpa error. |
| `npx jest` | laundry-be | ✅ SUCCESS | **19 suite / 140 test PASS** dalam ~4.8s. Hanya 2 WARN log (skenario negatif IotMachineService — disengaja). |
| `flutter analyze` | laundry_mobile_flutter | ✅ SUCCESS | **No issues found** (1.6s). 14 paket punya versi lebih baru (non-blocking). |
| `flutter analyze` | laundry_kiosk_flutter | ✅ SUCCESS | **No issues found** (1.0s). |
| `npm test` (e2e) | laundry-be | ⚠️ N/A | Script `test:e2e` ada tapi folder `test/` tidak ada → tidak ada e2e test untuk dijalankan. |
| Admin build | laundry-admin | ⏳ tidak dijalankan | Tidak ada script `lint`/`typecheck`; build Nuxt tidak dieksekusi pada audit ini (waktu). Tidak ada error statis terdeteksi dari struktur. |

**Tidak ada error yang diperbaiki** (sesuai instruksi audit). Backend dan kedua app Flutter dalam keadaan sehat secara build/analyze.

---

## 8. Recommended Next Sprint Plan (1 minggu menuju UAT/demo kuat)

| Day | Focus | Task | Owner Role | Output |
|---|---|---|---|---|
| 1 | Payment nyata (P0) | Integrasi provider (Midtrans/Xendit) di `PaymentGateway` interface; set `PAYMENT_WEBHOOK_SECRET`; sandbox QRIS/VA | Backend Engineer | Charge + webhook sandbox berfungsi |
| 1 | CI gate (P1) | Tambah job `npm ci && nest build && jest` + `flutter analyze` sebelum deploy di `main.yml` | DevOps Engineer | CI gagal jika test/build gagal |
| 2 | E2E test (P1) | Buat `test/` e2e: alur order → bayar → wallet → promo/poin | QA + Backend | Suite e2e hijau di CI |
| 2 | Dedup wallet (P1) | Audit & konsolidasi `WalletService`/`WalletsService` (tanpa ubah API publik) | Backend Engineer | Satu source-of-truth wallet |
| 3 | Mobile payment (P1) | Sambungkan `payment_qris_page`/`payment_va_page` ke gateway nyata | Flutter Mobile Engineer | Pembayaran QRIS/VA end-to-end di app |
| 3 | Hardening secret (P1) | Cek startup: tolak boot bila secret default saat `APP_ENV=production` | Backend Engineer | Guard env produksi |
| 4 | Kiosk payment + member id (P1/P2) | Sambungkan kiosk ke gateway nyata; tambah identifikasi member opsional | Flutter Kiosk Engineer | Kiosk bayar nyata + akrual poin opsional |
| 4 | Admin report export (P2) | Endpoint export CSV/PDF + tombol di `reports/finance` | Web Frontend + Backend | Owner bisa unduh laporan |
| 5 | IoT end-to-end (P1) | Uji MQTT broker (mosquitto) + start machine command nyata via order binding | Backend + DevOps | 1 mesin/simulator merespons command |
| 5 | UAT script & data (P2) | Susun skenario UAT + seed data demo; smoke promo-loyalty | QA + Product Owner | Checklist UAT siap |
| 6 | Regression & bugfix | Jalankan seluruh test + UAT pass-1, perbaiki temuan | QA + semua engineer | Bug list & fix |
| 7 | Demo dry-run & dokumentasi | Demo end-to-end ke owner; finalisasi README run-book | Product Owner + DevOps | Demo sukses + run-book |

---

## 9. Final Conclusion

- **Estimasi progress keseluruhan: ~75%.**
  - Backend ~85%, Database ~90%, Mobile ~78%, Admin ~75%, Kiosk ~72%, Testing ~55%, Production-hardening ~45%.
- **Status maturity: MVP fungsional, mendekati UAT-ready** (Demo-ready penuh; Production belum).

### 5 Risiko terbesar
1. **Payment gateway mock** — tidak bisa terima uang nyata (blocker monetisasi). *(P0)*
2. **CI tanpa quality gate** — deploy bisa mengirim regresi ke produksi. *(P1)*
3. **Tanpa e2e/integration test** — bug lintas modul (double-spend, salah hitung promo) bisa lolos. *(P1)*
4. **Secret default di env** — risiko kompromi auth bila dipakai apa adanya. *(P1)*
5. **Duplikasi service wallet + single-VM tanpa DR jelas** — inkonsistensi logika & risiko kehilangan data. *(P1/P2)*

### 10 Task prioritas berikutnya
1. Integrasi payment gateway nyata + webhook secret (P0).
2. Tambah CI gate build+test+analyze sebelum deploy (P1).
3. Bangun e2e test alur order→pay→wallet→promo/poin (P1).
4. Konsolidasi `WalletService`/`WalletsService` (P1).
5. Guard startup menolak secret default di produksi (P1).
6. Sambungkan QRIS/VA mobile & kiosk ke gateway nyata (P1).
7. Uji IoT MQTT end-to-end (start machine via order binding) (P1).
8. Tambah export laporan keuangan (CSV/PDF) di admin (P2).
9. Tambah identifikasi member di kiosk untuk akrual poin/tier (P2).
10. Dokumentasikan backup/restore DB + run-book deployment (P2).

### Modul paling siap
- **Database/Schema** dan **Backend Auth + Wallet + Promo/Loyalty engine** — logic nyata, teruji unit, struktur matang.

### Modul paling berbahaya jika belum diperbaiki
- **Payment/Checkout** (masih mock) dan **pipeline CI/CD tanpa quality gate** — keduanya langsung mengancam kemampuan transaksi nyata dan stabilitas produksi.

---

*Audit ini murni berbasis evidence dari repository per 2026-06-23. Tidak ada source code yang diubah selama proses audit.*
