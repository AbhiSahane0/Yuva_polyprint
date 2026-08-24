-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "customer_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "address_line1" TEXT NOT NULL DEFAULT 'NA',
    "address_line2" TEXT NOT NULL DEFAULT 'NA',
    "address_line3" TEXT NOT NULL DEFAULT 'NA',
    "mobile" TEXT NOT NULL DEFAULT 'NA',
    "email" TEXT NOT NULL DEFAULT 'NA',
    "cylinder_rate" DECIMAL(10,4) NOT NULL,
    "gst_percent" DECIMAL(5,2) NOT NULL,
    "material_advance_percent" DECIMAL(5,2) NOT NULL,
    "cylinder_advance_percent" DECIMAL(5,2) NOT NULL,
    "material_subtotal" DECIMAL(14,2) NOT NULL,
    "material_with_gst" DECIMAL(14,2) NOT NULL,
    "cylinder_subtotal" DECIMAL(14,2) NOT NULL,
    "cylinder_with_gst" DECIMAL(14,2) NOT NULL,
    "grand_subtotal" DECIMAL(14,2) NOT NULL,
    "grand_with_gst" DECIMAL(14,2) NOT NULL,
    "material_advance" DECIMAL(14,2) NOT NULL,
    "cylinder_advance" DECIMAL(14,2) NOT NULL,
    "total_advance" DECIMAL(14,2) NOT NULL,
    "terms" TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "job_id" TEXT,
    "job_name" TEXT NOT NULL,
    "layer" INTEGER NOT NULL,
    "width_mm" DECIMAL(10,2) NOT NULL,
    "height_mm" DECIMAL(10,2) NOT NULL,
    "poly_micron" DECIMAL(10,2) NOT NULL,
    "quantity_kg" DECIMAL(12,3) NOT NULL,
    "rate_per_kg" DECIMAL(12,2) NOT NULL,
    "repeat_width" DECIMAL(10,2) NOT NULL,
    "repeat_height" DECIMAL(10,2) NOT NULL,
    "cylinder_count" INTEGER NOT NULL,
    "transport_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "micron" DECIMAL(10,2) NOT NULL,
    "pouches_per_kg" DECIMAL(12,2) NOT NULL,
    "total_pouches" DECIMAL(14,2) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "cylinder_width" DECIMAL(10,2) NOT NULL,
    "cylinder_circumference" DECIMAL(10,2) NOT NULL,
    "cost_per_cylinder" DECIMAL(14,2) NOT NULL,
    "total_cylinder_cost" DECIMAL(14,2) NOT NULL,
    "cost_per_pouch" DECIMAL(12,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_number_key" ON "quotations"("number");

-- CreateIndex
CREATE INDEX "quotations_customer_id_idx" ON "quotations"("customer_id");

-- CreateIndex
CREATE INDEX "quotations_status_idx" ON "quotations"("status");

-- CreateIndex
CREATE INDEX "quotation_items_quotation_id_idx" ON "quotation_items"("quotation_id");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
