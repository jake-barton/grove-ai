// POST /api/companies/sync — bulk sync all DB companies to Google Sheets
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { syncAllCompaniesToSheets } from '@/lib/sheets-sync';
import { Company } from '@/lib/types';

function toCompany(row: Record<string, unknown>): Company {
  return {
    id: row.id as string,
    company_name: row.company_name as string,
    draft: row.draft as boolean,
    outreach_status: row.outreach_status as Company['outreach_status'],
    email_format: (row.email_format as string) || undefined,
    contact_name: (row.contact_name as string) || undefined,
    contact_position: (row.contact_position as string) || undefined,
    contact_info: (row.contact_info as string) || undefined,
    contact_linkedin: (row.contact_linkedin as string) || undefined,
    linkedin_company: (row.linkedin_company as string) || undefined,
    confirmed_emails: (row.confirmed_emails as string[]) || [],
    bounced_emails: (row.bounced_emails as string[]) || [],
    previously_sponsored: row.previously_sponsored as boolean,
    previous_events: (row.previous_events as string[]) || [],
    what_they_sponsored: (row.what_they_sponsored as string) || undefined,
    why_good_fit: (row.why_good_fit as string) || undefined,
    relevant_links: (row.relevant_links as string[]) || [],
    industry: (row.industry as string) || undefined,
    company_size: (row.company_size as string) || undefined,
    website: (row.website as string) || undefined,
    notes: (row.notes as string) || undefined,
    sponsorship_likelihood_score: (row.sponsorship_likelihood_score as number) || undefined,
    approved_for_export: (row.approved_for_export as boolean) || false,
    created_at: (row.created_at as Date)?.toISOString(),
    updated_at: (row.updated_at as Date)?.toISOString(),
  };
}

export async function POST() {
  try {
    const rows = await prisma.company.findMany({ orderBy: { created_at: 'asc' } });
    const companies = rows.map(r => toCompany(r as unknown as Record<string, unknown>));
    console.log(`🔄 Syncing ${companies.length} companies to Google Sheets...`);
    const ok = await syncAllCompaniesToSheets(companies);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Sheets sync failed — check server logs' }, { status: 500 });
    }
    return NextResponse.json({ success: true, synced: companies.length });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
