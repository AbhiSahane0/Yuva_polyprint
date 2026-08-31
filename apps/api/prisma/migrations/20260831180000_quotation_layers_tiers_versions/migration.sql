-- Quotation lines gain stated plies, quantity tiers, and versions.
--
-- Three shapes change at once because they overlap. A line's money moves to a
-- per-quantity table, its structure moves to a per-ply table, and the document
-- totals follow the money onto a tier. Splitting these across migrations would
-- leave the same figures in two places in between, which in a costing system is
-- how numbers start disagreeing.
--
-- Nothing is dropped before it has been copied. The backfill in the middle
-- reconstructs, for every existing quotation:
--   * one tier holding the totals that were on the quotation
--   * one quantity per line holding the money that was on the line
--   * the plies that the old fixed structure implied
-- Existing documents therefore read back with exactly the figures they were
-- sent with.

-- ============================================================ 1. new shape

CREATE TABLE "quotation_tiers" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "material_subtotal" DECIMAL(14,2) NOT NULL,
    "material_with_gst" DECIMAL(14,2) NOT NULL,
    "cylinder_subtotal" DECIMAL(14,2) NOT NULL,
    "cylinder_with_gst" DECIMAL(14,2) NOT NULL,
    "grand_subtotal" DECIMAL(14,2) NOT NULL,
    "grand_with_gst" DECIMAL(14,2) NOT NULL,
    "material_advance" DECIMAL(14,2) NOT NULL,
    "cylinder_advance" DECIMAL(14,2) NOT NULL,
    "total_advance" DECIMAL(14,2) NOT NULL,
    "total_quantity_kg" DECIMAL(14,3) NOT NULL,
    "total_pouches" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "quotation_tiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_item_layers" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "material_id" TEXT,
    "material_name" TEXT NOT NULL,
    "micron" DECIMAL(10,2) NOT NULL,
    "density" DECIMAL(6,4),
    "rate_per_kg" DECIMAL(12,2),
    "gsm" DECIMAL(10,3) NOT NULL,
    CONSTRAINT "quotation_item_layers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_item_quantities" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "quantity_kg" DECIMAL(12,3) NOT NULL,
    "rate_per_kg" DECIMAL(12,2) NOT NULL,
    "quantity_pouches" INTEGER NOT NULL DEFAULT 0,
    "rate_per_pouch" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "total_pouches" DECIMAL(14,2) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "cost_per_pouch" DECIMAL(12,4) NOT NULL,
    "material_cost" DECIMAL(14,2),
    "margin_percent" DECIMAL(6,2),
    CONSTRAINT "quotation_item_quantities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quotations"
    ADD COLUMN "version"     INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "root_id"     TEXT,
    ADD COLUMN "is_latest"   BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "won_tier_id" TEXT;

ALTER TABLE "quotation_items"
    ADD COLUMN "charge_cylinders" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "composite_gsm"    DECIMAL(10,3) NOT NULL DEFAULT 0;

-- ============================================================ 2. backfill

-- One tier per existing quotation, carrying the totals it already had.
INSERT INTO "quotation_tiers" (
    "id", "quotation_id", "position",
    "material_subtotal", "material_with_gst",
    "cylinder_subtotal", "cylinder_with_gst",
    "grand_subtotal", "grand_with_gst",
    "material_advance", "cylinder_advance", "total_advance",
    "total_quantity_kg", "total_pouches"
)
SELECT
    'tr' || substr(md5(q."id"), 1, 23),
    q."id", 1,
    q."material_subtotal", q."material_with_gst",
    q."cylinder_subtotal", q."cylinder_with_gst",
    q."grand_subtotal", q."grand_with_gst",
    q."material_advance", q."cylinder_advance", q."total_advance",
    COALESCE((SELECT SUM(i."quantity_kg")   FROM "quotation_items" i WHERE i."quotation_id" = q."id"), 0),
    COALESCE((SELECT SUM(i."total_pouches") FROM "quotation_items" i WHERE i."quotation_id" = q."id"), 0)
FROM "quotations" q;

-- One quantity per existing line, carrying the money it already had.
INSERT INTO "quotation_item_quantities" (
    "id", "item_id", "tier_id", "position",
    "quantity_kg", "rate_per_kg", "quantity_pouches", "rate_per_pouch",
    "total_pouches", "total_amount", "cost_per_pouch",
    "material_cost", "margin_percent"
)
SELECT
    'qy' || substr(md5(i."id"), 1, 23),
    i."id", t."id", 1,
    i."quantity_kg", i."rate_per_kg", i."quantity_pouches", i."rate_per_pouch",
    i."total_pouches", i."total_amount", i."cost_per_pouch",
    i."material_cost", i."margin_percent"
FROM "quotation_items" i
JOIN "quotation_tiers" t ON t."quotation_id" = i."quotation_id" AND t."position" = 1;

-- The plies the old fixed structure implied: one PET at 12 microns, a
-- metallised PET at 12 on a 3-layer job, then the chosen film as the sealant.
-- Densities are the constants the engine used (1.4 for both PET plies); the
-- sealant's comes from the material it was costed against, and is null when no
-- film was chosen — which is exactly the case the new engine now refuses to
-- cost rather than costing wrongly.
INSERT INTO "quotation_item_layers" (
    "id", "item_id", "position", "material_id", "material_name",
    "micron", "density", "rate_per_kg", "gsm"
)
SELECT 'l1' || substr(md5(i."id"), 1, 23), i."id", 1,
       (SELECT m."id" FROM "materials" m WHERE m."name" = 'PET 12µm'),
       'PET', 12, 1.4::numeric, NULL::numeric, 16.8
FROM "quotation_items" i
UNION ALL
SELECT 'l2' || substr(md5(i."id"), 1, 23), i."id", 2,
       (SELECT m."id" FROM "materials" m WHERE m."name" = 'MET PET 12µm'),
       'MET PET', 12, 1.4::numeric, NULL::numeric, 16.8
FROM "quotation_items" i
WHERE i."layer" = 3
UNION ALL
SELECT 'l3' || substr(md5(i."id"), 1, 23), i."id",
       CASE WHEN i."layer" = 3 THEN 3 ELSE 2 END,
       i."film_material_id",
       COALESCE(m."name", 'Poly'),
       i."poly_micron",
       m."density",
       NULL::numeric,
       COALESCE(ROUND(i."poly_micron" * m."density", 3), 0)
FROM "quotation_items" i
LEFT JOIN "materials" m ON m."id" = i."film_material_id";

-- Composite GSM, summed from the plies just written plus the ink and adhesive
-- the settings carry. 1.8 and 2.5 are the seeded defaults; a works that has
-- changed them since will see a fractionally different figure on old lines than
-- was printed, which is why only this derived column is reconstructed and no
-- price is.
--
-- Only for lines that actually carried a cost. A line quoted without a film has
-- no density for its sealant ply, so its plies do not add up to the laminate --
-- summing what is there would print a confident 21 GSM for a pouch that weighs
-- four times that. Those lines keep 0, which reads as "never costed" and
-- matches the null cost per kilogram already stored beside it.
UPDATE "quotation_items" i
SET "composite_gsm" = COALESCE(
    (SELECT SUM(l."gsm") FROM "quotation_item_layers" l WHERE l."item_id" = i."id"), 0
) + 1.8 + 2.5
WHERE i."material_cost_per_kg" IS NOT NULL;

-- Cylinders were charged on every line before this; the per-design rule starts
-- from today. Lines prefilled from a saved job keep charging, because that is
-- what the sent document says.
-- (charge_cylinders defaults to true, so nothing to write.)

-- ============================================================ 3. drop the old

ALTER TABLE "quotation_items" DROP CONSTRAINT "quotation_items_film_material_id_fkey";

ALTER TABLE "quotation_items"
    DROP COLUMN "layer",
    DROP COLUMN "poly_micron",
    DROP COLUMN "film_material_id",
    DROP COLUMN "quantity_kg",
    DROP COLUMN "rate_per_kg",
    DROP COLUMN "quantity_pouches",
    DROP COLUMN "rate_per_pouch",
    DROP COLUMN "total_pouches",
    DROP COLUMN "total_amount",
    DROP COLUMN "cost_per_pouch",
    DROP COLUMN "material_cost",
    DROP COLUMN "margin_percent";

ALTER TABLE "quotations"
    DROP COLUMN "material_subtotal",
    DROP COLUMN "material_with_gst",
    DROP COLUMN "cylinder_subtotal",
    DROP COLUMN "cylinder_with_gst",
    DROP COLUMN "grand_subtotal",
    DROP COLUMN "grand_with_gst",
    DROP COLUMN "material_advance",
    DROP COLUMN "cylinder_advance",
    DROP COLUMN "total_advance";

DROP INDEX "quotations_number_key";

-- ============================================================ 4. constraints

CREATE UNIQUE INDEX "quotation_tiers_quotation_id_position_key" ON "quotation_tiers"("quotation_id", "position");
CREATE INDEX "quotation_item_layers_material_id_idx" ON "quotation_item_layers"("material_id");
CREATE UNIQUE INDEX "quotation_item_layers_item_id_position_key" ON "quotation_item_layers"("item_id", "position");
CREATE INDEX "quotation_item_quantities_tier_id_idx" ON "quotation_item_quantities"("tier_id");
CREATE UNIQUE INDEX "quotation_item_quantities_item_id_position_key" ON "quotation_item_quantities"("item_id", "position");
CREATE UNIQUE INDEX "quotations_won_tier_id_key" ON "quotations"("won_tier_id");
CREATE INDEX "quotations_number_idx" ON "quotations"("number");
CREATE INDEX "quotations_is_latest_idx" ON "quotations"("is_latest");
CREATE UNIQUE INDEX "quotations_number_version_key" ON "quotations"("number", "version");

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_won_tier_id_fkey" FOREIGN KEY ("won_tier_id") REFERENCES "quotation_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_tiers" ADD CONSTRAINT "quotation_tiers_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_item_layers" ADD CONSTRAINT "quotation_item_layers_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "quotation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_item_layers" ADD CONSTRAINT "quotation_item_layers_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_item_quantities" ADD CONSTRAINT "quotation_item_quantities_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "quotation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_item_quantities" ADD CONSTRAINT "quotation_item_quantities_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "quotation_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
