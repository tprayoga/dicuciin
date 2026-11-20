-- Batch 4: top-up saldo Midtrans, bukti PIN sekali pakai (terikat sesi), rekonsiliasi top-up.
-- Aditif: tabel & kolom baru; payment_reconciliations.orderId menjadi nullable.
-- CreateEnum
CREATE TYPE "TopupStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "payment_reconciliations" ADD COLUMN     "topupId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "wallet_topups" (
    "id" TEXT NOT NULL,
    "topupNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "adminFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "chargeAmount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "bank" TEXT,
    "status" "TopupStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "externalId" TEXT,
    "externalResponse" JSONB,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "pendingSlot" TEXT,
    "ledgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_topups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_pin_proofs" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_pin_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_topups_topupNumber_key" ON "wallet_topups"("topupNumber");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_topups_pendingSlot_key" ON "wallet_topups"("pendingSlot");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_topups_ledgerId_key" ON "wallet_topups"("ledgerId");

-- CreateIndex
CREATE INDEX "wallet_topups_customerId_createdAt_idx" ON "wallet_topups"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_topups_status_idx" ON "wallet_topups"("status");

-- CreateIndex
CREATE INDEX "wallet_pin_proofs_customerId_sessionHash_idx" ON "wallet_pin_proofs"("customerId", "sessionHash");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reconciliations_topupId_reason_key" ON "payment_reconciliations"("topupId", "reason");

-- AddForeignKey
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_topupId_fkey" FOREIGN KEY ("topupId") REFERENCES "wallet_topups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_topups" ADD CONSTRAINT "wallet_topups_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_topups" ADD CONSTRAINT "wallet_topups_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_topups" ADD CONSTRAINT "wallet_topups_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "wallet_ledgers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_pin_proofs" ADD CONSTRAINT "wallet_pin_proofs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

