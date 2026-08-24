-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_person" TEXT NOT NULL DEFAULT 'NA',
    "address" TEXT NOT NULL DEFAULT 'NA',
    "city" TEXT NOT NULL DEFAULT 'NA',
    "district" TEXT NOT NULL DEFAULT 'NA',
    "pincode" TEXT NOT NULL DEFAULT 'NA',
    "mobile" TEXT NOT NULL DEFAULT 'NA',
    "alt_phone" TEXT NOT NULL DEFAULT 'NA',
    "email" TEXT NOT NULL DEFAULT 'NA',
    "source_raw" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "job_code" TEXT NOT NULL DEFAULT 'NA',
    "job_name" TEXT NOT NULL DEFAULT 'NA',
    "job_type" TEXT NOT NULL DEFAULT 'NA',
    "customer_id" TEXT,
    "pouch_type" TEXT NOT NULL DEFAULT 'NA',
    "pet_micron" DECIMAL(10,3),
    "met_pet_micron" DECIMAL(10,3),
    "poly_micron" DECIMAL(10,3),
    "poly_type" TEXT NOT NULL DEFAULT 'NA',
    "layer" DECIMAL(10,3),
    "job_final_direction" TEXT NOT NULL DEFAULT 'NA',
    "printing_type" TEXT NOT NULL DEFAULT 'NA',
    "design_height" DECIMAL(10,3),
    "design_open_width" DECIMAL(10,3),
    "ups" DECIMAL(10,3),
    "design" TEXT NOT NULL DEFAULT 'NA',
    "job_colours" TEXT NOT NULL DEFAULT 'NA',
    "total_cylinders" DECIMAL(10,3),
    "ink_gsm" DECIMAL(10,3),
    "pet_gsm" DECIMAL(10,3),
    "met_pet_gsm" DECIMAL(10,3),
    "poly_gsm" DECIMAL(10,3),
    "adhesive_gsm" DECIMAL(10,3),
    "composite_gsm" DECIMAL(10,3),
    "coating_gsm" DECIMAL(10,3),
    "up_1" TEXT NOT NULL DEFAULT 'NA',
    "up_2" TEXT NOT NULL DEFAULT 'NA',
    "up_3" TEXT NOT NULL DEFAULT 'NA',
    "up_4" TEXT NOT NULL DEFAULT 'NA',
    "up_2_open_width" TEXT NOT NULL DEFAULT 'NA',
    "up_2_height" TEXT NOT NULL DEFAULT 'NA',
    "up_3_open_width" TEXT NOT NULL DEFAULT 'NA',
    "notes" TEXT NOT NULL DEFAULT 'NA',
    "rubber_size" DECIMAL(10,3),
    "cylinder_cell" DECIMAL(10,3),
    "cylinder_dia" DECIMAL(10,3),
    "cylinder_party" TEXT NOT NULL DEFAULT 'NA',
    "viscosity" TEXT NOT NULL DEFAULT 'NA',
    "single_roll_weight" TEXT NOT NULL DEFAULT 'NA',
    "pouch_plate_size" TEXT NOT NULL DEFAULT 'NA',
    "pouches_per_kg" TEXT NOT NULL DEFAULT 'NA',
    "d_punch" TEXT NOT NULL DEFAULT 'NA',
    "d_punch_top_size" TEXT NOT NULL DEFAULT 'NA',
    "pouch_sub_type" TEXT NOT NULL DEFAULT 'NA',
    "pouch_height" DECIMAL(10,3),
    "pouch_open_width" DECIMAL(10,3),
    "gusset" TEXT NOT NULL DEFAULT 'NA',
    "gusset_size" TEXT NOT NULL DEFAULT 'NA',
    "v_notch" TEXT NOT NULL DEFAULT 'NA',
    "source_row" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_mobile_idx" ON "customers"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_name_key" ON "customers"("company_name");

-- CreateIndex
CREATE INDEX "jobs_job_code_idx" ON "jobs"("job_code");

-- CreateIndex
CREATE INDEX "jobs_customer_id_idx" ON "jobs"("customer_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
