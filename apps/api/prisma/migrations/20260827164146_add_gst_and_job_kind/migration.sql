-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('ROLL', 'POUCH');

-- CreateEnum
CREATE TYPE "PouchType" AS ENUM ('STANDUP', 'STANDUP_ZIPPER', 'ZIPPER', 'SPOUT', 'CENTRE_SEAL', 'THREE_SIDE_SEAL', 'OTHER');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "gst_number" TEXT NOT NULL DEFAULT 'NA';

-- AlterTable
ALTER TABLE "quotation_items" ADD COLUMN     "job_kind" "JobKind" NOT NULL DEFAULT 'POUCH',
ADD COLUMN     "pouch_type" "PouchType",
ADD COLUMN     "pouch_type_note" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "gst_number" TEXT NOT NULL DEFAULT 'NA';
