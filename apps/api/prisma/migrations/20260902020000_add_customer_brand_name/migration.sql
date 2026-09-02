-- The brand a customer sells under, where that differs from its registered name.
--
-- Added with a default rather than as nullable, to match every other optional
-- text column on this table: the legacy import writes the literal 'NA' where the
-- spreadsheet had no value, and the app already renders that as an empty box.
-- A nullable column here would mean two different ways of saying "not known" on
-- one row, and every reader would have to handle both.
--
-- Backfilled to 'NA' for existing rows, which is the office's starting point:
-- they fill brands in as they go.
ALTER TABLE "customers"
  ADD COLUMN "brand_name" TEXT NOT NULL DEFAULT 'NA';
