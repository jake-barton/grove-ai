/**
 * Restore companies from the Excel backup into the database.
 * Run with: node scripts/restore-from-excel.mjs
 */
// ── Parse Excel ────────────────────────────────────────────────────────────
import { execSync } from 'child_process';

const result = execSync(`python3 << 'PYEOF'
import zipfile, re, json, sys

with zipfile.ZipFile('/Users/jakebarton/Desktop/TechBirmingham/Sponsor Research Leads.xlsx') as z:
    with z.open('xl/worksheets/sheet1.xml') as f:
        sheet = f.read().decode('utf-8')
    with z.open('xl/sharedStrings.xml') as f:
        ss_xml = f.read().decode('utf-8')

ss_texts = re.findall(r'<si>(.*?)</si>', ss_xml, re.DOTALL)
shared = []
for si in ss_texts:
    texts = re.findall(r'<t[^>]*>([^<]*)</t>', si)
    shared.append(''.join(texts).replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"'))

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

companies = []
SKIP = {'company name', 'general outreach template, personalized outreach', ''}

for row_num, row_content in rows:
    if row_num == '1':
        continue
    cells = re.findall(r'<c\\b([^>]*)>(.*?)</c>', row_content, re.DOTALL)
    row = {}
    for attrs, content in cells:
        col_ref = re.search(r'\\br="([A-Z]+)\\d+"', attrs)
        if col_ref:
            col = col_ref.group(1)
            row[col] = cell_val('<c ' + attrs + '>' + content + '</c>')
    
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
        'relevant_links': row.get('L', '').strip() or None,
        'outreach_status': 'not_started',
        'draft': False,
        'sponsorship_likelihood_score': None,
        'industry': None,
        'company_size': None,
        'website': None,
        'email_format': None,
        'contact_position': None,
        'contact_info': None,
    })

print(json.dumps(companies))
PYEOF`, { encoding: 'utf-8' });

const companies = JSON.parse(result);
console.log(`📦 Found ${companies.length} companies in Excel file`);

// ── POST each company to the local API ────────────────────────────────────
const BASE = 'http://localhost:3000';
const INTERNAL_HEADER = 'grove-internal-2026';

let saved = 0;
let failed = 0;

for (const company of companies) {
  try {
    const res = await fetch(`${BASE}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-grove-internal': INTERNAL_HEADER,
      },
      body: JSON.stringify({
        companyName: company.company_name,
        autoResearch: false,
        companyData: company,
      }),
    });

    if (res.ok) {
      saved++;
      console.log(`  ✅ ${company.company_name}`);
    } else {
      const text = await res.text();
      failed++;
      console.log(`  ❌ ${company.company_name} — ${res.status}: ${text.slice(0, 100)}`);
    }
  } catch (e) {
    failed++;
    console.log(`  ❌ ${company.company_name} — ${e.message}`);
  }
}

console.log(`\n✅ Restored ${saved} companies | ❌ Failed: ${failed}`);
