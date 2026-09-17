-- CreateEnum
CREATE TYPE "JobSheetStatus" AS ENUM ('OPEN', 'COSTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobSheetStage" AS ENUM ('PRINTING', 'LAMINATION_1', 'LAMINATION_2', 'SLITTING', 'POUCHING');

-- CreateEnum
CREATE TYPE "JobSheetSection" AS ENUM ('PRINTING', 'LAMINATION');

-- CreateEnum
CREATE TYPE "JobSheetLineKind" AS ENUM ('FILM', 'SOLVENT', 'INK', 'ADHESIVE', 'OTHER');

-- CreateTable
CREATE TABLE "job_sheets" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" "JobSheetStatus" NOT NULL DEFAULT 'OPEN',
    "job_id" TEXT,
    "job_name" TEXT NOT NULL DEFAULT '',
    "customer_id" TEXT,
    "operator_name" TEXT NOT NULL DEFAULT '',
    "film_type" TEXT NOT NULL DEFAULT '',
    "web_width_mm" DECIMAL(10,2),
    "micron" DECIMAL(10,3),
    "circumference_mm" DECIMAL(10,2),
    "cylinder_count" INTEGER NOT NULL DEFAULT 0,
    "print_mix_issued_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "print_mix_returned_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "lam_mix_issued_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "lam_mix_returned_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "make_ready_days" DECIMAL(8,3) NOT NULL DEFAULT 0,
    "production_days" DECIMAL(8,3) NOT NULL DEFAULT 0,
    "printed_gross_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "printed_core_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "produced_gross_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "produced_core_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "final_output_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "pouching_weight_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "electricity_per_day" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transport_per_kg" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "pouching_per_kg" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "packaging_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "emi_per_day" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "profit_percent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "expected_wastage_percent" DECIMAL(6,3) NOT NULL DEFAULT 5,
    "electricity_override" DECIMAL(12,2),
    "salary_override" DECIMAL(12,2),
    "transport_override" DECIMAL(12,2),
    "pouching_override" DECIMAL(12,2),
    "emi_override" DECIMAL(12,2),
    "profit_override" DECIMAL(12,2),
    "material_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "material_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "basic_value_per_kg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "electricity_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "salary_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transport_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pouching_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "emi_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "profit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overhead_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "effective_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_per_kg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expected_wastage_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "actual_wastage_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "wastage_percent" DECIMAL(8,3) NOT NULL DEFAULT 0,
    "excess_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "stock_posted_at" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "entered_by" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_sheet_lines" (
    "id" TEXT NOT NULL,
    "sheet_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "section" "JobSheetSection" NOT NULL,
    "kind" "JobSheetLineKind" NOT NULL DEFAULT 'OTHER',
    "material_id" TEXT,
    "name" TEXT NOT NULL,
    "issued_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "returned_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "mix_issued_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "mix_returned_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "mix_share_percent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "computed_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "consumed_override_kg" DECIMAL(14,3),
    "consumed_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "rate_per_kg" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "job_sheet_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_sheet_labour" (
    "id" TEXT NOT NULL,
    "sheet_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "headcount" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "rate_per_day" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "days" DECIMAL(8,3) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "job_sheet_labour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_sheet_stage_usage" (
    "id" TEXT NOT NULL,
    "sheet_id" TEXT NOT NULL,
    "stage" "JobSheetStage" NOT NULL,
    "share_percent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "days" DECIMAL(8,3) NOT NULL DEFAULT 0,
    "shifts" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "job_sheet_stage_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_sheets_number_key" ON "job_sheets"("number");

-- CreateIndex
CREATE INDEX "job_sheets_date_idx" ON "job_sheets"("date");

-- CreateIndex
CREATE INDEX "job_sheets_status_date_idx" ON "job_sheets"("status", "date");

-- CreateIndex
CREATE INDEX "job_sheets_job_id_idx" ON "job_sheets"("job_id");

-- CreateIndex
CREATE INDEX "job_sheets_customer_id_idx" ON "job_sheets"("customer_id");

-- CreateIndex
CREATE INDEX "job_sheet_lines_material_id_idx" ON "job_sheet_lines"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_sheet_lines_sheet_id_position_key" ON "job_sheet_lines"("sheet_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "job_sheet_labour_sheet_id_position_key" ON "job_sheet_labour"("sheet_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "job_sheet_stage_usage_sheet_id_stage_key" ON "job_sheet_stage_usage"("sheet_id", "stage");

-- AddForeignKey
ALTER TABLE "job_sheets" ADD CONSTRAINT "job_sheets_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_sheets" ADD CONSTRAINT "job_sheets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_sheet_lines" ADD CONSTRAINT "job_sheet_lines_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "job_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_sheet_lines" ADD CONSTRAINT "job_sheet_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_sheet_labour" ADD CONSTRAINT "job_sheet_labour_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "job_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_sheet_stage_usage" ADD CONSTRAINT "job_sheet_stage_usage_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "job_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

