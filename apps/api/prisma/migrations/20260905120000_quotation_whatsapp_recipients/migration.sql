-- Where a quotation was sent, beyond email.
--
-- `whatsapp_to` holds the mobile numbers a send was addressed to, in E.164.
-- `whatsapp_sent_at` stays null until a provider actually accepts a message, so
-- a row with numbers and no timestamp reads as pending rather than delivered.
--
-- Both are safe to add ahead of the code that writes them: the array defaults to
-- empty and the timestamp is nullable, so every existing send record keeps
-- reading exactly as it did.
ALTER TABLE "quotation_emails"
  ADD COLUMN "whatsapp_to" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "whatsapp_sent_at" TIMESTAMP(3);
