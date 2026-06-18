# Promotion & Loyalty Smoke Testing

Dokumen ini menjelaskan seed dan smoke test lokal untuk Promotion & Loyalty Engine Di.Cuciin.

## Command

Jalankan dari folder backend:

```bash
cd laundry-be
npm run seed:promo-loyalty
npm run test:smoke:promo-loyalty
```

`test:smoke:promo-loyalty` juga menjalankan seed di awal agar test bisa diulang tanpa voucher bekas pakai.

## Data Test

Semua data smoke memakai prefix `TEST_` agar tidak bercampur dengan data demo/produksi lokal.

- Customer retail: `TEST_CUSTOMER_RETAIL`
- Happy hour aktif: `TEST_HAPPY_HOUR_ACTIVE`
- Happy hour nonaktif: `TEST_HAPPY_HOUR_INACTIVE`
- Voucher percentage: `TEST_VOUCHER_PERCENT_CODE`
- Voucher fixed amount: `TEST_VOUCHER_FIXED_CODE`
- Voucher expired: `TEST_VOUCHER_EXPIRED_CODE`
- Voucher minimum tinggi: `TEST_VOUCHER_MIN_HIGH_CODE`
- Voucher kombinasi happy hour: `TEST_VOUCHER_STACK_CODE`
- Voucher untuk skenario refund: `TEST_VOUCHER_REFUND_CODE`
- Promo code (fixed 8K): `TEST_PROMO_FIXED_CODE`
- B2B partner aktif: `TEST_B2B_ACTIVE`
- B2B partner inactive: `TEST_B2B_INACTIVE`
- B2B pricing rule: `TEST_B2B_SPECIAL_PRICE`
- B2B voucher: `TEST_VOUCHER_B2B_CODE`

Seed memakai service price aktif pertama di database lokal sebagai basis skenario.

## Skenario Smoke

Expected result saat service price basis Rp50.000:

- Normal wallet payment: final Rp50.000, main balance debit Rp50.000, point +50, tier progress naik.
- Happy hour: diskon 20%, final Rp40.000, quota happy hour bertambah.
- Happy hour di luar jadwal: diskon 0.
- Voucher percentage: diskon 20% maksimal Rp15.000, untuk basis Rp50.000 diskon Rp10.000.
- Voucher fixed: diskon Rp10.000.
- Voucher expired: ditolak dengan error kedaluwarsa.
- Voucher minimum tinggi: ditolak dengan error minimal transaksi.
- B2B special pricing: harga final Rp30.000, attribution `b2b_pricing_rule_usages` tercatat.
- Partner inactive: ditolak.
- B2B pricing + B2B voucher: final Rp25.000.
- Happy hour + voucher: stacking diizinkan oleh `allowVoucherStack=true`, final Rp35.000.
- Bonus balance: dengan bonus Rp20.000, pembayaran memakai bonus dulu (Rp20.000) lalu main (Rp30.000).
- Promo code fixed: diskon Rp8.000, final Rp42.000, `promo_usages` tercatat & `usedCount` bertambah.
- B2B quote (preview): `quote` partner aktif mengembalikan harga khusus final Rp30.000 tanpa membuat order.
- Refund reversal: order PAID di-refund → wallet (main/bonus) kembali, point kembali, voucher kembali `ACTIVE` (redemption `REVERSED`), tier `successfulTxnCount` turun.

## Business Rule Yang Dites

- Transaksi smoke menggunakan `TransactionService.checkout`, bukan insert order langsung.
- Seed boleh menulis langsung ke database, tapi checkout tetap lewat service existing.
- Voucher tetap satu per transaksi.
- Happy hour dapat stack dengan voucher hanya jika rule mengizinkan.
- B2B special pricing meng-override discount tier B2B.
- QRIS/VA gateway flow tidak dicover command ini; coverage unit untuk settlement gateway ada di `payments.service.spec.ts`.

## Scheduler (BullMQ + Redis)

Verifikasi runtime scheduler (read-only) — butuh Redis hidup:

```bash
npm run verify:redis-scheduler
```

Menampilkan: Redis reachable, repeatable jobs terdaftar (`campaign-scheduler`,
`loyalty-scheduler`), dan **point-expiry dry-run** (tanpa mutasi). Detail di
[promo-loyalty-scheduler.md](./promo-loyalty-scheduler.md).

Coverage unit (jest):
- Point expiry: earn mengisi `expiresAt` (default 365 hari), job membuat DEBIT EXPIRED,
  idempoten (run 2x tidak double-debit), clamp ke saldo (tidak negatif), dry-run.
- Campaign idempotency: birthday/anniversary/long-time-no-see/topup-cashback tidak
  double-issue pada run berulang (`campaign.service.spec.ts`).

## Frontend (Mobile & Kiosk)

Mapping UI ↔ API ada di [mobile-kiosk-loyalty-integration.md](./mobile-kiosk-loyalty-integration.md).

Static check & test:

```bash
# Mobile
cd laundry_mobile_flutter && flutter analyze && flutter test
# Kiosk
cd laundry_kiosk_flutter && flutter analyze && flutter test
```

Phase F: mobile menambah section **"Voucher Saya"** (UserVoucher real, badge status) di
member dashboard; kiosk menambah **badge "Happy Hour aktif"** di ringkasan checkout. Tidak
ada perubahan backend; smoke tetap 15 PASS.

## Known Limitation

- Smoke script membuat order baru setiap run. Data test tetap aman karena prefixed, tetapi order historis smoke tidak dihapus agar ledger/audit tidak dimanipulasi.
- Jika database kosong total, jalankan seed utama dulu agar outlet/service price tersedia:

```bash
npm run prisma:seed
```
