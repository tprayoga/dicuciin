-- Batch 2: siklus hidup pembayaran + rekonsiliasi keuangan.
-- Aditif. Backfill hanya mengisi kolom baru; tidak ada baris yang dihapus.

-- CreateEnum
CREATE TYPE "ReconciliationReason" AS ENUM ('DUPLICATE_PAYMENT', 'PAID_AFTER_CANCEL', 'PAID_BOOKING_UNAVAILABLE', 'PAID_NOT_USED', 'CUSTOMER_REQUEST');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('WALLET_CREDIT', 'EXTERNAL');


-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paidPaymentId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "pendingSlot" TEXT,
ADD COLUMN     "provider" TEXT;

-- CreateTable
CREATE TABLE "payment_reconciliations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "refundAmount" DECIMAL(14,2) NOT NULL,
    "provider" TEXT,
    "providerRef" TEXT,
    "reason" "ReconciliationReason" NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "requestedBy" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "refundMethod" "RefundMethod",
    "executedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "executionRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_reconciliations_status_idx" ON "payment_reconciliations"("status");

-- CreateIndex
CREATE INDEX "payment_reconciliations_orderId_idx" ON "payment_reconciliations"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reconciliations_paymentId_reason_key" ON "payment_reconciliations"("paymentId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "orders_paidPaymentId_key" ON "orders"("paidPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_pendingSlot_key" ON "payments"("pendingSlot");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_paidPaymentId_fkey" FOREIGN KEY ("paidPaymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Backfill ─────────────────────────────────────────────────────────────
-- Kedaluwarsa & provider dari respons gateway lama (ISO UTC).
UPDATE "payments"
SET "expiresAt" = (("externalResponse"->>'expiresAt')::timestamptz AT TIME ZONE 'UTC')
WHERE "expiresAt" IS NULL
  AND "externalResponse" IS NOT NULL
  AND ("externalResponse"->>'expiresAt') IS NOT NULL;

UPDATE "payments"
SET "provider" = "externalResponse"->>'provider'
WHERE "provider" IS NULL AND "externalResponse" IS NOT NULL;

-- Satu slot aktif per order: hanya percobaan PENDING terbaru yang memegangnya.
UPDATE "payments" p
SET "pendingSlot" = p."orderId"
WHERE p.status = 'PENDING'
  AND p.id = (
    SELECT q.id FROM "payments" q
    WHERE q."orderId" = p."orderId" AND q.status = 'PENDING'
    ORDER BY q."createdAt" DESC, q.id DESC
    LIMIT 1
  );

-- Pembayaran yang melunasi order lama = pembayaran lunas PERTAMA.
UPDATE "orders" o
SET "paidPaymentId" = (
  SELECT p.id FROM "payments" p
  WHERE p."orderId" = o.id AND p.status IN ('PAID', 'REFUNDED')
  ORDER BY p."paidAt" ASC NULLS LAST, p."createdAt" ASC
  LIMIT 1
)
WHERE o."paidPaymentId" IS NULL
  AND o.status NOT IN ('DRAFT', 'WAITING_PAYMENT', 'CANCELLED');

-- ── Invarian keuangan di level database ─────────────────────────────────
-- (1) Order CANCELLED/REFUNDED tidak pernah hidup lagi (mis. jadi PAID).
-- (2) paidPaymentId harus pembayaran milik order itu sendiri.
CREATE OR REPLACE FUNCTION orders_financial_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('CANCELLED', 'REFUNDED')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('CANCELLED', 'REFUNDED') THEN
    RAISE EXCEPTION 'Order % berstatus % tidak boleh berubah menjadi %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."paidPaymentId" IS NOT NULL
     AND NEW."paidPaymentId" IS DISTINCT FROM OLD."paidPaymentId"
     AND NOT EXISTS (
       SELECT 1 FROM "payments" p WHERE p.id = NEW."paidPaymentId" AND p."orderId" = NEW.id
     ) THEN
    RAISE EXCEPTION 'paidPaymentId % bukan pembayaran order %', NEW."paidPaymentId", NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_financial_guard ON "orders";
CREATE TRIGGER orders_financial_guard
  BEFORE UPDATE OF status, "paidPaymentId" ON "orders"
  FOR EACH ROW EXECUTE FUNCTION orders_financial_guard();
