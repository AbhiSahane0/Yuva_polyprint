-- A claim names the roll it is on.
--
-- A claim on "781 kg of LDPE" is a claim on nothing in particular. It cannot
-- tell the floor which rolls to fetch, it cannot stop two cards being promised
-- one roll, and it forced the availability sum to guess which reels a claim had
-- come off — a guess made deliberately towards saying no, but a guess.
--
-- Naming the roll removes it: what is left of a roll is what is on it less what
-- other cards hold OF THAT ROLL, which is a fact rather than an apportionment.
--
-- The existing rows keep a null batch and stay exactly as they are. They still
-- count against their material, so nothing that was claimed becomes unclaimed
-- by running this; they are simply the last claims that cannot say where they
-- are. Re-saving a card replaces them with rows that can.

ALTER TABLE "stock_reservations"
  ADD COLUMN "batch_id" TEXT;

ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per card per material was the old shape. A job spanning three rolls
-- needs three rows, which is the whole point.
DROP INDEX "stock_reservations_production_order_id_material_id_key";

CREATE UNIQUE INDEX "stock_reservations_production_order_id_batch_id_key"
  ON "stock_reservations"("production_order_id", "batch_id");

CREATE INDEX "stock_reservations_batch_id_status_idx"
  ON "stock_reservations"("batch_id", "status");
