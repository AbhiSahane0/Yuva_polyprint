-- The gauge a film is usually bought at.
--
-- Most film names state it — `PET 12µm` — and the quotation form reads it off
-- the name. The LDPE grades, PP Woven and the rest state nothing, because the
-- works buys them at whatever thickness the job asks for. The form filled those
-- in with 12µ so the row would validate, which on a sealant is not a starting
-- figure, it is a wrong one: a 50µ poly quoted at 12 is a third of the laminate
-- costed at a quarter of its weight.
--
-- Null means nobody has said. The form leaves the box empty and asks, rather
-- than inventing a number. Once set, the next quotation starts there.
ALTER TABLE "materials" ADD COLUMN "usual_micron" DECIMAL(6,2);

-- Where the name states a gauge, it is already known. Taken from the name so
-- the column starts out agreeing with what the form has always done.
UPDATE "materials"
SET "usual_micron" = CAST(substring("name" from '([0-9]+(?:\.[0-9]+)?)\s*(?:µ|u|mic)') AS DECIMAL(6,2))
WHERE category = 'FILM'
  AND "name" ~ '[0-9]+(\.[0-9]+)?\s*(µ|u|mic)';
