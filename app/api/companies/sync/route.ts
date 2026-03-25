import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncAllCompaniesToSheets } from '@/lib/sheets-sync';
import { Company } from '@/lib/types';

// Full sync: wipe the sheet and rebuild it entirely from the database
export async function POST() {
  try {
    const rows = await prisma.company.findMany({ orderBy: { created_at: 'desc' } });

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: 'No companies to sync' });
    }

    // Map Prisma rows → Company type
    const companies: Company[] = rows.map(r => ({
      id: r.id,
      company_name: r.company_name,
      industry: r.industry || '',
      company_size: r.company_size || '',
      website: r.website || '',
      linkedin_company: r.linkedin_company || '',
      contact_name: r.contact_name || '',
      contact_position: r.contact_position || '',
      contact_linkedin: r.contact_linkedin || '',
      contact_info: r.contact_info || '',
      email_format: r.email_format || '',
      confirmed_emails: (r.confirmed_emails as string[]) || [],
      bounced_emails: (r.bounced_emails as string[]) || [],
      sponsorship_likelihood_score: r.sponsorship_likelihood_score || 0,
      previously_sponsored: r.previously_sponsored || false,
      previous_events: (r.previous_events as string[]) || [],
      what_they_sponsored: r.what_they_sponsored || '',
      why_good_fit: r.why_good_fit || '',
      notes: r.notes || '',
      relevant_links: (r.relevant_links as string[]) || [],
      outreach_status: (r.outreach_status as Company['outreach_status']) || 'not_started',
      draft: r.draft || false,
    }));

    const ok = await syncAllCompaniesToSheets(companies);

    return NextResponse.json({
      ok,
      synced: companies.length,
      message: ok
        ? `Synced ${companies.length} companies to Google Sheets`
        : 'Sync failed — check server logs',
    });
  } catch (error) {
    console.error('❌ Full sync error:', error);
    return NextResponse.json(
      { ok: false, error: 'Full sync failed', detail: String(error) },
      { status: 500 }
    );
  }
}
