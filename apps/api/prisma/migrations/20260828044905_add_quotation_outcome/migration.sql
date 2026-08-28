-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "decided_at" TIMESTAMP(3),
ADD COLUMN     "lost_reason" TEXT NOT NULL DEFAULT '';
