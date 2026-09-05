-- Buying, and the join to holding.
--
-- A purchase order has lines; a line has receipts; a receipt's accepted quantity
-- opens a stock batch through the same path a manual receipt uses, so there is
-- one way stock comes into existence and one ledger recording it.
--
-- Rejected material is recorded on the receipt and never reaches stock. Faulty
-- goods are not inventory.
--
-- Two things are deliberately absent. Suppliers do not store what they supply or
-- what they last charged — both are answered by the orders placed with them, and
-- a second copy is a list nobody maintains. And there is no DELAYED status: that
-- is a fact about today's date against the expected one, computed on read rather
-- than stored, because a stored flag needs a nightly job and is wrong in between.
--
-- Every object here is new, so this is safe to apply ahead of the deploy.

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('ORDERED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT NOT NULL DEFAULT 'NA',
    "mobile" TEXT NOT NULL DEFAULT 'NA',
    "email" TEXT NOT NULL DEFAULT 'NA',
    "address" TEXT NOT NULL DEFAULT 'NA',
    "gst_number" TEXT NOT NULL DEFAULT 'NA',
    "notes" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "ordered_on" DATE NOT NULL,
    "expected_on" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "raised_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "rate_per_unit" DECIMAL(12,4) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "received_on" DATE NOT NULL,
    "accepted_quantity" DECIMAL(14,3) NOT NULL,
    "rejected_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "rejection_reason" TEXT NOT NULL DEFAULT '',
    "batch_id" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "entered_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "suppliers_is_active_name_idx" ON "suppliers"("is_active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_status_ordered_on_idx" ON "purchase_orders"("status", "ordered_on");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_order_lines_material_id_idx" ON "purchase_order_lines"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_order_id_position_key" ON "purchase_order_lines"("order_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_batch_id_key" ON "purchase_receipts"("batch_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_order_id_received_on_idx" ON "purchase_receipts"("order_id", "received_on");

-- CreateIndex
CREATE INDEX "purchase_receipts_line_id_idx" ON "purchase_receipts"("line_id");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "purchase_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

