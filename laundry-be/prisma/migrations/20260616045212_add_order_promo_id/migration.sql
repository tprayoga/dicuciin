-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "promoId" TEXT;

-- CreateIndex
CREATE INDEX "orders_promoId_idx" ON "orders"("promoId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "promos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
