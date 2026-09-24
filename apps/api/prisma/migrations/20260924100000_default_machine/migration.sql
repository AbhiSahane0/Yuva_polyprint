-- Which machine of each kind the works actually runs.
--
-- The costing charges one machine per process and, with nothing to go on, took
-- whichever came first on the list. A works with an old laminator and a new one
-- was therefore pricing every job on the old one's speed, and had no way to say
-- otherwise — the engine could already be told, but nothing ever told it.
--
-- Defaults to false everywhere, which is exactly the behaviour that was there
-- before: no machine marked means "first on the list", so this migration moves
-- no price. Marking one is a deliberate act afterwards.

ALTER TABLE "costing_machines"
  ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
