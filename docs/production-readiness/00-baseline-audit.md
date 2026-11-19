# 00 — Baseline Audit (Di.Cuciin Production Readiness)

Tanggal: 19 Nov 2026 · Sumber kebenaran: repository `main` (commit `70dedee` + perubahan lokal).
Dokumen ini memetakan temuan audit ([Audit-Aplikasi-Mobile-2026-11-19.pdf](../Audit-Aplikasi-Mobile-2026-11-19.pdf)) ke kode aktual sebelum perbaikan.

## 1. Arsitektur aktual

| Komponen | Path | Catatan |
|---|---|---|
| Backend | `laundry-be/` | NestJS 10, Prisma 5, PostgreSQL 16, BullMQ + Redis, MQTT (Mosquitto) |
| Admin | `laundry-admin/` | Nuxt 4 + Nuxt UI 4 |
| Mobile | `laundry_mobile_flutter/` | Flutter, provider, `flutter_secure_storage`, `mobile_scanner` |
| Kiosk | `laundry_kiosk_flutter/` | Flutter; memakai endpoint `/kiosks/device/*` (auth token perangkat, `@Public`) |
| Deploy | `deploy/` | PM2 (`ecosystem.config.cjs`), Nginx, `scripts/deploy-update.sh` |

**Auth backend.** Guard global (`app.module.ts`): `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`.
`req.user = { userId, email, role }` (`modules/auth/jwt.strategy.ts`). `@Roles(...)` dibaca `RolesGuard`; route tanpa `@Roles` terbuka untuk **semua** user login (termasuk `CUSTOMER`). `@Public()` melewati JWT.
Role: `SUPER_ADMIN, OWNER, ADMIN_OUTLET, CASHIER, OPERATOR, TECHNICIAN, CUSTOMER`.

**Pola kepemilikan yang sudah ada (benar):** `PointService.assertWalletAccess`, `WalletsService.getOwnedCustomer` (PIN), `BookingsService` (pakai `req.user`), `PaymentsService.createGatewayPayment`, `UploadsController` profile.

## 2. Pengujian otomatis yang ada

22 file `*.spec.ts` (unit test dengan mock Prisma), 174 test lulus. **Belum ada** test e2e/HTTP (`test/jest-e2e.json` direferensikan di `package.json` tetapi folder `test/` tidak ada). `supertest` dan `@nestjs/testing` tersedia.

## 3. Sapuan route terbuka (tanpa `@Roles`, bukan `@Public`)

Dihasilkan dengan memindai semua `*.controller.ts`. Route yang memakai `req.user` untuk membatasi data ditandai ✓.

| Route | Status sebelum perbaikan | Temuan |
|---|---|---|
| `PATCH /users/:id`, `GET /users/:id` | Terbuka; DTO menerima `role`, `password`, `isActive` | K5, K12 |
| `GET /customers`, `GET /customers/:id`, `/:id/orders`, `/:id/wallet`, `/:id/stats` | Terbuka, tanpa cek pemilik (terverifikasi live: 5 customer terbaca) | K6 |
| `GET /orders`, `GET /orders/summary/dashboard`, `/summary/finance` | Terbuka (live: 28 order terbaca) | K6 |
| `GET /orders/:id` | Terbuka, tanpa cek pemilik | K6 |
| `PATCH /orders/:id/status` | Terbuka, tanpa aturan transisi | K7 |
| `POST /orders/:id/cancel` | Terbuka, tanpa cek pemilik | **K11 (baru)** |
| `POST /orders` | `customerId` dari body tidak dicocokkan dengan user | **K11 (baru)** |
| `POST /wallets/customer/:id/topup` | Terbuka, kredit saldo tanpa bayar | K1 |
| `POST /wallets/customer/:id/pay` | Nominal dari klien, tanpa cek pemilik | K4 |
| `POST /wallets/customer/:id/refund` | Customer me-refund sendiri | K3 |
| `GET /wallets/customer/:id`, `/transactions` | Tanpa cek pemilik | K6 |
| `POST /transactions/topup` | Terbuka, kredit saldo tanpa bayar | **K9 (baru)** |
| `POST /transactions/checkout`, `/quote`, `POST /pricing/calculate` | `customerId`/`partnerId` dari body: checkout bisa memotong saldo customer lain | **K8 (baru)** |
| `POST /iot/devices/:id/commands`, `/heartbeat`; `GET /iot/devices*` | Terbuka: customer bisa mengirim perintah ke mesin | **K10 (baru)** |
| `GET /kiosks`, `/kiosks/:id`, `/kiosks/assigned`, sesi kiosk staf | Terbuka | K12 |
| `GET /payments/:paymentNumber/status` | Tanpa cek pemilik | K6 |
| `GET /reviews/focused`, `/reviews/order/:orderId` | Terbuka | K12 |
| `POST /uploads/image`, `/uploads/payment/:orderId/proof` | Terbuka / tanpa cek pemilik | K12 |
| `POST /payments/:n/simulate` | Ditolak saat `APP_ENV=production` (sudah) | — |
| `/bookings/*`, `/mobile/me/*`, `/points/*`, `/vouchers/mine`, `/memberships/me`, `/promos/validate`, `/payments/gateway` | Memakai `req.user` ✓ | — |
| `GET /outlets*`, `/services*`, `/banners*`, `/promos*`, `/bookings/occupancy` | Data katalog publik untuk app — dibiarkan | — |

## 4. Konsumen endpoint (kompatibilitas)

| Konsumen | Endpoint terdampak Fase 0 | Dampak |
|---|---|---|
| Admin (`laundry-admin`) | `GET /customers`, `/customers/:id(/orders)`, `GET /orders`, `/orders/summary/*`, `GET/POST/PATCH /users`, `GET/PATCH /iot/devices`, `POST /uploads/image`, `POST /wallets/orders/:id/refund` | Tetap jalan untuk role staf/admin |
| Mobile | `/customers/:id/{orders,wallet,stats}`, `/orders/:id`, `/wallets/customer/:id`, `/transactions/{quote,checkout}`, `/pricing/calculate`, `/payments/:n/status` (data milik sendiri → lolos). Top-up (`/wallets/customer/:id/topup`) dan refund (`…/refund`) → ditutup; tombolnya disembunyikan. `PATCH /users/:id` (layar edit profil, tidak terpakai) → pindah ke `PATCH /users/me`. `payWithWallet` (`WalletController.payOrder`) tidak dipanggil di mana pun. | Perlu rilis app |
| Kiosk | Hanya `/kiosks/device/*` (`@Public`, token perangkat) | Tidak terdampak |

## 5. Perbedaan plan vs kode aktual

1. Selain K1–K7, sapuan menemukan **K8–K12** (tabel di atas). K8–K10 setara kritis dan dimasukkan ke Fase 0.
2. Bayar saldo di app memakai `/transactions/checkout`, bukan `/wallets/customer/:id/pay` — keduanya diamankan.
3. `MachineBooking.orderId` (unik) sudah ada di skema; BullMQ sudah dipakai (`campaign-scheduler`, `loyalty-scheduler`) → Fase 1 tidak perlu skema besar.
4. `PaymentGateway` belum punya `cancelCharge` (Fase 1, T4).
5. Tenancy outlet: role `ADMIN_OUTLET`/`CASHIER` belum dibatasi per outlet di kebanyakan endpoint admin (hanya refund admin). Dicatat sebagai risiko tersisa; di luar cakupan Fase 0.

## 6. Urutan implementasi

1. **Fase 0** — helper kebijakan akses bersama; RBAC + kepemilikan pada route di §3; DTO `PATCH /users/me`; transisi status order; nominal saldo dari server; app: sembunyikan top-up/refund, profil ke `/users/me`. Test otorisasi HTTP (supertest, guard asli, layanan di-mock) + unit test.
2. Fase 1–5 sesuai [PLAN_PRODUCTION_READY.md](../PLAN_PRODUCTION_READY.md).

## 7. Risiko migrasi & rollback (Fase 0)

- Tidak ada perubahan skema database di Fase 0.
- Rollback: deploy commit sebelumnya (`deploy-update.sh`), backup `dist` otomatis.
- Risiko utama: admin/klien yang diam-diam bergantung pada endpoint terbuka. Mitigasi: daftar konsumen §4; smoke test admin setelah deploy.
