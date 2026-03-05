// API Route: Clear all companies
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { clearAllFromSheets } from '@/lib/sheets-sync';

export async function DELETE() {
  try {
    console.log('🗑️ DELETE /api/companies/clear - Clearing all companies');
    
    // Delete all from database
    const { count } = await prisma.company.deleteMany({});
    console.log(`✅ Deleted ${count} companies from database`);
    
    // Clear from Google Sheets
    try {
      await clearAllFromSheets();
      console.log('✅ Cleared all companies from spreadsheet');
    } catch (sheetsError) {
      console.error('⚠️ Failed to clear spreadsheet:', sheetsError);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `All ${count} companies deleted successfully`
    });
  } catch (error) {
    console.error('❌ Error clearing companies:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear companies' },
      { status: 500 }
    );
  }
}
