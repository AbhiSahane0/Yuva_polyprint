-- A reel has a width, and film is not fungible by weight.
--
-- The works' own stock register is kept by width, and it is right to be: PET
-- 12µm sits in twenty-three widths from 340 mm to 1040 mm, and a job needing
-- 650 mm cannot run on a 340 mm reel however many kilograms of it there are.
-- "Free: 2,919 kg" was therefore an optimistic figure, and this is the column
-- that lets it stop being one.
--
-- The gauge comes with it. It is in the material's name as well, but the works
-- prices a film by TYPE and buys it in many gauges — their register carries
-- LDPE in fourteen of them under one rate — so the gauge belongs to the
-- delivery rather than to the catalogue row.
--
-- Both nullable: ink, adhesive and solvent do not come on reels, and a film
-- delivery nobody measured is still a delivery.

ALTER TABLE "stock_batches"
  ADD COLUMN "width_mm" DECIMAL(10, 2),
  ADD COLUMN "micron"   DECIMAL(10, 2);
