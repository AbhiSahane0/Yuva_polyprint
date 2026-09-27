-- Machines & maintenance: why a machine is standing.
--
-- A record with no ended_at IS the machine being down. There is no status
-- column on the machine, deliberately: a status somebody has to remember to
-- change is a status that is wrong, and the press would read "under
-- maintenance" for a fortnight after it came back.
--
-- Everything else on the machines screen is derived from what already exists —
-- the running stage, the stages finished today, and the pause/restart events
-- the machine screen records.
--
-- Additive throughout. Nothing existing is altered or dropped.

-- CreateEnum
CREATE TYPE "MaintenanceKind" AS ENUM ('SERVICE', 'BREAKDOWN');

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "machine_id" TEXT NOT NULL,
    "kind" "MaintenanceKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "work_done" TEXT NOT NULL DEFAULT '',
    "reported_by" TEXT NOT NULL DEFAULT '',
    "closed_by" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_records_number_key" ON "maintenance_records"("number");

-- CreateIndex
CREATE INDEX "maintenance_records_machine_id_idx" ON "maintenance_records"("machine_id");

-- CreateIndex
CREATE INDEX "maintenance_records_started_at_idx" ON "maintenance_records"("started_at");

-- CreateIndex
CREATE INDEX "maintenance_records_ended_at_idx" ON "maintenance_records"("ended_at");

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "costing_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

