# 01 — Fase 0: Security Hotfix

Status: **TESTED** (mock + PostgreSQL nyata) · Belum dideploy · Tanggal: 19 Nov 2026

## Ringkasan

Semua route yang terbuka untuk customer di [00-baseline-audit.md](00-baseline-audit.md) §3 kini dibatasi role atau kepemilikan.
Mekanisme bersama: [`laundry-be/src/common/auth/access-policy.ts`](../../laundry-be/src/common/auth/access-policy.ts)

| Fungsi | Kegunaan |
|---|---|
| `STAFF_ROLES`, `ADMIN_ROLES`, `USER_ADMIN_ROLES` | Konstanta role untuk `@Roles(...)` |
| `assertCustomerAccess(prisma, user, customerId)` | Staf boleh; customer hanya miliknya (403/404) |
| `assertOrderAccess(prisma, user, orderId)` | Staf boleh; customer hanya order miliknya; order tamu/kiosk hanya staf |
| `scopeCheckoutIdentity(prisma, user, dto)` | Body ber-`customerId`/`partnerId`: customer dipaksa ke dirinya; partner hanya milik user |

## Perubahan per temuan

| Temuan | Perubahan (backend) | File |
|---|---|---|
| **K5** Ubah user mana pun | `GET`/`PATCH /users/:id` → `SUPER_ADMIN, OWNER`. Service menolak OWNER membuat/mengubah/menetapkan `SUPER_ADMIN`. Baru: `PATCH /users/me` (DTO `name`, `email`, `avatarUrl` berpola `/uploads/...`). | `modules/users/users.controller.ts`, `users.service.ts`, `dto/update-my-profile.dto.ts` |
| **K6** Data bocor | `GET /customers`, `GET /orders`, `/orders/summary/dashboard` → staf; `/orders/summary/finance` → admin. `/customers/:id`, `/:id/orders\|wallet\|stats`, `/orders/:id`, `/wallets/customer/:id(/transactions)`, `/payments/:n/status`, `/reviews/order/:id` → cek pemilik. | `customers.controller.ts`, `orders.controller.ts`, `wallets.controller.ts`, `payments.controller.ts`, `reviews.controller.ts` |
| **K7** Status order bebas | `PATCH /orders/:id/status` → staf + `assertManualTransition`: target `PAID/REFUNDED/CANCELLED/DRAFT/WAITING_PAYMENT` ditolak; sumber harus sudah dibayar dan belum final. | `orders/order-status.policy.ts`, `orders.service.ts` |
| **K1** Top-up gratis | `POST /wallets/customer/:id/topup` → `SUPER_ADMIN, OWNER`. | `wallets.controller.ts` |
| **K9** Top-up gratis (jalur 2) | `POST /transactions/topup` → `SUPER_ADMIN, OWNER`. | `transactions.controller.ts` |
| **K4** Nominal saldo dari klien | `amount` dihapus dari `PayWithWalletDto` (dikirim → 400). Nominal = `order.totalAmount`; hanya order `DRAFT/WAITING_PAYMENT`; cek pemilik wallet. | `wallets.service.ts`, `dto/wallet.dto.ts`, `wallets.controller.ts` |
| **K3** Refund mandiri | `POST /wallets/customer/:id/refund` → admin, didelegasikan ke `refundByAdmin` (cek outlet, idempoten) dan order wajib milik customer di URL. | `wallets.controller.ts` |
| **K8** Checkout atas nama orang lain | `/transactions/checkout`, `/transactions/quote`, `/pricing/calculate` → `scopeCheckoutIdentity`. | `transactions.controller.ts`, `pricing/pricing.controller.ts` |
| **K10** Perintah mesin | `POST /iot/devices/:id/commands`, `/heartbeat` → admin + teknisi; `GET /iot/devices*` → staf. | `iot/iot.controller.ts` |
| **K11** Buat/batal order | `POST /orders` → `scopeCheckoutIdentity`. `POST /orders/:id/cancel`: customer hanya order miliknya yang belum dibayar; staf order belum final. | `orders.controller.ts`, `orders.service.ts` |
| **K12** Data internal | `GET /kiosks`, `/kiosks/:id`, `/kiosks/assigned`, sesi kiosk staf → staf. `GET /reviews/focused` → staf. `POST /uploads/image` → admin. `POST /uploads/payment/:orderId/proof` → pemilik. Ulasan hanya untuk order sendiri. | `kiosks.controller.ts`, `reviews.*`, `uploads.controller.ts` |

## Perubahan aplikasi mobile

| Perubahan | File |
|---|---|
| Tombol Top up disembunyikan (`AppConfig.walletTopUpEnabled`, default `false`; aktif lagi di Fase 2) | `core/config/app_config.dart`, `home/home_page.dart`, `home/member_dashboard_page.dart` |
| "Refund ke Saldo" diganti "Butuh bantuan?" → WhatsApp layanan pelanggan berisi nomor order; kode refund mandiri dihapus | `home/order_page.dart`, `customer_controller.dart`, `customer_service.dart` |
| Edit profil memakai `PATCH /users/me` (nama, email); nomor HP read-only | `auth/auth_service.dart`, `auth_controller.dart`, `edit_profile_screen.dart` |
| `payWithWallet` tidak lagi mengirim `amount` | `auth/auth_service.dart`, `wallet_controller.dart` |

## Bukti verifikasi

| Pemeriksaan | Perintah | Hasil |
|---|---|---|
| Test backend | `cd laundry-be && npx jest` | **24 suite, 254 test lulus** (174 lama + 80 baru) |
| Security gate HTTP | `npx jest src/common/auth/authorization.http.spec.ts` | **49/49 lulus** |
| Aturan service | `npx jest src/common/auth/phase0-service-rules.spec.ts` | **27/27 lulus** |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Build | `npm run build` | exit 0 |
| Flutter | `flutter analyze` | No issues found |
| Flutter test | `flutter test` | 1/1 lulus (hanya placeholder — **tidak ada** test widget untuk alur ini) |
| Flutter build | `flutter build web --release` | Berhasil |

Jenis pengujian: **otomatis dengan mock** (Prisma fixture + service mock). Belum diuji terhadap database nyata maupun server live.

## Kompatibilitas

- **Admin:** semua endpoint yang dipakai admin tetap terbuka untuk role staf/admin. *Diperbarui di Fase 1 Batch 1 (keputusan owner):* kasir boleh membuka laporan transaksi **outlet yang ditugaskan** saja — lihat [02-booking-payment-architecture.md](02-booking-payment-architecture.md) §Kebijakan role & outlet.
- **Kiosk:** tidak terdampak (memakai `/kiosks/device/*`).
- **Mobile versi lama (sudah terpasang):** tombol Top up & Refund akan menerima 403 sampai pengguna memperbarui aplikasi.
- **Payment/IoT:** webhook Midtrans tidak berubah. Perintah IoT dari backend (aktivasi setelah PAID) tidak lewat HTTP, jadi tidak terdampak.

## Risiko tersisa

1. **Tenancy outlet** belum diterapkan: staf `ADMIN_OUTLET/CASHIER` masih bisa membaca data outlet lain (di luar cakupan Fase 0).
2. **Kiosk `/pricing/calculate`** sudah gagal (401) sejak sebelum perubahan: kiosk mengirim token perangkat (bukan JWT). Temuan baru; perlu endpoint `device/quote` (Fase 1).
3. Celah pemakaian mesin tanpa bayar lewat scan QR (**K2**) baru ditutup di Fase 1.

## Rollback

Tidak ada perubahan skema. Rollback = deploy commit sebelumnya (`deploy/scripts/deploy-update.sh`; `dist` lama dicadangkan).
