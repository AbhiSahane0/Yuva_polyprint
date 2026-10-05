-- Quoting a repair instead of a new set.
--
-- A repeat order needs no cylinders cut, which the line already records as
-- `charge_cylinders = false`. What it sometimes DOES need is one of the
-- existing set re-engraved, and until now there was nowhere to say so — the
-- office quoted the repair in the notes and added it to the figure by hand.
--
-- The cost is typed per cylinder, every time. The master records what a
-- cylinder cost to ENGRAVE, which is not what it costs to put right.
--
-- Snapshotted the way every other figure on a quotation is: the code and the
-- colour travel with the document, so it still reads after the cylinder has
-- been re-engraved, renumbered or scrapped. The link goes null in that case
-- rather than taking the quotation with it.
--
-- Additive throughout. No existing line changes: `repair_cylinders` defaults
-- to false, which is what every quotation already written means.

ALTER TABLE "quotation_items" ADD COLUMN "repair_cylinders" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "quotation_item_cylinder_repairs" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "cylinder_id" TEXT,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'NA',
    "cost" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_item_cylinder_repairs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quotation_item_cylinder_repairs_item_id_idx" ON "quotation_item_cylinder_repairs"("item_id");
CREATE INDEX "quotation_item_cylinder_repairs_cylinder_id_idx" ON "quotation_item_cylinder_repairs"("cylinder_id");

ALTER TABLE "quotation_item_cylinder_repairs"
  ADD CONSTRAINT "quotation_item_cylinder_repairs_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "quotation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: a quotation does not stop being true because the works
-- threw a cylinder away.
ALTER TABLE "quotation_item_cylinder_repairs"
  ADD CONSTRAINT "quotation_item_cylinder_repairs_cylinder_id_fkey"
  FOREIGN KEY ("cylinder_id") REFERENCES "cylinders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
