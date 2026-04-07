/**
 * Restore companies directly into the Prisma Accelerate database.
 * Bypasses the Next.js server entirely.
 * Run with: node scripts/restore-direct.mjs
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// ── Load .env.local ────────────────────────────────────────────────────────
const envFile = readFileSync('.env.local', 'utf-8');
const envVars = {};
for (const line of envFile.split('\n')) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
  if (match) envVars[match[1]] = match[2];
}
const DATABASE_URL = envVars.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL not found in .env.local');

// ── Parse Excel ────────────────────────────────────────────────────────────
const companiesJson = execSync(`python3 << 'PYEOF'
import zipfile, re, json, html

with zipfile.ZipFile('/Users/jakebarton/Desktop/TechBirmingham/Sponsor Research Leads.xlsx') as z:
    with z.open('xl/worksheets/sheet1.xml') as f:
        sheet = f.read().decode('utf-8')
    with z.open('xl/sharedStrings.xml') as f:
        ss_xml = f.read().decode('utf-8')

ss_texts = re.findall(r'<si>(.*?)</si>', ss_xml, re.DOTALL)
shared = []
for si in ss_texts:
    texts = re.findall(r'<t[^>]*>([^<]*)</t>', si)
    shared.append(html.unescape(''.join(texts)))

rows = re.findall(r'<row\\b[^>]*\\br="(\\d+)"[^>]*>(.*?)</row>', sheet, re.DOTALL)

def cell_val(cell_xml):
    t_attr = re.search(r'\\bt="([^"]+)"', cell_xml)
    v = re.search(r'<v>([^<]*)</v>', cell_xml)
    if not v:
        return ''
    val = v.group(1)
    cell_type = t_attr.group(1) if t_attr else ''
    if cell_type == 's':
        idx = int(val)
        return shared[idx] if idx < len(shared) else ''
    return val

SKIP = {'company name', 'general outreach template, personalized outreach', ''}
companies = []

for row_num, row_content in rows:
    if row_num == '1':
        continue
    cells = re.findall(r'<c\\b([^>]*)>(.*?)</c>', row_content, re.DOTALL)
    row = {}
    for attrs, content in cells:
        col_ref = re.search(r'\\br="([A-Z]+)\\d+"', attrs)
        if col_ref:
            row[col_ref.group(1)] = cell_val('<c ' + attrs + '>' + content + '</c>')

    name = row.get('A', '').strip()
    if not name or name.lower() in SKIP:
        continue

    companies.append({
        'company_name': name,
        'contact_name': row.get('E', '').strip() or None,
        'confirmed_emails': [e.strip() for e in row.get('F', '').split(',') if e.strip()],
        'bounced_emails': [e.strip() for e in row.get('G', '').split(',') if e.strip()],
        'previous_events': [e.strip() for e in row.get('H', '').split(',') if e.strip()],
        'what_they_sponsored': row.get('I', '').strip() or None,
        'why_good_fit': row.get('J', '').strip() or None,
        'notes': row.get('K', '').strip() or None,
        'relevant_links': [row.get('L', '').strip()] if row.get('L', '').strip() else [],
    })

print(json.dumps(companies))
PYEOF`, { encoding: 'utf-8' });

const companies = JSON.parse(companiesJson);
console.log(`📦 Found ${companies.length} companies in Excel file\n`);

// ── Write to DB via Prisma Accelerate REST API ─────────────────────────────
// Extract the API key from the DATABASE_URL
const apiKeyMatch = DATABASE_URL.match(/api_key=([^&\s]+)/);
if (!apiKeyMatch) throw new Error('Could not extract API key from DATABASE_URL');
const apiKey = apiKeyMatch[1];
const accelerateBase = 'https://accelerate.prisma-data.net';

// We'll use the Prisma Accelerate JSON Protocol
// The easiest approach: use the @prisma/client directly via dynamic import

// Alternative: use the migrate-to-db script pattern
// Actually, let's just POST to our own /api/companies endpoint via curl
// but the server isn't running. So we'll use Prisma via a temp script.

console.log('Writing directly to database via Prisma client...\n');

// Write a temp JS file that uses the bundled Prisma client
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const tempScript = `
process.env.DATABASE_URL = ${JSON.stringify(DATABASE_URL)};
const { PrismaClient } = require(${JSON.stringify(join(process.cwd(), 'lib/generated/prisma/index.js'))});
const db = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL });

const companies = ${JSON.stringify(companies)};

async function run() {
  let saved = 0, skipped = 0;
  for (const c of companies) {
    try {
      await db.company.upsert({
        where: { company_name: c.company_name },
        update: {},
        create: {
          company_name: c.company_name,
          contact_name: c.contact_name,
          confirmed_emails: c.confirmed_emails,
          bounced_emails: c.bounced_emails,
          previous_events: c.previous_events,
          what_they_sponsored: c.what_they_sponsored,
          why_good_fit: c.why_good_fit,
          notes: c.notes,
          relevant_links: c.relevant_links,
          previously_sponsored: c.previous_events.length > 0,
          outreach_status: 'not_started',
          draft: false,
          sponsorship_likelihood_score: 5,
        },
      });
      saved++;
      console.log('  ✅ ' + c.company_name);
    } catch(e) {
      skipped++;
      console.log('  ❌ ' + c.company_name + ' — ' + e.message.split('\\n')[0]);
    }
  }
  console.log('\\n✅ Saved: ' + saved + ' | ❌ Failed: ' + skipped);
  await db.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
`;

const tempPath = join(process.cwd(), 'scripts/_restore_temp.cjs');
writeFileSync(tempPath, tempScript);

try {
  execSync(`node ${tempPath}`, { stdio: 'inherit' });
} finally {
  unlinkSync(tempPath);
}
