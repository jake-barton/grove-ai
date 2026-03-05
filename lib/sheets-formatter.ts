/**
 * Advanced Google Sheets Formatting
 * AI interprets any natural language request and maps it to real Sheets API operations.
 *
 * COLUMN MAP (0-indexed):
 *  0  ID
 *  1  Company Name
 *  2  Industry
 *  3  Company Size
 *  4  Website
 *  5  LinkedIn Company
 *  6  Contact Name
 *  7  Contact Position
 *  8  Contact LinkedIn
 *  9  Contact Email
 *  10 Email Format
 *  11 Previously Sponsored
 *  12 Sponsorship Score
 *  13 Status
 *  14 Notes
 *  15 Created At
 *  16 Updated At
 */

import { google } from 'googleapis';
import { generateWithSystemPrompt } from '@/lib/openai';

// ─── Column reference ────────────────────────────────────────────────────────
export const COLUMN_MAP: Record<string, number> = {
  id: 0,
  'company name': 1,
  company: 1,
  industry: 2,
  'company size': 3,
  size: 3,
  website: 4,
  'linkedin company': 5,
  'company linkedin': 5,
  'contact name': 6,
  contact: 6,
  'contact position': 7,
  position: 7,
  title: 7,
  'contact linkedin': 8,
  'contact email': 9,
  email: 9,
  'email format': 10,
  'previously sponsored': 11,
  sponsored: 11,
  'sponsorship score': 12,
  score: 12,
  status: 13,
  notes: 14,
  'created at': 15,
  'updated at': 16,
};

// Total number of data columns
const TOTAL_COLUMNS = 17;

// ─── Colour helpers ──────────────────────────────────────────────────────────
function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { red: 1, green: 1, blue: 1 };
  return {
    red: parseInt(result[1], 16) / 255,
    green: parseInt(result[2], 16) / 255,
    blue: parseInt(result[3], 16) / 255,
  };
}

const NAMED_COLORS: Record<string, string> = {
  red: '#FF0000', blue: '#4472C4', green: '#34A853', yellow: '#FBBC04',
  orange: '#FF6D00', purple: '#7B1FA2', pink: '#E91E63', teal: '#00897B',
  grey: '#9E9E9E', gray: '#9E9E9E', white: '#FFFFFF', black: '#212121',
  'light blue': '#BBDEFB', 'light green': '#C8E6C9', 'light yellow': '#FFF9C4',
  'light grey': '#F5F5F5', 'light gray': '#F5F5F5',
  'dark blue': '#1A237E', 'dark green': '#1B5E20', 'dark red': '#B71C1C',
};

function resolveColor(colorName: string): string {
  const lower = colorName.toLowerCase().trim();
  return NAMED_COLORS[lower] || (lower.startsWith('#') ? lower : '#4472C4');
}

// ─── Initialise Sheets API ───────────────────────────────────────────────────
async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID not configured');
  return { sheets, spreadsheetId };
}

// ─── Individual action executors ─────────────────────────────────────────────

async function execAlternateRowColors(evenColor = '#F8F9FA', oddColor = '#FFFFFF') {
  const { sheets, spreadsheetId } = await getSheetsClient();
  // Clear any existing conditional format rules first to avoid stacking
  const existing = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetData = existing.data.sheets?.[0];
  const existingRules = sheetData?.conditionalFormats || [];

  // Must delete in reverse order; simplest approach: delete index 0 repeatedly
  for (let i = 0; i < existingRules.length; i++) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ deleteConditionalFormatRule: { sheetId: 0, index: 0 } }],
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId: 0, startRowIndex: 1 }],
              booleanRule: {
                condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=ISODD(ROW())' }] },
                format: { backgroundColor: hexToRgb(oddColor) },
              },
            },
            index: 0,
          },
        },
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId: 0, startRowIndex: 1 }],
              booleanRule: {
                condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=ISEVEN(ROW())' }] },
                format: { backgroundColor: hexToRgb(evenColor) },
              },
            },
            index: 1,
          },
        },
      ],
    },
  });
}

async function execResizeColumns() {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        autoResizeDimensions: {
          dimensions: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: TOTAL_COLUMNS },
        },
      }],
    },
  });
}

async function execAddFilter() {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        setBasicFilter: {
          filter: { range: { sheetId: 0, startRowIndex: 0 } },
        },
      }],
    },
  });
}

async function execFreezeColumns(columnCount: number) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: 0, gridProperties: { frozenColumnCount: columnCount } },
          fields: 'gridProperties.frozenColumnCount',
        },
      }],
    },
  });
}

async function execFreezeRows(rowCount: number) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: 0, gridProperties: { frozenRowCount: rowCount } },
          fields: 'gridProperties.frozenRowCount',
        },
      }],
    },
  });
}

async function execSortByColumn(columnIndex: number, ascending: boolean) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        sortRange: {
          range: { sheetId: 0, startRowIndex: 1 },
          sortSpecs: [{ dimensionIndex: columnIndex, sortOrder: ascending ? 'ASCENDING' : 'DESCENDING' }],
        },
      }],
    },
  });
}

async function execColorColumn(columnIndex: number, hexColor: string) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId: 0, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
          cell: { userEnteredFormat: { backgroundColor: hexToRgb(hexColor) } },
          fields: 'userEnteredFormat.backgroundColor',
        },
      }],
    },
  });
}

async function execColorHeader(hexColor: string, textColor = '#FFFFFF') {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: hexToRgb(hexColor),
              textFormat: { foregroundColor: hexToRgb(textColor), bold: true },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      }],
    },
  });
}

async function execBoldColumn(columnIndex: number) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId: 0, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      }],
    },
  });
}

async function execHighlightByScore(threshold: number, hexColor: string) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  // Column 12 (M) is Sponsorship Score
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: 0, startRowIndex: 1 }],
            booleanRule: {
              condition: {
                type: 'NUMBER_GREATER_THAN_EQ',
                values: [{ userEnteredValue: String(threshold) }],
              },
              format: { backgroundColor: hexToRgb(hexColor) },
            },
          },
          index: 0,
        },
      }],
    },
  });
}

async function execSetColumnWidth(columnIndex: number, pixelWidth: number) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateDimensionProperties: {
          range: { sheetId: 0, dimension: 'COLUMNS', startIndex: columnIndex, endIndex: columnIndex + 1 },
          properties: { pixelSize: pixelWidth },
          fields: 'pixelSize',
        },
      }],
    },
  });
}

async function execHideColumn(columnIndex: number) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateDimensionProperties: {
          range: { sheetId: 0, dimension: 'COLUMNS', startIndex: columnIndex, endIndex: columnIndex + 1 },
          properties: { hiddenByUser: true },
          fields: 'hiddenByUser',
        },
      }],
    },
  });
}

async function execShowAllColumns() {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateDimensionProperties: {
          range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: TOTAL_COLUMNS },
          properties: { hiddenByUser: false },
          fields: 'hiddenByUser',
        },
      }],
    },
  });
}

async function execWrapText(columnIndex?: number) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  const range = columnIndex !== undefined
    ? { sheetId: 0, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 }
    : { sheetId: 0 };
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range,
          cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
          fields: 'userEnteredFormat.wrapStrategy',
        },
      }],
    },
  });
}

async function execSetFontSize(size: number, headerOnly = false) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  const range = headerOnly
    ? { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }
    : { sheetId: 0 };
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range,
          cell: { userEnteredFormat: { textFormat: { fontSize: size } } },
          fields: 'userEnteredFormat.textFormat.fontSize',
        },
      }],
    },
  });
}

// ─── AI-powered interpretation ───────────────────────────────────────────────

const SHEETS_SYSTEM_PROMPT = `You are an expert Google Sheets assistant for a sponsor research tool called Sloss.Tech.

The spreadsheet has these columns (0-indexed):
0: ID | 1: Company Name | 2: Industry | 3: Company Size | 4: Website
5: LinkedIn Company | 6: Contact Name | 7: Contact Position | 8: Contact LinkedIn
9: Contact Email | 10: Email Format | 11: Previously Sponsored | 12: Sponsorship Score
13: Status | 14: Notes | 15: Created At | 16: Updated At

Your job: interpret any natural language request about the spreadsheet and return a JSON array of actions to execute.

Available actions:
- { "action": "alternate_row_colors", "evenColor": "#hex", "oddColor": "#hex" }
- { "action": "resize_columns" }
- { "action": "add_filter" }
- { "action": "freeze_columns", "count": number }
- { "action": "freeze_rows", "count": number }
- { "action": "sort_by_column", "columnIndex": number, "ascending": boolean }
- { "action": "color_column", "columnIndex": number, "color": "#hex" }
- { "action": "color_header", "color": "#hex", "textColor": "#hex" }
- { "action": "bold_column", "columnIndex": number }
- { "action": "highlight_by_score", "threshold": number, "color": "#hex" }
- { "action": "set_column_width", "columnIndex": number, "pixels": number }
- { "action": "hide_column", "columnIndex": number }
- { "action": "show_all_columns" }
- { "action": "wrap_text", "columnIndex": number | null }
- { "action": "set_font_size", "size": number, "headerOnly": boolean }

Rules:
- Always return ONLY a JSON array, no explanation, no markdown fences.
- For colour names like "blue", "red", "green" etc, convert to appropriate hex codes.
- For "professional" or "clean" requests, return a combo: alternate_row_colors + resize_columns + add_filter + freeze_columns(2) + color_header.
- For "highlight top companies" or "highlight high scores", use highlight_by_score with threshold 7 and a green color.
- If the user says "sort by score", use columnIndex 12.
- If the user says "sort by company", use columnIndex 1.
- If the user says "sort by status", use columnIndex 13.
- For "make the header blue", use color_header with an appropriate blue.
- For "make notes column wider", use set_column_width for columnIndex 14 with pixels 300.
- For "hide ID column" or "hide the first column", use hide_column for columnIndex 0.
- For "wrap text in notes", use wrap_text with columnIndex 14.
- Always be generous in interpretation — if unsure, pick the most useful action.

Example output for "make it look professional":
[
  {"action":"alternate_row_colors","evenColor":"#F8F9FA","oddColor":"#FFFFFF"},
  {"action":"color_header","color":"#1E3A5F","textColor":"#FFFFFF"},
  {"action":"resize_columns"},
  {"action":"add_filter"},
  {"action":"freeze_columns","count":2}
]`;

interface SheetAction {
  action: string;
  evenColor?: string;
  oddColor?: string;
  color?: string;
  textColor?: string;
  count?: number;
  columnIndex?: number;
  ascending?: boolean;
  threshold?: number;
  pixels?: number;
  size?: number;
  headerOnly?: boolean;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function handleNaturalLanguageFormat(
  prompt: string
): Promise<{ success: boolean; message: string }> {
  console.log(`🤖 AI sheets interpreter: "${prompt}"`);

  let actions: SheetAction[] = [];

  try {
    // Ask the AI to interpret the request
    const aiRaw = await generateWithSystemPrompt(
      SHEETS_SYSTEM_PROMPT,
      `User request: "${prompt}"\n\nReturn a JSON array of spreadsheet actions.`,
    );

    // Strip markdown fences if present
    const cleaned = aiRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in AI response');
    actions = JSON.parse(jsonMatch[0]);
    console.log(`🎯 AI produced ${actions.length} sheet action(s):`, actions);
  } catch (err) {
    console.warn('⚠️ AI interpretation failed, falling back to keyword matching:', err);
    actions = keywordFallback(prompt);
  }

  if (actions.length === 0) {
    return { success: false, message: 'Could not understand the formatting request. Try something like "make it professional", "add alternating row colors", "sort by score", or "highlight top companies".' };
  }

  const applied: string[] = [];
  const errors: string[] = [];

  for (const a of actions) {
    try {
      switch (a.action) {
        case 'alternate_row_colors':
          await execAlternateRowColors(a.evenColor, a.oddColor);
          applied.push('alternating row colors');
          break;
        case 'resize_columns':
          await execResizeColumns();
          applied.push('auto-resized columns');
          break;
        case 'add_filter':
          await execAddFilter();
          applied.push('filter row');
          break;
        case 'freeze_columns':
          await execFreezeColumns(a.count ?? 2);
          applied.push(`froze ${a.count ?? 2} column(s)`);
          break;
        case 'freeze_rows':
          await execFreezeRows(a.count ?? 1);
          applied.push(`froze ${a.count ?? 1} row(s)`);
          break;
        case 'sort_by_column':
          await execSortByColumn(a.columnIndex ?? 1, a.ascending !== false);
          applied.push(`sorted by column ${a.columnIndex ?? 1} (${a.ascending !== false ? 'A→Z' : 'Z→A'})`);
          break;
        case 'color_column':
          await execColorColumn(a.columnIndex ?? 0, resolveColor(a.color ?? '#4472C4'));
          applied.push(`coloured column ${a.columnIndex}`);
          break;
        case 'color_header':
          await execColorHeader(resolveColor(a.color ?? '#1E3A5F'), resolveColor(a.textColor ?? '#FFFFFF'));
          applied.push('header colour');
          break;
        case 'bold_column':
          await execBoldColumn(a.columnIndex ?? 1);
          applied.push(`bolded column ${a.columnIndex}`);
          break;
        case 'highlight_by_score':
          await execHighlightByScore(a.threshold ?? 7, resolveColor(a.color ?? '#C8E6C9'));
          applied.push(`highlighted rows with score ≥ ${a.threshold ?? 7}`);
          break;
        case 'set_column_width':
          await execSetColumnWidth(a.columnIndex ?? 1, a.pixels ?? 200);
          applied.push(`set column ${a.columnIndex} width to ${a.pixels}px`);
          break;
        case 'hide_column':
          await execHideColumn(a.columnIndex ?? 0);
          applied.push(`hid column ${a.columnIndex}`);
          break;
        case 'show_all_columns':
          await execShowAllColumns();
          applied.push('showed all columns');
          break;
        case 'wrap_text':
          await execWrapText(a.columnIndex ?? undefined);
          applied.push(a.columnIndex !== undefined ? `wrapped text in column ${a.columnIndex}` : 'wrapped text in all columns');
          break;
        case 'set_font_size':
          await execSetFontSize(a.size ?? 11, a.headerOnly ?? false);
          applied.push(`set font size to ${a.size}`);
          break;
        default:
          console.warn(`Unknown sheet action: ${a.action}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Sheet action "${a.action}" failed:`, msg);
      errors.push(`${a.action}: ${msg}`);
    }
  }

  if (applied.length === 0) {
    return {
      success: false,
      message: `Failed to apply changes. ${errors.join('; ')}`,
    };
  }

  const summary = applied.join(', ');
  const warning = errors.length > 0 ? ` (${errors.length} step(s) failed: ${errors.join('; ')})` : '';
  return {
    success: true,
    message: `Applied: ${summary}${warning}`,
  };
}

// ─── Keyword fallback (no AI call needed for obvious cases) ──────────────────
function keywordFallback(prompt: string): SheetAction[] {
  const p = prompt.toLowerCase();
  const actions: SheetAction[] = [];

  if (p.includes('professional') || p.includes('clean') || p.includes('nice') || p.includes('look good') || p.includes('prettier')) {
    return [
      { action: 'alternate_row_colors', evenColor: '#F8F9FA', oddColor: '#FFFFFF' },
      { action: 'color_header', color: '#1E3A5F', textColor: '#FFFFFF' },
      { action: 'resize_columns' },
      { action: 'add_filter' },
      { action: 'freeze_columns', count: 2 },
    ];
  }
  if (p.includes('alternate') || p.includes('zebra') || p.includes('stripe') || p.includes('every other'))
    actions.push({ action: 'alternate_row_colors', evenColor: '#F8F9FA', oddColor: '#FFFFFF' });
  if (p.includes('resize') || p.includes('fit') || p.includes('auto size') || p.includes('column width'))
    actions.push({ action: 'resize_columns' });
  if (p.includes('filter'))
    actions.push({ action: 'add_filter' });
  if (p.includes('freeze') || p.includes('lock column') || p.includes('pin column')) {
    const m = p.match(/(\d+)\s*column/);
    actions.push({ action: 'freeze_columns', count: m ? parseInt(m[1]) : 2 });
  }
  if ((p.includes('sort') || p.includes('order')) && (p.includes('score') || p.includes('likelihood')))
    actions.push({ action: 'sort_by_column', columnIndex: 12, ascending: false });
  else if (p.includes('sort') || p.includes('order'))
    actions.push({ action: 'sort_by_column', columnIndex: 1, ascending: true });
  if (p.includes('highlight') || p.includes('top companies') || p.includes('high score'))
    actions.push({ action: 'highlight_by_score', threshold: 7, color: '#C8E6C9' });
  if (p.includes('wrap'))
    actions.push({ action: 'wrap_text' });
  if (p.includes('header') && (p.includes('color') || p.includes('colour') || p.includes('blue') || p.includes('dark')))
    actions.push({ action: 'color_header', color: '#1E3A5F', textColor: '#FFFFFF' });

  return actions;
}
