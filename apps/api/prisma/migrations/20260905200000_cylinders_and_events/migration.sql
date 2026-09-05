-- The engraved set a design prints from.
--
-- A design is a job: the 420 jobs already on record hold the customer, product,
-- colours, diameter and count, and the quotation wizard already treats a saved
-- job as the design it charges cylinders for. What was missing is the individual
-- cylinders, each identifiable, so "where is the cyan one for Krishna Dairy" has
-- an answer — which is what stops a set being re-engraved because nobody could
-- find the old one.
--
-- `cylinder_events` is a ledger like `stock_movements`: the events are the truth
-- and `cylinders.status` is a cache of the latest. Nothing edits or deletes an
-- event, because "who had it last and when" is the whole point.
--
-- Every object here is new, so this is safe to apply ahead of the deploy.

-- CreateEnum
CREATE TYPE "CylinderOwnership" AS ENUM ('CUSTOMER_OWNED', 'YUVA_OWNED');

-- CreateEnum
CREATE TYPE "CylinderStatus" AS ENUM ('IN_STORE', 'ALLOCATED', 'IN_USE', 'DAMAGED', 'NEEDS_REWORK', 'RETIRED');

-- CreateEnum
CREATE TYPE "CylinderEventKind" AS ENUM ('ENGRAVED', 'ALLOCATED', 'IN_USE', 'RETURNED', 'DAMAGED', 'REWORKED', 'TRANSFERRED', 'RETIRED');

-- CreateTable
CREATE TABLE "cylinders" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'NA',
    "position" INTEGER,
    "ownership" "CylinderOwnership" NOT NULL DEFAULT 'YUVA_OWNED',
    "status" "CylinderStatus" NOT NULL DEFAULT 'IN_STORE',
    "location" TEXT NOT NULL DEFAULT 'NA',
    "diameter_mm" DECIMAL(10,2),
    "circumference_mm" DECIMAL(10,2),
    "cost" DECIMAL(12,2),
    "engraver" TEXT NOT NULL DEFAULT 'NA',
    "engraved_on" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cylinders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cylinder_events" (
    "id" TEXT NOT NULL,
    "cylinder_id" TEXT NOT NULL,
    "kind" "CylinderEventKind" NOT NULL,
    "occurred_on" DATE NOT NULL,
    "status_after" "CylinderStatus" NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "from_location" TEXT NOT NULL DEFAULT '',
    "to_location" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "entered_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cylinder_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cylinders_code_key" ON "cylinders"("code");

-- CreateIndex
CREATE INDEX "cylinders_job_id_idx" ON "cylinders"("job_id");

-- CreateIndex
CREATE INDEX "cylinders_status_idx" ON "cylinders"("status");

-- CreateIndex
CREATE INDEX "cylinder_events_cylinder_id_occurred_on_idx" ON "cylinder_events"("cylinder_id", "occurred_on");

-- AddForeignKey
ALTER TABLE "cylinders" ADD CONSTRAINT "cylinders_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cylinder_events" ADD CONSTRAINT "cylinder_events_cylinder_id_fkey" FOREIGN KEY ("cylinder_id") REFERENCES "cylinders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

