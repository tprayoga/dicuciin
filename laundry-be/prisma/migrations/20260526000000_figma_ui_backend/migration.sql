-- AlterTable
ALTER TABLE "outlets"
ADD COLUMN "openTime" TEXT,
ADD COLUMN "closeTime" TEXT,
ADD COLUMN "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "outlet_users"
ADD COLUMN "shiftName" TEXT;

-- AlterTable
ALTER TABLE "services"
ADD COLUMN "machineType" TEXT,
ADD COLUMN "capacityKg" DOUBLE PRECISION,
ADD COLUMN "estimateMinutes" INTEGER,
ADD COLUMN "basePrice" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "promos"
ADD COLUMN "bannerUrl" TEXT;
