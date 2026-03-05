// Script: migrate existing companies.json data into Prisma Postgres
import { PrismaClient } from '../lib/generated/prisma';
import fs from 'fs';
import path from 'path';

// Load env manually for scripts
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL,
});

async function main() {
  const dataPath = path.join(__dirname, '../data/companies.json');
  
  if (!fs.existsSync(dataPath)) {
    console.log('No companies.json found — nothing to migrate');
    return;
  }

  const companies = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Found ${companies.length} companies to migrate`);

  let migrated = 0;
  let skipped = 0;

  for (const c of companies) {
    try {
      await prisma.company.upsert({
        where: { company_name: c.company_name },
        update: {
          draft: c.draft ?? false,
          outreach_status: c.outreach_status || 'not_started',
          email_format: c.email_format || null,
          contact_name: c.contact_name || null,
          contact_position: c.contact_position || null,
          contact_info: c.contact_info || null,
          contact_linkedin: c.contact_linkedin || null,
          linkedin_company: c.linkedin_company || null,
          confirmed_emails: c.confirmed_emails || [],
          bounced_emails: c.bounced_emails || [],
          previously_sponsored: c.previously_sponsored || false,
          previous_events: c.previous_events || [],
          industry: c.industry || null,
          company_size: c.company_size || null,
          website: c.website || null,
          notes: c.notes || null,
          sponsorship_likelihood_score: c.sponsorship_likelihood_score || 5,
          approved_for_export: c.approved_for_export || false,
        },
        create: {
          company_name: c.company_name,
          draft: c.draft ?? false,
          outreach_status: c.outreach_status || 'not_started',
          email_format: c.email_format || null,
          contact_name: c.contact_name || null,
          contact_position: c.contact_position || null,
          contact_info: c.contact_info || null,
          contact_linkedin: c.contact_linkedin || null,
          linkedin_company: c.linkedin_company || null,
          confirmed_emails: c.confirmed_emails || [],
          bounced_emails: c.bounced_emails || [],
          previously_sponsored: c.previously_sponsored || false,
          previous_events: c.previous_events || [],
          industry: c.industry || null,
          company_size: c.company_size || null,
          website: c.website || null,
          notes: c.notes || null,
          sponsorship_likelihood_score: c.sponsorship_likelihood_score || 5,
          approved_for_export: c.approved_for_export || false,
        },
      });
      console.log(`  ✅ Migrated: ${c.company_name}`);
      migrated++;
    } catch (err) {
      console.error(`  ❌ Failed: ${c.company_name}`, err);
      skipped++;
    }
  }

  console.log(`\nDone! Migrated: ${migrated}, Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch(console.error);
