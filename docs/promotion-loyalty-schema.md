# Promotion & Loyalty Engine — Rancangan Database Schema

> Dokumen rancangan (belum diimplementasikan). Basis: `laundry-be/prisma/schema.prisma`
> (Prisma 5 + PostgreSQL). Mengikuti konvensi schema yang sudah ada:
> model PascalCase, `@@map` snake_case jamak, field camelCase, enum SCREAMING_SNAKE,
> uang `Decimal @db.Decimal(14, 2)`, ledger pakai `balanceBefore`/`balanceAfter` +
> `idempotencyKey` unik (lihat `WalletTransaction`), index di FK & kolom filter.
>
> **Prinsip:** *extend, jangan rewrite.* Model lama (`Customer`, `Order`, `Wallet`,
> `WalletTransaction`, `Promo`, `PromoRule`, `PromoUsage`) dipertahankan; engine baru
> menambah model & beberapa kolom. Pemetaan kompatibilitas dijelaskan per bagian.

## Daftar isi
1. [Keputusan bisnis → keputusan desain](#1-keputusan-bisnis--keputusan-desain)
2. [Enum baru](#2-enum-baru)
3. [Wallet multi-saldo + ledger](#3-wallet-multi-saldo--ledger)
4. [Point ledger](#4-point-ledger)
5. [Membership tier (retail) & B2B partner tier](#5-membership-tier-retail--b2b-partner-tier)
6. [B2B partner](#6-b2b-partner)
7. [Voucher: template, user voucher, redemption](#7-voucher-template-user-voucher-redemption)
8. [Campaign & happy hour](#8-campaign--happy-hour)
9. [Promotion rule & pricing calculation](#9-promotion-rule--pricing-calculation)
10. [Integrasi transaksi (order, payment, refund)](#10-integrasi-transaksi)
11. [Reporting & revenue recognition](#11-reporting--revenue-recognition)
12. [Ringkasan migrasi](#12-ringkasan-migrasi)

---

## 1. Keputusan bisnis → keputusan desain

| # | Keputusan bisnis | Implikasi schema |
|---|------------------|------------------|
| 1 | Retail + B2B partner | Owner wallet di-generalisasi (`customerId` **atau** `partnerId`); `segment` (RETAIL/B2B) di tier & voucher |
| 2 | Wallet: MAIN / BONUS / POINT | `Wallet.mainBalance`, `Wallet.bonusBalance`, `Wallet.pointBalance`; ledger ber-`balanceType` |
| 3 | Point dari transaksi sukses, bukan top up | `PointLedger` EARN hanya dipicu order PAID; top up tak menambah point |
| 4 | Tier retail dari spending/jumlah transaksi sukses | `MembershipTier.thresholdSpending`/`thresholdTxnCount`; `Membership.earnedSpending`/`successfulTxnCount` (top up dikecualikan) |
| 5 | Voucher tidak bisa digabung (1 voucher/transaksi) | `@@unique` redemption per order + `VoucherTemplate.isStackable=false` |
| 6 | B2B pakai wallet/deposit, bukan invoice | `Partner` punya wallet via owner generalization; tidak ada model invoice |
| 7 | Top up bukan revenue sampai terpakai | Top up = `WalletTransaction TOPUP` (liability); revenue diakui saat konsumsi (`PAYMENT`); lihat §11 |
| 8 | Bonus & point tak bisa dicairkan | `Wallet.bonusBalance`/`pointBalance` tak punya jalur withdraw; aturan di service, didokumentasikan |
| 9 | Semua mutasi wajib ledger/audit | Setiap mutasi → baris ledger (`WalletTransaction`, `PointLedger`, `VoucherRedemption`, `MembershipHistory`) + `AuditLog` untuk perubahan konfigurasi |
| 10 | Refund membalikkan saldo/poin/reward | Ledger ber-`referenceType`/`referenceId` + tipe pembalikan (`REFUND`, `EXPIRE/ADJUST`, status `REVERSED`) |

---

## 2. Enum baru

```prisma
enum AccountSegment {
  RETAIL
  B2B
}

enum WalletBalanceType {
  MAIN   // saldo utama dari top up (refundable, diakui sbg revenue saat dipakai)
  BONUS  // saldo bonus dari cashback/promo (non-withdrawable)
  POINT  // poin loyalty (non-withdrawable, satuan poin)
}

enum PointLedgerType {
  EARN              // dari order sukses
  REDEEM            // ditukar voucher/hadiah
  EXPIRE            // kedaluwarsa
  ADJUST            // koreksi manual admin
  REFUND_REVERSAL   // pembalikan saat order di-refund
}

enum VoucherBenefitType {
  PERCENTAGE
  FIXED_AMOUNT
  FREE_DELIVERY
  CASHBACK          // benefit dikreditkan ke BONUS_BALANCE saat PAID
  POINT_BONUS       // bonus poin
}

enum VoucherStatus {
  ACTIVE
  USED
  EXPIRED
  REVOKED
}

enum VoucherSourceType {
  CAMPAIGN
  REFERRAL
  BIRTHDAY
  ANNIVERSARY
  LONG_TIME_NO_SEE
  TIER_BENEFIT
  POINT_REDEMPTION
  MANUAL            // diterbitkan admin
}

enum CampaignType {
  BIRTHDAY
  ANNIVERSARY
  LONG_TIME_NO_SEE
  REFERRAL
  TOPUP_BONUS
  HAPPY_HOUR
  GENERAL
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  ENDED
}

enum ReferralStatus {
  PENDING     // referee mendaftar, belum transaksi pertama
  QUALIFIED   // syarat terpenuhi → reward diterbitkan
  REWARDED
  EXPIRED
}

enum PriceAdjustmentType {
  PERCENTAGE_OFF
  FIXED_OFF
  FIXED_PRICE
}
```

> `PromoType` & `WalletTransactionType` yang lama tetap dipakai. `WalletTransactionType`
> ditambah nilai bila perlu (mis. `VOUCHER_CASHBACK`), atau cukup pakai `CASHBACK` yang ada.

---

## 3. Wallet multi-saldo + ledger

### 3.1 Extend `Wallet`
Owner di-generalisasi agar B2B partner bisa punya wallet/deposit (keputusan 1 & 6).
`customerId` lama menjadi opsional; tepat satu dari `customerId`/`partnerId` terisi
(divalidasi di service + partial unique index).

```prisma
model Wallet {
  id            String   @id @default(uuid())
  customerId    String?  @unique          // RETAIL (kompatibel dgn data lama)
  partnerId     String?  @unique          // B2B deposit
  mainBalance   Decimal  @default(0) @db.Decimal(14, 2)  // = `balance` lama (top up)
  bonusBalance  Decimal  @default(0) @db.Decimal(14, 2)  // cashback/promo
  pointBalance  Int      @default(0)                     // poin loyalty
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  customer     Customer?           @relation(fields: [customerId], references: [id], onDelete: Cascade)
  partner      Partner?            @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  transactions WalletTransaction[]

  @@map("wallets")
}
```

> **Migrasi `balance` → `mainBalance`:** rename kolom (data terjaga). Semua referensi
> `wallet.balance` di `wallets.service.ts` & `payments` di-update di fase implementasi.
> `pointBalance` adalah cache cepat; sumber kebenaran tetap `PointLedger` (§4).

### 3.2 Extend `WalletTransaction` (ledger uang — keputusan 9)
```prisma
model WalletTransaction {
  id              String                @id @default(uuid())
  walletId        String
  orderId         String?
  balanceType     WalletBalanceType     @default(MAIN)  // bucket yang bermutasi
  transactionType WalletTransactionType
  amount          Decimal               @db.Decimal(14, 2)  // signed (+/-)
  balanceBefore   Decimal               @db.Decimal(14, 2)
  balanceAfter    Decimal               @db.Decimal(14, 2)
  referenceType   String?               // 'VOUCHER' | 'CAMPAIGN' | 'REFUND' | 'TOPUP' ...
  referenceId     String?
  description     String?
  idempotencyKey  String?               @unique
  createdAt       DateTime              @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id], onDelete: Cascade)
  order  Order? @relation(fields: [orderId], references: [id], onDelete: SetNull)

  @@index([walletId])
  @@index([orderId])
  @@index([balanceType])
  @@index([referenceType, referenceId])
  @@index([idempotencyKey])
  @@map("wallet_transactions")
}
```

> Mutasi MAIN & BONUS lewat tabel ini. **POINT pakai `PointLedger`** terpisah karena
> satuannya integer & punya semantik expiry. `bonusBalance`/`pointBalance` **tidak**
> punya `transactionType` withdraw → keputusan 8 ditegakkan di service.

---

## 4. Point ledger

Poin = transaksi sukses, bukan top up (keputusan 3); tak bisa dicairkan (keputusan 8);
wajib ledger (keputusan 9).

```prisma
model PointLedger {
  id             String          @id @default(uuid())
  walletId       String
  orderId        String?         // sumber EARN
  type           PointLedgerType
  points         Int             // signed (+EARN / -REDEEM/EXPIRE)
  balanceBefore  Int
  balanceAfter   Int
  sourceType     String?         // 'ORDER' | 'TIER_MULTIPLIER' | 'CAMPAIGN' | 'REDEMPTION'
  sourceId       String?
  expiresAt      DateTime?       // utk batch EXPIRE
  idempotencyKey String?         @unique
  description    String?
  createdAt      DateTime        @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id], onDelete: Cascade)
  order  Order? @relation(fields: [orderId], references: [id], onDelete: SetNull)

  @@index([walletId])
  @@index([orderId])
  @@index([type])
  @@index([expiresAt])
  @@index([idempotencyKey])
  @@map("point_ledgers")
}
```

**Aturan earn:** dipicu hanya saat order → `PAID` (lihat §10). Rumus dasar
`points = floor(earnedSubtotal / pointRate) * tier.pointMultiplier`. Konfigurasi
`pointRate` di tabel konfigurasi loyalty (lihat `LoyaltyConfig` di §9) atau env.

---

## 5. Membership tier (retail) & B2B partner tier

Satu tabel definisi tier dipakai retail & B2B via `segment` (keputusan 1 & 4).

```prisma
model MembershipTier {
  id                String         @id @default(uuid())
  segment           AccountSegment                 // RETAIL | B2B
  name              String                         // Silver/Gold/Platinum/Diamond (retail) atau tier B2B
  level             Int                            // urutan; 1 = terendah
  thresholdSpending Decimal?       @db.Decimal(14, 2)  // earned spending utk naik tier
  thresholdTxnCount Int?                           // ATAU jumlah transaksi sukses
  pointMultiplier   Decimal        @default(1) @db.Decimal(6, 2)  // pengali earn poin
  cashbackRate      Decimal        @default(0) @db.Decimal(5, 2)  // % cashback ke BONUS
  benefitVoucherTemplateId String?                 // voucher bulanan tier (opsional)
  color             String?                        // utk UI badge
  isActive          Boolean        @default(true)
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  benefitVoucherTemplate VoucherTemplate? @relation("TierBenefitVoucher", fields: [benefitVoucherTemplateId], references: [id], onDelete: SetNull)
  memberships            Membership[]

  @@unique([segment, level])
  @@index([segment])
  @@map("membership_tiers")
}
```

State tier per pemilik (retail customer atau B2B partner):

```prisma
model Membership {
  id                 String         @id @default(uuid())
  segment            AccountSegment
  customerId         String?        @unique
  partnerId          String?        @unique
  tierId             String
  earnedSpending     Decimal        @default(0) @db.Decimal(14, 2) // akumulasi (top up DIKECUALIKAN)
  successfulTxnCount Int            @default(0)
  achievedAt         DateTime       @default(now())  // kapan tier saat ini dicapai
  evaluatedAt        DateTime       @default(now())  // evaluasi terakhir
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  tier     MembershipTier @relation(fields: [tierId], references: [id])
  customer Customer?      @relation(fields: [customerId], references: [id], onDelete: Cascade)
  partner  Partner?       @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  history  MembershipHistory[]

  @@index([tierId])
  @@map("memberships")
}

/// Audit perubahan tier (keputusan 9): naik/turun tier + alasannya.
model MembershipHistory {
  id           String   @id @default(uuid())
  membershipId String
  fromTierId   String?
  toTierId     String
  reason       String   // 'SPENDING_THRESHOLD' | 'TXN_THRESHOLD' | 'MANUAL' | 'REFUND_DOWNGRADE'
  snapshotSpending Decimal @db.Decimal(14, 2)
  snapshotTxnCount Int
  createdAt    DateTime @default(now())

  membership Membership @relation(fields: [membershipId], references: [id], onDelete: Cascade)

  @@index([membershipId])
  @@map("membership_histories")
}
```

---

## 6. B2B partner

```prisma
model Partner {
  id           String         @id @default(uuid())
  userId       String?        @unique  // akun login PIC (opsional, reuse User)
  partnerCode  String         @unique
  companyName  String
  picName      String
  phone        String
  email        String?
  address      String?
  status       String         @default("ACTIVE")  // ACTIVE | SUSPENDED
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  user        User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
  wallet      Wallet?                      // deposit (keputusan 6)
  membership  Membership?                  // B2B tier
  userVouchers UserVoucher[]
  orders      Order[]

  @@index([partnerCode])
  @@map("partners")
}
```

> `Order.partnerId String?` ditambah (§10) agar order B2B dibayar dari deposit partner.
> `User` mendapat relasi balik `partner Partner?` dan `Customer` tetap untuk retail.

---

## 7. Voucher: template, user voucher, redemption

Pemisahan **template (definisi)** vs **user voucher (instance milik 1 pemilik)** —
beda dengan `Promo` (kode publik yang diketik siapa saja). Voucher tidak bisa digabung
(keputusan 5).

```prisma
model VoucherTemplate {
  id                 String             @id @default(uuid())
  code               String             @unique  // prefix/kode dasar; instance pakai kode unik sendiri
  name               String
  description        String?
  bannerUrl          String?
  segment            AccountSegment     @default(RETAIL)
  benefitType        VoucherBenefitType
  value              Decimal            @db.Decimal(14, 2)  // % atau nominal/point sesuai benefitType
  maxDiscount        Decimal?           @db.Decimal(14, 2)
  minTransaction     Decimal?           @db.Decimal(14, 2)
  applicableServices String?            // CSV serviceId (konsisten dgn PromoRule)
  applicableOutlets  String?            // CSV outletId
  validityDays       Int?               // masa berlaku sejak diterbitkan (utk auto-issue)
  startDate          DateTime?          // ATAU jendela absolut
  endDate            DateTime?
  isStackable        Boolean            @default(false)  // keputusan 5: selalu false
  quota              Int?               // total instance yang boleh terbit
  issuedCount        Int                @default(0)
  perCustomerLimit   Int?               @default(1)
  pointCost          Int?               // bila ditukar dari poin (POINT_REDEMPTION)
  tierId             String?            // batasi ke tier tertentu (opsional)
  isActive           Boolean            @default(true)
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  tier        MembershipTier? @relation("TierBenefitVoucher")
  userVouchers UserVoucher[]
  campaigns   Campaign[]      @relation("CampaignRewardVoucher")

  @@index([code])
  @@index([segment])
  @@index([isActive])
  @@map("voucher_templates")
}

model UserVoucher {
  id          String            @id @default(uuid())
  templateId  String
  customerId  String?
  partnerId   String?
  code        String            @unique  // kode instance unik
  status      VoucherStatus     @default(ACTIVE)
  sourceType  VoucherSourceType
  sourceId    String?           // campaignId/referralId/orderId/dst
  issuedAt    DateTime          @default(now())
  expiresAt   DateTime?
  usedAt      DateTime?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  template   VoucherTemplate    @relation(fields: [templateId], references: [id])
  customer   Customer?          @relation(fields: [customerId], references: [id], onDelete: Cascade)
  partner    Partner?           @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  redemption VoucherRedemption?

  @@index([templateId])
  @@index([customerId])
  @@index([partnerId])
  @@index([status])
  @@index([code])
  @@map("user_vouchers")
}

/// Audit pemakaian voucher (keputusan 9) + jalur pembalikan refund (keputusan 10).
model VoucherRedemption {
  id            String   @id @default(uuid())
  userVoucherId String   @unique          // 1 voucher hanya 1 redemption
  orderId       String   @unique          // keputusan 5: 1 voucher per order
  customerId    String?
  partnerId     String?
  discountApplied Decimal @db.Decimal(14, 2)
  status        String   @default("APPLIED")  // APPLIED | REVERSED (refund)
  redeemedAt    DateTime @default(now())
  reversedAt    DateTime?

  userVoucher UserVoucher @relation(fields: [userVoucherId], references: [id], onDelete: Cascade)
  order       Order       @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([customerId])
  @@index([partnerId])
  @@map("voucher_redemptions")
}
```

> **Non-stackable ditegakkan dua lapis:** `VoucherRedemption.orderId @unique` (DB) +
> validasi di pricing service (tolak >1 voucher). `Order` boleh punya `promoId` **atau**
> satu voucher — kebijakan prioritas didokumentasikan di §9.

---

## 8. Campaign & happy hour

Satu model `Campaign` menyatukan pemicu reward (birthday, anniversary, LTNS, referral,
top-up bonus, general). Happy hour punya tabel aturan harga sendiri karena mengubah harga,
bukan menerbitkan voucher.

```prisma
model Campaign {
  id              String         @id @default(uuid())
  type            CampaignType
  name            String
  description     String?
  status          CampaignStatus @default(DRAFT)
  segment         AccountSegment @default(RETAIL)
  startDate       DateTime?
  endDate         DateTime?
  rewardVoucherTemplateId String?            // reward berupa voucher
  rewardPoints    Int?                       // ATAU reward poin
  config          Json?                      // param spesifik per tipe (lihat catatan)
  isActive        Boolean        @default(true)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  rewardVoucherTemplate VoucherTemplate? @relation("CampaignRewardVoucher", fields: [rewardVoucherTemplateId], references: [id], onDelete: SetNull)
  issuances    CampaignIssuance[]
  referrals    Referral[]

  @@index([type])
  @@index([status])
  @@map("campaigns")
}
```

**`config` per tipe (didokumentasikan, divalidasi di DTO):**
- `LONG_TIME_NO_SEE`: `{ inactiveDays: 30 }`
- `BIRTHDAY` / `ANNIVERSARY`: `{ daysBefore: 0, oncePerYear: true }`
- `TOPUP_BONUS`: `{ tiers: [{ minTopup: 100000, bonus: 10000, type: 'FIXED'|'PERCENT' }] }`
- `REFERRAL`: `{ rewardReferrer: true, rewardReferee: true, qualifyOn: 'FIRST_PAID_ORDER' }`

```prisma
/// Audit penerbitan reward kampanye (keputusan 9) + idempotensi anti dobel-terbit.
model CampaignIssuance {
  id            String   @id @default(uuid())
  campaignId    String
  customerId    String?
  partnerId     String?
  userVoucherId String?           // bila reward voucher
  pointsAwarded Int?              // bila reward poin
  idempotencyKey String  @unique  // mis. "birthday:<customerId>:2026" → 1x/tahun
  issuedAt      DateTime @default(now())

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([campaignId])
  @@index([customerId])
  @@map("campaign_issuances")
}

model Referral {
  id            String         @id @default(uuid())
  campaignId    String?
  referrerCustomerId String
  refereeCustomerId  String?     // diisi saat referee mendaftar
  referralCode  String         @unique
  status        ReferralStatus @default(PENDING)
  qualifiedAt   DateTime?
  rewardedAt    DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  campaign Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)

  @@index([referrerCustomerId])
  @@index([refereeCustomerId])
  @@index([referralCode])
  @@map("referrals")
}
```

**Happy hour** (mengubah harga mesin/layanan per hari & jam):

```prisma
model HappyHourRule {
  id             String              @id @default(uuid())
  name           String
  outletId       String?             // null = semua outlet
  serviceId      String?             // null = semua layanan
  machineType    String?             // alternatif filter
  daysOfWeek     String              // CSV "1,2,3" (1=Senin), konsisten dgn Kiosk.scheduleDays
  startTime      String              // "18:00"
  endTime        String              // "21:00"
  timezone       String              @default("Asia/Jakarta")
  adjustmentType PriceAdjustmentType
  value          Decimal             @db.Decimal(14, 2)
  priority       Int                 @default(0)  // bila beberapa rule cocok, ambil prioritas tertinggi
  startDate      DateTime?
  endDate        DateTime?
  isActive       Boolean             @default(true)
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  outlet  Outlet?  @relation(fields: [outletId], references: [id], onDelete: Cascade)
  service Service? @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@index([outletId])
  @@index([serviceId])
  @@index([isActive])
  @@map("happy_hour_rules")
}
```

---

## 9. Promotion rule & pricing calculation

`PromoRule` lama tetap. Untuk konfigurasi global loyalty (point rate, expiry, dll):

```prisma
model LoyaltyConfig {
  id                 String   @id @default(uuid())
  key                String   @unique  // 'POINT_RATE' | 'POINT_EXPIRY_DAYS' | 'TOPUP_MIN' ...
  valueNumeric       Decimal? @db.Decimal(14, 2)
  valueText          String?
  description        String?
  updatedAt          DateTime @updatedAt

  @@map("loyalty_configs")
}
```

**Pricing pipeline (deterministik) — diimplementasikan di `PricingService` (lihat plan):**

```
1. Base price per item       ← ServicePrice
2. Happy hour adjustment      ← HappyHourRule (per item, prioritas tertinggi)  → adjustedSubtotal
3. Satu diskon promosi:       ← MUTUALLY EXCLUSIVE (keputusan 5):
     a. Voucher (UserVoucher) ATAU
     b. Promo code (Promo)
   → eligibleSubtotal dihitung per applicableServices, lalu maxDiscount/minTransaction
4. Tier benefit               ← Membership.tier (mis. diskon/multiplier; tak menambah diskon ganda bila kebijakan melarang)
5. totalAmount = adjustedSubtotal − discount + deliveryFee
6. Accrual (dihitung, dieksekusi saat PAID):
     - point earn  = f(eligibleSubtotal, tier.pointMultiplier, LoyaltyConfig.POINT_RATE)
     - cashback    = voucher CASHBACK / tier.cashbackRate → BONUS_BALANCE
```

> Output `PricingBreakdown` (DTO, bukan tabel): `{ subtotal, happyHourAdjustment,
> discount, discountSource, totalAmount, pointsToEarn, cashbackToCredit }`.
> Dipakai bersama preview (mobile/kiosk) dan realisasi (order create) — pola yang sama
> seperti `PromosService.evaluatePromo` yang sudah ada.

---

## 10. Integrasi transaksi

### 10.1 `Order` (extend)
```prisma
// tambahan kolom:
partnerId          String?   // order B2B (bayar dari deposit partner)
userVoucherId      String?   // voucher yang dipakai (selain promoId)
happyHourAdjustment Decimal  @default(0) @db.Decimal(14, 2)
pointsEarned       Int       @default(0)  // diisi saat PAID (cache; sumber: PointLedger)
cashbackCredited   Decimal   @default(0) @db.Decimal(14, 2)
// relasi: partner Partner?, userVoucher UserVoucher?, pointLedgers PointLedger[], voucherRedemption VoucherRedemption?
```

### 10.2 Titik hook (mengikuti pola `commitUsage` yang sudah ada)
| Event | Aksi | Ledger |
|-------|------|--------|
| **Order create** | Hitung harga via `PricingService` (happy hour + voucher/promo). Simpan `promoId`/`userVoucherId`, `discountAmount`, `happyHourAdjustment`. Voucher belum USED. | — |
| **Payment success (PAID)** — di `payments.settlePaid` & `wallets.pay` | (a) `promos.commitUsage` (sudah ada); (b) `voucher.commitRedemption` → status USED + `VoucherRedemption`; (c) `points.earn` → `PointLedger EARN`; (d) cashback → `bonusBalance` + `WalletTransaction(BONUS, CASHBACK)`; (e) `membership.reevaluate` → naik tier bila threshold tercapai (+`MembershipHistory`); (f) trigger campaign (referral qualify, dst) | WalletTransaction, PointLedger, VoucherRedemption, MembershipHistory |
| **Refund** (`wallets` refund) | Balikkan semua (keputusan 10): refund MAIN/BONUS (`WalletTransaction REFUND`), `PointLedger REFUND_REVERSAL` (tarik poin earned), `VoucherRedemption.status=REVERSED` + `UserVoucher` kembali ACTIVE (bila belum kedaluwarsa), turunkan `earnedSpending`/tier bila perlu (`MembershipHistory reason=REFUND_DOWNGRADE`) | semua ledger terkait |

> Pembayaran B2B: `wallets.pay` menerima owner = partner; potong `mainBalance` deposit.
> Top up B2B & retail tetap `WalletTransaction TOPUP` ke `mainBalance` (liability, §11).

---

## 11. Reporting & revenue recognition

**Revenue recognition (keputusan 7):** top up **bukan** revenue. Implikasi report:
- **Top up** (`WalletTransaction TOPUP`, `mainBalance`) = **liability** (deferred revenue) /
  outstanding wallet balance. Bukan pendapatan.
- **Revenue** diakui saat **konsumsi**: order `PAID` (mengikuti `PAID_STATUSES` di
  `reports.service.ts`). Pembayaran dari `mainBalance` mengkonversi liability → revenue.
- **Bonus balance** terpakai = potongan biaya marketing, bukan revenue baru.
- **Point/bonus** = liability non-tunai (keputusan 8), dilaporkan terpisah.

**Laporan baru (modul `reports` yang sudah ada, tambah endpoint):**
| Report | Sumber |
|--------|--------|
| Wallet liability (outstanding main vs bonus) | `Wallet`, `WalletTransaction` |
| Point liability & aging | `PointLedger` (saldo aktif + akan expire) |
| Voucher funnel (issued → used → expired) | `UserVoucher`, `VoucherRedemption` |
| Campaign ROI (biaya reward vs revenue terdorong) | `CampaignIssuance`, `Order` |
| Tier distribution & migrasi | `Membership`, `MembershipHistory` |
| B2B deposit usage | `Wallet(partner)`, `WalletTransaction`, `Order(partnerId)` |
| Happy hour uplift | `Order.happyHourAdjustment` |

> Semua angka uang lewat `toNum` di boundary report (pola `reports.service.ts`).

---

## 12. Ringkasan migrasi

Pecah jadi beberapa migration kecil (mengikuti gaya `add_*` yang ada), urut aman:

1. `extend_wallet_multibalance` — rename `balance`→`mainBalance`, tambah `bonusBalance`,
   `pointBalance`, `partnerId`; backfill; update kode `wallets`/`payments`.
2. `add_wallet_ledger_fields` — `balanceType`, `referenceType/Id` di `WalletTransaction`.
3. `add_point_ledger` — `PointLedger`.
4. `add_partners` — `Partner` (+ relasi `User`, `Order.partnerId`).
5. `add_membership_tiers` — `MembershipTier`, `Membership`, `MembershipHistory`.
6. `add_vouchers` — `VoucherTemplate`, `UserVoucher`, `VoucherRedemption` (+ `Order.userVoucherId`).
7. `add_campaigns` — `Campaign`, `CampaignIssuance`, `Referral`.
8. `add_happy_hour` — `HappyHourRule` (+ `Order.happyHourAdjustment`).
9. `add_loyalty_config` — `LoyaltyConfig`, kolom accrual di `Order` (`pointsEarned`, `cashbackCredited`).

Tiap migration disertai update seed dummy (`prisma/seed.ts`) seperti praktik yang ada.
