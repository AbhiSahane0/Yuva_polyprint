-- Why the cylinder quoted for repair needs one.
--
-- The quotation names which cylinders are being put right and what each
-- costs, but not what is wrong with them — so when a won quotation sends
-- them out, there was nothing to write on the register's own
-- SENT_FOR_REPAIR event, which requires a reason for exactly the reason
-- the office needs one: a cylinder that goes to the engraver with no
-- fault recorded comes back weeks later against a bill nobody can check.
--
-- Typed per cylinder, beside its cost, because a set rarely goes out for
-- one fault: two cylinders on the same quotation can be scored and worn.
ALTER TABLE "quotation_item_cylinder_repairs"
  ADD COLUMN "reason" TEXT NOT NULL DEFAULT '';
