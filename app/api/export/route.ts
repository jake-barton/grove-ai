// API Route: Export companies to Google Sheets
import { NextRequest, NextResponse } from 'next/server';
import { exportToGoogleSheets, syncAllToGoogleSheets } from '@/lib/google-sheets';
import { prisma } from '@/lib/db';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { companyIds } = await request.json();

    let companies;
    if (companyIds && companyIds.length > 0) {
      companies = await prisma.company.findMany({ where: { id: { in: companyIds } } });
    } else {
      companies = await prisma.company.findMany({ orderBy: { created_at: 'desc' } });
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No companies found' },
        { status: 404 }
      );
    }

    const message = await exportToGoogleSheets(companies as never);

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('Export API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to export to Google Sheets' },
      { status: 500 }
    );
  }
}

// Sync all companies
export async function GET() {
  try {
    const companies = await prisma.company.findMany({ orderBy: { created_at: 'desc' } });

    if (!companies || companies.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No companies found' },
        { status: 404 }
      );
    }

    const message = await syncAllToGoogleSheets(companies as never);

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('Sync API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync to Google Sheets' },
      { status: 500 }
    );
  }
}
