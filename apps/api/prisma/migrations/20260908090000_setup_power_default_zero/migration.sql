-- AlterTable
ALTER TABLE "costing_machines" ALTER COLUMN "setup_power_factor" SET DEFAULT 0;


-- Machines already on record were created under the old default. The works'
-- sheet charges nothing for setup power, so bring them to it; anybody who has
-- deliberately set a different figure keeps it.
UPDATE "costing_machines" SET "setup_power_factor" = 0 WHERE "setup_power_factor" = 1;
