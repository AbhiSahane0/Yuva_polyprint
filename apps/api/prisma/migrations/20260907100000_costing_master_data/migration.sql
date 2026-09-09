-- CreateEnum
CREATE TYPE "MachineKind" AS ENUM ('PRINTING', 'LAMINATION', 'SLITTING', 'POUCHING');

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "laydown_gsm" DECIMAL(6,3),
ADD COLUMN     "solids_percent" DECIMAL(6,3);

-- CreateTable
CREATE TABLE "costing_machines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "MachineKind" NOT NULL,
    "horsepower" DECIMAL(10,2) NOT NULL,
    "power_rate_per_hp_hour" DECIMAL(10,2) NOT NULL,
    "speed_m_per_min" DECIMAL(10,2) NOT NULL,
    "setup_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costing_machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_labour" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "process" "MachineKind" NOT NULL,
    "monthly_salary" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costing_labour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "costing_machines_name_key" ON "costing_machines"("name");

-- CreateIndex
CREATE UNIQUE INDEX "costing_labour_role_key" ON "costing_labour"("role");

