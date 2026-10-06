-- Repair status, and why.
--
-- The register could say a cylinder was DAMAGED — found unusable — and it
-- could say it was back in store, but it had no word for the weeks in
-- between, when the cylinder is at the engraver and not in the works at all.
-- So a set sent out for re-engraving read as either "damaged, on the shelf",
-- which it is not, or as nothing having happened.
--
-- Two statuses and one event close that:
--   UNDER_REPAIR  it has gone out to be put right
--   REPAIRED      it has come back, and is usable again
-- SENT_FOR_REPAIR is the event that starts it; the existing REWORKED event
-- ends it and now leaves the cylinder REPAIRED rather than IN_STORE.
--
-- The reason is recorded on the event, because it belongs to the day it was
-- sent, and mirrored onto the cylinder so the register can say why the one in
-- front of you is away without replaying its history. Only the event recorder
-- ever writes either, exactly as it is the only writer of the status.
ALTER TYPE "CylinderStatus" ADD VALUE 'UNDER_REPAIR' AFTER 'NEEDS_REWORK';
ALTER TYPE "CylinderStatus" ADD VALUE 'REPAIRED' AFTER 'UNDER_REPAIR';

ALTER TYPE "CylinderEventKind" ADD VALUE 'SENT_FOR_REPAIR' AFTER 'DAMAGED';

ALTER TABLE "cylinder_events" ADD COLUMN "repair_reason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "cylinders" ADD COLUMN "repair_reason" TEXT NOT NULL DEFAULT '';
