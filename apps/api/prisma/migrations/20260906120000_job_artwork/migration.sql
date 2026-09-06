-- CreateEnum
CREATE TYPE "ArtworkKind" AS ENUM ('ARTWORK', 'PROOF', 'REFERENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ArtworkStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUPERSEDED', 'REMOVED');

-- CreateTable
CREATE TABLE "job_artwork" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "kind" "ArtworkKind" NOT NULL DEFAULT 'ARTWORK',
    "status" "ArtworkStatus" NOT NULL DEFAULT 'PENDING',
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "replaces_id" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "uploaded_by" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_artwork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_artwork_storage_key_key" ON "job_artwork"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "job_artwork_replaces_id_key" ON "job_artwork"("replaces_id");

-- CreateIndex
CREATE INDEX "job_artwork_job_id_status_idx" ON "job_artwork"("job_id", "status");

-- AddForeignKey
ALTER TABLE "job_artwork" ADD CONSTRAINT "job_artwork_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_artwork" ADD CONSTRAINT "job_artwork_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "job_artwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

