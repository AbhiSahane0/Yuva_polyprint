-- The remarks box on the works' own stage card.
--
-- Their printing card has four boxes beside the figures: what was wasted at
-- that machine, how long the power was off, when the job was taken, and how
-- long registration and shade matching took. None of them reaches the costing
-- — a run costs what it consumed — but the office reads them when a job goes
-- wrong, and until now there was nowhere to put them.
ALTER TABLE "job_sheet_stage_usage"
    ADD COLUMN "wastage_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    ADD COLUMN "no_power_minutes" DECIMAL(8,2) NOT NULL DEFAULT 0,
    ADD COLUMN "job_taken_time" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "registration_time" TEXT NOT NULL DEFAULT '';
