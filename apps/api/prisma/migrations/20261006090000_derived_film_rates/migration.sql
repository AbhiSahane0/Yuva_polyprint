-- A film priced as "the base film, plus so much".
--
-- The works buys one LDPE and sells twelve grades of it, and the twelve are
-- not independently priced: each is General Poly plus a fixed amount — a
-- 1 kg packaging film is GP + Rs 6, a frosty film GP + Rs 55. Keying all
-- twelve every time the resin moves is twelve chances to key one wrong, and
-- the works' own table says they never move apart.
--
-- So a material may name the material its rate follows and what is added to
-- it. `base_material_id` null means the rate is typed, which is every film
-- that is not LDPE and the base itself.
--
-- SET NULL on delete rather than cascade: losing a base film must not take the
-- grades with it. They stop being derived and fall back to their last written
-- rate, which is wrong but recoverable — where a cascade would be neither.
ALTER TABLE "materials"
  ADD COLUMN "base_material_id" TEXT,
  ADD COLUMN "rate_premium" DECIMAL(12,4);

ALTER TABLE "materials"
  ADD CONSTRAINT "materials_base_material_id_fkey"
  FOREIGN KEY ("base_material_id") REFERENCES "materials"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "materials_base_material_id_idx" ON "materials"("base_material_id");
