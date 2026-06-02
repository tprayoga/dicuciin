-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HOME_POPUP', 'HOME_CAROUSEL');

-- CreateTable
CREATE TABLE "app_banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "ctaLabel" TEXT,
    "placement" "BannerPlacement" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_banners_placement_isActive_idx" ON "app_banners"("placement", "isActive");
