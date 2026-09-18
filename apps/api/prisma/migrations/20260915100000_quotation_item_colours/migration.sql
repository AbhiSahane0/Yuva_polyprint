-- Which inks a quotation line prints.
--
-- A line starts with the four process colours and the office takes away what
-- the job does not print — plenty are one colour — and adds a SPECIAL for each
-- station carrying something else. Which something is not known while quoting,
-- so a special is priced at the dearest ink on the rates list.
--
-- Snapshotted like a ply: rate, laydown and solids as they stood that day, so
-- reopening a quotation shows what was quoted and not what it would cost now.
--
-- Nothing is backfilled. A line written before this has no colours, and is
-- priced the way it always was — at the works' blended ink rate over the flat
-- ink GSM. That is what keeps the seven rebuilt 2022 quotations reproducing.
CREATE TABLE IF NOT EXISTS "quotation_item_colours" (
    "id"              TEXT NOT NULL,
    "item_id"         TEXT NOT NULL,
    "position"        INTEGER NOT NULL,
    "material_id"     TEXT,
    "name"            TEXT NOT NULL,
    "kind"            "InkKind" NOT NULL,
    "laydown_gsm"     DECIMAL(6,3) NOT NULL,
    "solids_percent"  DECIMAL(6,3) NOT NULL,
    "rate_per_kg"     DECIMAL(12,2) NOT NULL,

    CONSTRAINT "quotation_item_colours_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quotation_item_colours_item_id_position_key"
    ON "quotation_item_colours"("item_id", "position");
CREATE INDEX IF NOT EXISTS "quotation_item_colours_material_id_idx"
    ON "quotation_item_colours"("material_id");

ALTER TABLE "quotation_item_colours"
    ADD CONSTRAINT "quotation_item_colours_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "quotation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, not Restrict: deleting an ink from the price list must not be able
-- to destroy a quotation, and the snapshot above keeps the line readable.
ALTER TABLE "quotation_item_colours"
    ADD CONSTRAINT "quotation_item_colours_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
