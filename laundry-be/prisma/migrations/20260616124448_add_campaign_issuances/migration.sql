-- CreateTable
CREATE TABLE "campaign_issuances" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT,
    "partnerId" TEXT,
    "userVoucherId" TEXT,
    "pointsAwarded" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_issuances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_issuances_idempotencyKey_key" ON "campaign_issuances"("idempotencyKey");

-- CreateIndex
CREATE INDEX "campaign_issuances_campaignId_idx" ON "campaign_issuances"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_issuances_customerId_idx" ON "campaign_issuances"("customerId");

-- AddForeignKey
ALTER TABLE "campaign_issuances" ADD CONSTRAINT "campaign_issuances_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

