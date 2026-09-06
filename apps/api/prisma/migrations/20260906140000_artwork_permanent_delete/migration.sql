-- AlterEnum
ALTER TYPE "ArtworkStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "job_artwork" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" TEXT,
ALTER COLUMN "storage_key" DROP NOT NULL;

