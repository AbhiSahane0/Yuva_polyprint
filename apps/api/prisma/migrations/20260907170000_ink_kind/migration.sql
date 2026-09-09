-- CreateEnum
CREATE TYPE "InkKind" AS ENUM ('PROCESS', 'SPECIAL');

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "ink_kind" "InkKind";

