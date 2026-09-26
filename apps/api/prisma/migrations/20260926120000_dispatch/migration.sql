-- Dispatch: what left the building, and on whose lorry.
--
-- The link that was missing. Completing a job card never completed the order
-- and was right not to: for a customer, complete means delivered, and nothing
-- knew about delivery. One note is one lorry and one customer, with a line per
-- order aboard and a row per reel under the line.
--
-- Additive throughout. Nothing existing is altered or dropped.

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "dispatches" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'DRAFT',
    "customer_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "dispatch_date" DATE NOT NULL,
    "delivery_address" TEXT NOT NULL DEFAULT '',
    "vehicle_number" TEXT NOT NULL DEFAULT '',
    "transporter" TEXT NOT NULL DEFAULT '',
    "driver_name" TEXT NOT NULL DEFAULT '',
    "driver_phone" TEXT NOT NULL DEFAULT '',
    "lr_number" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "raised_by" TEXT NOT NULL DEFAULT '',
    "dispatched_at" TIMESTAMP(3),
    "dispatched_by" TEXT NOT NULL DEFAULT '',
    "cancelled_at" TIMESTAMP(3),
    "cancelled_reason" TEXT NOT NULL DEFAULT '',
    "override_reason" TEXT NOT NULL DEFAULT '',
    "override_by" TEXT NOT NULL DEFAULT '',
    "override_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_lines" (
    "id" TEXT NOT NULL,
    "dispatch_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "order_id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "production_order_id" TEXT,
    "quantity_kg" DECIMAL(12,3) NOT NULL,
    "quantity_pouches" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_packages" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reel_number" TEXT NOT NULL DEFAULT '',
    "net_kg" DECIMAL(12,3) NOT NULL,
    "gross_kg" DECIMAL(12,3),
    "width_mm" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_number_key" ON "dispatches"("number");

-- CreateIndex
CREATE INDEX "dispatches_status_idx" ON "dispatches"("status");

-- CreateIndex
CREATE INDEX "dispatches_customer_id_idx" ON "dispatches"("customer_id");

-- CreateIndex
CREATE INDEX "dispatches_dispatch_date_idx" ON "dispatches"("dispatch_date");

-- CreateIndex
CREATE INDEX "dispatch_lines_order_id_idx" ON "dispatch_lines"("order_id");

-- CreateIndex
CREATE INDEX "dispatch_lines_production_order_id_idx" ON "dispatch_lines"("production_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_lines_dispatch_id_position_key" ON "dispatch_lines"("dispatch_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_packages_line_id_position_key" ON "dispatch_packages"("line_id", "position");

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_packages" ADD CONSTRAINT "dispatch_packages_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "dispatch_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

