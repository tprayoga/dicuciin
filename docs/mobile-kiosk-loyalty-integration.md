# Mobile & Kiosk Loyalty Integration

> Status: 2026-06-18 (Phase F). Memetakan UI mobile (Flutter) & kiosk (Flutter) ke API
> backend promo/loyalty. Prinsip: UI hanya merender response API; tidak menghitung/menyimpan
> business rule sendiri. Semua angka final berasal dari `/pricing/calculate` atau
> `/transactions/checkout`.

## 1. API Contract

| Feature | Method | Endpoint | Request (ringkas) | Response (ringkas) | Used By |
|---------|--------|----------|-------------------|--------------------|---------|
| Wallet customer | GET | `/customers/:id/wallet` | — | `{ balance, bonusBalance, pointBalance, transactions[] }` | Mobile |
| Voucher saya | GET | `/vouchers/mine?status=` | — | `UserVoucher[]` (code, status, template) | Mobile |
| Membership status | GET | `/memberships/me` | — | `{ currentTier, currentB2BTier, earnedSpending, successfulTxnCount }` | Mobile |
| Promo publik | GET | `/promos` | — | `Promo[]` | Mobile |
| Quote pricing | POST | `/pricing/calculate` | `{ customerId\|partnerId, outletId, items[], voucherCode?, promoCode? }` | `PricingQuote` (breakdown) | Mobile, Kiosk |
| Validasi promo | POST | `/promos/validate` | `{ code, items[], outletId }` | `{ discount, isValid }` | Mobile |
| Checkout wallet | POST | `/transactions/checkout` | `{ customerId\|partnerId, outletId, items[], voucherCode? }` | `{ orderId, status, breakdown }` | Mobile |
| Redeem poin → voucher | POST | `/points/redeem-voucher` | `{ walletId, templateId, idempotencyKey }` | `{ pointLedger, userVoucher }` | Mobile |
| Kiosk quote | POST | `/pricing/calculate` (device token) | `{ outletId, items[], voucherCode? }` | `PricingQuote` | Kiosk |
| Kiosk order (QRIS/VA) | POST | `/kiosks/device/orders` → `/payments` | `{ outletId, items[], promoCode?, customerLookup? }` | order + gateway | Kiosk |
| Kiosk wallet checkout | POST | `/kiosks/device/checkout` | `{ customerLookup, items[], voucherCode? }` | `{ breakdown }` | Kiosk |

> `PricingQuote` fields: `basePrice, b2bDiscount, happyHourDiscount, voucherDiscount,
> promoDiscount, spendingAmount, finalAmount, pointsToEarn, cashbackToCredit`.

## 2. Mobile UI Mapping

| Screen | Data Needed | API | Status |
|--------|-------------|-----|--------|
| Member Dashboard — saldo | main/bonus/point | `/customers/:id/wallet` | DONE |
| Member Dashboard — tier progress | tier, spending, txn count, poin | `/memberships/me` + wallet | DONE |
| Member Dashboard — B2B card | partner code/tier/deposit | auth profile | DONE |
| Member Dashboard — statistik & riwayat | order stats, wallet txns, orders | `/customers/:id/stats`, `/orders` | DONE |
| **Member Dashboard — Voucher Saya** | UserVoucher (status/expiry/type) | `/vouchers/mine` | **DONE (Phase F: ditambah section)** |
| Member Dashboard — Promo Tersedia | promo publik | `/promos` | DONE |
| Checkout — Loyalty Summary | breakdown happy hour/voucher/b2b/point | `/pricing/calculate` | DONE |
| Checkout — Voucher eligibility | per-voucher quote + reason | `/vouchers/mine` + `/pricing/calculate` | DONE |
| Checkout — submit | settle wallet + loyalty | `/transactions/checkout` | DONE |
| Top up | tambah saldo MAIN | wallet topup flow | DONE (existing) |
| Redeem poin → voucher | tukar poin | `/points/redeem-voucher` | DONE (controller wired) |

> Phase F menambahkan section **"Voucher Saya"** di Member Dashboard yang merender
> `UserVoucher` milik customer (sebelumnya hanya promo publik yang tampil). Status badge:
> Aktif / Terpakai / Kedaluwarsa / Dibatalkan. Data sudah dimuat controller
> (`CustomerController.vouchers` via `getMyVouchers`).

## 3. Kiosk UI Mapping

| Screen | Data Needed | API | Status |
|--------|-------------|-----|--------|
| Enrollment | device token | `/kiosks/device/enroll` | DONE |
| Welcome/Services | service prices | `/kiosks/device/services` | DONE |
| Machines | mesin + occupancy | `/kiosks/device/machines` | DONE |
| Checkout — price summary | base, happy hour, voucher, point, total | `/pricing/calculate` | DONE |
| **Checkout — Happy Hour badge** | happyHourDiscount > 0 | `/pricing/calculate` | **DONE (Phase F: badge ditambah)** |
| Checkout — voucher/promo input | apply voucher/promo | `/pricing/calculate` (re-quote) | DONE |
| Payment QRIS/VA | gateway charge + polling | `/kiosks/device/orders` → `/payments` | DONE |
| Wallet checkout | settle loyalty | `/kiosks/device/checkout` | DONE |
| Success | ringkasan | — | DONE |

> Phase F menambahkan **badge "Happy Hour aktif — hemat Rp…"** di kartu ringkasan checkout
> kiosk saat `happyHourDiscount > 0` (baris discount sudah ada sebelumnya).

## 4. Edge Cases

| Kasus | Perilaku UI |
|-------|-------------|
| Customer belum login (mobile) | Dashboard butuh auth; controller `syncFromAuth` clear bila tak ada token. |
| Wallet kosong | Saldo Rp0; empty hint untuk transaksi. |
| Voucher expired/used | "Voucher Saya" menampilkan badge Kedaluwarsa/Terpakai (non-aktif, abu/merah). |
| Voucher < minimum transaksi | `/pricing/calculate` menolak → `getVoucherEligibility` menandai voucher `eligible=false` + reason; checkout menampilkan alasan. |
| Happy hour aktif/tidak | Badge happy hour + baris diskon hanya muncul bila `happyHourDiscount > 0`. |
| Promo tidak stackable dgn voucher | Backend menolak (400) → UI menampilkan message error dari API. |
| Poin tidak cukup (redeem) | `/points/redeem-voucher` 400 "Poin tidak mencukupi" → message di controller. |
| Customer B2B | `b2bDiscount` di quote; mobile mengirim `partnerId`; B2B card di dashboard. |
| API error | `_guard`/`ApiException` → message user-friendly; bagian lain dashboard tetap tampil. |
| Offline/timeout | Per-section `_guard` mengembalikan null; UI memakai data lama / empty state. |

## 5. Admin (status, light audit)

Halaman `laundry-admin/app/pages/promotion-loyalty/index.vue` sudah matang: tab Voucher,
Campaign, **Loyalty Point Rule**, Happy Hour, B2B Pricing, Tiers, Partners (dengan `isActive`).
Report `/reports/promotion-loyalty` menyediakan voucher funnel, bonus/point liability, B2B
impact. **Tidak diubah di Phase F** (sesuai instruksi: jangan ubah flow besar admin).

**Known gap (opsional, untuk fase berikut):** `LOYALTY_POINT_RATE` & `LOYALTY_POINT_EXPIRY_DAYS`
saat ini dikonfigurasi via env (lihat [promo-loyalty-config.md](./promo-loyalty-config.md)),
belum dapat diedit dari admin UI. Bila perlu, surface read-only dulu lalu editable saat
config dipindah ke DB (`LoyaltyConfig` table).

## 6. Catatan Implementasi

- Mobile & kiosk memakai API client existing (`ApiClient`) + token/session pattern existing.
- State: mobile `ChangeNotifier` (`CustomerController`), kiosk `ChangeNotifier` (`KioskController`).
- Model Flutter sudah ada: `WalletData`, `UserVoucher`, `MembershipStatus`, `PricingQuote`,
  `LoyaltyCheckoutResult`, `VoucherEligibility`. **Tidak ada model baru di Phase F** (cukup).
- Tidak ada perubahan backend di Phase F.
