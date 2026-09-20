-- Who sent this enquiry the works' way. Empty where nobody did.
--
-- Additive and defaulted, so every quotation already on file reads as "nobody
-- referred it" rather than as unknown — which is the truth: the field did not
-- exist when they were written.
ALTER TABLE "quotations" ADD COLUMN "referred_by" TEXT NOT NULL DEFAULT '';
