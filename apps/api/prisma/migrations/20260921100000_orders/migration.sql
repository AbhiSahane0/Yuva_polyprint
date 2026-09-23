-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED');
-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "customer_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "job_id" TEXT,
    "job_name" TEXT NOT NULL,
    "quotation_id" TEXT,
    "quotation_item_id" TEXT,
    "quantity_kg" DECIMAL(12,3) NOT NULL,
    "rate_per_kg" DECIMAL(12,2) NOT NULL,
    "quantity_pouches" INTEGER NOT NULL DEFAULT 0,
    "rate_per_pouch" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL,
    "customer_po_number" TEXT NOT NULL DEFAULT '',
    "order_date" DATE NOT NULL,
    "due_date" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");
-- CreateIndex
CREATE UNIQUE INDEX "orders_quotation_item_id_key" ON "orders"("quotation_item_id");
-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");
-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");
-- CreateIndex
CREATE INDEX "orders_due_date_idx" ON "orders"("due_date");
-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_quotation_item_id_fkey" FOREIGN KEY ("quotation_item_id") REFERENCES "quotation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
