-- An enquiry that arrived through a person.
--
-- The client's own example: "Enquiry Source: Person / Referred By: Amit
-- Sharma". Every other value here is a wire — mail, WhatsApp, a phone, an SMS
-- — and a referral is the one route that is not, which is why it was falling
-- into OTHER and losing the distinction the referred-by name exists to record.
--
-- Placed before OTHER so the list keeps its catch-all last.
ALTER TYPE "EnquiryChannel" ADD VALUE 'PERSON' BEFORE 'OTHER';
