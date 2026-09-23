-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'RELEASED');
-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "material_override_at" TIMESTAMP(3),
ADD COLUMN     "material_override_by" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "material_override_reason" TEXT NOT NULL DEFAULT '';
-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "stock_reservations_material_id_status_idx" ON "stock_reservations"("material_id", "status");
-- CreateIndex
CREATE UNIQUE INDEX "stock_reservations_production_order_id_material_id_key" ON "stock_reservations"("production_order_id", "material_id");
-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
