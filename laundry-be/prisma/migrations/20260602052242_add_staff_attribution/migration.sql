-- AlterTable
ALTER TABLE "kiosk_sessions" ADD COLUMN     "staffUserId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "staffUserId" TEXT;

-- CreateIndex
CREATE INDEX "kiosk_sessions_staffUserId_idx" ON "kiosk_sessions"("staffUserId");

-- CreateIndex
CREATE INDEX "orders_staffUserId_idx" ON "orders"("staffUserId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_sessions" ADD CONSTRAINT "kiosk_sessions_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
