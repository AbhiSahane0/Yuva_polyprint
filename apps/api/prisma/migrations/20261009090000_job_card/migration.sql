-- The job card: the half of the sheet that is a work instruction.
--
-- What is already here records what a run CONSUMED — ink and adhesive issued
-- and returned, days on the floor, output and waste. That is the costing, and
-- it is written after the run. The works' own Job Sheet is the other half and
-- comes first: the paper an operator is handed before the press starts, saying
-- what film to draw, cut to what size, how many kilograms of each ply, how
-- many metres that is and how long the job will stand on the machine.
--
-- One document, two halves, because that is how the paper travels.
--
-- Everything else on the card is worked out — from the design master, which
-- already mirrors the works' Jobs Data tab column for column, and from the
-- figures on the Costing screen. These are only what an operator types, which
-- is the nine yellow boxes on their sheet plus who prepared and approved it.
ALTER TABLE "job_sheets"
  ADD COLUMN "work_order_no"        TEXT NOT NULL DEFAULT '',
  ADD COLUMN "po_date"              DATE,
  ADD COLUMN "dispatch_date"        DATE,
  ADD COLUMN "transport"            TEXT NOT NULL DEFAULT '',
  ADD COLUMN "quantity_kg"          DECIMAL(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN "job_received_by"      TEXT NOT NULL DEFAULT '',
  ADD COLUMN "printing_note"        TEXT NOT NULL DEFAULT '',
  -- Seeded from the works' figure and then the operator's to change.
  ADD COLUMN "print_speed_m_per_min" DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- Worked out from the PET ply, and overridable: the sheet's own cell is
  -- yellow, so the floor is allowed to correct it against the roll in hand.
  ADD COLUMN "print_meters_override" DECIMAL(14,3),
  ADD COLUMN "met_pet_coating_gsm"  DECIMAL(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN "poly_coating_gsm"     DECIMAL(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN "pouching_speed_per_min" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "other_setting_minutes" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "single_roll_weight"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN "pouch_sorting"        TEXT NOT NULL DEFAULT '',
  ADD COLUMN "special_instructions" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "prepared_by"          TEXT NOT NULL DEFAULT '',
  ADD COLUMN "approved_by"          TEXT NOT NULL DEFAULT '';
