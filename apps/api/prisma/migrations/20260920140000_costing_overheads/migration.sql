-- CreateEnum
CREATE TYPE "OverheadBasis" AS ENUM ('PER_KG', 'PER_JOB', 'PER_POUCH', 'PER_DAY', 'PERCENT_MATERIAL', 'PERCENT_TOTAL');
-- CreateTable
CREATE TABLE "costing_overheads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basis" "OverheadBasis" NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "costing_overheads_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "costing_overheads_effective_from_idx" ON "costing_overheads"("effective_from");
-- CreateIndex
CREATE INDEX "costing_overheads_effective_to_idx" ON "costing_overheads"("effective_to");
