-- Which quantity the printed quotation is for, 1-based.
--
-- The office prices a job at two or three quantities to see what volume does to
-- the margin; the customer is quoted one. Defaulted to 1 and NOT NULL, so every
-- existing row keeps showing the quantity it was written for and the column is
-- safe to add before the code that writes it is deployed.
ALTER TABLE "quotations"
  ADD COLUMN "selected_quantity" INTEGER NOT NULL DEFAULT 1;
