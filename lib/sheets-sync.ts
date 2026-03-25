// Google Sheets live sync — matches the new 12-column layout
import { google, sheets_v4 } from 'googleapis';
import { Company } from './types';
import { EVENTS_SHEET_NAME, SEED_EVENTS, buildEventDropdownRequest, buildEventsSheetColorRequests } from './google-sheets';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const NUM_COLS = 12; // A–L

// Email Format? — only TRUE when we have a real pattern string
const INVALID_EMAIL_FORMAT = new Set(['', 'not available', 'not found', 'n/a', 'unknown']);
const hasEmailFormat = (c: Company) =>
  !!c.email_format && !INVALID_EMAIL_FORMAT.has(c.email_format.trim().toLowerCase());

const HEADERS = [
  'Company Name',   // A
  'Draft?',         // B  checkbox
  'Outreach?',      // C  checkbox
  'Email Format?',  // D  checkbox
  'Contact',        // E  Name — Position + HYPERLINK to LinkedIn
  'Confirmed Emails', // F
  'Bounced Emails', // G
  'Previously Sponsored Events', // H  dropdown from EventsList sheet
  'What They Sponsored',         // I
  'Why Are They A Good Fit',     // J
  'Relevant Notes',              // K
  'Relevant Links',              // L  HYPERLINK
];

const HEADER_TEXT  = { red: 0.18, green: 0.42, blue: 0.55 };
const HEADER_BORDER = { red: 0.18, green: 0.42, blue: 0.55 };
const DATA_TEXT    = { red: 0.2,  green: 0.2,  blue: 0.2  };
const WHITE        = { red: 1,    green: 1,    blue: 1    };

let sheetsInstance: sheets_v4.Sheets | null = null;

async function getSheetsClient(): Promise<sheets_v4.Sheets | null> {
  if (sheetsInstance) return sheetsInstance;
  const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  if (!rawKey || !email) {
    console.warn('⚠️ Google Sheets credentials not configured. Sync disabled.');
    return null;
  }
  // Normalize the private key — Vercel can store it with literal \n or with spaces
  // replacing the newlines depending on how it was pasted. Handle all formats.
  let key = rawKey
    .replace(/\\n/g, '\n')   // literal backslash-n → real newline
    .replace(/\n /g, '\n')   // newline + space → just newline
    .trim();
  // If the key body has no newlines at all (pasted as one long line with spaces),
  // reformat it: header, 64-char chunks, footer
  if (!key.includes('\n')) {
    const match = key.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
    if (match) {
      const body = match[1].replace(/\s+/g, '');
      const chunks = body.match(/.{1,64}/g)?.join('\n') ?? body;
      key = `-----BEGIN PRIVATE KEY-----\n${chunks}\n-----END PRIVATE KEY-----`;
    }
  }
  const auth = new google.auth.JWT({ email, key, scopes: SCOPES });
  sheetsInstance = google.sheets({ version: 'v4', auth });
  console.log('✅ Google Sheets API initialized');
  return sheetsInstance;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build the Contact cell — HYPERLINK formula with name as label → their LinkedIn.
 *  STRICT: returns either a =HYPERLINK() formula OR plain text — never mixed. */
function buildContactCell(c: Company): string {
  const nameLine = c.contact_name
    ? c.contact_name + (c.contact_position ? ` — ${c.contact_position}` : '')
    : '';
  const url = c.contact_linkedin || c.contact_info || '';
  if (url && url.startsWith('http')) {
    const safeUrl = url.replace(/"/g, '%22');
    const safeLabel = (nameLine || url).replace(/"/g, "'");
    return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
  }
  return nameLine || '';
}

/** Build Relevant Links — STRICT one-formula-or-plain-text rule.
 *  HYPERLINK formula only when website exists. No mixing formula + \n plain text. */
function buildLinksCell(c: Company): string {
  const extraUrls: string[] = [];
  if (c.linkedin_company?.startsWith('http')) extraUrls.push(c.linkedin_company);
  if (c.relevant_links) c.relevant_links.filter(l => l?.startsWith('http')).forEach(l => extraUrls.push(l));

  if (c.website?.startsWith('http')) {
    const safeUrl = c.website.replace(/"/g, '%22');
    const safeLabel = (c.company_name + ' Website').replace(/"/g, "'");
    return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
  }
  return extraUrls.join('\n');
}

function buildRow(c: Company): string[] {
  return [
    c.company_name,
    c.draft ? 'TRUE' : 'FALSE',
    c.outreach_status !== 'not_started' ? 'TRUE' : 'FALSE',
    hasEmailFormat(c) ? 'TRUE' : 'FALSE',
    buildContactCell(c),
    c.confirmed_emails.join('\n'),
    c.bounced_emails.join('\n'),
    (c.previous_events ?? []).join(', '),
    c.what_they_sponsored || '',
    c.why_good_fit || '',
    c.notes || '',
    buildLinksCell(c),
  ];
}

// ── formatting helpers ────────────────────────────────────────────────────────

function headerFormatRequests(totalRows: number): object[] {
  const requests: object[] = [];

  // Header: white bg, teal bold text
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
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

  // Bottom border on header
  requests.push({
    updateBorders: {
      range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
      bottom: { style: 'SOLID_MEDIUM', color: HEADER_BORDER },
    },
  });

  // Freeze header
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount',
    },
  });

  // Filter
  requests.push({
    setBasicFilter: {
      filter: {
        range: { sheetId: 0, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: NUM_COLS },
      },
    },
  });

  return requests;
}

function rowFormatRequests(rowIndex: number, eventsSheetId: number, eventCount: number, mergedEvents: string[], company?: Company): object[] {
  const requests: object[] = [];

  // White bg, dark text, wrap, top-align for all columns
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
      cell: {
        userEnteredFormat: {
          backgroundColor: WHITE,
          textFormat: { foregroundColor: DATA_TEXT, fontSize: 10 },
          verticalAlignment: 'TOP',
          wrapStrategy: 'WRAP',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)',
    },
  });

  // Checkboxes: B(1), C(2), D(3) — apply BOOLEAN validation so they render as checkboxes
  for (const col of [1, 2, 3]) {
    requests.push({
      repeatCell: {
        range: { sheetId: 0, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: col, endColumnIndex: col + 1 },
        cell: { dataValidation: { condition: { type: 'BOOLEAN' }, strict: true } },
        fields: 'dataValidation',
      },
    });
  }

  // Write actual boolean values so checkboxes render correctly (strings are unreliable)
  if (company) {
    requests.push({
      updateCells: {
        range: { sheetId: 0, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 1, endColumnIndex: 4 },
        rows: [{
          values: [
            { userEnteredValue: { boolValue: company.draft === true } },
            { userEnteredValue: { boolValue: company.outreach_status !== 'not_started' } },
            { userEnteredValue: { boolValue: hasEmailFormat(company) } },
          ],
        }],
        fields: 'userEnteredValue',
      },
    });
  }

  // Events column H (index 7): ONE_OF_RANGE pointing at EventsList sheet
  requests.push(buildEventDropdownRequest(mergedEvents, 0, rowIndex, rowIndex + 1, eventCount));

  // Row height
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: 0, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
      properties: { pixelSize: 60 },
      fields: 'pixelSize',
    },
  });

  return requests;
}

function columnWidthRequests(): object[] {
  // C (index 2) widened from 70 → 90 so "Outreach?" doesn't wrap
  return [180, 60, 90, 90, 260, 160, 130, 220, 220, 260, 260, 220].map((px, colIdx) => ({
    updateDimensionProperties: {
      range: { sheetId: 0, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
      properties: { pixelSize: px },
      fields: 'pixelSize',
    },
  }));
}

// ── public API ────────────────────────────────────────────────────────────────

export async function getOrCreateSpreadsheet(): Promise<string | null> {
  const api = await getSheetsClient();
  if (!api) return null;

  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) return null;

  try {
    await api.spreadsheets.get({ spreadsheetId });
    console.log(`✅ Using existing spreadsheet: ${spreadsheetId}`);
    return spreadsheetId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('❌ Spreadsheet not accessible:', msg);
    return msg; // return the error string so callers can surface it
  }
}

/** Ensure EventsList sheet exists; merge seed + new events; return { sheetId, count } */
async function ensureEventsSheet(
  api: sheets_v4.Sheets,
  spreadsheetId: string,
  newEvents: string[] = [],
): Promise<{ eventsSheetId: number; eventCount: number; mergedEvents: string[] }> {
  const spreadsheet = await api.spreadsheets.get({ spreadsheetId });
  const allSheets = spreadsheet.data.sheets ?? [];
  const eventsSheet = allSheets.find(s => s.properties?.title === EVENTS_SHEET_NAME);
  let eventsSheetId: number;

  if (!eventsSheet) {
    const addRes = await api.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: EVENTS_SHEET_NAME,
              gridProperties: { hideGridlines: true },
              tabColor: { red: 0.18, green: 0.42, blue: 0.55 },
            },
          },
        }],
      },
    });
    eventsSheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 1;
    console.log(`✅ Created "${EVENTS_SHEET_NAME}" sheet`);
  } else {
    eventsSheetId = eventsSheet.properties?.sheetId ?? 1;
  }

  // Read existing events from the sheet
  const existing = await api.spreadsheets.values.get({
    spreadsheetId,
    range: `${EVENTS_SHEET_NAME}!A2:A1000`,
  });
  const existingEvents = existing.data.values?.map(r => String(r[0] ?? '').trim()).filter(Boolean) ?? [];

  // Merge: seed + existing + new (deduplicated, sorted)
  const merged = Array.from(new Set([...SEED_EVENTS, ...existingEvents, ...newEvents]))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  await api.spreadsheets.values.update({
    spreadsheetId,
    range: `${EVENTS_SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [['Event Name'], ...merged.map(e => [e])] },
  });

  // Color the EventsList rows — this is what drives chip colors in the dropdown
  const colorRequests = buildEventsSheetColorRequests(merged, eventsSheetId);
  if (colorRequests.length > 0) {
    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: colorRequests } });
  }

  return { eventsSheetId, eventCount: merged.length, mergedEvents: merged };
}

/** Sync a single company — add or update its row, apply formatting */
export async function syncCompanyToSheets(company: Company): Promise<boolean> {
  const api = await getSheetsClient();
  if (!api) return false;

  const spreadsheetId = await getOrCreateSpreadsheet();
  if (!spreadsheetId) return false;

  try {
    // ── Ensure EventsList sheet is up to date with this company's events ─────
    const { eventCount, mergedEvents } = await ensureEventsSheet(api, spreadsheetId, company.previous_events ?? []);
    const eventsSheetId = 0;

    // Read column A to find header + existing company rows
    const existing = await api.spreadsheets.values.get({ spreadsheetId, range: 'A:A' });
    const colA = existing.data.values?.map((r) => String(r[0] ?? '')) ?? [];

    // ── Ensure header row exists ──────────────────────────────────────────────
    const headerMissing = colA.length === 0 || colA[0] !== 'Company Name';
    if (headerMissing) {
      await api.spreadsheets.values.update({
        spreadsheetId,
        range: 'A1:L1',
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
      const headerFmt = headerFormatRequests(2);
      await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: headerFmt } });
      const fresh = await api.spreadsheets.values.get({ spreadsheetId, range: 'A:A' });
      colA.length = 0;
      (fresh.data.values ?? []).forEach((r) => colA.push(String(r[0] ?? '')));
      console.log('✅ Header row written to spreadsheet');
    }

    // ── Find existing row by company name (skip row 0 = header) ──────────────
    const rowIdx = colA.findIndex((n, i) => i > 0 && n === company.company_name);

    const row = buildRow(company);
    const totalDataRows = colA.length;

    if (rowIdx > 0) {
      // ── UPDATE existing row in place ────────────────────────────────────────
      await api.spreadsheets.values.update({
        spreadsheetId,
        range: `A${rowIdx + 1}:L${rowIdx + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });
      const fmtRequests = rowFormatRequests(rowIdx, eventsSheetId, eventCount, mergedEvents, company);
      await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: fmtRequests } });
      console.log(`✅ Updated ${company.company_name} in spreadsheet (row ${rowIdx + 1})`);
    } else {
      // ── APPEND new row at the bottom ────────────────────────────────────────
      const appendRes = await api.spreadsheets.values.append({
        spreadsheetId,
        range: 'A2:L2',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });

      const updatedRange = appendRes.data.updates?.updatedRange ?? '';
      const match = updatedRange.match(/[A-Z](\d+)/);
      const newRowNumber = match ? parseInt(match[1]) : totalDataRows + 1;
      const newRowIndex = newRowNumber - 1;

      const fmtRequests = [
        ...rowFormatRequests(newRowIndex, eventsSheetId, eventCount, mergedEvents, company),
        ...columnWidthRequests(),
        ...headerFormatRequests(newRowNumber),
      ];
      await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: fmtRequests } });
      console.log(`✅ Added ${company.company_name} to spreadsheet (row ${newRowNumber})`);
    }

    return true;
  } catch (error) {
    console.error(`❌ Error syncing ${company.company_name}:`, error);
    return false;
  }
}

/** Delete a company row by company name */
export async function deleteCompanyFromSheets(companyName: string): Promise<boolean> {
  const api = await getSheetsClient();
  if (!api) return false;
  const spreadsheetId = await getOrCreateSpreadsheet();
  if (!spreadsheetId) return false;

  try {
    const existing = await api.spreadsheets.values.get({ spreadsheetId, range: 'A:A' });
    const names = existing.data.values?.map((r) => String(r[0] ?? '')) ?? [];
    // Exact match first, then case-insensitive partial match
    let rowIdx = names.findIndex((n, i) => i > 0 && n === companyName);
    if (rowIdx < 0) rowIdx = names.findIndex((n, i) => i > 0 && n.toLowerCase().includes(companyName.toLowerCase()));

    if (rowIdx >= 0) {
      await api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: { sheetId: 0, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 },
            },
          }],
        },
      });
      console.log(`✅ Deleted row ${rowIdx + 1} (${companyName}) from spreadsheet`);
      return true;
    }
    console.warn(`⚠️ Could not find "${companyName}" in spreadsheet to delete`);
    return false;
  } catch (error) {
    console.error(`❌ Error deleting from sheets:`, error);
    return false;
  }
}

/** Clear all data rows (keep header) */
export async function clearAllFromSheets(): Promise<boolean> {
  const api = await getSheetsClient();
  if (!api) return false;
  const spreadsheetId = await getOrCreateSpreadsheet();
  if (!spreadsheetId) return false;

  try {
    await api.spreadsheets.values.clear({ spreadsheetId, range: 'A2:L1000' });
    console.log('✅ Cleared all companies from spreadsheet');
    return true;
  } catch (error) {
    console.error('❌ Error clearing spreadsheet:', error);
    return false;
  }
}

/** Bulk sync (used by clear/route) */
export async function syncAllCompaniesToSheets(companies: Company[]): Promise<boolean | string> {
  const api = await getSheetsClient();
  if (!api) return 'NO_CREDENTIALS';
  const spreadsheetId = await getOrCreateSpreadsheet();
  // getOrCreateSpreadsheet returns the ID on success, or an error string / null on failure
  if (!spreadsheetId || spreadsheetId.length > 100) return spreadsheetId ?? 'NO_SPREADSHEET_ID';

  try {
    // ── Ensure EventsList sheet is up to date ─────────────────────────────────
    const allNewEvents = companies.flatMap(c => c.previous_events ?? []);
    const { eventCount, mergedEvents } = await ensureEventsSheet(api, spreadsheetId, allNewEvents);

    await api.spreadsheets.values.clear({ spreadsheetId, range: 'A1:Z1000' });

    const rows = companies.map(buildRow);
    await api.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS, ...rows] },
    });

    const totalRows = rows.length + 1;
    const requests: object[] = [
      // Nuke all formatting first (kills any navy fill)
      {
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 26 },
          cell: {
            userEnteredFormat: {
              backgroundColor: WHITE,
              textFormat: { bold: false, italic: false, foregroundColor: DATA_TEXT },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
      ...headerFormatRequests(totalRows),
      ...columnWidthRequests(),
    ];

    companies.forEach((c, i) => {
      const rowIndex = i + 1;
      requests.push(...rowFormatRequests(rowIndex, 0, eventCount, mergedEvents, c));
    });

    requests.push({
      updateDimensionProperties: {
        range: { sheetId: 0, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 35 },
        fields: 'pixelSize',
      },
    });

    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    console.log(`✅ Synced ${companies.length} companies to spreadsheet`);
    return true;
  } catch (error) {
    console.error('❌ Error syncing all companies:', error);
    return String(error);
  }
}
