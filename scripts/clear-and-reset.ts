import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { PrismaClient } from '../lib/generated/prisma';
import { google } from 'googleapis';

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL });

async function clearSheets() {
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!key || !email || !spreadsheetId) {
    console.log('⚠️  Google Sheets credentials missing, skipping sheet clear');
    return;
  }
  const auth = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });

  // Clear all values
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'A1:Z1000' });

  // Nuke all formatting (kills navy fill etc.)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 26 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 1 },
                textFormat: { bold: false, foregroundColor: { red: 0, green: 0, blue: 0 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
      ],
    },
  });
  console.log('✅ Google Sheet cleared and formatting reset');
}

async function main() {
  // 1. Delete all companies from DB
  const deleted = await prisma.company.deleteMany({});
  console.log(`✅ Deleted ${deleted.count} companies from database`);

  // 2. Clear the sheet
  await clearSheets();

  await prisma.$disconnect();
  console.log('\n🎉 Done! DB and sheet are clean. Go to http://localhost:3000 and run a fresh research session.');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
