-- A drum is not taken once.
--
-- The works takes ten kilograms of white, finishes it, takes fifteen more,
-- finishes that, takes two and puts one back. Their sheet has four cells for
-- it — `=SUM(B15:E15)` — and the solvent rows have eight. We stored one figure
-- per row, so Total could only ever repeat Rec, and the three draws had to be
-- added up in somebody's head before they reached the form. A form whose whole
-- purpose is arithmetic should not ask that.
--
-- Fresh draws are ISSUE reels, which already exist. These two are the drums:
-- an ink's own mixed tin, and the lamination pool the sheet carries rather
-- than any one row.
ALTER TYPE "JobSheetReelRole" ADD VALUE 'MIX_ISSUE';
ALTER TYPE "JobSheetReelRole" ADD VALUE 'LAM_MIX_ISSUE';
