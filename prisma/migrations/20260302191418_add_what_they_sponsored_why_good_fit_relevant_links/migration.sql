-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "relevant_links" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "what_they_sponsored" TEXT,
ADD COLUMN     "why_good_fit" TEXT;
