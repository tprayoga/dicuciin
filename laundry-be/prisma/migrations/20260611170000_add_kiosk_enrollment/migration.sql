ALTER TABLE "kiosks"
ADD COLUMN "enrollmentCodeHash" TEXT,
ADD COLUMN "enrollmentCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN "deviceTokenHash" TEXT,
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "enrolledAt" TIMESTAMP(3),
ADD COLUMN "tokenRevokedAt" TIMESTAMP(3),
ADD COLUMN "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "scheduleDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
ADD COLUMN "scheduleOpenTime" TEXT,
ADD COLUMN "scheduleCloseTime" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta';

CREATE UNIQUE INDEX "kiosks_deviceTokenHash_key" ON "kiosks"("deviceTokenHash");
