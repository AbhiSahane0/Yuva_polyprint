-- A job sheet is the costing of a job card.
--
-- One run, one costing, hence the unique index: two sheets against one card
-- would each claim to be what that run cost.
--
-- Nullable and ON DELETE SET NULL, because the works' own imported sheets
-- predate job cards and an office keying yesterday's paper has no card to point
-- at. Where it is set, posting the sheet releases the card's claim on the film —
-- the run's material has genuinely left the shelf by then, so the claim that was
-- standing in for it stops counting.

ALTER TABLE "job_sheets"
  ADD COLUMN "production_order_id" TEXT;

ALTER TABLE "job_sheets"
  ADD CONSTRAINT "job_sheets_production_order_id_fkey"
  FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "job_sheets_production_order_id_key"
  ON "job_sheets"("production_order_id");
