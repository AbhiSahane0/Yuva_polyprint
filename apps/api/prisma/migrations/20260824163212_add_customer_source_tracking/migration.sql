-- CreateEnum
CREATE TYPE "CustomerSource" AS ENUM ('SHEET', 'BRAND_INFERRED');

-- CreateEnum
CREATE TYPE "JobCustomerSource" AS ENUM ('EXPLICIT', 'INFERRED', 'NONE');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "source" "CustomerSource" NOT NULL DEFAULT 'SHEET';

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "customer_source" "JobCustomerSource" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "needs_customer" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "jobs_needs_customer_idx" ON "jobs"("needs_customer");
