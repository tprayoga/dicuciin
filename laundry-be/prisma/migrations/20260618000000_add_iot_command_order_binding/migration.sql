-- AlterTable (aditif, nullable — aman untuk data existing)
ALTER TABLE "iot_commands" ADD COLUMN "orderId" TEXT;
ALTER TABLE "iot_commands" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "iot_commands_idempotencyKey_key" ON "iot_commands"("idempotencyKey");

-- CreateIndex
CREATE INDEX "iot_commands_orderId_idx" ON "iot_commands"("orderId");

-- AddForeignKey
ALTER TABLE "iot_commands" ADD CONSTRAINT "iot_commands_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
