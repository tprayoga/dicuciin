# Promotion & Loyalty Engine API

Dokumentasi ini menjelaskan API Promotion & Loyalty Engine Di.Cuciin yang terintegrasi dengan backend NestJS. Semua endpoint berada di base path API backend yang sama dengan modul lain dan memakai JWT Bearer token kecuali disebutkan berbeda.

## 1. Overview Sistem Promo

Engine ini mengelola wallet multi-saldo, voucher, point, membership tier, B2B partner, campaign, happy hour, pricing calculation, settlement transaksi, refund, dan report promo.

### Response Wrapper

Response sukses dibungkus oleh `TransformInterceptor`:

```json
{
  "success": true,
  "data": {},
  "meta": {},
  "timestamp": "2026-06-16T10:00:00.000Z"
}
```

Response error dibungkus oleh global exception filter:

```json
{
  "success": false,
  "error": "BadRequestException",
  "message": "Voucher tidak bisa digabung",
  "statusCode": 400,
  "timestamp": "2026-06-16T10:00:00.000Z",
  "path": "/transactions/quote"
}
```

### Role Umum

- `CUSTOMER`: endpoint milik user login, checkout, quote, referral.
- `SUPER_ADMIN`, `OWNER`: konfigurasi promo, tier, campaign, partner, voucher.
- `ADMIN_OUTLET`: akses operasional seperti list, ledger, partner detail, report, refund tertentu.

### Rule Bisnis Wajib

1. Top up bukan revenue. Top up masuk `MAIN_BALANCE` sebagai liability dan revenue diakui saat saldo dipakai membayar order sukses.
2. Voucher tidak bisa digabung. Satu transaksi maksimal memakai satu voucher, dan voucher tidak bisa digabung dengan promo code. Happy hour juga bisa menolak stacking voucher bila rule backend melarang.
3. Point hanya dari transaksi sukses. Top up tidak menghasilkan point.
4. Tier tidak naik dari top up. Tier retail dan B2B dievaluasi dari spending/jumlah transaksi sukses.
5. B2B menggunakan wallet/deposit, bukan invoice. Partner harus `ACTIVE` sebelum checkout B2B.
6. Bonus balance dan point tidak bisa dicairkan. Bonus hanya untuk pembayaran sesuai rule; point hanya untuk loyalty redemption.
7. Semua mutasi harus tercatat di ledger: `wallet_ledgers`, `point_ledgers`, `voucher_redemptions`, `campaign_issuances`, dan log/status terkait transaksi.

## 2. Wallet API

### Get Customer Wallet

- Method: `GET`
- Path: `/wallets/customer/:customerId`
- Purpose: Mengambil saldo wallet customer.
- Request body: none
- Response body:

```json
{
  "id": "wallet-1",
  "customerId": "cust-1",
  "balance": 100000,
  "bonusBalance": 15000,
  "pointBalance": 250
}
```

- Error case: `404 Wallet not found`, `401 Unauthorized`.
- Permission/role: JWT user; akses detail customer harus dibatasi oleh policy aplikasi.
- Notes: `balance` adalah `MAIN_BALANCE`; `bonusBalance` non-withdrawable; `pointBalance` dikelola lewat point ledger.

### Get Wallet Transactions

- Method: `GET`
- Path: `/wallets/customer/:customerId/transactions?page=1&limit=10`
- Purpose: Melihat history transaksi wallet customer.
- Request body: none
- Response body:

```json
{
  "data": [
    {
      "id": "trx-1",
      "type": "TOPUP",
      "amount": 100000,
      "balanceBefore": 0,
      "balanceAfter": 100000,
      "createdAt": "2026-06-16T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1 }
}
```

- Error case: `404 Customer/Wallet not found`, `401 Unauthorized`.
- Permission/role: JWT user.
- Notes: Endpoint legacy ini menampilkan transaksi wallet. Untuk engine promo baru, report ledger detail juga tersedia di report Promotion/Loyalty.

### Top Up Customer Wallet

- Method: `POST`
- Path: `/wallets/customer/:customerId/topup`
- Purpose: Menambah saldo utama customer.
- Request body:

```json
{
  "amount": 100000,
  "description": "Top up manual",
  "idempotencyKey": "topup-cust-1-20260616-001"
}
```

- Response body:

```json
{
  "id": "trx-1",
  "customerId": "cust-1",
  "amount": 100000,
  "balanceAfter": 100000,
  "transactionType": "TOPUP"
}
```

- Error case: `400 amount minimal 1000`, duplicate `idempotencyKey`, wallet/customer tidak valid.
- Permission/role: JWT user.
- Notes: Top up masuk `MAIN_BALANCE`; bukan revenue; tidak menambah point atau tier.

### Pay With Wallet

- Method: `POST`
- Path: `/wallets/customer/:customerId/pay`
- Purpose: Membayar order legacy memakai wallet.
- Request body:

```json
{
  "orderId": "order-1",
  "amount": 50000,
  "idempotencyKey": "pay-order-1"
}
```

- Response body:

```json
{
  "orderId": "order-1",
  "amount": 50000,
  "status": "PAID"
}
```

- Error case: `400 Saldo tidak mencukupi`, `404 Order not found`, duplicate payment.
- Permission/role: JWT user.
- Notes: Untuk flow promo-loyalty baru, gunakan `/transactions/checkout` agar pricing, voucher, point, tier, dan ledger tersettle dalam satu transaksi.

### Refund Customer Wallet

- Method: `POST`
- Path: `/wallets/customer/:customerId/refund`
- Purpose: Refund order paid ke wallet customer.
- Request body:

```json
{
  "orderId": "order-1",
  "description": "Pesanan dibatalkan",
  "idempotencyKey": "refund-order-1"
}
```

- Response body:

```json
{
  "orderId": "order-1",
  "refundedAmount": 50000,
  "status": "REFUNDED"
}
```

- Error case: `400 Hanya order PAID yang bisa direfund`, `409 Order sudah direfund`.
- Permission/role: JWT user.
- Notes: Untuk rollback promo lengkap, gunakan `/transactions/:id/refund`.

### Admin Refund Order Wallet

- Method: `POST`
- Path: `/wallets/orders/:orderId/refund`
- Purpose: Refund paid order oleh admin.
- Request body:

```json
{
  "description": "Refund oleh admin"
}
```

- Response body:

```json
{
  "orderId": "order-1",
  "refundedAmount": 50000,
  "status": "REFUNDED"
}
```

- Error case: `400`, `403`, `404`, `409`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Gunakan refund transaction promo bila order memakai voucher/point/tier supaya reversal lengkap.

### Wallet PIN

- Method: `POST`
- Path: `/wallets/customer/:customerId/pin/set`
- Purpose: Set atau ganti PIN wallet.
- Request body:

```json
{ "pin": "123456" }
```

- Response body:

```json
{ "message": "PIN wallet berhasil disimpan" }
```

- Error case: PIN invalid, customer tidak valid, user tidak berhak.
- Permission/role: JWT user.
- Notes: PIN dipakai untuk proteksi pembayaran wallet.

- Method: `POST`
- Path: `/wallets/customer/:customerId/pin/verify`
- Purpose: Verifikasi PIN wallet.
- Request body:

```json
{ "pin": "123456" }
```

- Response body:

```json
{ "valid": true }
```

- Error case: PIN salah, PIN belum diset.
- Permission/role: JWT user.
- Notes: Tidak melakukan mutasi saldo.

## 3. Voucher API

### List Voucher Templates

- Method: `GET`
- Path: `/vouchers/templates?segment=RETAIL`
- Purpose: List template voucher untuk admin.
- Request body: none
- Response body:

```json
[
  {
    "id": "tpl-1",
    "code": "WELCOME10",
    "name": "Welcome 10K",
    "segment": "RETAIL",
    "voucherType": "NOMINAL_DISCOUNT",
    "value": 10000,
    "quota": 100,
    "issuedCount": 10,
    "isActive": true
  }
]
```

- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Filter `segment` opsional: `RETAIL` atau `B2B`.

### My Vouchers

- Method: `GET`
- Path: `/vouchers/mine?status=ACTIVE`
- Purpose: List voucher milik user login.
- Request body: none
- Response body:

```json
[
  {
    "id": "uv-1",
    "code": "WELCOME10-ABCD1234",
    "status": "ACTIVE",
    "expiresAt": "2026-07-16T00:00:00.000Z",
    "template": {
      "name": "Welcome 10K",
      "voucherType": "NOMINAL_DISCOUNT",
      "value": 10000
    }
  }
]
```

- Error case: `401`, user tidak ditemukan.
- Permission/role: JWT user.
- Notes: Voucher tidak valid untuk checkout tetap bisa ditampilkan frontend di section berbeda dengan alasan dari pricing/validation API.

### Create Voucher Template

- Method: `POST`
- Path: `/vouchers/templates`
- Purpose: Membuat template voucher.
- Request body:

```json
{
  "code": "B2B-GOLD-15",
  "name": "B2B Gold 15%",
  "description": "Diskon untuk partner Gold",
  "segment": "B2B",
  "voucherType": "PERCENTAGE_DISCOUNT",
  "value": 15,
  "maxDiscount": 50000,
  "minTransaction": 100000,
  "applicableServices": "svc-1,svc-2",
  "applicableOutlets": "out-1",
  "b2bTierRestriction": "GOLD_PARTNER",
  "validityDays": 30,
  "quota": 100,
  "perUserLimit": 1,
  "pointCost": 0,
  "isActive": true
}
```

- Response body: created `VoucherTemplate`.
- Error case: duplicate code, validation error, invalid enum.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Service memaksa `isStackable: false`; voucher tidak bisa digabung.

### Update Voucher Template

- Method: `PATCH`
- Path: `/vouchers/templates/:id`
- Purpose: Mengubah template voucher.
- Request body: sama seperti create, semua field opsional.
- Response body: updated `VoucherTemplate`.
- Error case: `404 Template voucher tidak ditemukan`, validation error.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Perubahan template mempengaruhi validasi user voucher berikutnya.

### List Issued Vouchers

- Method: `GET`
- Path: `/vouchers/issued?status=ACTIVE&segment=RETAIL`
- Purpose: List voucher yang sudah diterbitkan.
- Request body: none
- Response body: array `UserVoucher` plus `template`, `customer`, atau `partner`.
- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Dipakai admin untuk monitoring quota dan status voucher.

### Issue Voucher

- Method: `POST`
- Path: `/vouchers/issue`
- Purpose: Terbitkan voucher manual ke customer atau partner.
- Request body:

```json
{
  "templateId": "tpl-1",
  "customerId": "cust-1",
  "sourceType": "MANUAL"
}
```

atau:

```json
{
  "templateId": "tpl-b2b",
  "partnerId": "partner-1",
  "sourceType": "MANUAL"
}
```

- Response body: created `UserVoucher`.
- Error case: owner kosong, template tidak aktif, quota habis, template tidak ditemukan.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Voucher campaign/referral juga memakai service issue yang sama agar issuance bisa diaudit.

### Voucher Redemptions

- Method: `GET`
- Path: `/vouchers/redemptions`
- Purpose: List pemakaian voucher.
- Request body: none
- Response body:

```json
[
  {
    "id": "red-1",
    "userVoucherId": "uv-1",
    "orderId": "order-1",
    "discountApplied": 10000,
    "status": "APPLIED",
    "redeemedAt": "2026-06-16T10:00:00.000Z"
  }
]
```

- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Redemption dibuat saat checkout berhasil, bukan saat quote.

## 4. Membership Tier API

### List Retail Tiers

- Method: `GET`
- Path: `/memberships/tiers`
- Purpose: List konfigurasi tier retail.
- Request body: none
- Response body:

```json
[
  {
    "tier": "SILVER",
    "name": "Silver",
    "level": 1,
    "thresholdSpending": 0,
    "thresholdTxnCount": 0,
    "pointMultiplier": 1,
    "cashbackRate": 0,
    "isActive": true
  }
]
```

- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Tier dihitung dari transaksi sukses, bukan top up.

### Upsert Retail Tier

- Method: `POST`
- Path: `/memberships/tiers`
- Purpose: Create/update konfigurasi tier retail.
- Request body:

```json
{
  "tier": "GOLD",
  "name": "Gold",
  "level": 2,
  "thresholdSpending": 1000000,
  "thresholdTxnCount": 10,
  "pointMultiplier": 1.5,
  "cashbackRate": 1,
  "benefitDescription": "1.5x point",
  "color": "#D97706",
  "isActive": true
}
```

- Response body: upserted `MembershipTierConfig`.
- Error case: validation error, invalid enum.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: `thresholdSpending` dan `thresholdTxnCount` bersifat OR sesuai service resolver.

### My Membership Status

- Method: `GET`
- Path: `/memberships/me`
- Purpose: Status tier user login.
- Request body: none
- Response body:

```json
{
  "customerId": "cust-1",
  "segment": "RETAIL",
  "currentTier": "GOLD",
  "earnedSpending": 1250000,
  "successfulTxnCount": 12,
  "evaluatedAt": "2026-06-16T10:00:00.000Z"
}
```

- Error case: user/customer tidak ditemukan.
- Permission/role: JWT user.
- Notes: Progress tier frontend dihitung dari status ini plus list tier.

## 5. B2B Partner API

### List Partners

- Method: `GET`
- Path: `/partners`
- Purpose: List partner B2B.
- Request body: none
- Response body: array partner dengan `wallet` dan `membershipStatus`.
- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Partner memakai wallet/deposit.

### Create Partner

- Method: `POST`
- Path: `/partners`
- Purpose: Membuat partner B2B, wallet deposit, dan membership status B2B.
- Request body:

```json
{
  "companyName": "PT Laundry Partner",
  "picName": "Andi",
  "phone": "08123456789",
  "email": "andi@example.com",
  "address": "Jakarta",
  "userId": "user-1"
}
```

- Response body: created `B2BPartner`.
- Error case: duplicate user/phone/email sesuai constraint, validation error.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Default tier `BUSINESS_PARTNER`, status default `ACTIVE`.

### Get Partner Detail

- Method: `GET`
- Path: `/partners/:id`
- Purpose: Detail partner B2B.
- Request body: none
- Response body: partner dengan `wallet` dan `membershipStatus`.
- Error case: `404 Partner tidak ditemukan`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Dipakai admin panel detail partner.

### Update Partner / Approve-Reject

- Method: `PATCH`
- Path: `/partners/:id`
- Purpose: Mengubah data partner, status, atau tier manual.
- Request body:

```json
{
  "companyName": "PT Laundry Partner",
  "picName": "Budi",
  "phone": "08123456789",
  "email": "budi@example.com",
  "address": "Bandung",
  "tier": "GOLD_PARTNER",
  "status": "ACTIVE"
}
```

- Response body: updated partner.
- Error case: `404`, validation error.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Gunakan `status: "ACTIVE"` untuk approved dan status lain seperti `SUSPENDED` untuk reject/suspend. Checkout B2B menolak partner yang bukan `ACTIVE`.

### Partner Wallet

- Method: `GET`
- Path: `/partners/:id/wallet`
- Purpose: Melihat deposit wallet partner.
- Request body: none
- Response body:

```json
{
  "id": "wallet-b2b",
  "partnerId": "partner-1",
  "balance": 500000,
  "bonusBalance": 0,
  "pointBalance": 0
}
```

- Error case: `404 Wallet partner tidak ditemukan`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Deposit B2B tetap wallet, bukan invoice.

### Partner Transactions

- Method: `GET`
- Path: `/partners/:id/transactions`
- Purpose: List transaksi partner B2B.
- Request body: none
- Response body: array order dengan `outlet`, `payments`, dan `items`.
- Error case: `404 Partner tidak ditemukan`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Maksimal 100 transaksi terbaru.

## 6. B2B Pricing API

### List B2B Tier Pricing

- Method: `GET`
- Path: `/memberships/b2b-tiers`
- Purpose: List konfigurasi tier dan diskon B2B.
- Request body: none
- Response body:

```json
[
  {
    "tier": "GOLD_PARTNER",
    "name": "Gold Partner",
    "level": 2,
    "thresholdSpending": 5000000,
    "thresholdTxnCount": 20,
    "discountRate": 10,
    "pointMultiplier": 1,
    "cashbackRate": 0,
    "isActive": true
  }
]
```

- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: `discountRate` diterapkan oleh pricing calculation untuk checkout B2B.

### Upsert B2B Tier Pricing

- Method: `POST`
- Path: `/memberships/b2b-tiers`
- Purpose: Create/update harga/diskon tier B2B.
- Request body:

```json
{
  "tier": "GOLD_PARTNER",
  "name": "Gold Partner",
  "level": 2,
  "thresholdSpending": 5000000,
  "thresholdTxnCount": 20,
  "discountRate": 10,
  "pointMultiplier": 1,
  "cashbackRate": 0,
  "benefitDescription": "Diskon 10%",
  "isActive": true
}
```

- Response body: upserted `B2BPartnerTierConfig`.
- Error case: validation error, invalid enum.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Discount tier dipakai sebagai fallback. Untuk special price per partner/tier/outlet/service/machine, gunakan endpoint B2B Special Pricing Rules di bawah.

### B2B Special Pricing Rules

- Method: `GET`
- Path: `/b2b-pricing/rules`
- Purpose: List special pricing B2B per partner/tier/outlet/service/machine.
- Request body: none
- Response body:

```json
[
  {
    "id": "rule-1",
    "name": "PT ABC Washer Outlet A",
    "partnerId": "partner-1",
    "tier": null,
    "outletId": "out-1",
    "serviceId": "svc-1",
    "machineType": "WASHER",
    "priceType": "FIXED_PRICE",
    "value": 30000,
    "startDate": "2026-06-01T00:00:00.000Z",
    "endDate": "2026-06-30T23:59:59.000Z",
    "priority": 10,
    "isActive": true
  }
]
```

- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Rule aktif yang cocok akan meng-override tier discount B2B.

- Method: `POST`
- Path: `/b2b-pricing/rules`
- Purpose: Membuat special pricing B2B.
- Request body:

```json
{
  "name": "Gold Partner Washer Outlet A",
  "tier": "GOLD_PARTNER",
  "outletId": "out-1",
  "serviceId": "svc-1",
  "machineType": "WASHER",
  "priceType": "FIXED_PRICE",
  "value": 30000,
  "startDate": "2026-06-01T00:00:00.000Z",
  "endDate": "2026-06-30T23:59:59.000Z",
  "priority": 10,
  "isActive": true
}
```

- Response body: created `B2BPricingRule`.
- Error case: `400` jika `partnerId` dan `tier` kosong, `priceType` invalid, atau `startDate > endDate`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: `priceType`: `DISCOUNT_PERCENT`, `FIXED_DISCOUNT`, `FIXED_PRICE`.

- Method: `PATCH`
- Path: `/b2b-pricing/rules/:id`
- Purpose: Mengubah special pricing B2B.
- Request body: sama seperti create, semua field opsional.
- Response body: updated `B2BPricingRule`.
- Error case: `404 B2B pricing rule tidak ditemukan`, validation error.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Nonaktifkan rule dengan `isActive: false`.

### B2B Pricing Precedence

Rule pricing B2B dievaluasi di backend pada `/pricing/calculate`, `/transactions/quote`, dan `/transactions/checkout`.

Urutan:

1. Hitung base price dari service price outlet.
2. Cari special pricing rule B2B per item.
3. Jika special rule ditemukan, rule tersebut meng-override tier discount.
4. Jika tidak ada special rule, gunakan `discountRate` dari B2B tier.
5. Lanjut happy hour.
6. Lanjut voucher atau promo, tetap maksimal satu voucher.

Pemilihan rule:

- `priority` tertinggi menang.
- Jika priority sama, rule paling spesifik menang.
- Specificity dihitung dari field yang terisi: `partnerId`, `tier`, `outletId`, `serviceId`, `machineType`.
- `partnerId` dapat dipakai untuk kontrak khusus satu partner; `tier` untuk rule umum tier.
- `startDate`/`endDate` membatasi active period.

### B2B Pricing Report Attribution

Special pricing B2B masuk ke `discountAmount` order dan juga dicatat di `b2b_pricing_rule_usages`.

Implikasi:

- Report dapat menunjukkan total impact diskon B2B.
- Report dapat memecah impact per special pricing rule, partner, outlet, service, dan machine type.
- Checkout mencatat usage dalam transaksi DB yang sama dengan order/payment settlement.
- Untuk order historis, jalankan dry-run `npm run backfill:b2b-pricing-usages` di `laundry-be`; tulis data dengan `npm run backfill:b2b-pricing-usages -- --write`.

### Promotion Rules

- Method: `GET`
- Path: `/promotion-rules`
- Purpose: List promotion rule aktif yang dapat dipakai pricing.
- Request body: none
- Response body: array `PromotionRule`.
- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Dapat berisi segment, min transaction, max discount, outlet/service restriction, dan tier restriction.

- Method: `POST`
- Path: `/promotion-rules`
- Purpose: Membuat promotion rule.
- Request body:

```json
{
  "name": "Retail Gold Min 100K",
  "segment": "RETAIL",
  "minTransaction": 100000,
  "maxDiscount": 25000,
  "applicableServices": "svc-1,svc-2",
  "applicableOutlets": "out-1",
  "tierRestriction": "GOLD",
  "maxUsagePerUser": 1,
  "isActive": true
}
```

- Response body: created `PromotionRule`.
- Error case: validation error.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Endpoint ini rule library; kalkulasi final tetap melalui pricing/transaction.

- Method: `PATCH`
- Path: `/promotion-rules/:id`
- Purpose: Mengubah promotion rule.
- Request body: sama seperti create, semua field opsional.
- Response body: updated `PromotionRule`.
- Error case: `404`, validation error.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Nonaktifkan rule dengan `isActive: false`.

## 7. Point API

Point dipakai melalui:

- `/transactions/checkout`: earn point setelah transaksi sukses.
- `/transactions/:id/refund`: reversal point saat refund.
- `/wallets/customer/:customerId`: membaca `pointBalance`.
- `/points/wallet/:walletId/balance`: membaca saldo point wallet.
- `/points/redeem`: debit point untuk redemption dasar.
- `/points/redeem-voucher`: debit point dan issue voucher dalam satu DB transaction.

### Get Point Balance

- Method: `GET`
- Path: `/points/wallet/:walletId/balance`
- Purpose: Membaca saldo point wallet tanpa mengambil detail wallet penuh.
- Request body: none
- Response body:

```json
{ "walletId": "wallet-1", "pointBalance": 250 }
```

- Error case: `404 Wallet tidak ditemukan`.
- Permission/role: owner wallet atau admin (`SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`).
- Notes: Authorization mengecek owner customer/partner pada wallet. Admin role boleh membaca wallet lain.

### Redeem Points

- Method: `POST`
- Path: `/points/redeem`
- Purpose: Debit point untuk redemption dasar.
- Request body:

```json
{
  "walletId": "wallet-1",
  "points": 100,
  "sourceType": "VOUCHER_REDEMPTION",
  "sourceId": "tpl-1",
  "idempotencyKey": "point-redeem-wallet-1-tpl-1"
}
```

- Response body:

```json
{
  "walletId": "wallet-1",
  "direction": "DEBIT",
  "points": 100,
  "balanceBefore": 250,
  "balanceAfter": 150
}
```

- Error case: `400 Poin tidak mencukupi`, invalid point amount.
- Permission/role: owner wallet atau admin (`SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`).
- Notes: Point tidak bisa diuangkan. Semua redeem menulis `point_ledgers`. Endpoint ini hanya debit point dasar; gunakan `/points/redeem-voucher` bila reward berupa voucher.

### Redeem Points To Voucher

- Method: `POST`
- Path: `/points/redeem-voucher`
- Purpose: Menukar point menjadi voucher secara atomik.
- Request body:

```json
{
  "walletId": "wallet-1",
  "templateId": "tpl-1",
  "description": "Redeem voucher point",
  "idempotencyKey": "point-redeem-voucher-wallet-1-tpl-1"
}
```

- Response body:

```json
{
  "pointLedger": {
    "id": "pl-1",
    "walletId": "wallet-1",
    "direction": "DEBIT",
    "points": 100,
    "balanceBefore": 250,
    "balanceAfter": 150,
    "sourceType": "VOUCHER_REDEMPTION",
    "sourceId": "tpl-1"
  },
  "userVoucher": {
    "id": "uv-1",
    "templateId": "tpl-1",
    "customerId": "cust-1",
    "code": "POINT100-ABCD1234",
    "status": "ACTIVE",
    "sourceType": "POINT_REDEMPTION"
  }
}
```

- Error case: `400 Poin tidak mencukupi`, template tidak aktif, template tidak memiliki `pointCost`, `404 Template voucher tidak ditemukan`, duplicate `idempotencyKey`.
- Permission/role: owner wallet atau admin (`SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`).
- Notes: Debit point dan issue voucher berada dalam satu DB transaction. Jika issue voucher gagal, debit point rollback.

## 8. Campaign API

### My Referral Code

- Method: `GET`
- Path: `/campaigns/referral/code`
- Purpose: Mengambil kode referral user login.
- Request body: none
- Response body:

```json
{ "referralCode": "MBR12345" }
```

- Error case: customer tidak ditemukan.
- Permission/role: JWT user.
- Notes: Kode referral berasal dari `Customer.memberCode`.

### Apply Referral Code

- Method: `POST`
- Path: `/campaigns/referral/apply`
- Purpose: Memakai kode referral sebelum transaksi pertama.
- Request body:

```json
{ "code": "MBR12345" }
```

- Response body: created `Referral`.
- Error case: kode invalid, memakai kode sendiri, sudah memakai referral, sudah pernah transaksi.
- Permission/role: JWT user.
- Notes: Reward referral baru diberikan setelah transaksi pertama sukses.

### Admin Referral List

- Method: `GET`
- Path: `/campaigns/referral/admin`
- Purpose: Menampilkan daftar referral untuk admin panel.
- Request body: none
- Query: `status`, `search`.
- Response body:

```json
[
  {
    "id": "ref-1",
    "referralCode": "MBR12345",
    "status": "PENDING",
    "campaignName": "Referral Juni",
    "referrer": { "id": "cust-1", "memberCode": "MBR12345", "name": "Ayu", "phone": "0811" },
    "referee": { "id": "cust-2", "memberCode": "MBR67890", "name": "Bima", "phone": "0822" },
    "qualifiedAt": null,
    "rewardedAt": null,
    "createdAt": "2026-06-17T00:00:00.000Z"
  }
]
```

- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Endpoint ini hanya membaca referral; reward tetap idempoten di checkout transaksi pertama.

### Create Campaign

- Method: `POST`
- Path: `/campaigns`
- Purpose: Membuat campaign.
- Request body:

```json
{
  "type": "CASHBACK_TOPUP",
  "name": "Cashback Top Up 10%",
  "description": "Cashback top up minimal 100K",
  "segment": "RETAIL",
  "startDate": "2026-06-01T00:00:00.000Z",
  "endDate": "2026-06-30T23:59:59.000Z",
  "rules": [
    { "ruleKey": "minTopup", "ruleValue": "100000" },
    { "ruleKey": "cashbackPercent", "ruleValue": "10" },
    { "ruleKey": "maxCashback", "ruleValue": "20000" }
  ],
  "rewards": [
    { "rewardType": "CASHBACK", "rewardCashback": 10000, "targetParty": "SELF" }
  ]
}
```

- Response body: campaign with `rules` and `rewards`.
- Error case: validation error, invalid enum.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Campaign reward idempotent melalui `campaign_issuances.idempotencyKey`.

### List Campaigns

- Method: `GET`
- Path: `/campaigns`
- Purpose: List campaign.
- Request body: none
- Response body: array campaign with rules/rewards.
- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Admin panel memakai endpoint ini untuk Campaign Management.

### Get Campaign Detail

- Method: `GET`
- Path: `/campaigns/:id`
- Purpose: Detail campaign.
- Request body: none
- Response body: campaign with rules/rewards.
- Error case: `404 Campaign tidak ditemukan`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Route referral diletakkan sebelum `:id` agar tidak bentrok.

### Update Campaign

- Method: `PATCH`
- Path: `/campaigns/:id`
- Purpose: Mengubah metadata campaign.
- Request body:

```json
{
  "name": "Cashback Top Up 5%",
  "description": "Updated",
  "startDate": "2026-06-01T00:00:00.000Z",
  "endDate": "2026-07-01T00:00:00.000Z"
}
```

- Response body: updated campaign.
- Error case: `404`, validation error.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: DTO update saat ini tidak mengubah nested rules/rewards.

### Activate / Deactivate Campaign

- Method: `POST`
- Path: `/campaigns/:id/activate`
- Purpose: Mengaktifkan campaign.
- Request body: none
- Response body: updated campaign.
- Error case: `404`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Set `status: ACTIVE` dan `isActive: true`.

- Method: `POST`
- Path: `/campaigns/:id/deactivate`
- Purpose: Menonaktifkan campaign.
- Request body: none
- Response body: updated campaign.
- Error case: `404`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Set `status: PAUSED` dan `isActive: false`.

### Campaign Logs

- Method: `GET`
- Path: `/campaigns/:id/logs`
- Purpose: Melihat log eksekusi campaign.
- Request body: none
- Response body: array `CampaignExecutionLog`.
- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Log dibuat saat scheduler birthday, anniversary, long-time-no-see, monthly tier berjalan.

### Run Scheduled Campaign Manually

- Method: `POST`
- Path: `/campaigns/run/scheduled?date=2026-06-16`
- Purpose: Menjalankan campaign terjadwal manual untuk testing/admin.
- Request body: none
- Response body:

```json
{
  "ranAt": "2026-06-16T00:00:00.000Z",
  "monthlyTier": false
}
```

- Error case: invalid date, campaign execution error.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Menjalankan birthday, anniversary, long-time-no-see, dan monthly tier benefit bila tanggal 1.

## 9. Happy Hour API

### List Happy Hour Rules

- Method: `GET`
- Path: `/happy-hour/rules`
- Purpose: List aturan happy hour.
- Request body: none
- Response body:

```json
[
  {
    "id": "hh-1",
    "name": "Weekday Evening",
    "outletId": "out-1",
    "serviceId": "svc-1",
    "machineType": "WASHER",
    "daysOfWeek": "1,2,3,4,5",
    "startTime": "18:00",
    "endTime": "21:00",
    "adjustmentType": "PERCENTAGE_OFF",
    "value": 20,
    "quota": 100,
    "usedQuota": 12,
    "allowVoucherStack": true,
    "priority": 10,
    "isActive": true
  }
]
```

- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Hari memakai angka `1=Senin` sampai `7=Minggu`.

### Create Happy Hour Rule

- Method: `POST`
- Path: `/happy-hour/rules`
- Purpose: Membuat rule happy hour.
- Request body:

```json
{
  "name": "Weekday Evening",
  "outletId": "out-1",
  "serviceId": "svc-1",
  "machineType": "WASHER",
  "daysOfWeek": "1,2,3,4,5",
  "startTime": "18:00",
  "endTime": "21:00",
  "timezone": "Asia/Jakarta",
  "adjustmentType": "PERCENTAGE_OFF",
  "value": 20,
  "quota": 100,
  "allowVoucherStack": false,
  "priority": 10,
  "startDate": "2026-06-01T00:00:00.000Z",
  "endDate": "2026-06-30T23:59:59.000Z",
  "isActive": true
}
```

- Response body: created `HappyHourRule`.
- Error case: validation error.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: `adjustmentType`: `PERCENTAGE_OFF`, `FIXED_OFF`, atau `FIXED_PRICE`. `quota` kosong berarti unlimited. `allowVoucherStack=false` membuat pricing menolak kombinasi happy hour dengan voucher.

### Update Happy Hour Rule

- Method: `PATCH`
- Path: `/happy-hour/rules/:id`
- Purpose: Mengubah rule happy hour.
- Request body: sama seperti create, semua field opsional.
- Response body: updated `HappyHourRule`.
- Error case: `404 Happy hour tidak ditemukan`, validation error.
- Permission/role: `SUPER_ADMIN`, `OWNER`.
- Notes: Eligibility happy hour dievaluasi oleh PricingService berdasarkan outlet, service, machine type, hari, jam, date range, priority, dan sisa quota. Quota di-increment secara atomic saat checkout sukses.

## 10. Pricing Calculation API

### Quote Pricing

- Method: `POST`
- Path: `/transactions/quote`
- Purpose: Preview final pricing dari backend tanpa membuat order.
- Request body:

```json
{
  "customerId": "cust-1",
  "outletId": "out-1",
  "items": [
    { "serviceId": "svc-1", "quantity": 1, "notes": "Mesin 1" }
  ],
  "voucherCode": "WELCOME10-ABCD1234",
  "promoCode": null,
  "deliveryFee": 0,
  "sourcePlatform": "MOBILE_APP",
  "kioskId": "kiosk-1"
}
```

Untuk B2B:

```json
{
  "partnerId": "partner-1",
  "outletId": "out-1",
  "items": [
    { "serviceId": "svc-1", "quantity": 2 }
  ],
  "voucherCode": "B2B-GOLD-ABCD1234"
}
```

- Response body:

```json
{
  "basePrice": 50000,
  "b2bDiscount": 0,
  "happyHourDiscount": 10000,
  "voucherDiscount": 5000,
  "promoDiscount": 0,
  "discountSource": "VOUCHER",
  "deliveryFee": 0,
  "spendingAmount": 35000,
  "finalAmount": 35000,
  "pointsToEarn": 35,
  "cashbackToCredit": 0,
  "voucherId": "uv-1",
  "voucherCode": "WELCOME10-ABCD1234"
}
```

- Error case: voucher expired/used/segment mismatch, voucher dan promo digabung, lebih dari satu voucher, saldo/owner invalid, partner B2B tidak `ACTIVE`.
- Permission/role: JWT user.
- Notes: Frontend/mobile/kiosk tidak boleh melakukan kalkulasi final sendiri. Semua angka final harus berasal dari endpoint ini atau `/transactions/checkout`.

### Standalone Pricing API

- Method: `POST`
- Path: `/pricing/calculate`
- Purpose: Endpoint standalone untuk kalkulasi pricing tanpa lewat transaction controller.
- Request body: sama seperti `/transactions/quote`.
- Response body: sama seperti `/transactions/quote`.
- Error case: sama seperti quote.
- Permission/role: JWT user atau admin.
- Notes: Endpoint ini memakai pricing pipeline yang sama dengan checkout/quote. Tidak membuat order dan tidak melakukan mutasi ledger.

## 11. Transaction Promo Integration API

### Checkout

- Method: `POST`
- Path: `/transactions/checkout`
- Purpose: Membuat order, menghitung pricing backend, membayar dengan wallet, dan settle loyalty dalam satu transaksi DB.
- Request body:

```json
{
  "customerId": "cust-1",
  "outletId": "out-1",
  "items": [
    { "serviceId": "svc-1", "quantity": 1 }
  ],
  "voucherCode": "WELCOME10-ABCD1234",
  "deliveryFee": 0,
  "sourcePlatform": "MOBILE_APP",
  "kioskId": "kiosk-1"
}
```

- Response body:

```json
{
  "orderId": "order-1",
  "orderNumber": "ORD-20260616-000001",
  "status": "PAID",
  "segment": "RETAIL",
  "breakdown": {
    "basePrice": 50000,
    "b2bDiscount": 0,
    "happyHourDiscount": 10000,
    "voucherDiscount": 5000,
    "promoDiscount": 0,
    "deliveryFee": 0,
    "finalAmount": 35000,
    "bonusBalanceUsed": 5000,
    "mainBalanceUsed": 30000,
    "pointEarned": 35,
    "cashbackCredited": 0,
    "voucherCode": "WELCOME10-ABCD1234"
  }
}
```

- Error case: saldo tidak cukup, voucher invalid, partner non-active, order duplicate, service/outlet invalid.
- Permission/role: JWT user.
- Notes: Settlement order: wallet debit bonus lalu main, payment PAID, voucher redemption, promo commit, point earn, cashback tier, tier update, referral qualification. Semua mutasi ditulis ke ledger.

### Kiosk Wallet Checkout

- Method: `POST`
- Path: `/kiosks/device/checkout`
- Purpose: Checkout wallet dari kiosk menggunakan Promotion/Loyalty transaction engine.
- Request body:

```json
{
  "customerId": "cust-1",
  "customerLookup": "08123456789",
  "items": [
    { "serviceId": "svc-1", "quantity": 1, "machineType": "WASHER" }
  ],
  "voucherCode": "WELCOME10-ABCD1234"
}
```

- Response body: sama seperti `/transactions/checkout`.
- Error case: device token invalid, kiosk di luar jadwal, customer/partner kosong, saldo kurang, voucher invalid, quota happy hour habis.
- Permission/role: public endpoint dengan Bearer device token kiosk.
- Notes: `outletId`, `kioskId`, dan `sourcePlatform=KIOSK` dipaksa dari device token, bukan dari body. `customerLookup` dapat berupa nomor HP, email, atau member code sehingga kiosk tidak perlu mengirim ID internal. Endpoint legacy `/kiosks/device/orders` dan `/kiosks/device/payments` tetap tersedia untuk QRIS/VA.

### Kiosk QRIS/VA Loyalty Settlement

- Method: `POST`
- Path: `/kiosks/device/orders` lalu `/kiosks/device/payments`
- Purpose: Flow QRIS/VA kiosk tetap membuat order dan charge gateway, tetapi jika body order menyertakan `customerLookup`, webhook payment `PAID` akan settle promo/loyalty.
- Request body order:

```json
{
  "customerLookup": "08123456789",
  "items": [
    { "serviceId": "svc-1", "quantity": 1 }
  ],
  "promoCode": "PROMO10"
}
```

- Response body: order legacy dan payment gateway view.
- Error case: customer lookup tidak ditemukan, payment gagal/expired, promo invalid.
- Permission/role: public endpoint dengan Bearer device token kiosk.
- Notes: Karena pembayaran dilakukan lewat gateway, backend tidak mendebit wallet. Saat webhook PAID, backend mencatat order PAID, promo usage, point earn, tier progress, referral qualification, dan tier cashback secara idempoten.

### Top Up With Campaign Cashback

- Method: `POST`
- Path: `/transactions/topup`
- Purpose: Top up `MAIN_BALANCE` dan trigger campaign cashback top up ke `BONUS_BALANCE`.
- Request body:

```json
{
  "customerId": "cust-1",
  "amount": 100000,
  "idempotencyKey": "topup-cust-1-001"
}
```

- Response body:

```json
{
  "ledgerId": "ledger-topup-1",
  "mainBalanceAdded": 100000,
  "bonusCashback": 10000
}
```

- Error case: amount invalid, wallet/customer invalid, duplicate idempotency key.
- Permission/role: JWT user.
- Notes: Top up tidak menghasilkan point dan tidak menaikkan tier. Cashback top up idempotent per ledger top up.

### Refund Transaction

- Method: `POST`
- Path: `/transactions/:id/refund`
- Purpose: Refund order promo-loyalty lengkap.
- Request body:

```json
{ "reason": "Customer cancel" }
```

- Response body:

```json
{
  "orderId": "order-1",
  "status": "REFUNDED",
  "refundedAmount": 35000
}
```

- Error case: order tidak ditemukan, order bukan `PAID`, order sudah refund, payment tidak ditemukan.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Refund mengembalikan MAIN/BONUS sesuai ledger debit, reverse point, reverse voucher redemption, dan mengurangi akumulasi tier retail/B2B bila applicable.

## 12. Report API

### Promotion Loyalty Report

- Method: `GET`
- Path: `/reports/promotion-loyalty?month=2026-06`
- Purpose: Dashboard dan laporan Promotion/Loyalty.
- Request body: none
- Response body:

```json
{
  "month": "2026-06",
  "dashboard": {
    "totalVoucherIssued": 100,
    "totalVoucherUsed": 40,
    "voucherBurnRate": 40,
    "totalBonusBalanceIssued": 250000,
    "totalOutstandingPoint": 12345,
    "b2bTransactionVolume": 3000000,
    "b2bTransactionCount": 20,
    "promoRevenueImpact": 500000,
    "promoDrivenRevenue": 4500000
  },
  "voucherByStatus": [
    { "status": "ACTIVE", "count": 60 },
    { "status": "USED", "count": 40 }
  ],
  "campaignLogs": [],
  "b2bPricingImpact": [
    {
      "ruleId": "rule-1",
      "ruleName": "Gold Washer",
      "partnerName": "PT B2B",
      "tier": "GOLD_PARTNER",
      "outletName": "Outlet A",
      "serviceName": "Wash",
      "machineType": "WASHER",
      "usageCount": 2,
      "discountAmount": 75000
    }
  ],
  "walletLedgers": []
}
```

- Error case: invalid `month` format. Format wajib `YYYY-MM`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Report memisahkan top up sebagai liability. Revenue impact dihitung dari order paid yang memakai discount/promo/voucher.

### Related Operational Reports

- Method: `GET`
- Path: `/reports/outlets?outletId=out-1`
- Purpose: Ringkasan performa outlet.
- Request body: none
- Response body: array outlet summary.
- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Bukan report promo khusus, tapi berguna untuk konteks outlet restriction.

- Method: `GET`
- Path: `/reports/top-services?month=2026-06&outletId=out-1`
- Purpose: Top 10 layanan berdasarkan revenue.
- Request body: none
- Response body: array top service.
- Error case: invalid `month`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Bisa dipakai untuk analisa service yang paling sering terdampak promo.

- Method: `GET`
- Path: `/reports/staff?outletId=out-1`
- Purpose: Kinerja staff.
- Request body: none
- Response body: array staff performance.
- Error case: `401`, `403`.
- Permission/role: `SUPER_ADMIN`, `OWNER`, `ADMIN_OUTLET`.
- Notes: Bukan report promo khusus.

## Appendix: Enum Referensi

- `UserSegment`: `RETAIL`, `B2B`
- `VoucherStatus`: `ACTIVE`, `USED`, `EXPIRED`, `CANCELLED`
- `VoucherType`: `FREE_WASH`, `FREE_DRY`, `FREE_WASH_DRY`, `NOMINAL_DISCOUNT`, `PERCENTAGE_DISCOUNT`, `LOTTERY_TICKET`, `TIER_EXCLUSIVE`, `B2B_EXCLUSIVE`
- `MembershipTier`: `SILVER`, `GOLD`, `PLATINUM`, `DIAMOND`
- `B2BPartnerTier`: `BUSINESS_PARTNER`, `GOLD_PARTNER`, `PLATINUM_PARTNER`, `DIAMOND_PARTNER`
- `CampaignType`: `CASHBACK_TOPUP`, `LONG_TIME_NO_SEE`, `REFERRAL`, `BIRTHDAY_REWARD`, `ANNIVERSARY_REWARD`, `MONTHLY_TIER_BENEFIT`
- `WalletType`: `MAIN_BALANCE`, `BONUS_BALANCE`, `POINT_BALANCE`
- `LedgerDirection`: `CREDIT`, `DEBIT`
