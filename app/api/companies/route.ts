// API Route: Company management — uses Prisma Postgres (cloud database)
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { researchCompany } from '@/lib/ai-agent';
import { syncCompanyToSheets, deleteCompanyFromSheets } from '@/lib/sheets-sync';
import { Company } from '@/lib/types';

// Map Prisma row → Company type
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

// GET /api/companies — return all companies
export async function GET() {
  try {
    const rows = await prisma.company.findMany({
      orderBy: { created_at: 'desc' },
    });
    return NextResponse.json({ success: true, data: rows.map(r => toCompany(r as unknown as Record<string, unknown>)) });
  } catch (error) {
    console.error('Get companies error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch companies' },
      { status: 500 }
    );
  }
}

// POST /api/companies — add a company (with optional AI research)
export async function POST(request: NextRequest) {
  try {
    const { companyName, autoResearch = true, companyData: providedData } = await request.json();

    console.log(`\n📥 POST /api/companies:`);
    console.log(`   Company: ${companyName}`);
    console.log(`   Auto-research: ${autoResearch}`);
    console.log(`   Has provided data: ${!!providedData}`);

    let companyData: Partial<Company>;

    if (providedData) {
      companyData = providedData;
    } else if (autoResearch) {
      console.log(`   🔬 Starting AI research...`);
      companyData = await researchCompany(companyName);
      console.log(`   ✅ Research complete`);
    } else {
      companyData = {
        company_name: companyName,
        draft: true,
        outreach_status: 'not_started',
        confirmed_emails: [],
        bounced_emails: [],
        previously_sponsored: false,
      };
    }

    const name = companyData.company_name || companyName;

    // Upsert by name (deduplication)
    const saved = await prisma.company.upsert({
      where: { company_name: name },
      update: {
        draft: companyData.draft ?? false,
        outreach_status: companyData.outreach_status || 'not_started',
        email_format: companyData.email_format || null,
        contact_name: companyData.contact_name || null,
        contact_position: companyData.contact_position || null,
        contact_info: companyData.contact_info || null,
        contact_linkedin: companyData.contact_linkedin || null,
        linkedin_company: companyData.linkedin_company || null,
        confirmed_emails: companyData.confirmed_emails || [],
        bounced_emails: companyData.bounced_emails || [],
        previously_sponsored: companyData.previously_sponsored || false,
        previous_events: companyData.previous_events || [],
        what_they_sponsored: companyData.what_they_sponsored || null,
        why_good_fit: companyData.why_good_fit || null,
        relevant_links: companyData.relevant_links || [],
        industry: companyData.industry || null,
        company_size: companyData.company_size || null,
        website: companyData.website || null,
        notes: companyData.notes || null,
        sponsorship_likelihood_score: companyData.sponsorship_likelihood_score || 5,
        approved_for_export: companyData.approved_for_export || false,
      },
      create: {
        company_name: name,
        draft: companyData.draft ?? false,
        outreach_status: companyData.outreach_status || 'not_started',
        email_format: companyData.email_format || null,
        contact_name: companyData.contact_name || null,
        contact_position: companyData.contact_position || null,
        contact_info: companyData.contact_info || null,
        contact_linkedin: companyData.contact_linkedin || null,
        linkedin_company: companyData.linkedin_company || null,
        confirmed_emails: companyData.confirmed_emails || [],
        bounced_emails: companyData.bounced_emails || [],
        previously_sponsored: companyData.previously_sponsored || false,
        previous_events: companyData.previous_events || [],
        what_they_sponsored: companyData.what_they_sponsored || null,
        why_good_fit: companyData.why_good_fit || null,
        relevant_links: companyData.relevant_links || [],
        industry: companyData.industry || null,
        company_size: companyData.company_size || null,
        website: companyData.website || null,
        notes: companyData.notes || null,
        sponsorship_likelihood_score: companyData.sponsorship_likelihood_score || 5,
        approved_for_export: companyData.approved_for_export || false,
      },
    });

    console.log(`   ✅ Saved to database! ID: ${saved.id}`);

    const company = toCompany(saved as unknown as Record<string, unknown>);

    // Sync to Google Sheets
    try {
      await syncCompanyToSheets(company);
      console.log(`   ✅ Synced to Google Sheets`);
    } catch (sheetError) {
      console.error('   ⚠️ Google Sheets sync error:', sheetError);
    }

    return NextResponse.json({ success: true, data: company });
  } catch (error) {
    console.error('Add company error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add company' },
      { status: 500 }
    );
  }
}

// PUT /api/companies — update a company by id
export async function PUT(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();

    const updated = await prisma.company.update({
      where: { id },
      data: { ...updates, updated_at: new Date() },
    });

    const company = toCompany(updated as unknown as Record<string, unknown>);
    try {
      await syncCompanyToSheets(company);
    } catch (sheetError) {
      console.error('⚠️ Google Sheets sync error on PUT:', sheetError);
    }

    return NextResponse.json({ success: true, data: company });
  } catch (error) {
    console.error('Update company error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update company' },
      { status: 500 }
    );
  }
}

// DELETE /api/companies?id=xxx — delete a company
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Company ID required' }, { status: 400 });
    }

    // Fetch name BEFORE deleting so sheets can find the row by company name
    const existing = await prisma.company.findUnique({ where: { id }, select: { company_name: true } });
    await prisma.company.delete({ where: { id } });

    if (existing?.company_name) {
      try {
        await deleteCompanyFromSheets(existing.company_name);
      } catch (sheetError) {
        console.error('⚠️ Google Sheets delete error:', sheetError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete company error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete company' },
      { status: 500 }
    );
  }
}
