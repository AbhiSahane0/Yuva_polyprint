-- The works weighs reels, not jobs.
--
-- Their sheet has a column for every reel that went on the machine and every
-- roll that came off it: "257.3 and 250.25" is how 507.55 kg of polyester
-- reaches the form. Typing the total instead throws away the only record of
-- which reel was light, and asks somebody to add up in their head on a form
-- whose whole purpose is arithmetic.
--
-- A line's issued and returned figures become the sum of its reels where it
-- has any — the same rule a dispatch note's packages follow — and the typed
-- total stands where it has none.
CREATE TYPE "JobSheetReelRole" AS ENUM ('ISSUE', 'RETURN', 'OUTPUT');

CREATE TABLE "job_sheet_reels" (
    "id" TEXT NOT NULL,
    "sheet_id" TEXT NOT NULL,
    "line_id" TEXT,
    "stage" "JobSheetStage",
    "role" "JobSheetReelRole" NOT NULL,
    "position" INTEGER NOT NULL,
    "weight_kg" DECIMAL(14,3) NOT NULL,
    "core_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reel_number" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_sheet_reels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_sheet_reels_sheet_id_role_idx" ON "job_sheet_reels"("sheet_id", "role");
CREATE INDEX "job_sheet_reels_line_id_idx" ON "job_sheet_reels"("line_id");

ALTER TABLE "job_sheet_reels" ADD CONSTRAINT "job_sheet_reels_sheet_id_fkey"
    FOREIGN KEY ("sheet_id") REFERENCES "job_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_sheet_reels" ADD CONSTRAINT "job_sheet_reels_line_id_fkey"
    FOREIGN KEY ("line_id") REFERENCES "job_sheet_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
