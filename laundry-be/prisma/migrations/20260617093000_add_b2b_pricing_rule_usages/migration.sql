-- CreateTable
CREATE TABLE "b2b_pricing_rule_usages" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "partnerId" TEXT,
    "discountAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b2b_pricing_rule_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "b2b_pricing_rule_usages_orderId_ruleId_key" ON "b2b_pricing_rule_usages"("orderId", "ruleId");

-- CreateIndex
CREATE INDEX "b2b_pricing_rule_usages_ruleId_idx" ON "b2b_pricing_rule_usages"("ruleId");

-- CreateIndex
CREATE INDEX "b2b_pricing_rule_usages_partnerId_idx" ON "b2b_pricing_rule_usages"("partnerId");

-- CreateIndex
CREATE INDEX "b2b_pricing_rule_usages_createdAt_idx" ON "b2b_pricing_rule_usages"("createdAt");

-- AddForeignKey
ALTER TABLE "b2b_pricing_rule_usages" ADD CONSTRAINT "b2b_pricing_rule_usages_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_pricing_rule_usages" ADD CONSTRAINT "b2b_pricing_rule_usages_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "b2b_pricing_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_pricing_rule_usages" ADD CONSTRAINT "b2b_pricing_rule_usages_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "b2b_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
