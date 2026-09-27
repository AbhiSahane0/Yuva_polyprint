-- Planning: when an order runs, and on what machine.
--
-- The gate between an order and the floor. Two facts stored on the order and
-- nothing else: everything the planning board shows besides these — whether
-- the film is there, how long it will take, whether it can still make its
-- date — is worked out from what already exists.
--
-- Additive throughout. Nothing existing is altered or dropped.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "plan_note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "planned_at" TIMESTAMP(3),
ADD COLUMN     "planned_by" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "planned_machine_id" TEXT,
ADD COLUMN     "planned_start" DATE;

-- CreateIndex
CREATE INDEX "orders_planned_start_idx" ON "orders"("planned_start");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_planned_machine_id_fkey" FOREIGN KEY ("planned_machine_id") REFERENCES "costing_machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

