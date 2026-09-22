-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('PLANNED', 'RUNNING', 'ON_HOLD', 'COMPLETED');
-- CreateEnum
CREATE TYPE "ProductionStageStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'SKIPPED');
-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "ProductionStatus" NOT NULL DEFAULT 'PLANNED',
    "order_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "job_id" TEXT,
    "quantity_kg" DECIMAL(12,3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "production_stages" (
    "id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "stage" "MachineKind" NOT NULL,
    "pass" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductionStageStatus" NOT NULL DEFAULT 'PENDING',
    "machine_id" TEXT,
    "machine_name" TEXT NOT NULL DEFAULT '',
    "operator" TEXT NOT NULL DEFAULT '',
    "input_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "output_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "production_stages_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "production_orders_number_key" ON "production_orders"("number");
-- CreateIndex
CREATE INDEX "production_orders_status_idx" ON "production_orders"("status");
-- CreateIndex
CREATE INDEX "production_orders_order_id_idx" ON "production_orders"("order_id");
-- CreateIndex
CREATE INDEX "production_stages_status_idx" ON "production_stages"("status");
-- CreateIndex
CREATE UNIQUE INDEX "production_stages_production_order_id_position_key" ON "production_stages"("production_order_id", "position");
-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "production_stages" ADD CONSTRAINT "production_stages_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "production_stages" ADD CONSTRAINT "production_stages_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "costing_machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
