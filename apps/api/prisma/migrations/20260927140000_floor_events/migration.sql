-- The operator view: what the floor said, and why it stopped.
--
-- A stage already records when it started, when it finished and what it
-- weighed. What nothing recorded was why a machine is standing idle — so this
-- is a log rather than a field, because a shift holds four stoppages and the
-- fourth overwriting the third is how a works loses its own day.
--
-- Additive throughout. Nothing existing is altered or dropped.

-- CreateEnum
CREATE TYPE "FloorEventKind" AS ENUM ('PAUSED', 'RESUMED', 'ISSUE');

-- CreateTable
CREATE TABLE "floor_events" (
    "id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "kind" "FloorEventKind" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "operator_id" TEXT,
    "operator" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "floor_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "floor_events_production_order_id_idx" ON "floor_events"("production_order_id");

-- CreateIndex
CREATE INDEX "floor_events_stage_id_idx" ON "floor_events"("stage_id");

-- CreateIndex
CREATE INDEX "floor_events_created_at_idx" ON "floor_events"("created_at");

-- AddForeignKey
ALTER TABLE "floor_events" ADD CONSTRAINT "floor_events_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_events" ADD CONSTRAINT "floor_events_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "production_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_events" ADD CONSTRAINT "floor_events_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

