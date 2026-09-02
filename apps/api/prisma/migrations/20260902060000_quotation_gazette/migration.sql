-- Gazette pouches, and the flat film a line is actually cut from.
--
-- A gazette gussets at the sides and the base so the pouch stands. That depth is
-- film the flat sheet has to carry, so it enlarges both the weight (fewer
-- pouches to the kilogram) and the cylinder (a wider printed area).
--
-- The four gazette columns take defaults, so every existing line reads as the
-- ordinary flat bag it was quoted as. Nothing is repriced.
ALTER TABLE "quotation_items"
  ADD COLUMN "is_gazette"     BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN "gazette_bottom" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "gazette_left"   DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "gazette_right"  DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- The flat film size. Added nullable, backfilled from the pouch size — which is
-- correct for every existing row, because none of them had a gusset — and only
-- then made NOT NULL. Adding it NOT NULL in one step would need a default that
-- is wrong for every row written afterwards.
ALTER TABLE "quotation_items"
  ADD COLUMN "film_width_mm"  DECIMAL(10, 2),
  ADD COLUMN "film_height_mm" DECIMAL(10, 2);

UPDATE "quotation_items"
   SET "film_width_mm"  = "width_mm",
       "film_height_mm" = "height_mm";

ALTER TABLE "quotation_items"
  ALTER COLUMN "film_width_mm"  SET NOT NULL,
  ALTER COLUMN "film_height_mm" SET NOT NULL;
