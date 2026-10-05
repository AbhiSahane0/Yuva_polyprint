-- Where an enquiry came from, finishing that is not a style, and the end of Brand.
--
-- Four changes the client asked for, and one of them drops data.
--
-- 1. `brand_name` leaves the customer. The office never kept it up — two of
--    seventy carry one — and it was printed on the quotation beside the company
--    name, which made the document look wrong more often than right. The two
--    values are recorded in the comment below so the decision is reversible by
--    hand if the works wants them back.
--
--      ADF Foods Ltd  -> Ashoka
--      A S Agro       -> A S Agro
--
-- 2. The quotation records who enquired and how they got in touch. Both are
--    optional: every document written before today has no answer, and
--    defaulting one would be inventing it.
--
-- 3. D punch and V notch become ticks on the line. A punched handle is
--    finishing, not a style — a three side seal with a handle is still a three
--    side seal, and the old list made the office choose between the two. The
--    `D_PUNCH` value stays in the enum so quotations that chose it still read.
--
-- 4. Three styles join the list: three side seal zipper, standup with zipper,
--    flat bottom.
--
-- Nothing is recomputed. Existing quotations keep every figure they were saved
-- with, including the eleven centre seal and one standup line already on file.

-- The styles that were asked for.
ALTER TYPE "PouchType" ADD VALUE IF NOT EXISTS 'THREE_SIDE_SEAL_ZIPPER';
ALTER TYPE "PouchType" ADD VALUE IF NOT EXISTS 'STANDUP_WITH_ZIPPER';
ALTER TYPE "PouchType" ADD VALUE IF NOT EXISTS 'FLAT_BOTTOM';

-- How the enquiry arrived.
CREATE TYPE "EnquiryChannel" AS ENUM ('MAIL', 'WHATSAPP', 'PHONE', 'SMS', 'OTHER');

ALTER TABLE "quotations" ADD COLUMN "enquiry_from" TEXT NOT NULL DEFAULT '';
ALTER TABLE "quotations" ADD COLUMN "generated_through" "EnquiryChannel";

-- Finishing, ticked on the line.
ALTER TABLE "quotation_items" ADD COLUMN "has_d_punch" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quotation_items" ADD COLUMN "has_v_notch" BOOLEAN NOT NULL DEFAULT false;

-- A line that chose the retired style is a punched pouch; the tick says so, and
-- the style stays as it was so the document still reads the way it was sent.
UPDATE "quotation_items" SET "has_d_punch" = true WHERE "pouch_type" = 'D_PUNCH';

-- And Brand goes.
ALTER TABLE "customers" DROP COLUMN "brand_name";
