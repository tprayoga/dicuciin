-- AlterTable
ALTER TABLE "app_banners" ADD COLUMN     "promoId" TEXT;

-- AddForeignKey
ALTER TABLE "app_banners" ADD CONSTRAINT "app_banners_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "promos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
