-- The customer's own answer: a link they can open, and what they did with it.

-- AlterEnum: a quotation the customer has accepted but the works has not yet
-- acted on. Added at the end — Postgres appends, and the order is only ever
-- read as a list.
ALTER TYPE "QuotationStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "QuotationResponseKind" AS ENUM ('ACCEPTED', 'DECLINED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE "quotation_links" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_responses" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "link_id" TEXT,
    "decision" "QuotationResponseKind" NOT NULL,
    "person_name" TEXT NOT NULL,
    "person_role" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "tier_id" TEXT,
    "ip_address" TEXT NOT NULL DEFAULT '',
    "user_agent" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotation_links_token_hash_key" ON "quotation_links"("token_hash");
CREATE INDEX "quotation_links_quotation_id_created_at_idx" ON "quotation_links"("quotation_id", "created_at");
CREATE INDEX "quotation_responses_quotation_id_created_at_idx" ON "quotation_responses"("quotation_id", "created_at");

-- AddForeignKey
ALTER TABLE "quotation_links" ADD CONSTRAINT "quotation_links_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_responses" ADD CONSTRAINT "quotation_responses_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_responses" ADD CONSTRAINT "quotation_responses_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "quotation_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_responses" ADD CONSTRAINT "quotation_responses_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "quotation_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
