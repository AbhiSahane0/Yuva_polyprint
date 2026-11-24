-- Whose cylinders a line prints from.
--
-- Charging nothing for a set already had one meaning: `charge_cylinders` false,
-- which says the works engraved this design before and still holds it. The
-- office also needs to say the opposite thing — the customer turned up with
-- their own set, cut somewhere else, which goes home with them. Until now the
-- only way to stop that being charged was to mark the new design as a repeat,
-- after which the quotation claimed a shelf here holds cylinders nobody at the
-- works has ever seen.
--
-- False everywhere to begin with: every line already written was quoted on the
-- works' own set or on a repeat of it, and neither is this.
ALTER TABLE "quotation_items"
  ADD COLUMN "customer_cylinders" BOOLEAN NOT NULL DEFAULT false;
