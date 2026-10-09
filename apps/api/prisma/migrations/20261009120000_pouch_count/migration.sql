-- How a pouch count was arrived at: sets of pouches put on the scale.
--
-- Nobody counts thirty thousand pouches. The packer weighs a hundred, three
-- times over, and every box on the lorry is counted by weight off that
-- average. The rows are kept so the count can be re-checked afterwards.
CREATE TABLE "pouch_weighings" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "pouch_count" INTEGER NOT NULL DEFAULT 100,
    "grams" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pouch_weighings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pouch_weighings_line_id_position_key"
    ON "pouch_weighings"("line_id", "position");

ALTER TABLE "pouch_weighings"
    ADD CONSTRAINT "pouch_weighings_line_id_fkey"
    FOREIGN KEY ("line_id") REFERENCES "dispatch_lines"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
