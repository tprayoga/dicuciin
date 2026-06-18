# Promo & Loyalty Implementation Next Plan

> Disusun 2026-06-18. Basis: audit + pembacaan kode aktual (`laundry-be`). Prinsip:
> **aman, aditif, backward compatible.** Tidak ada refactor besar, tidak hapus fitur,
> tidak reset DB, tidak rename model Prisma. Jika docs berbeda dari code, **ikuti code**
> lalu catat docs yang perlu di-update.

## 1. Current Confirmed State

### DONE (terbukti di kode + 114 unit test hijau)
- **Wallet multi-saldo**: `Wallet.balance` (MAIN) + `bonusBalance` + `pointBalance`;
  ledger uang `WalletLedger` (`walletType`+`direction`). Bayar pakai BONUS dulu lalu MAIN
  ([wallet.service.ts](../laundry-be/src/modules/wallets/wallet.service.ts), [transaction.service.ts:206-218](../laundry-be/src/modules/transactions/transaction.service.ts)).
- **Point**: earn saat PAID (`point-earn-<orderId>`), redeem, redeem-voucher atomik,
  `reverseForOrder` saat refund ([point.service.ts](../laundry-be/src/modules/points/point.service.ts)).
- **Voucher**: template/UserVoucher/redemption, non-stackable (`VoucherRedemption.orderId @unique`),
  `reverseRedemption` saat refund ([voucher.service.ts](../laundry-be/src/modules/vouchers/voucher.service.ts)).
- **Promo**: `evaluatePromo` + `commitUsage` saat PAID; PERCENTAGE/FIXED_AMOUNT/CASHBACK/FREE_DELIVERY
  ([promos.service.ts](../laundry-be/src/modules/promos/promos.service.ts)).
- **Pricing pipeline**: base → B2B → happy hour → (voucher ATAU promo) → accrual poin/cashback,
  dipakai quote & checkout ([pricing.service.ts](../laundry-be/src/modules/pricing/pricing.service.ts)).
- **Tier**: config retail/B2B + `UserMembershipStatus`, `recordSuccessfulTransaction` /
  `reverseTransaction`.
- **B2B**: `B2BPartner` + deposit wallet + `B2BPricingRule`(+`Usage`); special pricing override
  discount tier; partner non-ACTIVE ditolak.
- **Happy hour**: rule + quota atomik + `allowVoucherStack`.
- **Checkout & Refund**: orchestrasi 1-transaksi DB; refund balikkan wallet (per bucket),
  poin, voucher, tier ([transaction.service.ts:367-441](../laundry-be/src/modules/transactions/transaction.service.ts)).
- **Seed smoke**: retail customer+wallet, happy hour aktif/nonaktif, 6 voucher template+instance,
  **B2B partner aktif/inactive + wallet + pricing rule + tier config + B2B voucher** — **sudah ada**
  ([seed-promo-loyalty-smoke.ts](../laundry-be/scripts/seed-promo-loyalty-smoke.ts)).
- **Smoke runner**: 11 skenario (normal, happy hour in/out, voucher %/fixed/expired/min,
  B2B pricing, B2B inactive, B2B+voucher, HH+voucher) ([smoke-promo-loyalty.ts](../laundry-be/scripts/smoke-promo-loyalty.ts)).

### PARTIAL
- **Smoke coverage**: belum mencakup **promo code discount**, **refund reversal**, **bonus-balance
  payment**, dan **B2B quote (preview)**. (Phase A & B menambah ini.)
- **LoyaltyConfig**: sebagian via **env** (`LOYALTY_POINT_RATE`, default 1000) di pricing;
  belum ada tabel/config terpusat. Tier multiplier/cashback dari `MembershipTierConfig` (sudah tabel).
- **Mobile/kiosk loyalty UI**: backend kaya, UI lebih tipis.

### UNKNOWN / belum terverifikasi di environment ini
- **Smoke e2e run**: butuh PostgreSQL hidup (belum dijalankan saat menulis ini).
- **Scheduler campaign & point-expiry job**: butuh Redis; belum diverifikasi runtime.
- **Potensi ambiguitas report** antara `wallet_transactions` (legacy) vs `wallet_ledgers`.

## 2. Priority Gap (urut risiko)

1. **Smoke full flow belum verified** — tanpa run e2e, regresi promo/loyalty tak ketahuan.
2. **Coverage smoke kurang** (promo, refund, bonus) — flow penting tak ada proteksi.
3. **WalletTransaction vs WalletLedger ambiguity** — risiko double-count di report.
4. **LoyaltyConfig belum terpusat** — rate poin di env; tier di tabel; tersebar.
5. **Point expiry job belum verified** — liability poin bisa tak pernah kedaluwarsa.
6. **Mobile/kiosk loyalty UI belum lengkap** — pengalaman pengguna belum setara BE.
7. **IoT integration masih basic** — di luar scope promo/loyalty.

> Catatan koreksi audit: **"Seed B2B belum jelas" ternyata sudah ada** di
> `seed-promo-loyalty-smoke.ts` (artefak grep). Tidak perlu menambah seed B2B baru; cukup
> menambah **coverage smoke B2B quote**.

## 3. Implementation Strategy

### Phase A — Stabilkan seed + smoke test **(dikerjakan sekarang)**
- Tambah skenario smoke yang hilang **tanpa** mengubah business logic:
  - Promo code discount (FIXED_AMOUNT) + verifikasi `PromoUsage`/`usedCount`.
  - Refund reversal (wallet + point + voucher + tier) end-to-end.
  - Bonus-balance dipakai sebelum main balance.
- Tambah seed pendukung (idempoten, prefix `TEST_`): promo + rule, voucher khusus refund.

### Phase B — Lengkapi B2B scenario **(dikerjakan sekarang)**
- Tambah skenario **B2B quote** (preview `txService.quote`) memastikan harga khusus B2B
  masuk ke quote sebelum checkout. (Seed B2B sudah lengkap; tak diubah.)

### Phase C — Validasi ledger & report ✅ SELESAI (2026-06-18)
- Source of truth ditetapkan & didokumentasikan di
  [promo-loyalty-ledger-source-of-truth.md](./promo-loyalty-ledger-source-of-truth.md):
  `WalletLedger` (saldo modern), `PointLedger`/`pointBalance` (poin), order PAID (revenue),
  `WalletTransaction` = legacy (tetap, tak dihapus).
- `reports.service.ts` terbukti tidak menjumlahkan dua ledger → +3 test anti-double-count.

### Phase D — LoyaltyConfig / config source ✅ SELESAI (2026-06-18)
- `LoyaltyConfigService` (`@Global`) memusatkan `LOYALTY_POINT_RATE` (default 1000),
  `LOYALTY_POINT_EXPIRY_DAYS` (365), `LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND` (false).
- `pricing` & `payments` membaca rate dari wrapper (bukan `process.env` langsung).
- Cashback refund reversal via feature flag (default off = backward compatible).
- Detail: [promo-loyalty-config.md](./promo-loyalty-config.md).

### Phase E — Scheduler campaign + point expiry verification ✅ SELESAI (2026-06-18)
- Campaign scheduler sudah lengkap & idempoten (terverifikasi: repeatable job terdaftar, cron `0 1 * * *`).
- Point expiry diimplementasi: `expiresAt` di-set saat earn (default 365h), job `loyalty-scheduler`
  + `PointService.expireDuePoints` (idempoten, clamp ke saldo, dry-run).
- Verify script `npm run verify:redis-scheduler` (Redis reachable; dry-run OK).
- Detail: [promo-loyalty-scheduler.md](./promo-loyalty-scheduler.md).

### Phase F — Mobile/kiosk integration ✅ SELESAI (2026-06-18)
- Audit: mobile & kiosk **API layer + sebagian besar UI sudah lengkap** (wallet, tier, quote,
  checkout breakdown, voucher eligibility). Gap nyata: dashboard menampilkan promo publik,
  bukan voucher milik customer.
- Mobile: tambah section **"Voucher Saya"** (UserVoucher real + badge status) di member dashboard.
- Kiosk: tambah **badge "Happy Hour aktif"** di ringkasan checkout.
- `flutter analyze` & `flutter test` hijau (mobile & kiosk); backend tak berubah (smoke 15 PASS).
- Mapping lengkap: [mobile-kiosk-loyalty-integration.md](./mobile-kiosk-loyalty-integration.md).

## 4. File Impact

| Phase | File | Jenis perubahan |
|-------|------|-----------------|
| A | [scripts/seed-promo-loyalty-smoke.ts](../laundry-be/scripts/seed-promo-loyalty-smoke.ts) | + seed promo (TEST_PROMO_FIXED) + rule, + voucher refund (TEST_VOUCHER_REFUND), idempoten |
| A | [scripts/smoke-promo-loyalty.ts](../laundry-be/scripts/smoke-promo-loyalty.ts) | + skenario: bonus balance, promo discount, refund reversal |
| B | [scripts/smoke-promo-loyalty.ts](../laundry-be/scripts/smoke-promo-loyalty.ts) | + skenario B2B quote (preview) |
| A/B | [docs/testing-promo-loyalty.md](./testing-promo-loyalty.md) | (opsional) update daftar skenario |
| C–F | (didefinisikan saat phase tersebut) | — |

> **Tidak** mengubah: service pricing/checkout/refund, schema Prisma, migration, seed utama.

## 5. Acceptance Criteria

### Phase A
- `tsc`/`jest` tetap hijau (tidak ada regresi).
- Seed bisa dijalankan **berulang** tanpa error duplikat (idempoten, upsert / deleteMany+create).
- Smoke menambah & melewati: `Bonus balance used`, `Promo code discount`, `Refund reversal`.
- Refund terbukti membalik: wallet (main/bonus), point (balance kembali), voucher (ACTIVE),
  tier (`successfulTxnCount` turun).
- Output smoke jelas PASS/FAIL + reason.

### Phase B
- Smoke `B2B quote` PASS: quote partner aktif mengembalikan `b2bDiscount` & `finalAmount`
  sesuai special pricing (final Rp30.000 untuk basis Rp50.000).
- Tidak ada perubahan business rule B2B.

### Phase C–F (ringkas, untuk nanti)
- C: report tidak double-count; satu sumber ledger per metrik + test.
- D: `LOYALTY_POINT_RATE` punya satu sumber; default backward compatible.
- E: job terjadwal idempoten & terverifikasi dengan Redis.
- F: mobile/kiosk menampilkan voucher/tier/poin dari endpoint nyata.
