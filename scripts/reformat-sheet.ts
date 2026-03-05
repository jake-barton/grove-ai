/**
 * One-shot script: reformat the existing Google Sheet to match the reference style.
 * - Removes all background fills
 * - Header: white bg, teal-blue bold text, bottom border
 * - Data rows: white bg, near-black text, wrap, top-aligned
 * - Frozen header + filter preserved
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
const NUM_COLS = 12; // A–L

// Teal-blue for header text: #2E6B8C
const HEADER_TEXT = { red: 0.18, green: 0.42, blue: 0.55 };
const HEADER_BORDER = { red: 0.18, green: 0.42, blue: 0.55 };
const DATA_TEXT = { red: 0.2, green: 0.2, blue: 0.2 };
const WHITE = { red: 1, green: 1, blue: 1 };

// Event chip colours (same as main export)
const EVENT_COLORS = [
  { red: 0.8,  green: 0.6,  blue: 1.0  },
  { red: 0.6,  green: 0.9,  blue: 0.7  },
  { red: 1.0,  green: 0.8,  blue: 0.5  },
  { red: 0.5,  green: 0.8,  blue: 1.0  },
  { red: 1.0,  green: 0.6,  blue: 0.6  },
  { red: 0.9,  green: 0.9,  blue: 0.5  },
  { red: 0.6,  green: 0.7,  blue: 1.0  },
  { red: 0.8,  green: 1.0,  blue: 0.6  },
];

async function main() {
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;

  if (!privateKey || !clientEmail || !SPREADSHEET_ID) {
    console.error('❌ Missing GOOGLE_SHEETS_PRIVATE_KEY, GOOGLE_SHEETS_CLIENT_EMAIL or GOOGLE_SHEETS_SPREADSHEET_ID');
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Find out how many rows exist
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets?.[0];
  const totalRows = sheet?.properties?.gridProperties?.rowCount ?? 1000;
  const dataRows = Math.min(totalRows, 1000);

  console.log(`📊 Reformatting sheet (${dataRows} rows)…`);

  const requests: object[] = [];

  // 1. Clear ALL backgrounds and text colours across the whole sheet
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 0, endRowIndex: dataRows, startColumnIndex: 0, endColumnIndex: NUM_COLS },
      cell: {
        userEnteredFormat: {
          backgroundColor: WHITE,
          textFormat: { foregroundColor: DATA_TEXT, bold: false, fontSize: 10 },
          verticalAlignment: 'TOP',
          wrapStrategy: 'WRAP',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)',
    },
  });

  // 2. Header row: white bg, teal-blue bold text, left-aligned, middle-vertical
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
      cell: {
        userEnteredFormat: {
          backgroundColor: WHITE,
          textFormat: { foregroundColor: HEADER_TEXT, bold: true, fontSize: 10 },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'WRAP',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
    },
  });

  // 3. Bottom border on header
  requests.push({
    updateBorders: {
      range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
      bottom: { style: 'SOLID_MEDIUM', color: HEADER_BORDER },
    },
  });

  // 4. Freeze header row
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount',
    },
  });

  // 5. Re-apply filter
  requests.push({
    setBasicFilter: {
      filter: {
        range: { sheetId: 0, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: NUM_COLS },
      },
    },
  });

  // 6. Column H (index 7) — re-color any rows that have content (previously sponsored events)
  // Read existing values first
  const valuesRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'H2:H1000',
  });
  const eventValues = valuesRes.data.values ?? [];
  let eventColorIdx = 0;
  eventValues.forEach((row, i) => {
    const val = (row[0] ?? '').trim();
    if (val) {
      const color = EVENT_COLORS[eventColorIdx % EVENT_COLORS.length];
      eventColorIdx++;
      requests.push({
        repeatCell: {
          range: { sheetId: 0, startRowIndex: i + 1, endRowIndex: i + 2, startColumnIndex: 7, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: color,
              textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 } },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
        },
      });
    }
  });

  // 7. Column widths: A=180, B=60, C=70, D=90, E=260, F=160, G=130, H=220, I=220, J=260, K=260, L=220
  [180, 60, 70, 90, 260, 160, 130, 220, 220, 260, 260, 220].forEach((px, colIdx) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: 0, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
        properties: { pixelSize: px },
        fields: 'pixelSize',
      },
    });
  });

  // 8. Header row height
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: 0, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 35 },
      fields: 'pixelSize',
    },
  });

  // 9. Data row heights
  if (dataRows > 1) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: 0, dimension: 'ROWS', startIndex: 1, endIndex: dataRows },
        properties: { pixelSize: 60 },
        fields: 'pixelSize',
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
  console.log('✅ Sheet reformatted successfully!');
}

main().catch((err) => {
  console.error('❌ Error:', err.message ?? err);
  process.exit(1);
});
