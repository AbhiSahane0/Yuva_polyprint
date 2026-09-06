-- What a delivery note said, before conversion to the stocked unit.
--
-- Film is bought by the tonne and stocked by the kilogram. `initial_quantity`
-- holds the kilograms, because that is what value, costing and every screen
-- measure in; these hold the 2 and the TON so a batch can be checked against the
-- paperwork it arrived with.
--
-- Both nullable: most deliveries arrive in the unit the material is stocked in,
-- and there is nothing to record. Safe ahead of the deploy for the same reason.

-- AlterTable
ALTER TABLE "stock_batches" ADD COLUMN     "purchase_quantity" DECIMAL(14,3),
ADD COLUMN     "purchase_unit" TEXT;

