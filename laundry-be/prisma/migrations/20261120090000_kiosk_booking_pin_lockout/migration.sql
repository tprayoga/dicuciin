-- Batch 1.5: booking tamu kiosk (tanpa customer) + penguncian PIN wallet.
-- Aditif & aman untuk data lama: hanya melonggarkan NOT NULL dan menambah kolom ber-default.
ALTER TABLE "machine_bookings" ALTER COLUMN "customerId" DROP NOT NULL;

ALTER TABLE "customers" ADD COLUMN "walletPinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "walletPinLockedUntil" TIMESTAMP(3);
