-- What a setting was on a given day.
--
-- The works' own sheets carry a bank EMI of Rs 4,166.66 in March and April 2022
-- and Rs 10,000 in July — the same figure, changed in between, not something
-- that varies job to job. Material rates already answer "what was this worth
-- then"; settings could not, so an old quotation repriced at today's overheads.
--
-- `app_settings` stays the current value, and is also where the GSTIN lookup
-- cache lives, so it is left alone. This records the changes beside it.
CREATE TABLE "app_setting_history" (
    "key"            TEXT NOT NULL,
    "value"          TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_setting_history_pkey" PRIMARY KEY ("key", "effective_date")
);

CREATE INDEX "app_setting_history_key_effective_date_idx"
    ON "app_setting_history"("key", "effective_date" DESC);
