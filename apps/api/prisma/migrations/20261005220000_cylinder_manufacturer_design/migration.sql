-- Who cuts the cylinders, and which design they carry.
--
-- Both asked for on the quotation itself rather than left to the register.
-- The works deals with more than one engraver and the price differs between
-- them, so which one is quoted is part of what was quoted; and the design is
-- how the customer refers to the set when they ring up about it, which is not
-- always the job name on the line.
--
-- Free text with an empty default, because neither is a list the works keeps
-- and every quotation already on file has no answer to either.
ALTER TABLE "quotation_items"
  ADD COLUMN "cylinder_manufacturer" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "cylinder_design" TEXT NOT NULL DEFAULT '';
