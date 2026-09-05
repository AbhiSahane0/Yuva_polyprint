-- Stock: what the works holds, and every change to it.
--
-- Batch level, not roll level: how much of a material is there, what is it
-- worth, and is it running out are the questions the office asks, and all three
-- are answered per batch. Roll numbers become worth keying in when a production
-- module exists to consume them.
--
-- The movement table is the ledger and the source of truth. `stock_batches.
-- quantity` is a cache of it, written in the same transaction, so the two
-- cannot drift. Movements are never updated or deleted — the running balance on
-- every later row would be wrong — and a mistake is corrected by an ADJUSTMENT
-- that leaves both the error and the correction on the record.
--
-- Safe to apply ahead of the code that uses it: every object here is new, and
-- the one added column is nullable.

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('RECEIPT', 'ISSUE', 'WASTE', 'ADJUSTMENT', 'TRANSFER');

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "reorder_level" DECIMAL(14,3);

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_code" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'NA',
    "received_on" DATE NOT NULL,
    "initial_quantity" DECIMAL(14,3) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "rate_per_unit" DECIMAL(12,4),
    "reference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balance_after" DECIMAL(14,3) NOT NULL,
    "job_id" TEXT,
    "from_location" TEXT NOT NULL DEFAULT '',
    "to_location" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "entered_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_batches_material_id_received_on_idx" ON "stock_batches"("material_id", "received_on");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_material_id_batch_code_key" ON "stock_batches"("material_id", "batch_code");

-- CreateIndex
CREATE INDEX "stock_movements_material_id_created_at_idx" ON "stock_movements"("material_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_batch_id_created_at_idx" ON "stock_movements"("batch_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_job_id_idx" ON "stock_movements"("job_id");

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

