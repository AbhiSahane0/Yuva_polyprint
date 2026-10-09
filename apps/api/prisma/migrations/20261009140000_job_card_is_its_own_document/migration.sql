-- The job card becomes its own document, which is what it always was.
--
-- A job card is a work INSTRUCTION: written when the order is in hand, handed
-- to an operator before the press starts, and signed. A job sheet is a RECORD:
-- written after a stage finishes, saying what that stage drew from the shelf,
-- what came back, and what the run therefore cost.
--
-- They were briefly one row. Two documents with two authors, two moments and
-- two lives do not belong in one table, so the eighteen boxes the card is made
-- of move to a table of their own and leave the sheet to its costing.
--
-- Nothing is carried across: the columns are a day old and were never filled
-- on any real sheet.
CREATE TABLE "job_cards" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,

    "order_id" TEXT,
    "job_id" TEXT,
    "customer_id" TEXT,
    "job_name" TEXT NOT NULL DEFAULT '',
    "customer_name" TEXT NOT NULL DEFAULT '',

    "work_order_no" TEXT NOT NULL DEFAULT '',
    "po_date" DATE,
    "dispatch_date" DATE,
    "transport" TEXT NOT NULL DEFAULT '',
    "quantity_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "job_received_by" TEXT NOT NULL DEFAULT '',
    "printing_note" TEXT NOT NULL DEFAULT '',
    "print_speed_m_per_min" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "print_meters_override" DECIMAL(14,3),
    "met_pet_coating_gsm" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "poly_coating_gsm" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "pouching_speed_per_min" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "other_setting_minutes" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "single_roll_weight" TEXT NOT NULL DEFAULT '',
    "pouch_sorting" TEXT NOT NULL DEFAULT '',
    "special_instructions" TEXT NOT NULL DEFAULT '',
    "prepared_by" TEXT NOT NULL DEFAULT '',
    "operated_by" TEXT NOT NULL DEFAULT '',
    "approved_by" TEXT NOT NULL DEFAULT '',

    "entered_by" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_cards_number_key" ON "job_cards"("number");
CREATE INDEX "job_cards_order_id_idx" ON "job_cards"("order_id");
CREATE INDEX "job_cards_job_id_idx" ON "job_cards"("job_id");
CREATE INDEX "job_cards_date_idx" ON "job_cards"("date");

ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- And the sheet goes back to being only what the run consumed.
ALTER TABLE "job_sheets"
    DROP COLUMN "work_order_no",
    DROP COLUMN "po_date",
    DROP COLUMN "dispatch_date",
    DROP COLUMN "transport",
    DROP COLUMN "quantity_kg",
    DROP COLUMN "job_received_by",
    DROP COLUMN "printing_note",
    DROP COLUMN "print_speed_m_per_min",
    DROP COLUMN "print_meters_override",
    DROP COLUMN "met_pet_coating_gsm",
    DROP COLUMN "poly_coating_gsm",
    DROP COLUMN "pouching_speed_per_min",
    DROP COLUMN "other_setting_minutes",
    DROP COLUMN "single_roll_weight",
    DROP COLUMN "pouch_sorting",
    DROP COLUMN "special_instructions",
    DROP COLUMN "prepared_by",
    DROP COLUMN "approved_by";
