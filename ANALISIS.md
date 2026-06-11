# Analisis Project DiCuciin — Sistem Laundry Multi-Platform

> Dokumen ini berisi hasil analisis arsitektur, kualitas kode, dan saran perbaikan.
> Dibuat: 2026-05-29 · Cakupan: backend, admin web, mobile, deployment.

---

## 1. Gambaran Umum

**DiCuciin** adalah monorepo sistem manajemen laundry multi-platform dengan 4 komponen:

| Komponen | Path | Stack | Status |
|----------|------|-------|--------|
| Backend API | [laundry-be](laundry-be/) | NestJS 10 + Prisma + PostgreSQL + Redis/BullMQ + MQTT | Paling matang |
| Admin Web | [laundry-admin](laundry-admin/) | Nuxt 4 + Pinia + Nuxt UI | Kerangka halaman lengkap |
| Mobile App | [laundry_mobile_flutter](laundry_mobile_flutter/) | Flutter + Provider + http | Baru auth + customer |
| Deployment | [deploy](deploy/) | PM2 + Nginx + Docker (infra) + GitHub Actions | Functional, single-VM |

### Cakupan Domain
- **Multi-outlet** dengan harga layanan per outlet (`ServicePrice`).
- **7 role**: SUPER_ADMIN, OWNER, ADMIN_OUTLET, CASHIER, OPERATOR, TECHNICIAN, CUSTOMER.
- **Workflow order laundry**: DRAFT → WAITING_PAYMENT → PAID → RECEIVED → WASHING → DRYING → IRONING → PACKING → READY_PICKUP → OUT_FOR_DELIVERY → COMPLETED (plus CANCELLED/REFUNDED).
- **Wallet / e-money** dengan top-up, payment, refund, idempotency key.
- **Promo** (percentage, fixed, cashback, free delivery) dengan rules & kuota.
- **IoT** via MQTT: KIOSK, DIGITAL_SCALE, RECEIPT/LABEL_PRINTER, SMART_LOCKER, WASHING/DRYER_MACHINE, QR_SCANNER.

---

## 2. Yang Sudah Bagus 👍

1. **Arsitektur backend rapi** — modular NestJS, separation of concerns jelas (`common/` berisi guards, interceptors, filters, decorators; `modules/` per domain).
2. **Auth solid (di atas rata-rata)** — JWT access/refresh terpisah, **refresh token rotation**, token di-hash SHA-256 sebelum disimpan ke DB, housekeeping token expired/revoked, bcrypt dengan salt rounds dari env. Lihat [auth.service.ts](laundry-be/src/modules/auth/auth.service.ts).
3. **Security middleware** — `helmet`, `compression`, CORS dengan whitelist + dukungan wildcard + bypass localhost di non-prod, `ValidationPipe` dengan `whitelist` + `forbidNonWhitelisted` (menolak field asing). Lihat [main.ts](laundry-be/src/main.ts).
4. **Skema Prisma komprehensif** — indexing bagus, kebijakan cascade/SetNull dipikirkan, ada `AuditLog`, idempotency key di `WalletTransaction`.
5. **Async processing** — BullMQ untuk notifikasi / payment-callback / IoT command, plus MQTT untuk komunikasi perangkat.
6. **Praktik baik lain** — `.env` sudah di-gitignore (tidak ter-commit), CI/CD zero-downtime via `pm2 reload`, response/error terstandarisasi via interceptor & exception filter global.

---

## 3. Masalah & Saran (urut prioritas)

### 🔴 P1 — Uang disimpan sebagai `Float`
**Lokasi:** [schema.prisma](laundry-be/prisma/schema.prisma) — `Wallet.balance`, `WalletTransaction.amount/balanceBefore/balanceAfter`, `Order.subtotal/totalAmount`, `ServicePrice.price`, dll.

**Masalah:** floating point tidak akurat untuk uang (mis. `0.1 + 0.2 ≠ 0.3`). Akan menimbulkan selisih saldo & total yang sulit dilacak.

**Saran:** ganti ke `Decimal @db.Decimal(14, 2)`. Sesuaikan kode TypeScript untuk memakai `Prisma.Decimal` / library decimal saat aritmatika.

---

### 🔴 P2 — Race condition di Wallet
**Lokasi:** [wallets.service.ts:79-94](laundry-be/src/modules/wallets/wallets.service.ts#L79-L94) (topup), juga `pay()` dan `refund()`.

**Masalah:** saldo dibaca **di luar** `$transaction`, lalu dipakai sebagai `balanceBefore`. Dua request bersamaan → *lost update* atau saldo bisa minus (overspend). Cek `idempotencyKey` juga di luar transaksi (check-then-act yang racy).

**Saran:**
- Baca ulang wallet **di dalam** `$transaction` dengan row lock (`SELECT ... FOR UPDATE` via `$queryRaw`) **atau** gunakan update atomik `{ balance: { increment } / { decrement } }`.
- Untuk pay, validasi saldo cukup di dalam transaksi (atau `updateMany` dengan kondisi `balance >= amount` lalu cek `count`).
- Andalkan unique constraint `idempotencyKey` dan tangkap error Prisma `P2002`, bukan cek manual sebelumnya.

---

### 🟠 P3 — `wallet.pay()` tidak menutup pembayaran order
**Lokasi:** [wallets.service.ts:147](laundry-be/src/modules/wallets/wallets.service.ts#L147).

**Masalah:** hanya membuat `WalletTransaction`. Tidak membuat record `Payment`, tidak mengubah `Order.status` menjadi `PAID`. Alur bayar-via-wallet jadi setengah jadi.

**Saran:** dalam satu transaksi, buat `Payment` (status PAID, method WALLET), update `Order.status`, tulis `OrderStatusLog`, lalu kurangi saldo.

---

### 🟠 P4 — Tidak ada test
**Masalah:** Jest sudah dikonfigurasi tapi **0 file `.spec.ts`**; Flutter hanya punya `widget_test.dart` default. Untuk sistem yang memegang uang, ini berisiko.

**Saran:** prioritaskan unit test untuk `wallets`, `orders`, dan `auth`. Tambahkan e2e dasar untuk alur login → buat order → bayar.

---

### 🟡 P5 — Tidak ada rate limiting
**Masalah:** endpoint `/auth/login` & `/register` tanpa proteksi → rawan brute force / spam registrasi.

**Saran:** pasang `@nestjs/throttler`, ketat di endpoint auth.

---

### 🟡 P6 — Perbaikan kecil lainnya
- **Password DB hardcoded** di [docker-compose.yml](laundry-be/docker-compose.yml#L11) (`laundry_password`) — jadikan variabel env untuk produksi.
- **N+1 query** di order create ([orders.service.ts:57](laundry-be/src/modules/orders/orders.service.ts#L57)): `servicePrice.findFirst` di-loop per item — batch dengan satu `findMany { serviceId: { in: [...] } }`.
- **Promo tidak atomik**: `promo.update` increment ([orders.service.ts:160](laundry-be/src/modules/orders/orders.service.ts#L160)) terpisah dari pembuatan order; cek kuota juga racy. Bungkus dalam satu transaksi + update kondisional kuota.
- **Urutan deploy berisiko**: `prisma migrate deploy` jalan **sebelum** `npm run build` di [deploy-update.sh](deploy/scripts/deploy-update.sh#L31). Jika build gagal, schema sudah maju tapi kode lama masih jalan. Tambahkan backup DB sebelum migrate & pertimbangkan urutan build→migrate→reload.
- **Logging**: `console.log` di [main.ts](laundry-be/src/main.ts#L94) — pakai logger terstruktur (Nest Logger / pino).
- **Kode status keliru kecil**: `getMe` melempar `UnauthorizedException` untuk "User not found" ([auth.service.ts:164](laundry-be/src/modules/auth/auth.service.ts#L164)) — idealnya `NotFoundException`.

---

## 4. Catatan per Komponen

### Backend (`laundry-be`)
Komponen paling lengkap. Module: auth, users, customers, outlets, services, orders, payments (via wallet), wallets, promos, kiosks, iot, queues, notifications, reports, uploads, health. Fokus perbaikan ada di tabel di atas (uang & konkurensi).

### Admin Web (`laundry-admin`)
Nuxt 4, sudah ada store (auth/outlets/services), composable `useApi`, middleware auth global, dan halaman untuk dashboard, customers, kiosks, outlets, iot, users, orders, promos, services, reports/finance. Perlu dicek kelengkapan integrasi tiap halaman ke API.

### Mobile (`laundry_mobile_flutter`)
Baru fitur auth (login/register/edit profile) dan customer (home, create order, order detail). Belum ada flow operator/cashier/teknisi. Arsitektur `core/` + `features/` sudah rapi.

### Deployment (`deploy`)
Single-VM: Docker hanya untuk infra (Postgres/Redis/Mosquitto), aplikasi via PM2, reverse proxy Nginx, deploy otomatis via GitHub Actions SSH saat push ke `main`. Solid untuk skala awal; tambahkan backup DB & monitoring error.

---

## 5. Roadmap Saran

**Segera (sebelum produksi / uang nyata):**
- [ ] P1 — migrasi kolom uang ke `Decimal`
- [ ] P2 — perbaiki race condition wallet (row lock / atomic update)
- [ ] P3 — lengkapi alur pembayaran order via wallet
- [ ] P5 — rate limiting di endpoint auth

**Jangka pendek:**
- [ ] P4 — unit test wallet/order/auth
- [ ] Structured logging
- [ ] Backup DB otomatis di pipeline deploy

**Jangka menengah:**
- [ ] Lengkapi fitur Flutter (operator/cashier/teknisi)
- [ ] Error monitoring (Sentry)
- [ ] Hardening promo (atomik + anti-abuse)
