-- Margin, transport and pouch making, per quotation.
--
-- NULL keeps the works' own figure from settings, which is what every existing
-- quotation means. Seven of the client's own old sheets set all three by hand:
-- margins of 5%, 9% and 10%, transport at Rs 5 and Rs 10, and pouch making at
-- 0, 11.04 and 15 — so holding one figure for the works made their own history
-- unreproducible.
ALTER TABLE "quotations"
  ADD COLUMN "margin_percent" DECIMAL(5,2),
  ADD COLUMN "transport_per_kg" DECIMAL(10,2),
  ADD COLUMN "pouch_making_per_kg" DECIMAL(10,2);

-- What a press draws depends on how many stations are inked.
--
-- Their sheet switches a 12 HP station motor on as colours are added, so a
-- two-colour job draws the 30 HP main drive alone. Charging the full connected
-- load on every job overstated electricity on anything short of a full press.
--
-- Zero station horsepower means "one fixed load", which is what every machine
-- on record does today.
ALTER TABLE "costing_machines"
  ADD COLUMN "station_horsepower" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "station_colour_steps" TEXT NOT NULL DEFAULT '';
