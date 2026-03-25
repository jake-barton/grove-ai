// Google Sheets integration for exporting sponsor data
import { google } from 'googleapis';
import { Company } from './types';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Column layout:
// A  Company Name
// B  Draft?           (checkbox)
// C  Outreach?        (checkbox)
// D  Email Format?    (checkbox)
// E  Contact          (Name — Position + LinkedIn URL as HYPERLINK)
// F  Confirmed Emails
// G  Bounced Emails
// H  Previously Sponsored Events  (dropdown from EventsList sheet)
// I  What They Sponsored
// J  Why Are They A Good Fit
// K  Relevant Notes
// L  Relevant Links

export const HEADERS = [
  'Company Name',
  'Draft?',
  'Outreach?',
  'Email Format?',
  'Contact',
  'Confirmed Emails',
  'Bounced Emails',
  'Previously Sponsored Events',
  'What They Sponsored',
  'Why Are They A Good Fit',
  'Relevant Notes',
  'Relevant Links',
];

// The hidden sheet that stores the canonical events dropdown list
export const EVENTS_SHEET_NAME = 'EventsList';

// Seed events — always included in the dropdown
export const SEED_EVENTS = [
  'Afrotech',
  'SXSW',
  'TechCrunch Disrupt',
  'Create and Cultivate',
  'Collision Conf',
  'Webflow Conf.',
  'Adobe Summit',
  'The Next Web',
  'VentureATL',
  'Render ATL',
  'LWT',
  'FastCo',
  'GirlBoss',
  'South Summit',
  'Unfinished',
  'AWS re:Invent',
  'AFROTECH',
  'Citizens Technology Conference',
  '3686',
];

// Chip color palette — each event name gets a consistent color by hashing its name
const CHIP_PALETTE = [
  { red: 0.91, green: 0.73, blue: 0.96 }, // lavender
  { red: 0.71, green: 0.93, blue: 0.80 }, // mint
  { red: 1.00, green: 0.88, blue: 0.60 }, // yellow
  { red: 0.68, green: 0.85, blue: 1.00 }, // sky blue
  { red: 1.00, green: 0.72, blue: 0.72 }, // salmon
  { red: 0.76, green: 0.76, blue: 1.00 }, // periwinkle
  { red: 1.00, green: 0.85, blue: 0.70 }, // peach
  { red: 0.72, green: 0.96, blue: 0.96 }, // teal
  { red: 0.85, green: 0.95, blue: 0.68 }, // lime
  { red: 1.00, green: 0.78, blue: 0.90 }, // pink
];

/** Deterministic color for an event name — same name always = same color */
export function eventColor(name: string): { red: number; green: number; blue: number } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CHIP_PALETTE[hash % CHIP_PALETTE.length];
}

/**
 * Build a ONE_OF_RANGE setDataValidation request pointing at the EventsList sheet.
 * Colored chips are driven by the background colors of the EventsList cells —
 * Sheets inherits those colors when rendering the dropdown chips.
 *
 * eventsSheetId   — numeric sheetId of the EventsList tab
 * eventCount      — number of event rows (not counting the header row in A1)
 */
export function buildEventDropdownRequest(
  _events: string[],
  sheetId: number,
  startRowIndex: number,
  endRowIndex: number,
  eventCount = 1,
): object {
  // Point at EventsList!A2:A{eventCount+1} (skip the header row)
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex, endRowIndex, startColumnIndex: 7, endColumnIndex: 8 },
      rule: {
        condition: {
          type: 'ONE_OF_RANGE',
          values: [{
            userEnteredValue: `=${EVENTS_SHEET_NAME}!$A$2:$A$${eventCount + 1}`,
          }],
        },
        strict: false,      // allow custom values typed in
        showCustomUi: true, // render as chips (colors come from EventsList cell backgrounds)
      },
    },
  };
}

/**
 * Build the updateCells requests to color every event row in the EventsList sheet.
 * Must be called AFTER the sheet exists and the event values have been written.
 * Returns an array of requests (one per event row).
 */
export function buildEventsSheetColorRequests(
  events: string[],
  eventsSheetId: number,
): object[] {
  // Row 0 is the header, events start at row 1
  return events.map((e, i) => ({
    repeatCell: {
      range: {
        sheetId: eventsSheetId,
        startRowIndex: i + 1,
        endRowIndex: i + 2,
        startColumnIndex: 0,
        endColumnIndex: 1,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: eventColor(e),
          textFormat: {
            foregroundColor: { red: 0.15, green: 0.15, blue: 0.15 },
            fontSize: 10,
            bold: false,
          },
          verticalAlignment: 'MIDDLE',
          horizontalAlignment: 'LEFT',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment)',
    },
  }));
}



function normalizePrivateKey(raw: string): string {
  let key = raw
    .replace(/\\n/g, '\n')
    .replace(/\n /g, '\n')
    .trim();
  if (!key.includes('\n')) {
    const match = key.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
    if (match) {
      const body = match[1].replace(/\s+/g, '');
      const chunks = body.match(/.{1,64}/g)?.join('\n') ?? body;
      key = `-----BEGIN PRIVATE KEY-----\n${chunks}\n-----END PRIVATE KEY-----`;
    }
  }
  return key;
}

function getGoogleSheetsClient() {
  const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  if (!rawKey || !clientEmail) {
    throw new Error('Google Sheets credentials not configured');
  }
  const privateKey = normalizePrivateKey(rawKey);
  const auth = new google.auth.JWT({ email: clientEmail, key: privateKey, scopes: SCOPES });
  return google.sheets({ version: 'v4', auth });
}

// Contact cell: name+position as the HYPERLINK label → LinkedIn.
// STRICT rule: return EITHER a =HYPERLINK() formula OR plain text — NEVER mix them.
export function buildContactCell(company: Company): string {
  const nameLine = company.contact_name
    ? company.contact_name + (company.contact_position ? ` — ${company.contact_position}` : '')
    : '';
  const url = company.contact_linkedin || company.contact_info || '';
  if (url && url.startsWith('http')) {
    const safeUrl = url.replace(/"/g, '%22');
    // If we have a name, use it as the label; otherwise show the URL text
    const safeLabel = (nameLine || url).replace(/"/g, "'");
    return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
  }
  // No URL — just plain text name (no formula at all)
  return nameLine || '';
}

// Relevant Links: STRICT one-formula-or-plain-text rule.
// If we have a website URL → single =HYPERLINK() formula (clickable blue link).
// If no website but other URLs → join as plain text (no formula).
// NEVER mix a formula with \n-appended text — that causes #ERROR!
export function buildLinksCell(company: Company): string {
  const extraUrls: string[] = [];
  if (company.linkedin_company?.startsWith('http')) extraUrls.push(company.linkedin_company);
  if (company.relevant_links) {
    company.relevant_links.filter(l => l?.startsWith('http')).forEach(l => extraUrls.push(l));
  }

  if (company.website?.startsWith('http')) {
    // Only a HYPERLINK formula — no concatenated plain text after it
    const safeUrl = company.website.replace(/"/g, '%22');
    const safeLabel = (company.company_name + ' Website').replace(/"/g, "'");
    return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
  }

  // No website — plain text URLs (no formula)
  return extraUrls.join('\n');
}

export async function exportToGoogleSheets(companies: Company[]): Promise<string> {
  try {
    const sheets = getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) throw new Error('Spreadsheet ID not configured');

    // ── Step 1: Ensure EventsList sheet exists ────────────────────────────────
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = spreadsheet.data.sheets ?? [];
    const mainSheet = allSheets.find(s => (s.properties?.index ?? 0) === 0);
    const mainSheetId = mainSheet?.properties?.sheetId ?? 0;
    const eventsSheet = allSheets.find(s => s.properties?.title === EVENTS_SHEET_NAME);
    let eventsSheetId: number;

    if (!eventsSheet) {
      const addRes = await sheets.spreadsheets.batchUpdate({
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
      console.log(`✅ Created "${EVENTS_SHEET_NAME}" sheet (id=${eventsSheetId})`);
    } else {
      eventsSheetId = eventsSheet.properties?.sheetId ?? 1;
    }

    // ── Step 2: Build merged events list (seed + all company events) ──────────
    const companyEvents = companies.flatMap(c => c.previous_events ?? []);
    const mergedEvents = Array.from(new Set([...SEED_EVENTS, ...companyEvents]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    // Write events list to EventsList!A column (header in A1)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${EVENTS_SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Event Name'], ...mergedEvents.map(e => [e])],
      },
    });

    // Color every EventsList row — this is what gives the chips their colors
    const eventsColorRequests = buildEventsSheetColorRequests(mergedEvents, eventsSheetId);
    if (eventsColorRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: eventsColorRequests },
      });
    }

    // ── Step 3: Build rows ────────────────────────────────────────────────────
    // Email Format?: only TRUE when email_format is a real pattern string,
    // not empty / "Not available" / "Not found" / "N/A"
    const INVALID_EMAIL_FORMAT = new Set(['', 'not available', 'not found', 'n/a', 'unknown']);
    const hasEmailFormat = (c: Company) =>
      !!c.email_format && !INVALID_EMAIL_FORMAT.has(c.email_format.trim().toLowerCase());

    const rows = companies.map((c) => [
      c.company_name,
      '',  // B — Draft?       written as boolValue via updateCells below
      '',  // C — Outreach?    written as boolValue via updateCells below
      '',  // D — Email Format? written as boolValue via updateCells below
      buildContactCell(c),
      c.confirmed_emails.join('\n'),
      c.bounced_emails.join('\n'),
      (c.previous_events ?? []).join(', '),
      c.what_they_sponsored || '',
      c.why_good_fit || '',
      c.notes || '',
      buildLinksCell(c),
    ]);

    const totalRows = rows.length + 1;

    // ── Step 4: Clear and write main sheet ────────────────────────────────────
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'A1:Z1000' });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS, ...rows] },
    });

    const requests: object[] = [];

    // ── Nuke ALL existing formatting (kills navy fill etc.) ───────────────────
    requests.push({
      repeatCell: {
        range: { sheetId: mainSheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 26 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 1 },
            textFormat: { bold: false, italic: false, foregroundColor: { red: 0, green: 0, blue: 0 } },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });

    // Header row: white bg, teal bold text
    requests.push({
      repeatCell: {
        range: { sheetId: mainSheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 1 },
            textFormat: {
              foregroundColor: { red: 0.18, green: 0.42, blue: 0.55 },
              bold: true,
              fontSize: 10,
            },
            horizontalAlignment: 'LEFT',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
      },
    });

    // Bottom border under header
    requests.push({
      updateBorders: {
        range: { sheetId: mainSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
        bottom: { style: 'SOLID_MEDIUM', color: { red: 0.18, green: 0.42, blue: 0.55 } },
      },
    });

    // Freeze header
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: mainSheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    });

    // Filter
    requests.push({
      setBasicFilter: {
        filter: {
          range: { sheetId: mainSheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: HEADERS.length },
        },
      },
    });

    // Checkboxes: B(1), C(2), D(3) — apply BOOLEAN validation so they render as checkboxes
    for (const col of [1, 2, 3]) {
      requests.push({
        repeatCell: {
          range: { sheetId: mainSheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: col, endColumnIndex: col + 1 },
          cell: { dataValidation: { condition: { type: 'BOOLEAN' }, strict: true } },
          fields: 'dataValidation',
        },
      });
    }

    // Write actual boolean values for checkbox columns so Sheets renders them correctly.
    // Writing 'TRUE'/'FALSE' strings with BOOLEAN validation is unreliable — boolValues are not.
    const boolRows = companies.map((c) => {
      const hasDraft    = c.draft === true;
      const hasOutreach = c.outreach_status !== 'not_started';
      const hasEmail    = hasEmailFormat(c);
      return {
        values: [
          { userEnteredValue: { boolValue: hasDraft    } }, // B
          { userEnteredValue: { boolValue: hasOutreach } }, // C
          { userEnteredValue: { boolValue: hasEmail    } }, // D
        ],
      };
    });
    requests.push({
      updateCells: {
        range: { sheetId: mainSheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 1, endColumnIndex: 4 },
        rows: boolRows,
        fields: 'userEnteredValue',
      },
    });

    // Data rows: white bg, dark text, top-align, wrap
    for (let i = 1; i < totalRows; i++) {
      requests.push({
        repeatCell: {
          range: { sheetId: mainSheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 1, green: 1, blue: 1 },
              textFormat: { foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 }, fontSize: 10 },
              verticalAlignment: 'TOP',
              wrapStrategy: 'WRAP',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)',
        },
      });
    }

    // ── Previously Sponsored Events column H (index 7) ───────────────────────
    // ONE_OF_RANGE pointing at EventsList!A2:A{n} — chips inherit cell background colors
    if (totalRows > 1) {
      requests.push(buildEventDropdownRequest(mergedEvents, mainSheetId, 1, totalRows, mergedEvents.length));
    }

    // Column widths — C widened so "Outreach?" doesn't wrap
    [180, 60, 90, 90, 240, 160, 130, 220, 220, 260, 260, 220].forEach((px, colIdx) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId: mainSheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
          properties: { pixelSize: px },
          fields: 'pixelSize',
        },
      });
    });

    // Header row height
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: mainSheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 40 },
        fields: 'pixelSize',
      },
    });

    // Data row heights
    if (totalRows > 1) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId: mainSheetId, dimension: 'ROWS', startIndex: 1, endIndex: totalRows },
          properties: { pixelSize: 60 },
          fields: 'pixelSize',
        },
      });
    }

    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    return `Successfully exported ${companies.length} companies to Google Sheets`;
  } catch (error) {
    console.error('Google Sheets export error:', error);
    throw new Error('Failed to export to Google Sheets');
  }
}

export async function appendCompanyToSheets(company: Company): Promise<void> {
  try {
    const sheets = getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) throw new Error('Spreadsheet ID not configured');

    const row = [
      company.company_name,
      company.draft ? 'TRUE' : 'FALSE',
      company.outreach_status !== 'not_started' ? 'TRUE' : 'FALSE',
      company.email_format ? 'TRUE' : 'FALSE',
      buildContactCell(company),
      company.confirmed_emails.join('\n'),
      company.bounced_emails.join('\n'),
      (company.previous_events ?? []).join(', '),
      company.what_they_sponsored || '',
      company.why_good_fit || '',
      company.notes || '',
      buildLinksCell(company),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A2:L2',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  } catch (error) {
    console.error('Google Sheets append error:', error);
    throw new Error('Failed to append company to Google Sheets');
  }
}

export async function syncAllToGoogleSheets(companies: Company[]): Promise<string> {
  return exportToGoogleSheets(companies);
}
