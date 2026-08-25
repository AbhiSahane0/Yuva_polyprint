-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('FILM', 'INK', 'ADHESIVE', 'SOLVENT', 'CONSUMABLE');

-- AlterTable
ALTER TABLE "quotation_items" ADD COLUMN     "film_material_id" TEXT,
ADD COLUMN     "margin_percent" DECIMAL(6,2),
ADD COLUMN     "material_cost" DECIMAL(14,2),
ADD COLUMN     "material_cost_per_kg" DECIMAL(12,4);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MaterialCategory" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "density" DECIMAL(6,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_rates" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "effective_date" DATE NOT NULL,
    "entered_by" TEXT NOT NULL DEFAULT 'Office',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "materials_name_key" ON "materials"("name");

-- CreateIndex
CREATE INDEX "materials_category_sort_order_idx" ON "materials"("category", "sort_order");

-- CreateIndex
CREATE INDEX "material_rates_effective_date_idx" ON "material_rates"("effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "material_rates_material_id_effective_date_key" ON "material_rates"("material_id", "effective_date");

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_film_material_id_fkey" FOREIGN KEY ("film_material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_rates" ADD CONSTRAINT "material_rates_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
