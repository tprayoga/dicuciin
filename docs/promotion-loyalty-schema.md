# Promotion & Loyalty Engine — Database Schema (Implemented)

> Dokumen ini **mendeskripsikan schema yang sudah diimplementasikan** di
> `laundry-be/prisma/schema.prisma` (Prisma 5 + PostgreSQL) dan sudah ter-migrate
> (lihat §12). Sebelumnya dokumen ini berupa rancangan; kini disinkronkan dengan kode
> aktual. Konvensi schema: model PascalCase, `@@map` snake_case jamak, field camelCase,
> enum SCREAMING_SNAKE, uang `Decimal @db.Decimal(14, 2)`, ledger pakai
> `balanceBefore`/`balanceAfter` + `idempotencyKey` unik, index di FK & kolom filter.
>
> **Prinsip yang diterapkan:** *extend, jangan rewrite.* Model lama (`Customer`, `Order`,
> `Wallet`, `WalletTransaction`, `Promo`, `PromoRule`, `PromoUsage`) dipertahankan apa
> adanya; engine loyalty menambah model & ledger baru di sebelahnya.
>
> **Catatan penyelarasan (penting):** implementasi memilih beberapa keputusan desain yang
> berbeda dari draft awal — didokumentasikan di tiap bagian:
> - Ledger uang multi-saldo dibuat sebagai **tabel terpisah `WalletLedger`**
>   (`walletType` + `direction` CREDIT/DEBIT), **bukan** memperluas `WalletTransaction`.
>   `Wallet.balance` (top up / MAIN) **tidak di-rename**; ditambah `bonusBalance` &
>   `pointBalance`.
> - Nama model final: **`B2BPartner`** (bukan `Partner`), **`UserMembershipStatus`**
>   (bukan `Membership`), **`MembershipTierConfig`** + **`B2BPartnerTierConfig`** (bukan
>   `MembershipTier` tunggal).
> - Tier disimpan sebagai **enum** (`MembershipTier`, `B2BPartnerTier`), bukan level int bebas.
> - `Order` **tidak** menambah kolom accrual (`pointsEarned`, dst). Keterkaitan loyalty
>   dilacak via relasi: `VoucherRedemption`, `PointLedger`, `WalletLedger`,
>   `B2BPricingRuleUsage`, `PricingCalculationLog`. `Order` hanya menambah `promoId` & `partnerId`.

## Daftar isi
1. [Keputusan bisnis → keputusan desain](#1-keputusan-bisnis--keputusan-desain)
2. [Enum baru](#2-enum-baru)
3. [Wallet multi-saldo + ledger](#3-wallet-multi-saldo--ledger)
4. [Point ledger](#4-point-ledger)
5. [Membership tier (retail) & B2B partner tier](#5-membership-tier-retail--b2b-partner-tier)
6. [B2B partner & special pricing](#6-b2b-partner--special-pricing)
7. [Voucher: template, user voucher, redemption](#7-voucher-template-user-voucher-redemption)
8. [Campaign, referral & happy hour](#8-campaign-referral--happy-hour)
9. [Promotion rule & pricing calculation](#9-promotion-rule--pricing-calculation)
10. [Integrasi transaksi (order, payment, refund)](#10-integrasi-transaksi)
11. [Reporting & revenue recognition](#11-reporting--revenue-recognition)
12. [Status migrasi](#12-status-migrasi)

---

## 1. Keputusan bisnis → keputusan desain

| # | Keputusan bisnis | Implikasi schema (implementasi) |
|---|------------------|---------------------------------|
| 1 | Retail + B2B partner | `Wallet` & `UserMembershipStatus` di-generalisasi (`customerId` **atau** `partnerId`); `segment` (RETAIL/B2B) di voucher, tier-status, pricing log |
| 2 | Wallet: MAIN / BONUS / POINT | `Wallet.balance` (MAIN), `Wallet.bonusBalance`, `Wallet.pointBalance`; ledger uang `WalletLedger` ber-`walletType` |
| 3 | Point dari transaksi sukses, bukan top up | `PointLedger` EARN hanya dipicu order PAID; top up tak menambah point |
| 4 | Tier retail/B2B dari spending/jumlah transaksi sukses | `MembershipTierConfig`/`B2BPartnerTierConfig.thresholdSpending`/`thresholdTxnCount`; `UserMembershipStatus.earnedSpending`/`successfulTxnCount` (top up dikecualikan) |
| 5 | Voucher tidak bisa digabung (1 voucher/transaksi) | `VoucherRedemption.orderId @unique` + `VoucherTemplate.isStackable=false` |
| 6 | B2B pakai wallet/deposit, bukan invoice | `B2BPartner` punya `wallet` (deposit); tidak ada model invoice |
| 7 | Top up bukan revenue sampai terpakai | Top up = `WalletTransaction TOPUP` + `WalletLedger(MAIN, CREDIT)` (liability); revenue diakui saat konsumsi; lihat §11 |
| 8 | Bonus & point tak bisa dicairkan | `bonusBalance`/`pointBalance` tak punya jalur withdraw; ditegakkan di service |
| 9 | Semua mutasi wajib ledger/audit | Tiap mutasi → baris ledger (`WalletLedger`, `PointLedger`, `VoucherRedemption`, `CampaignIssuance`, `CampaignExecutionLog`, `B2BPricingRuleUsage`) |
| 10 | Refund membalikkan saldo/poin/reward | Ledger ber-`referenceType`/`referenceId`/`sourceType` + status pembalikan (`REVERSED`, `direction` berlawanan) |

---

## 2. Enum baru

```prisma
enum WalletType {
  MAIN_BALANCE   // saldo utama dari top up (refundable; diakui revenue saat dipakai)
  BONUS_BALANCE  // saldo bonus dari cashback/promo (non-withdrawable)
  POINT_BALANCE  // poin loyalty (non-withdrawable, satuan poin)
}

enum LedgerDirection {
  CREDIT
  DEBIT
}

enum UserSegment {
  RETAIL
  B2B
}

enum VoucherType {
  FREE_WASH
  FREE_DRY
  FREE_WASH_DRY
  NOMINAL_DISCOUNT
  PERCENTAGE_DISCOUNT
  LOTTERY_TICKET
  TIER_EXCLUSIVE
  B2B_EXCLUSIVE
}

enum VoucherStatus {
  ACTIVE
  USED
  EXPIRED
  CANCELLED
}

enum MembershipTier {
  SILVER
  GOLD
  PLATINUM
  DIAMOND
}

enum B2BPartnerTier {
  BUSINESS_PARTNER
  GOLD_PARTNER
  PLATINUM_PARTNER
  DIAMOND_PARTNER
}

enum CampaignType {
  CASHBACK_TOPUP
  LONG_TIME_NO_SEE
  REFERRAL
  BIRTHDAY_REWARD
  ANNIVERSARY_REWARD
  MONTHLY_TIER_BENEFIT
}

enum ReferralStatus {
  PENDING   // referee terdaftar, belum transaksi pertama
  REWARDED  // transaksi pertama → reward diberikan
  EXPIRED
}
```

> `PromoType` & `WalletTransactionType` lama tetap dipakai apa adanya. Status campaign,
> status partner (`ACTIVE`/`SUSPENDED`), `priceType`/`adjustmentType` pricing, dan
> `rewardType`/`targetParty` campaign disimpan sebagai **String** (bukan enum) agar
> fleksibel — nilai sahnya divalidasi di DTO/service.

---

## 3. Wallet multi-saldo + ledger

### 3.1 `Wallet` (extended)
Owner di-generalisasi agar B2B partner bisa punya wallet/deposit (keputusan 1 & 6).
`customerId` lama tetap opsional & unik; tepat satu dari `customerId`/`partnerId` terisi
(divalidasi di service). `balance` lama **tetap** = MAIN balance (top up).

```prisma
model Wallet {
  id           String   @id @default(uuid())
  customerId   String?  @unique // RETAIL (kompatibel data lama)
  partnerId    String?  @unique // B2B deposit
  balance      Decimal  @default(0) @db.Decimal(14, 2) // = MAIN_BALANCE (top up)
  bonusBalance Decimal  @default(0) @db.Decimal(14, 2) // cashback/promo
  pointBalance Int      @default(0) // poin loyalty (cache; sumber kebenaran: point_ledgers)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  customer     Customer?           @relation(fields: [customerId], references: [id], onDelete: Cascade)
  partner      B2BPartner?         @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  transactions WalletTransaction[] // ledger legacy (saldo tunggal)
  ledgers      WalletLedger[]      // ledger multi-saldo (MAIN/BONUS/POINT uang)
  pointLedgers PointLedger[]

  @@map("wallets")
}
```

> `pointBalance` adalah cache cepat; sumber kebenaran tetap `PointLedger` (§4).
> `bonusBalance`/`pointBalance` tak punya jalur withdraw (keputusan 8).

### 3.2 `WalletTransaction` (ledger legacy — tetap, saldo tunggal)
Tabel lama dipertahankan **tanpa perubahan** untuk kompatibilitas (top up/pay/refund
legacy lewat sini). Tidak punya `walletType`.

```prisma
model WalletTransaction {
  id              String                @id @default(uuid())
  walletId        String
  orderId         String?
  transactionType WalletTransactionType
  amount          Decimal               @db.Decimal(14, 2)
  balanceBefore   Decimal               @db.Decimal(14, 2)
  balanceAfter    Decimal               @db.Decimal(14, 2)
  description     String?
  idempotencyKey  String?               @unique
  createdAt       DateTime              @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id], onDelete: Cascade)
  order  Order? @relation(fields: [orderId], references: [id], onDelete: SetNull)

  @@index([walletId])
  @@index([orderId])
  @@index([idempotencyKey])
  @@map("wallet_transactions")
}
```

### 3.3 `WalletLedger` (ledger uang multi-saldo — baru, keputusan 2 & 9)
Mutasi MAIN & BONUS dicatat di sini per-bucket. `amount` adalah **magnitudo positif**;
arah ditentukan `direction` (CREDIT/DEBIT). **POINT pakai `PointLedger`** terpisah (§4).

```prisma
model WalletLedger {
  id             String          @id @default(uuid())
  walletId       String
  orderId        String?
  walletType     WalletType
  direction      LedgerDirection
  amount         Decimal         @db.Decimal(14, 2) // magnitudo (positif)
  balanceBefore  Decimal         @db.Decimal(14, 2)
  balanceAfter   Decimal         @db.Decimal(14, 2)
  referenceType  String? // 'TOPUP' | 'CASHBACK' | 'VOUCHER' | 'REFUND' | ...
  referenceId    String?
  description    String?
  idempotencyKey String?         @unique
  createdAt      DateTime        @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id], onDelete: Cascade)
  order  Order? @relation(fields: [orderId], references: [id], onDelete: SetNull)

  @@index([walletId])
  @@index([walletType])
  @@index([orderId])
  @@index([referenceType, referenceId])
  @@index([idempotencyKey])
  @@map("wallet_ledgers")
}
```

> **Dua tabel ledger uang hidup berdampingan:** `wallet_transactions` (legacy, saldo
> tunggal) dan `wallet_ledgers` (multi-saldo). Saat report menjumlahkan mutasi, pilih
> **satu** sumber per metrik untuk hindari double-count — lihat catatan §11.

---

## 4. Point ledger

Poin = transaksi sukses, bukan top up (keputusan 3); tak bisa dicairkan (keputusan 8);
wajib ledger (keputusan 9). `points` magnitudo positif; arah via `direction`.

```prisma
model PointLedger {
  id             String          @id @default(uuid())
  walletId       String
  orderId        String?         // sumber EARN
  direction      LedgerDirection // CREDIT=earn, DEBIT=redeem/expire/reversal
  points         Int             // magnitudo (positif)
  balanceBefore  Int
  balanceAfter   Int
  sourceType     String?         // 'ORDER' | 'REDEMPTION' | 'EXPIRY' | 'ADJUST' | 'REFUND_REVERSAL'
  sourceId       String?
  expiresAt      DateTime?       // utk batch EXPIRE
  description    String?
  idempotencyKey String?         @unique
  createdAt      DateTime        @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id], onDelete: Cascade)
  order  Order? @relation(fields: [orderId], references: [id], onDelete: SetNull)

  @@index([walletId])
  @@index([orderId])
  @@index([direction])
  @@index([expiresAt])
  @@index([idempotencyKey])
  @@map("point_ledgers")
}
```

**Aturan earn:** dipicu saat order → `PAID` (lihat §10). Earn ditulis dengan
`idempotencyKey = point-earn-<orderId>`. Rumus dasar memakai `pointMultiplier` tier
(`PointService.earn`). Konfigurasi rate poin berada di service/konstanta (belum ada
tabel `LoyaltyConfig` terpisah).

---

## 5. Membership tier (retail) & B2B partner tier

Berbeda dari draft (satu tabel `MembershipTier`), implementasi memisahkan **konfigurasi
tier retail** dan **B2B**, lalu **status per pemilik** di tabel ketiga.

### 5.1 Konfigurasi tier retail
```prisma
model MembershipTierConfig {
  id                 String         @id @default(uuid())
  tier               MembershipTier @unique
  name               String
  level              Int            @unique // 1=Silver terendah
  thresholdSpending  Decimal?       @db.Decimal(14, 2) // earned spending utk naik
  thresholdTxnCount  Int?           // ATAU jumlah transaksi sukses (OR)
  pointMultiplier    Decimal        @default(1) @db.Decimal(6, 2)
  cashbackRate       Decimal        @default(0) @db.Decimal(5, 2) // % ke BONUS
  benefitDescription String?
  color              String?        // utk UI badge
  isActive           Boolean        @default(true)
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  @@map("membership_tiers")
}
```

### 5.2 Konfigurasi tier B2B
```prisma
model B2BPartnerTierConfig {
  id                 String         @id @default(uuid())
  tier               B2BPartnerTier @unique
  name               String
  level              Int            @unique
  thresholdSpending  Decimal?       @db.Decimal(14, 2)
  thresholdTxnCount  Int?
  discountRate       Decimal        @default(0) @db.Decimal(5, 2) // % potongan harga partner
  pointMultiplier    Decimal        @default(1) @db.Decimal(6, 2)
  cashbackRate       Decimal        @default(0) @db.Decimal(5, 2)
  benefitDescription String?
  isActive           Boolean        @default(true)
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  @@map("b2b_partner_tiers")
}
```

### 5.3 Status tier per pemilik (retail atau B2B)
```prisma
model UserMembershipStatus {
  id                 String          @id @default(uuid())
  customerId         String?         @unique
  partnerId          String?         @unique
  segment            UserSegment
  currentTier        MembershipTier? // utk RETAIL
  currentB2BTier     B2BPartnerTier? // utk B2B
  earnedSpending     Decimal         @default(0) @db.Decimal(14, 2) // akumulasi (top up DIKECUALIKAN)
  successfulTxnCount Int             @default(0)
  achievedAt         DateTime        @default(now())
  evaluatedAt        DateTime        @default(now())
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  customer Customer?   @relation(fields: [customerId], references: [id], onDelete: Cascade)
  partner  B2BPartner? @relation(fields: [partnerId], references: [id], onDelete: Cascade)

  @@index([segment])
  @@map("user_membership_status")
}
```

> Evaluasi tier dijalankan saat order PAID (`MembershipTierService.recordSuccessfulTransaction`)
> dan dibalik saat refund (`reverseTransaction`). `thresholdSpending`/`thresholdTxnCount`
> bersifat **OR** sesuai resolver service. *Catatan:* draft awal menyebut `MembershipHistory`
> (audit naik/turun tier) — model tersebut **belum** diimplementasikan; jejak perubahan
> saat ini lewat `evaluatedAt`/`achievedAt`.

---

## 6. B2B partner & special pricing

```prisma
model B2BPartner {
  id          String         @id @default(uuid())
  userId      String?        @unique // akun login PIC (reuse User)
  partnerCode String         @unique
  companyName String
  picName     String
  phone       String
  email       String?
  address     String?
  tier        B2BPartnerTier @default(BUSINESS_PARTNER)
  status      String         @default("ACTIVE") // ACTIVE | SUSPENDED
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  user              User?                 @relation(fields: [userId], references: [id], onDelete: SetNull)
  wallet            Wallet?                                  // deposit (keputusan 6)
  membershipStatus  UserMembershipStatus?
  userVouchers      UserVoucher[]
  orders            Order[]
  pricingRules      B2BPricingRule[]
  pricingRuleUsages B2BPricingRuleUsage[]

  @@index([partnerCode])
  @@map("b2b_partners")
}
```

**Special pricing B2B** (di luar diskon tier) — per partner/tier/outlet/service/machine,
dengan prioritas & periode aktif. Rule yang cocok **meng-override** diskon tier B2B
(hindari diskon berlapis).

```prisma
model B2BPricingRule {
  id          String          @id @default(uuid())
  name        String
  partnerId   String?
  tier        B2BPartnerTier?
  outletId    String?
  serviceId   String?
  machineType String?
  priceType   String          // DISCOUNT_PERCENT | FIXED_DISCOUNT | FIXED_PRICE
  value       Decimal         @db.Decimal(14, 2)
  startDate   DateTime?
  endDate     DateTime?
  priority    Int             @default(0) // tertinggi menang; lalu paling spesifik
  isActive    Boolean         @default(true)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  partner B2BPartner?          @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  outlet  Outlet?              @relation(fields: [outletId], references: [id], onDelete: Cascade)
  service Service?             @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  usages  B2BPricingRuleUsage[]

  @@index([partnerId])
  @@index([tier])
  @@index([outletId])
  @@index([serviceId])
  @@index([machineType])
  @@index([isActive])
  @@map("b2b_pricing_rules")
}

/// Attribution pemakaian special pricing B2B per order (report impact per rule/partner).
model B2BPricingRuleUsage {
  id             String   @id @default(uuid())
  orderId        String
  ruleId         String
  partnerId      String?
  discountAmount Decimal  @db.Decimal(14, 2)
  createdAt      DateTime @default(now())

  order   Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  rule    B2BPricingRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  partner B2BPartner?    @relation(fields: [partnerId], references: [id], onDelete: SetNull)

  @@unique([orderId, ruleId])
  @@index([ruleId])
  @@index([partnerId])
  @@index([createdAt])
  @@map("b2b_pricing_rule_usages")
}
```

---

## 7. Voucher: template, user voucher, redemption

Pemisahan **template (definisi)** vs **user voucher (instance milik 1 pemilik)** —
beda dengan `Promo` (kode publik). Voucher tidak bisa digabung (keputusan 5).

```prisma
model VoucherTemplate {
  id                 String          @id @default(uuid())
  code               String          @unique
  name               String
  description        String?
  bannerUrl          String?
  segment            UserSegment     @default(RETAIL)
  voucherType        VoucherType
  value              Decimal         @default(0) @db.Decimal(14, 2)
  maxDiscount        Decimal?        @db.Decimal(14, 2)
  minTransaction     Decimal?        @db.Decimal(14, 2)
  applicableServices String?         // CSV serviceId (konsisten PromoRule)
  applicableOutlets  String?         // CSV outletId
  tierRestriction    MembershipTier? // batasi ke tier retail tertentu
  b2bTierRestriction B2BPartnerTier? // batasi ke tier B2B tertentu
  validityDays       Int?            // masa berlaku sejak diterbitkan
  startDate          DateTime?
  endDate            DateTime?
  isStackable        Boolean         @default(false) // keputusan 5: selalu false
  quota              Int?
  issuedCount        Int             @default(0)
  perUserLimit       Int?            @default(1)
  pointCost          Int?            // bila ditukar dari poin
  isActive           Boolean         @default(true)
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  userVouchers    UserVoucher[]
  campaignRewards CampaignReward[]

  @@index([code])
  @@index([segment])
  @@index([isActive])
  @@map("voucher_templates")
}

model UserVoucher {
  id         String        @id @default(uuid())
  templateId String
  customerId String?
  partnerId  String?
  segment    UserSegment
  code       String        @unique // kode instance unik
  status     VoucherStatus @default(ACTIVE)
  sourceType String?       // 'CAMPAIGN' | 'REFERRAL' | 'BIRTHDAY' | 'MANUAL' | 'POINT_REDEMPTION' | ...
  sourceId   String?
  issuedAt   DateTime      @default(now())
  expiresAt  DateTime?
  usedAt     DateTime?
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  template   VoucherTemplate    @relation(fields: [templateId], references: [id])
  customer   Customer?          @relation(fields: [customerId], references: [id], onDelete: Cascade)
  partner    B2BPartner?        @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  redemption VoucherRedemption?

  @@index([templateId])
  @@index([customerId])
  @@index([partnerId])
  @@index([status])
  @@index([code])
  @@map("user_vouchers")
}

/// Audit pemakaian voucher (keputusan 9) + jalur pembalikan refund (keputusan 10).
/// orderId @unique → 1 voucher per transaksi (keputusan 5).
model VoucherRedemption {
  id              String    @id @default(uuid())
  userVoucherId   String    @unique
  orderId         String    @unique
  customerId      String?
  partnerId       String?
  discountApplied Decimal   @db.Decimal(14, 2)
  status          String    @default("APPLIED") // APPLIED | REVERSED (refund)
  redeemedAt      DateTime  @default(now())
  reversedAt      DateTime?

  userVoucher UserVoucher @relation(fields: [userVoucherId], references: [id], onDelete: Cascade)
  order       Order       @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([customerId])
  @@index([partnerId])
  @@map("voucher_redemptions")
}
```

> **Non-stackable ditegakkan dua lapis:** `VoucherRedemption.orderId @unique` (DB) +
> validasi di pricing service (tolak voucher+promo, atau >1 voucher). `Order` boleh punya
> `promoId` **atau** satu voucher (via `VoucherRedemption`) — prioritas di §9.

---

## 8. Campaign, referral & happy hour

`Campaign` adalah header; syarat & reward dipecah ke tabel anak `CampaignRule` /
`CampaignReward` (lebih fleksibel daripada satu kolom `config Json`). Penerbitan reward
diaudit di `CampaignIssuance` (idempoten), eksekusi terjadwal di `CampaignExecutionLog`.

```prisma
model Campaign {
  id          String       @id @default(uuid())
  type        CampaignType
  name        String
  description String?
  segment     UserSegment  @default(RETAIL)
  status      String       @default("DRAFT") // DRAFT | ACTIVE | PAUSED | ENDED
  startDate   DateTime?
  endDate     DateTime?
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  rules         CampaignRule[]
  rewards       CampaignReward[]
  issuances     CampaignIssuance[]
  referrals     Referral[]
  executionLogs CampaignExecutionLog[]

  @@index([type])
  @@index([status])
  @@map("campaigns")
}

/// Syarat kampanye sebagai pasangan key/value (mis. inactiveDays=30, minTopup=100000).
model CampaignRule {
  id         String   @id @default(uuid())
  campaignId String
  ruleKey    String
  ruleValue  String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([campaignId])
  @@map("campaign_rules")
}

/// Reward kampanye: voucher / poin / cashback, dengan target penerima.
model CampaignReward {
  id                String   @id @default(uuid())
  campaignId        String
  rewardType        String   // 'VOUCHER' | 'POINT' | 'CASHBACK'
  voucherTemplateId String?
  rewardPoints      Int?
  rewardCashback    Decimal? @db.Decimal(14, 2)
  targetParty       String   @default("SELF") // SELF | REFERRER | REFEREE
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  campaign        Campaign         @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  voucherTemplate VoucherTemplate? @relation(fields: [voucherTemplateId], references: [id], onDelete: SetNull)

  @@index([campaignId])
  @@map("campaign_rewards")
}

/// Audit penerbitan reward kampanye + idempotensi anti dobel-terbit
/// (mis. ulang tahun 1x/tahun via idempotencyKey).
model CampaignIssuance {
  id             String   @id @default(uuid())
  campaignId     String
  customerId     String?
  partnerId      String?
  userVoucherId  String?
  pointsAwarded  Int?
  idempotencyKey String   @unique
  issuedAt       DateTime @default(now())

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([campaignId])
  @@index([customerId])
  @@map("campaign_issuances")
}

/// Audit eksekusi kampanye terjadwal (per run scheduler).
model CampaignExecutionLog {
  id           String       @id @default(uuid())
  campaignId   String?
  campaignType CampaignType
  jobName      String // 'birthday' | 'anniversary' | 'long-time-no-see' | 'monthly-tier' | 'cashback-topup' | 'referral'
  runAt        DateTime     @default(now())
  scannedCount Int          @default(0)
  issuedCount  Int          @default(0)
  status       String       @default("SUCCESS") // SUCCESS | FAILED
  message      String?

  campaign Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)

  @@index([campaignId])
  @@index([campaignType])
  @@index([runAt])
  @@map("campaign_execution_logs")
}

/// Referral: kode milik referrer, ditautkan ke referee. Reward saat referee transaksi
/// pertama. refereeCustomerId unik → satu orang hanya bisa dirujuk sekali.
model Referral {
  id                 String         @id @default(uuid())
  campaignId         String?
  referrerCustomerId String
  refereeCustomerId  String?        @unique
  referralCode       String
  status             ReferralStatus @default(PENDING)
  qualifiedAt        DateTime?
  rewardedAt         DateTime?
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  campaign Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)

  @@index([referrerCustomerId])
  @@index([referralCode])
  @@map("referrals")
}
```

> Kode referral seorang customer = `Customer.memberCode`-nya (stabil & unik), sehingga
> `referralCode` di `Referral` **tidak** ber-`@unique`. Reward referral idempoten saat
> transaksi pertama referee.

**Happy hour** (mengubah harga mesin/layanan per hari & jam). Punya **quota** atomik &
opsi `allowVoucherStack`:

```prisma
model HappyHourRule {
  id                String    @id @default(uuid())
  name              String
  outletId          String?   // null = semua outlet
  serviceId         String?   // null = semua layanan
  machineType       String?   // alternatif filter
  daysOfWeek        String    // CSV "1,2,3" (1=Senin)
  startTime         String    // "18:00"
  endTime           String    // "21:00"
  timezone          String    @default("Asia/Jakarta")
  adjustmentType    String    // PERCENTAGE_OFF | FIXED_OFF | FIXED_PRICE
  value             Decimal   @db.Decimal(14, 2)
  quota             Int?      // null = unlimited
  usedQuota         Int       @default(0)
  allowVoucherStack Boolean   @default(true) // false → pricing tolak kombinasi voucher
  priority          Int       @default(0)    // rule cocok → ambil prioritas tertinggi
  startDate         DateTime?
  endDate           DateTime?
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

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

`PromoRule` lama (untuk `Promo` kode publik) tetap. Selain itu ada **`PromotionRule`**
(library rule promosi yang dapat dipakai ulang) dan **`PricingCalculationLog`** (audit
hasil pipeline harga). Belum ada tabel `LoyaltyConfig` global — rate/expiry poin di
service/konstanta.

```prisma
model PromotionRule {
  id                 String          @id @default(uuid())
  name               String
  segment            UserSegment?
  minTransaction     Decimal?        @db.Decimal(14, 2)
  maxDiscount        Decimal?        @db.Decimal(14, 2)
  applicableServices String?
  applicableOutlets  String?
  tierRestriction    MembershipTier?
  maxUsagePerUser    Int?
  isActive           Boolean         @default(true)
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  @@map("promotion_rules")
}

/// Log perhitungan harga (audit pricing pipeline) — dipakai report & debugging.
model PricingCalculationLog {
  id                  String       @id @default(uuid())
  orderId             String?
  customerId          String?
  partnerId           String?
  segment             UserSegment?
  subtotal            Decimal      @db.Decimal(14, 2)
  happyHourAdjustment Decimal      @default(0) @db.Decimal(14, 2)
  discountAmount      Decimal      @default(0) @db.Decimal(14, 2)
  discountSource      String?      // 'VOUCHER' | 'PROMO' | 'NONE'
  voucherId           String?
  promoId             String?
  totalAmount         Decimal      @db.Decimal(14, 2)
  pointsToEarn        Int          @default(0)
  cashbackToCredit    Decimal      @default(0) @db.Decimal(14, 2)
  breakdown           Json?
  createdAt           DateTime     @default(now())

  @@index([orderId])
  @@index([customerId])
  @@index([partnerId])
  @@map("pricing_calculation_logs")
}
```

**Pricing pipeline (deterministik) — `PricingService` (`modules/pricing`):**

```
1. Base price per item        ← ServicePrice (per outlet)
2. B2B pricing                 ← B2BPricingRule (override) ATAU discountRate tier B2B
3. Happy hour adjustment       ← HappyHourRule (prioritas tertinggi, cek quota & allowVoucherStack)
4. Satu diskon promosi:        ← MUTUALLY EXCLUSIVE (keputusan 5):
     a. Voucher (UserVoucher) ATAU
     b. Promo code (Promo)
   → eligibleSubtotal per applicableServices, lalu maxDiscount/minTransaction
5. totalAmount = subtotal − happyHour − discount + deliveryFee
6. Accrual (dihitung; dieksekusi saat PAID):
     - pointsToEarn   = f(eligibleSubtotal, tier.pointMultiplier)
     - cashbackToCredit = voucher/tier cashback → BONUS_BALANCE
```

> Output dipakai bersama oleh `/transactions/quote`, `/pricing/calculate`, dan
> `/transactions/checkout`, lalu di-audit ke `PricingCalculationLog`.

---

## 10. Integrasi transaksi

### 10.1 `Order` (extend)
`Order` **hanya** menambah `promoId` (`add_order_promo_id`) & `partnerId` (B2B). Tidak ada
kolom accrual; keterkaitan loyalty lewat relasi.

```prisma
// tambahan kolom Order:
promoId   String?  // promo code yang dipakai
partnerId String?  // order B2B (bayar dari deposit partner)

// relasi loyalty (balik):
promo                Promo?                @relation(...)
partner              B2BPartner?           @relation(...)
walletLedgers        WalletLedger[]
pointLedgers         PointLedger[]
voucherRedemption    VoucherRedemption?
b2bPricingRuleUsages B2BPricingRuleUsage[]
// (walletTransactions[] & promoUsages[] sudah ada sebelumnya)
```

### 10.2 Titik hook (mengikuti pola `commitUsage` yang sudah ada)
| Event | Aksi | Ledger |
|-------|------|--------|
| **Order create / quote** | Hitung harga via `PricingService` (B2B → happy hour → voucher/promo). Simpan `promoId`/`discountAmount`. Voucher belum USED. Log ke `PricingCalculationLog`. | — |
| **Payment success (PAID)** — `TransactionService.checkout` (wallet) & `payments.settlePaid` (gateway/QRIS) | (a) debit BONUS lalu MAIN (`WalletLedger`); (b) `voucherService.redeem` → status USED + `VoucherRedemption`; (c) `promos.commitUsage` (sudah ada); (d) `pointService.earn` → `PointLedger` (`point-earn-<orderId>`); (e) cashback tier → `bonusBalance` + `WalletLedger` (`cashback-tier-<orderId>`); (f) `membershipTier.recordSuccessfulTransaction`; (g) `qualifyReferralOnFirstTransaction`; (h) `B2BPricingRuleUsage` bila ada special pricing | WalletLedger, PointLedger, VoucherRedemption, CampaignIssuance |
| **Refund** (`TransactionService.refund`) | Balikkan semua (keputusan 10): refund MAIN/BONUS per bucket dari ledger (`WalletLedger` arah berlawanan), `PointLedger` reversal (`REFUND_REVERSAL`), `VoucherRedemption.status=REVERSED` + `UserVoucher` ACTIVE kembali bila belum kedaluwarsa, `membershipTier.reverseTransaction` | semua ledger terkait |

> Pembayaran B2B: checkout menerima owner = partner; potong `balance` (deposit). Top up
> B2B & retail tetap `WalletTransaction TOPUP` + `WalletLedger(MAIN, CREDIT)` (liability, §11).
> Idempotensi tiap commit via `idempotencyKey` (`point-earn-<orderId>`, `cashback-tier-<orderId>`, dst).

---

## 11. Reporting & revenue recognition

**Revenue recognition (keputusan 7):** top up **bukan** revenue. Implikasi report:
- **Top up** (`mainBalance`/`WalletLedger(MAIN, CREDIT)`) = **liability** (deferred revenue),
  bukan pendapatan.
- **Revenue** diakui saat **konsumsi**: order `PAID` (`PAID_STATUSES` di `reports.service.ts`).
- **Bonus balance** terpakai = potongan biaya marketing, bukan revenue baru.
- **Point/bonus** = liability non-tunai (keputusan 8), dilaporkan terpisah.

**Endpoint report** (`GET /reports/promotion-loyalty?month=YYYY-MM` + report operasional):
| Report | Sumber |
|--------|--------|
| Voucher funnel (issued → used → expired) | `UserVoucher`, `VoucherRedemption` |
| Bonus balance & point liability | `Wallet`, `WalletLedger`, `PointLedger` |
| B2B volume & pricing impact per rule | `Order(partnerId)`, `B2BPricingRuleUsage` |
| Promo revenue impact / promo-driven revenue | `Order` (paid, ber-discount/promo/voucher) |
| Campaign logs | `CampaignExecutionLog` |

> **Hati-hati double-count:** ada dua tabel ledger uang (`wallet_transactions` legacy &
> `wallet_ledgers`). Pastikan tiap metrik report bersumber dari **satu** tabel. Semua angka
> uang lewat `toNum` di boundary (pola `reports.service.ts`).

---

## 12. Status migrasi

Engine ini **sudah ter-migrate** (urut). Migrasi terkait promo/loyalty:

| Migration | Isi |
|-----------|-----|
| `20260616045212_add_order_promo_id` | `Order.promoId` + relasi `Promo` |
| `20260616123608_add_promotion_loyalty_engine` | Inti: `WalletLedger`, `PointLedger`, voucher (template/user/redemption), tier config (retail/B2B), `UserMembershipStatus`, `B2BPartner`, `Campaign`(+rules/rewards/issuances), `Referral`, `HappyHourRule`, `PromotionRule`, `PricingCalculationLog`, kolom wallet (`bonusBalance`/`pointBalance`/`partnerId`), `Order.partnerId` |
| `20260616124448_add_campaign_issuances` | `CampaignIssuance` (idempotensi reward) |
| `20260616125347_add_b2b_discount_rate` | `discountRate` di `B2BPartnerTierConfig` |
| `20260616130709_add_campaign_automation` | `CampaignExecutionLog` + automation scheduler |
| `20260616143000_add_b2b_pricing_rules` | `B2BPricingRule` (special pricing) |
| `20260617093000_add_b2b_pricing_rule_usages` | `B2BPricingRuleUsage` (attribution) |
| `20260617103000_add_happy_hour_quota` | `quota`/`usedQuota`/`allowVoucherStack` di `HappyHourRule` |

> Seed dummy diperbarui di `prisma/seed.ts`; seed & smoke khusus promo-loyalty di
> `scripts/seed-promo-loyalty-smoke.ts` & `scripts/smoke-promo-loyalty.ts`
> (lihat [testing-promo-loyalty.md](./testing-promo-loyalty.md)).
>
> **Belum diimplementasikan vs draft awal:** model `MembershipHistory` (audit naik/turun
> tier) dan tabel `LoyaltyConfig` global. Bila diperlukan, tambahkan sebagai migrasi baru
> terpisah.
