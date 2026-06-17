-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('MAIN_BALANCE', 'BONUS_BALANCE', 'POINT_BALANCE');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "UserSegment" AS ENUM ('RETAIL', 'B2B');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('FREE_WASH', 'FREE_DRY', 'FREE_WASH_DRY', 'NOMINAL_DISCOUNT', 'PERCENTAGE_DISCOUNT', 'LOTTERY_TICKET', 'TIER_EXCLUSIVE', 'B2B_EXCLUSIVE');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');

-- CreateEnum
CREATE TYPE "B2BPartnerTier" AS ENUM ('BUSINESS_PARTNER', 'GOLD_PARTNER', 'PLATINUM_PARTNER', 'DIAMOND_PARTNER');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('CASHBACK_TOPUP', 'LONG_TIME_NO_SEE', 'REFERRAL', 'BIRTHDAY_REWARD', 'ANNIVERSARY_REWARD', 'MONTHLY_TIER_BENEFIT');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "partnerId" TEXT;

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "bonusBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "partnerId" TEXT,
ADD COLUMN     "pointBalance" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "customerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "wallet_ledgers" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "orderId" TEXT,
    "walletType" "WalletType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceBefore" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_ledgers" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "orderId" TEXT,
    "direction" "LedgerDirection" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "description" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bannerUrl" TEXT,
    "segment" "UserSegment" NOT NULL DEFAULT 'RETAIL',
    "voucherType" "VoucherType" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maxDiscount" DECIMAL(14,2),
    "minTransaction" DECIMAL(14,2),
    "applicableServices" TEXT,
    "applicableOutlets" TEXT,
    "tierRestriction" "MembershipTier",
    "b2bTierRestriction" "B2BPartnerTier",
    "validityDays" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isStackable" BOOLEAN NOT NULL DEFAULT false,
    "quota" INTEGER,
    "issuedCount" INTEGER NOT NULL DEFAULT 0,
    "perUserLimit" INTEGER DEFAULT 1,
    "pointCost" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vouchers" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "customerId" TEXT,
    "partnerId" TEXT,
    "segment" "UserSegment" NOT NULL,
    "code" TEXT NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_redemptions" (
    "id" TEXT NOT NULL,
    "userVoucherId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "partnerId" TEXT,
    "discountApplied" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "voucher_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tiers" (
    "id" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "thresholdSpending" DECIMAL(14,2),
    "thresholdTxnCount" INTEGER,
    "pointMultiplier" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "cashbackRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "benefitDescription" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_partner_tiers" (
    "id" TEXT NOT NULL,
    "tier" "B2BPartnerTier" NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "thresholdSpending" DECIMAL(14,2),
    "thresholdTxnCount" INTEGER,
    "pointMultiplier" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "cashbackRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "benefitDescription" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "b2b_partner_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_membership_status" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "partnerId" TEXT,
    "segment" "UserSegment" NOT NULL,
    "currentTier" "MembershipTier",
    "currentB2BTier" "B2BPartnerTier",
    "earnedSpending" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "successfulTxnCount" INTEGER NOT NULL DEFAULT 0,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_membership_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_partners" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "partnerCode" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "picName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "tier" "B2BPartnerTier" NOT NULL DEFAULT 'BUSINESS_PARTNER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "b2b_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "segment" "UserSegment" NOT NULL DEFAULT 'RETAIL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_rules" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "ruleValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_rewards" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "voucherTemplateId" TEXT,
    "rewardPoints" INTEGER,
    "rewardCashback" DECIMAL(14,2),
    "targetParty" TEXT NOT NULL DEFAULT 'SELF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "happy_hour_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outletId" TEXT,
    "serviceId" TEXT,
    "machineType" TEXT,
    "daysOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "adjustmentType" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "happy_hour_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" "UserSegment",
    "minTransaction" DECIMAL(14,2),
    "maxDiscount" DECIMAL(14,2),
    "applicableServices" TEXT,
    "applicableOutlets" TEXT,
    "tierRestriction" "MembershipTier",
    "maxUsagePerUser" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_calculation_logs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "customerId" TEXT,
    "partnerId" TEXT,
    "segment" "UserSegment",
    "subtotal" DECIMAL(14,2) NOT NULL,
    "happyHourAdjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountSource" TEXT,
    "voucherId" TEXT,
    "promoId" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "pointsToEarn" INTEGER NOT NULL DEFAULT 0,
    "cashbackToCredit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_calculation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledgers_idempotencyKey_key" ON "wallet_ledgers"("idempotencyKey");

-- CreateIndex
CREATE INDEX "wallet_ledgers_walletId_idx" ON "wallet_ledgers"("walletId");

-- CreateIndex
CREATE INDEX "wallet_ledgers_walletType_idx" ON "wallet_ledgers"("walletType");

-- CreateIndex
CREATE INDEX "wallet_ledgers_orderId_idx" ON "wallet_ledgers"("orderId");

-- CreateIndex
CREATE INDEX "wallet_ledgers_referenceType_referenceId_idx" ON "wallet_ledgers"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "wallet_ledgers_idempotencyKey_idx" ON "wallet_ledgers"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "point_ledgers_idempotencyKey_key" ON "point_ledgers"("idempotencyKey");

-- CreateIndex
CREATE INDEX "point_ledgers_walletId_idx" ON "point_ledgers"("walletId");

-- CreateIndex
CREATE INDEX "point_ledgers_orderId_idx" ON "point_ledgers"("orderId");

-- CreateIndex
CREATE INDEX "point_ledgers_direction_idx" ON "point_ledgers"("direction");

-- CreateIndex
CREATE INDEX "point_ledgers_expiresAt_idx" ON "point_ledgers"("expiresAt");

-- CreateIndex
CREATE INDEX "point_ledgers_idempotencyKey_idx" ON "point_ledgers"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_templates_code_key" ON "voucher_templates"("code");

-- CreateIndex
CREATE INDEX "voucher_templates_code_idx" ON "voucher_templates"("code");

-- CreateIndex
CREATE INDEX "voucher_templates_segment_idx" ON "voucher_templates"("segment");

-- CreateIndex
CREATE INDEX "voucher_templates_isActive_idx" ON "voucher_templates"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "user_vouchers_code_key" ON "user_vouchers"("code");

-- CreateIndex
CREATE INDEX "user_vouchers_templateId_idx" ON "user_vouchers"("templateId");

-- CreateIndex
CREATE INDEX "user_vouchers_customerId_idx" ON "user_vouchers"("customerId");

-- CreateIndex
CREATE INDEX "user_vouchers_partnerId_idx" ON "user_vouchers"("partnerId");

-- CreateIndex
CREATE INDEX "user_vouchers_status_idx" ON "user_vouchers"("status");

-- CreateIndex
CREATE INDEX "user_vouchers_code_idx" ON "user_vouchers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_redemptions_userVoucherId_key" ON "voucher_redemptions"("userVoucherId");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_redemptions_orderId_key" ON "voucher_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "voucher_redemptions_customerId_idx" ON "voucher_redemptions"("customerId");

-- CreateIndex
CREATE INDEX "voucher_redemptions_partnerId_idx" ON "voucher_redemptions"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tiers_tier_key" ON "membership_tiers"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tiers_level_key" ON "membership_tiers"("level");

-- CreateIndex
CREATE UNIQUE INDEX "b2b_partner_tiers_tier_key" ON "b2b_partner_tiers"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "b2b_partner_tiers_level_key" ON "b2b_partner_tiers"("level");

-- CreateIndex
CREATE UNIQUE INDEX "user_membership_status_customerId_key" ON "user_membership_status"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "user_membership_status_partnerId_key" ON "user_membership_status"("partnerId");

-- CreateIndex
CREATE INDEX "user_membership_status_segment_idx" ON "user_membership_status"("segment");

-- CreateIndex
CREATE UNIQUE INDEX "b2b_partners_userId_key" ON "b2b_partners"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "b2b_partners_partnerCode_key" ON "b2b_partners"("partnerCode");

-- CreateIndex
CREATE INDEX "b2b_partners_partnerCode_idx" ON "b2b_partners"("partnerCode");

-- CreateIndex
CREATE INDEX "campaigns_type_idx" ON "campaigns"("type");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaign_rules_campaignId_idx" ON "campaign_rules"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_rewards_campaignId_idx" ON "campaign_rewards"("campaignId");

-- CreateIndex
CREATE INDEX "happy_hour_rules_outletId_idx" ON "happy_hour_rules"("outletId");

-- CreateIndex
CREATE INDEX "happy_hour_rules_serviceId_idx" ON "happy_hour_rules"("serviceId");

-- CreateIndex
CREATE INDEX "happy_hour_rules_isActive_idx" ON "happy_hour_rules"("isActive");

-- CreateIndex
CREATE INDEX "pricing_calculation_logs_orderId_idx" ON "pricing_calculation_logs"("orderId");

-- CreateIndex
CREATE INDEX "pricing_calculation_logs_customerId_idx" ON "pricing_calculation_logs"("customerId");

-- CreateIndex
CREATE INDEX "pricing_calculation_logs_partnerId_idx" ON "pricing_calculation_logs"("partnerId");

-- CreateIndex
CREATE INDEX "orders_partnerId_idx" ON "orders"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_partnerId_key" ON "wallets"("partnerId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "b2b_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "b2b_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledgers" ADD CONSTRAINT "wallet_ledgers_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledgers" ADD CONSTRAINT "wallet_ledgers_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_ledgers" ADD CONSTRAINT "point_ledgers_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_ledgers" ADD CONSTRAINT "point_ledgers_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "voucher_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "b2b_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_userVoucherId_fkey" FOREIGN KEY ("userVoucherId") REFERENCES "user_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_membership_status" ADD CONSTRAINT "user_membership_status_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_membership_status" ADD CONSTRAINT "user_membership_status_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "b2b_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_partners" ADD CONSTRAINT "b2b_partners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_rules" ADD CONSTRAINT "campaign_rules_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_rewards" ADD CONSTRAINT "campaign_rewards_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_rewards" ADD CONSTRAINT "campaign_rewards_voucherTemplateId_fkey" FOREIGN KEY ("voucherTemplateId") REFERENCES "voucher_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "happy_hour_rules" ADD CONSTRAINT "happy_hour_rules_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "happy_hour_rules" ADD CONSTRAINT "happy_hour_rules_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

