-- CreateTable
CREATE TABLE "b2b_pricing_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partnerId" TEXT,
    "tier" "B2BPartnerTier",
    "outletId" TEXT,
    "serviceId" TEXT,
    "machineType" TEXT,
    "priceType" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "b2b_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "b2b_pricing_rules_partnerId_idx" ON "b2b_pricing_rules"("partnerId");

-- CreateIndex
CREATE INDEX "b2b_pricing_rules_tier_idx" ON "b2b_pricing_rules"("tier");

-- CreateIndex
CREATE INDEX "b2b_pricing_rules_outletId_idx" ON "b2b_pricing_rules"("outletId");

-- CreateIndex
CREATE INDEX "b2b_pricing_rules_serviceId_idx" ON "b2b_pricing_rules"("serviceId");

-- CreateIndex
CREATE INDEX "b2b_pricing_rules_machineType_idx" ON "b2b_pricing_rules"("machineType");

-- CreateIndex
CREATE INDEX "b2b_pricing_rules_isActive_idx" ON "b2b_pricing_rules"("isActive");

-- AddForeignKey
ALTER TABLE "b2b_pricing_rules" ADD CONSTRAINT "b2b_pricing_rules_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "b2b_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_pricing_rules" ADD CONSTRAINT "b2b_pricing_rules_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_pricing_rules" ADD CONSTRAINT "b2b_pricing_rules_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
