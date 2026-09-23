-- Wages get a history, like every other costing figure.
--
-- A single live row with an on/off switch reached backwards: switching the
-- lamination crew on in 2026 re-priced seven quotations written in 2022, each by
-- about a rupee a kilogram, because a quotation is costed against whatever the
-- master says now. The half-open window fixes that — on or after
-- effective_from, strictly before effective_to.
--
-- THIS MIGRATION MUST CHANGE NO PRICE. The backfill below reproduces exactly
-- what the on/off switch was saying the moment before it ran:
--
--   live rows    -> [1900-01-01, open)       charged then, charged now
--   retired rows -> [1900-01-01, 1900-01-01) a window that never contains a
--                                            day, so the row has never applied
--
-- A retired row's real history is not knowable from a boolean — it may have
-- been live once. What IS knowable is that the documents on file were priced
-- without it, and the empty window is the only backfill that keeps every one of
-- them reproducing. Turning such a role on is then a deliberate act, from a
-- date somebody chooses, and it reaches nothing already written.

ALTER TABLE "costing_labour"
  ADD COLUMN "effective_from" DATE,
  ADD COLUMN "effective_to"   DATE;

UPDATE "costing_labour"
   SET "effective_from" = DATE '1900-01-01',
       "effective_to"   = CASE WHEN "is_active" THEN NULL ELSE DATE '1900-01-01' END;

ALTER TABLE "costing_labour"
  ALTER COLUMN "effective_from" SET NOT NULL;

-- Whether a row is live is a question about a date. Keeping the answer in a
-- second place is how the two come to disagree.
ALTER TABLE "costing_labour" DROP COLUMN "is_active";

-- "Lamination Operator" at one wage until March and another after it is the
-- same job twice, and both windows have to survive.
DROP INDEX "costing_labour_role_key";

CREATE INDEX "costing_labour_effective_from_idx" ON "costing_labour"("effective_from");
CREATE INDEX "costing_labour_effective_to_idx" ON "costing_labour"("effective_to");
