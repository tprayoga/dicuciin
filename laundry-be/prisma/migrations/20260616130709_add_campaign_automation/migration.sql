-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "referrerCustomerId" TEXT NOT NULL,
    "refereeCustomerId" TEXT,
    "referralCode" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "qualifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_execution_logs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignType" "CampaignType" NOT NULL,
    "jobName" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedCount" INTEGER NOT NULL DEFAULT 0,
    "issuedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "message" TEXT,

    CONSTRAINT "campaign_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referrals_refereeCustomerId_key" ON "referrals"("refereeCustomerId");

-- CreateIndex
CREATE INDEX "referrals_referrerCustomerId_idx" ON "referrals"("referrerCustomerId");

-- CreateIndex
CREATE INDEX "referrals_referralCode_idx" ON "referrals"("referralCode");

-- CreateIndex
CREATE INDEX "campaign_execution_logs_campaignId_idx" ON "campaign_execution_logs"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_execution_logs_campaignType_idx" ON "campaign_execution_logs"("campaignType");

-- CreateIndex
CREATE INDEX "campaign_execution_logs_runAt_idx" ON "campaign_execution_logs"("runAt");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_execution_logs" ADD CONSTRAINT "campaign_execution_logs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

