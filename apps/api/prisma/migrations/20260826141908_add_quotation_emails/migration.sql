-- CreateTable
CREATE TABLE "quotation_emails" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "to" TEXT[],
    "cc" TEXT[],
    "subject" TEXT NOT NULL,
    "provider_id" TEXT,
    "sent_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotation_emails_quotation_id_created_at_idx" ON "quotation_emails"("quotation_id", "created_at");

-- AddForeignKey
ALTER TABLE "quotation_emails" ADD CONSTRAINT "quotation_emails_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
