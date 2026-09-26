-- The works' own people, at the level the floor needs them.
--
-- No attendance, no leave calendar, no payroll: a works of forty does not run
-- those off a screen. And no wage — that lives on the costing role this points
-- at, dated, where the costing already reads it.
--
-- The role FK is RESTRICT: a role with somebody on it is a role the works still
-- has, and deleting it out from under them would leave a person nothing
-- describes. The operator FK on a stage is SET NULL, because the NAME is
-- snapshotted beside it and a finished card must stay readable after somebody
-- leaves.

CREATE TYPE "Shift" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT', 'GENERAL');

CREATE TABLE "employees" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "code"       TEXT NOT NULL DEFAULT '',
  "role_id"    TEXT,
  "role_name"  TEXT NOT NULL,
  "shift"      "Shift" NOT NULL DEFAULT 'GENERAL',
  "phone"      TEXT NOT NULL DEFAULT '',
  "joined_on"  DATE,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "notes"      TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employees_is_active_name_idx" ON "employees"("is_active", "name");
CREATE INDEX "employees_role_id_idx" ON "employees"("role_id");

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "costing_labour"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Who ran a stage: a link, and the snapshot that was already there beside it.
ALTER TABLE "production_stages"
  ADD COLUMN "operator_id" TEXT;

CREATE INDEX "production_stages_operator_id_idx" ON "production_stages"("operator_id");

ALTER TABLE "production_stages"
  ADD CONSTRAINT "production_stages_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
