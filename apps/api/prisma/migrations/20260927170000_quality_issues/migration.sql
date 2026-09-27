-- Quality & Waste: what was found wrong, and what cannot be sent.
--
-- `ISSUE` leaves FloorEventKind and becomes a QualityIssue. A stoppage is a
-- moment; a defect is a state somebody has to close, with a severity and an
-- owner. Safe to rewrite the enum: no floor_events row has ever used ISSUE
-- (checked on both databases before this was written).
--
-- `rejected_kg` is finished film that failed after the run. It is NOT waste —
-- waste is material lost at the machine and every stage already records it.
-- Dispatch counts rejections out of what the godown can send.

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED');

-- AlterEnum
BEGIN;
CREATE TYPE "FloorEventKind_new" AS ENUM ('PAUSED', 'RESUMED');
ALTER TABLE "floor_events" ALTER COLUMN "kind" TYPE "FloorEventKind_new" USING ("kind"::text::"FloorEventKind_new");
ALTER TYPE "FloorEventKind" RENAME TO "FloorEventKind_old";
ALTER TYPE "FloorEventKind_new" RENAME TO "FloorEventKind";
DROP TYPE "public"."FloorEventKind_old";
COMMIT;

-- CreateTable
CREATE TABLE "quality_issues" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "rejected_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "raised_by" TEXT NOT NULL DEFAULT '',
    "responsible_id" TEXT,
    "responsible_name" TEXT NOT NULL DEFAULT '',
    "resolved_by" TEXT NOT NULL DEFAULT '',
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quality_issues_number_key" ON "quality_issues"("number");

-- CreateIndex
CREATE INDEX "quality_issues_status_idx" ON "quality_issues"("status");

-- CreateIndex
CREATE INDEX "quality_issues_severity_idx" ON "quality_issues"("severity");

-- CreateIndex
CREATE INDEX "quality_issues_production_order_id_idx" ON "quality_issues"("production_order_id");

-- CreateIndex
CREATE INDEX "quality_issues_created_at_idx" ON "quality_issues"("created_at");

-- AddForeignKey
ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "production_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

