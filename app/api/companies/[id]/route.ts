import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { syncCompanyToSheets, deleteCompanyFromSheets } from '@/lib/sheets-sync';
import { Company } from '@/lib/types';

// Allow up to 60s for sync operations
export const maxDuration = 60;

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const updates = await request.json();
    console.log('PATCH /api/companies/' + id, updates);
    const updated = await prisma.company.update({
      where: { id },
      data: { ...updates, updated_at: new Date() },
    });
    const company = toCompany(updated as unknown as Record<string, unknown>);
    try { await syncCompanyToSheets(company); } catch (e) { console.error('Sheets sync error', e); }
    return NextResponse.json({ success: true, data: company });
  } catch (error) {
    console.error('PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update company' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    console.log('DELETE /api/companies/' + id);
    // Fetch the company name BEFORE deleting so we can remove it from sheets by name
    const existing = await prisma.company.findUnique({ where: { id }, select: { company_name: true } });
    await prisma.company.delete({ where: { id } });
    if (existing?.company_name) {
      try { await deleteCompanyFromSheets(existing.company_name); } catch (e) { console.error('Sheets delete error', e); }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete company' }, { status: 500 });
  }
}
