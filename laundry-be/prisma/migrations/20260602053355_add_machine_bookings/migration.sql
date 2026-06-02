-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('RESERVED', 'IN_USE', 'DONE', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "machine_bookings" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "bookingCode" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machine_bookings_orderId_key" ON "machine_bookings"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "machine_bookings_bookingCode_key" ON "machine_bookings"("bookingCode");

-- CreateIndex
CREATE INDEX "machine_bookings_deviceId_status_idx" ON "machine_bookings"("deviceId", "status");

-- CreateIndex
CREATE INDEX "machine_bookings_customerId_idx" ON "machine_bookings"("customerId");

-- CreateIndex
CREATE INDEX "machine_bookings_bookingCode_idx" ON "machine_bookings"("bookingCode");

-- AddForeignKey
ALTER TABLE "machine_bookings" ADD CONSTRAINT "machine_bookings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "iot_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_bookings" ADD CONSTRAINT "machine_bookings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
