-- The rate the office agreed for THIS job's film, stated rather than deduced.
--
-- A typed rate used to be inferred: a ply whose material names a gauge the line
-- does not quote — "PET 12µm" at 20µ — was taken to carry one, and a ply at the
-- stocked gauge was taken to follow the rate list. That held while the only
-- reason to type a rate was an unstocked gauge.
--
-- It stopped holding once film prices turned out to be agreed per job. The
-- works' own sheets carry PET at 185, 175 and 190 — every one at 12µ, every one
-- written on 23 March 2022. At the stocked gauge such a rate was stored and then
-- invisible, so reopening the quotation and pressing Save replaced it with the
-- catalogue price, silently.
--
-- NULL means "use the film's own rate", which is what every existing row means:
-- they are read through the old inference, so nothing already saved changes.
ALTER TABLE "quotation_item_layers"
  ADD COLUMN "rate_override" DECIMAL(12,2);
