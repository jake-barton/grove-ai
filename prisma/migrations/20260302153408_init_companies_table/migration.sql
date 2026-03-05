-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "outreach_status" TEXT NOT NULL DEFAULT 'not_started',
    "email_format" TEXT,
    "contact_name" TEXT,
    "contact_position" TEXT,
    "contact_info" TEXT,
    "contact_linkedin" TEXT,
    "linkedin_company" TEXT,
    "confirmed_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bounced_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "previously_sponsored" BOOLEAN NOT NULL DEFAULT false,
    "previous_events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "industry" TEXT,
    "company_size" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "sponsorship_likelihood_score" INTEGER DEFAULT 5,
    "approved_for_export" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_company_name_key" ON "companies"("company_name");
