-- A D-punch pouch is its own style.
--
-- The works' pouch workbook keeps a sheet for it, and it costs differently from
-- everything else: the punch is a charge on top of making. Quoted as "Other"
-- until now, which carried no rule at all.
--
-- Added after ZIPPER so the dropdown reads in the order the office thinks in —
-- Postgres orders an enum by declaration, and the quotation form lists the
-- styles straight from it.
ALTER TYPE "PouchType" ADD VALUE IF NOT EXISTS 'D_PUNCH' AFTER 'ZIPPER';
