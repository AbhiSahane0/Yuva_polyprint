-- CreateEnum
CREATE TYPE "PricingBasis" AS ENUM ('PER_KG', 'PER_POUCH');

-- AlterTable
ALTER TABLE "quotation_items" ADD COLUMN     "pricing_basis" "PricingBasis" NOT NULL DEFAULT 'PER_KG',
ADD COLUMN     "quantity_pouches" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rate_per_pouch" DECIMAL(12,4) NOT NULL DEFAULT 0;
