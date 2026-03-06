// AI Agent that orchestrates web search and research tasks
import { generateWithOpenAI, extractContactWithAI } from '@/lib/openai';
import { Company } from '@/lib/types';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  validateUrl,
  validateLinkedInUrl,
  validateEmail as validatorValidateEmail,
  validateUrlInSearchResults,
  validateContactName,
  validateCompanyName,
  validateCompanyData,
  sanitizeText,
} from '@/lib/validators';

interface SearchResult {
  link?: string;
  title?: string;
  snippet?: string;
}

interface HunterContact {
  first_name: string;
  last_name: string;
  value: string; // email
  position?: string;
  linkedin?: string;
  confidence?: number;
}

// Web search using Serper API
export async function searchWeb(query: string): Promise<SearchResult[]> {
  try {
    console.log(`🔍 Searching web: "${query}"`);
    
    if (!process.env.SERPER_API_KEY || process.env.SERPER_API_KEY === 'your_serper_api_key_here') {
      console.error('❌ SERPER_API_KEY not configured!');
      return [];
    }
    
    const response = await axios.post(
      'https://google.serper.dev/search',
      {
        q: query,
        num: 10,
      },
      {
        headers: {
          'X-API-KEY': process.env.SERPER_API_KEY || '',
          'Content-Type': 'application/json',
        },
      }
    );

    const results = response.data.organic || [];
    console.log(`✅ Found ${results.length} search results`);
    return results;
  } catch (error) {
    console.error('❌ Web search error:', error);
    return [];
  }
}

// Scrape company website for information
export async function scrapeWebsite(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    const $ = cheerio.load(response.data);
    
    // Remove scripts, styles, and other non-content elements
    $('script, style, nav, footer, iframe').remove();
    
    // Extract text content
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    
    // Limit to first 2000 characters to avoid overwhelming the AI
    return text.substring(0, 2000);
  } catch (error) {
    console.error('Website scraping error:', error);
    return '';
  }
}

// Find email addresses on a website
export async function findEmails(url: string): Promise<string[]> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatches = response.data.match(emailRegex) || [];
    const emails: string[] = [...new Set(emailMatches as string[])];
    
    // Filter out common non-contact emails
    return emails.filter(
      (email) =>
        !email.includes('example.com') &&
        !email.includes('sentry') &&
        !email.includes('google-analytics')
    );
  } catch (error) {
    console.error('Email finding error:', error);
    return [];
  }
}

// ── Hunter.io domain search — finds REAL verified contacts with emails ──
// This is the highest-signal source: Hunter crawls company websites for published emails
// and associates them with names + titles. Free tier = 25 searches/month.
export async function hunterDomainSearch(domain: string): Promise<HunterContact[]> {
  const key = process.env.HUNTER_API_KEY;
  if (!key || key === 'your_hunter_api_key_here') {
    console.log('⚠️  Hunter API key not configured — skipping domain search');
    return [];
  }
  try {
    console.log(`🔍 Hunter.io domain search: ${domain}`);
    const response = await axios.get('https://api.hunter.io/v2/domain-search', {
      params: {
        domain,
        api_key: key,
        limit: 10,
        seniority: 'senior,executive',  // only senior/exec level
        department: 'marketing,management,executive,sales',
      },
      timeout: 10000,
    });
    const emails: HunterContact[] = response.data?.data?.emails ?? [];
    console.log(`✅ Hunter found ${emails.length} contacts at ${domain}`);
    return emails;
  } catch (err) {
    console.error('Hunter domain search error:', err);
    return [];
  }
}

// ── Scrape leadership/team/about pages on a company website ──
// Many companies publish their leadership team publicly — this is a goldmine for contacts.
export async function scrapeLeadershipPages(baseUrl: string): Promise<string> {
  // Common paths where companies publish leadership info
  const candidates = [
    '/about/leadership', '/about/team', '/about-us/team', '/about/executive-team',
    '/company/leadership', '/company/team', '/leadership', '/team', '/about',
    '/about-us', '/company/about', '/our-team', '/who-we-are',
  ];

  let found = '';
  for (const path of candidates) {
    try {
      const url = baseUrl.replace(/\/$/, '') + path;
      const response = await axios.get(url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        validateStatus: (s) => s === 200,
      });
      const $ = cheerio.load(response.data);
      $('script, style, nav, footer, iframe').remove();

      // Pull out name-like text near job titles
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      // A page is useful if it mentions senior titles
      const titleKeywords = ['cmo', 'chief marketing', 'vp marketing', 'head of marketing',
        'director', 'partnerships', 'sponsorship', 'president', 'ceo', 'coo', 'cto'];
      const textLower = text.toLowerCase();
      const hasTitles = titleKeywords.some(k => textLower.includes(k));
      if (hasTitles && text.length > 200) {
        console.log(`✅ Leadership page found: ${url} (${text.length} chars)`);
        found = `[From ${url}]\n` + text.substring(0, 1500);
        break;
      }
    } catch {
      // 404s and redirects are expected — just try next
    }
  }
  return found;
}

// Validate email using Hunter.io API
export async function validateEmail(email: string): Promise<boolean> {
  try {
    if (!process.env.HUNTER_API_KEY) {
      // If no API key, do basic format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }

    const response = await axios.get(
      `https://api.hunter.io/v2/email-verifier?email=${email}&api_key=${process.env.HUNTER_API_KEY}`
    );

    return response.data.data.status === 'valid';
  } catch (error) {
    console.error('Email validation error:', error);
    // Fallback to basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Main AI research agent
export async function researchCompany(companyName: string): Promise<Company> {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  // Run all searches + enrichment in parallel
  console.log(`🚀 Launching parallel searches + enrichment for "${companyName}"…`);
  const [
    companySearchResults,
    sponsorshipSearchResults,
    contactSearchResults,
    initiativesSearchResults,
    linkedInCompanyResults,
    linkedInPeopleResults,
    linkedInCurrentResults,
    recentNewsResults,
    // Extra targeted searches for real-world contact signals
    execSearchResults,
    pressQuoteResults,
  ] = await Promise.all([
    // 1: Company website
    searchWeb(`${companyName} official website ${currentYear} OR ${prevYear}`),
    // 2: Sponsorship history
    searchWeb(`"${companyName}" tech conference sponsorship ${currentYear} OR ${prevYear} OR "2025" OR "2026"`),
    // 3: LinkedIn decision-makers
    searchWeb(`"${companyName}" (CMO OR "Chief Marketing Officer" OR "VP Marketing" OR "Head of Sponsorships" OR "Director of Partnerships") site:linkedin.com ${currentYear} -former -"ex-" -left -departed`),
    // 4: Recent company initiatives
    searchWeb(`"${companyName}" tech community sponsorship diversity investment ${currentYear} OR ${prevYear}`),
    // 5: LinkedIn company page
    searchWeb(`site:linkedin.com/company "${companyName}"`),
    // 6: LinkedIn people — senior marketing/partnerships roles
    searchWeb(`site:linkedin.com/in "${companyName}" (CMO OR "VP Marketing" OR "Director of Sponsorships" OR "Head of Partnerships" OR "Community Manager") -"former" -"ex-" -left`),
    // 7: LinkedIn people with current-year signals
    searchWeb(`site:linkedin.com/in "${companyName}" (marketing OR sponsorships OR partnerships) "${currentYear}" -former -"ex-"`),
    // 8: Recent news/PR
    searchWeb(`"${companyName}" (CMO OR "VP Marketing" OR "Head of Partnerships" OR "sponsorship") ${currentYear} news announcement interview`),
    // 9: Named exec searches — finds people actually quoted/named in press
    searchWeb(`"${companyName}" (CMO OR "Chief Marketing Officer" OR "VP of Marketing" OR "Head of Sponsorships" OR "Director of Partnerships") ${currentYear} -site:linkedin.com`),
    // 10: Press quotes — finds named people actively speaking for the company right now
    searchWeb(`"${companyName}" sponsor OR partnership announcement "${currentYear}" "said" OR "according to" OR "commented" OR "announced"`),
  ]);
  console.log(`✅ All 10 searches complete for "${companyName}"`);

  const companyWebsite = companySearchResults[0]?.link || '';

  // Extract domain from website for Hunter lookup
  let websiteDomain = '';
  try {
    if (companyWebsite) {
      websiteDomain = new URL(companyWebsite).hostname.replace(/^www\./, '');
    }
  } catch { /* ignore */ }

  // Create a set of ALL URLs from search results for validation
  const allSearchResultUrls = new Set<string>();
  [
    ...companySearchResults,
    ...sponsorshipSearchResults,
    ...contactSearchResults,
    ...initiativesSearchResults,
    ...linkedInCompanyResults,
    ...linkedInPeopleResults,
    ...linkedInCurrentResults,
    ...recentNewsResults,
    ...execSearchResults,
    ...pressQuoteResults,
  ].forEach((result) => {
    if (result.link) {
      allSearchResultUrls.add(result.link.toLowerCase());
    }
  });

  console.log(`📊 Collected ${allSearchResultUrls.size} unique URLs from search results`);

  // Run website scraping + Hunter + leadership pages in parallel
  const [websiteContent, linkedInCompanyContent, leadershipContent, hunterContacts, emails] =
    await Promise.all([
      companyWebsite ? scrapeWebsite(companyWebsite) : Promise.resolve(''),
      (() => {
        const url = linkedInCompanyResults[0]?.link || '';
        return url.includes('linkedin.com/company') ? scrapeWebsite(url) : Promise.resolve('');
      })(),
      companyWebsite ? scrapeLeadershipPages(companyWebsite) : Promise.resolve(''),
      websiteDomain ? hunterDomainSearch(websiteDomain) : Promise.resolve([]),
      companyWebsite ? findEmails(companyWebsite) : Promise.resolve([]),
    ]);

  const linkedInCompanyUrl = linkedInCompanyResults[0]?.link || '';
  if (linkedInCompanyContent) {
    console.log(`🔗 LinkedIn company page scraped: ${linkedInCompanyUrl} (${linkedInCompanyContent.length} chars)`);
  }
  if (leadershipContent) {
    console.log(`� Leadership page content found (${leadershipContent.length} chars)`);
  }

  // Format Hunter contacts as readable text for the AI prompt
  const hunterContactsText = hunterContacts.length > 0
    ? hunterContacts
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 6)
        .map(c =>
          `• ${c.first_name} ${c.last_name}` +
          (c.position ? ` — ${c.position}` : '') +
          ` | Email: ${c.value}` +
          (c.linkedin ? ` | LinkedIn: ${c.linkedin}` : '') +
          (c.confidence ? ` | Confidence: ${c.confidence}%` : '')
        )
        .join('\n')
    : 'No Hunter.io contacts found';

  // Build comprehensive prompt for OpenAI
  const researchPrompt = `Research the company "${companyName}" as a potential sponsor for Sloss.Tech, a technology conference in Birmingham, Alabama.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]} — only use data that reflects the company's CURRENT state in ${currentYear}.

I've gathered this information:

**Company Website & Info:**
${companyWebsite}
${websiteContent.substring(0, 500)}

**🎯 HUNTER.IO VERIFIED CONTACTS (highest priority — these are REAL people with verified emails):**
${hunterContactsText}

**👥 LEADERSHIP/TEAM PAGE (scraped directly from company website — very reliable):**
${leadershipContent || 'Not found'}

**LinkedIn Company Page (scraped public data):**
URL: ${linkedInCompanyUrl || 'Not found'}
Content: ${linkedInCompanyContent.substring(0, 600) || 'Not available'}

**LinkedIn Company Search Results:**
${JSON.stringify(linkedInCompanyResults.slice(0, 3), null, 2)}

**LinkedIn People / Decision-Makers (primary source):**
${JSON.stringify(linkedInPeopleResults.slice(0, 5), null, 2)}

**LinkedIn People — Current Employees (${currentYear} signals, most reliable):**
${JSON.stringify(linkedInCurrentResults.slice(0, 5), null, 2)}

**Recent News / PR — ${currentYear} (use to verify who is actively representing the company NOW):**
${JSON.stringify(recentNewsResults.slice(0, 5), null, 2)}

**Named Executive Searches (people actually quoted/named in non-LinkedIn sources — very current):**
${JSON.stringify(execSearchResults.slice(0, 5), null, 2)}

**Press Quote Results (people who made public statements for ${companyName} in ${currentYear}):**
${JSON.stringify(pressQuoteResults.slice(0, 5), null, 2)}

**Sponsorship History (${prevYear}–${currentYear}):**
${JSON.stringify(sponsorshipSearchResults.slice(0, 5), null, 2)}

**Decision-Makers (LinkedIn Search via Google):**
${JSON.stringify(contactSearchResults.slice(0, 5), null, 2)}

**Community Initiatives (${prevYear}–${currentYear}):**
${JSON.stringify(initiativesSearchResults.slice(0, 5), null, 2)}

**All Search Snippets (use these to find industry, company size, etc):**
${[...companySearchResults, ...sponsorshipSearchResults, ...recentNewsResults, ...execSearchResults].slice(0, 12).map(r => r.snippet).filter(Boolean).join('\n')}

**Contact Emails Found (scraped from website):**
${emails.slice(0, 3).join(', ') || 'None found'}

🚨 CRITICAL INSTRUCTIONS 🚨

STEP 0: EXTRACT INDUSTRY AND COMPANY SIZE
- Read the "All Search Snippets" above carefully
- Extract the industry (e.g. "Cloud Security", "Developer Tools", "Data Analytics")
- Extract company size if mentioned (e.g. "3,000 employees", "publicly traded", "Series D")
- If not in snippets, make a reasonable inference from what the company does
- NEVER use "Unknown" - always provide a best answer

STEP 1: FIND THE BEST CONTACT — USE THESE SOURCES IN ORDER OF PRIORITY:

  ★ PRIORITY 1 — HUNTER.IO VERIFIED CONTACTS (use these first if available)
  - Look at "HUNTER.IO VERIFIED CONTACTS" section above
  - Hunter.io crawls company websites and finds REAL published contacts with VERIFIED emails
  - Pick the most senior person in: Marketing, Partnerships, Sponsorships, Community, or C-Suite
  - Best titles: CMO, VP Marketing, Head of Sponsorships, Director of Partnerships, CEO, President
  - If a Hunter contact has a LinkedIn URL, use it — it's been verified by Hunter
  - Use their email directly as contact_info
  - This is the MOST RELIABLE source — a real name + verified email is infinitely better than a guess

  ★ PRIORITY 2 — LEADERSHIP/TEAM PAGE (scraped directly from company website)
  - Look at "LEADERSHIP/TEAM PAGE" section above
  - Company websites often list their exec team with names, titles, and sometimes emails
  - Extract the most relevant person (CMO / VP Marketing / Partnerships / Community)
  - Names and titles here are ground truth — the company published them themselves

  ★ PRIORITY 3 — PRESS QUOTES / NAMED EXECUTIVES (from exec + press quote searches)
  - Look at "Named Executive Searches" and "Press Quote Results" sections
  - People named in press releases and quotes ARE currently at the company — companies don't quote former employees
  - Extract their name and title from the snippet
  - Format: "Jane Smith, VP of Marketing at ${companyName}, said..."

  ★ PRIORITY 4 — LINKEDIN (least reliable — often stale, only use if above sources failed)
  - Look through "LinkedIn People — Current Employees (${currentYear} signals)" first
  - Then "LinkedIn People / Decision-Makers"
  - Only accept if snippet shows CURRENT title at ${companyName} in present tense
  - REJECT anyone with: "Former", "Ex-", "previously", "left", "now at", "joined [other co]"
  - REJECT anyone whose snippet shows them at a DIFFERENT company
  - If ANY doubt, use "Not found" — staleness is the #1 failure mode here

STEP 2: EXTRACT THE CONTACT NAME
- Use the name from whichever Priority source you found in Step 1
- For Hunter: use first_name + last_name fields
- For leadership page: extract the name closest to a matching title
- For press quotes: extract the name before the comma/dash before the title
- NEVER invent names. NEVER use: "John Doe", "Jane Doe", "John Smith"
- If no real name found anywhere, use "Not found"

STEP 2b: FIND THE CONTACT'S PERSONAL LINKEDIN URL
- Once you have a contact name, search ALL search result snippets, titles, and links for their LinkedIn profile URL
- LinkedIn personal profile URLs look like: "linkedin.com/in/firstname-lastname-12345"
- Check ALL sections: Hunter contacts (linkedin field), LinkedIn People results, Named Executive searches, Press Quote results
- The URL often appears in the "link" field of a result OR embedded in a snippet/title
- COPY the EXACT URL character-for-character — including any numeric suffix (e.g. "-a1b2c3")
- If the contact was found via Hunter and Hunter provided a linkedin field, USE THAT URL
- If you cannot find a LinkedIn URL for this specific person in the search data, use "Not found"
- NEVER construct or guess a LinkedIn URL — only use URLs that appear verbatim in the search data

STEP 3: GET THE CONTACT EMAIL
- If Hunter.io found this person: use their email from the Hunter results (it's verified)
- Otherwise, check "Contact Emails Found" at the bottom for domain emails
- Otherwise use "Not found"

STEP 4: VERIFY COMPANY LINKEDIN
- Look through "LinkedIn Company Search Results" section
- Company LinkedIn URLs look like: "linkedin.com/company/amazon-web-services"
- Copy the EXACT first result "link" value that contains "linkedin.com/company/"
- If not found, use "Not found"

STEP 5: VERIFY SPONSORSHIP DATA
- Look ONLY in "Sponsorship History (${prevYear}–${currentYear})" section
- Only count events from ${prevYear} or ${currentYear} — older events are low signal
- Extract specific event names: "TechCrunch Disrupt 2025", "AWS re:Invent 2025", "SXSW 2026"
- If no recent events mentioned, return empty array []

STRICT RULES:
❌ DO NOT create or invent URLs — only copy exact "link" values from search results
❌ DO NOT use generic placeholder names
❌ DO NOT invent events — only use events explicitly mentioned in search results
❌ DO NOT save a contact if you are not CERTAIN they currently work at ${companyName} in ${currentYear}
✅ DO cross-reference LinkedIn results with Recent News to confirm recency
✅ DO copy URLs exactly character-for-character from the JSON
✅ DO prefer "Not found" over a potentially stale contact — accuracy matters more than completeness
✅ DO use "Not found" when data genuinely doesn't exist

Format as JSON:
{
  "company_name": "${companyName}",
  "industry": "string (from search results)",
  "company_size": "string (from search results or 'Unknown')",
  "website": "${companyWebsite}",
  "linkedin_company": "string (EXACT URL from search results or 'Not found')",
  "contact_name": "string (EXACT name from search results or 'Not found')",
  "contact_position": "string (from search results)",
  "contact_linkedin": "string (EXACT LinkedIn URL with numbers from search results or 'Not found')",
  "contact_info": "string (email if found or 'Not found')",
  "email_format": "string (pattern or 'Not available')",
  "previously_sponsored": ["array of specific events mentioned in search results - empty [] if none"],
  "what_they_sponsored": "string (specific examples from search results or 'No verified sponsorships found')",
  "why_good_fit": "string — exactly 3 bullet points each starting with '• ', covering: (1) technology/product alignment with Sloss.Tech, (2) community/developer investment signals from search results, (3) sponsorship history or likelihood. ONLY facts from search results — no invented claims.",
  "sponsorship_likelihood_score": number (1-10 based on evidence found),
  "relevant_notes": "string (key insights from search results)",
  "relevant_links": ["array of EXACT URLs from search results only - max 3"]
}

Respond ONLY with valid JSON. No explanations, no markdown, just pure JSON.`;

  const aiResponse = await generateWithOpenAI(researchPrompt);

  // Parse AI response with better error handling
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let companyData: any;
  try {
    // Try to extract JSON from response - look for both {} and markdown code blocks
    let jsonText = aiResponse;
    
    // Remove markdown code blocks if present
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Find JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonString = jsonMatch[0];
      
      // Fix trailing commas before closing braces/brackets
      jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');

      // Fix unescaped newlines/tabs ONLY inside JSON string values
      // Strategy: replace literal newlines inside double-quoted strings only
      jsonString = jsonString.replace(/"((?:[^"\\]|\\.)*)"/g, (_match, inner: string) => {
        const fixed = inner
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        return `"${fixed}"`;
      });
      
      try {
        companyData = JSON.parse(jsonString);
      } catch {
        // If still fails, strip remaining non-printable control chars and retry
        console.warn('First JSON parse failed, trying to strip control characters...');
        jsonString = jsonString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        companyData = JSON.parse(jsonString);
      }
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (err) {
    console.error('JSON parsing error:', err);
    console.error('AI Response:', aiResponse.substring(0, 500));
    throw new Error(`Failed to parse AI response for ${companyName}`);
  }

  // ====== STRICT VALIDATION LAYER ======
  // Validate all URLs and data before accepting
  
  console.log(`\n🔍 RAW AI OUTPUT for ${companyName}:`, JSON.stringify(companyData, null, 2));
  
  const validatedCompanyName = validateCompanyName(companyData.company_name);
  if (!validatedCompanyName) {
    console.error(`❌ Invalid company name: ${companyData.company_name}`);
    throw new Error(`Invalid company name received: ${companyData.company_name}`);
  }

  // Validate website URL
  console.log(`🔗 Validating website: ${companyData.website} or ${companyWebsite}`);
  const validatedWebsite = validateUrl(companyData.website) || validateUrl(companyWebsite);
  console.log(`✅ Website validated: ${validatedWebsite || 'NONE'}`);
  
  // Validate LinkedIn URLs - MUST be real LinkedIn URLs from search
  const allSearchResults = [
    ...contactSearchResults,
    ...sponsorshipSearchResults,
    ...initiativesSearchResults,
    ...linkedInCompanyResults,
    ...linkedInPeopleResults,
    ...linkedInCurrentResults,
    ...recentNewsResults,
    ...execSearchResults,
    ...pressQuoteResults,
  ];
  
  console.log(`🔗 Validating LinkedIn URLs...`);
  console.log(`   Contact LinkedIn: ${companyData.contact_linkedin}`);
  console.log(`   Company LinkedIn: ${companyData.linkedin_company}`);
  
  // First validate format
  let validatedContactLinkedIn = validateLinkedInUrl(companyData.contact_linkedin);
  let validatedCompanyLinkedIn = validateLinkedInUrl(companyData.linkedin_company);

  // Build a set of LinkedIn URLs sourced from Hunter (these are trusted — no need to cross-check search results)
  const hunterLinkedInUrls = new Set(
    hunterContacts.map(c => c.linkedin?.toLowerCase()).filter(Boolean) as string[]
  );

  // Verify LinkedIn URLs came from search results OR Hunter
  // Normalise URL: strip protocol + any subdomain, keep just the path for comparison
  const normaliseLinkedIn = (url: string) => {
    try {
      const u = new URL(url.toLowerCase());
      return u.pathname.replace(/\/$/, '');
    } catch {
      return url.toLowerCase();
    }
  };

  // Extract the profile slug from a linkedin /in/ or /company/ URL
  const linkedInSlug = (url: string): string => {
    const lower = url.toLowerCase();
    if (lower.includes('/in/')) return lower.split('/in/')[1]?.split(/[/?#]/)[0] || '';
    if (lower.includes('/company/')) return lower.split('/company/')[1]?.split(/[/?#]/)[0] || '';
    return '';
  };

  // Build a flat corpus of ALL text from search results (links + titles + snippets)
  // so we can check if a profile slug appears anywhere — not just in a link field
  const allSearchText = allSearchResults
    .map(r => `${r.link || ''} ${r.title || ''} ${r.snippet || ''}`)
    .join(' ')
    .toLowerCase();

  if (validatedContactLinkedIn) {
    const normalised = normaliseLinkedIn(validatedContactLinkedIn);
    const slug = linkedInSlug(validatedContactLinkedIn);
    const fromHunter = [...hunterLinkedInUrls].some(u => normaliseLinkedIn(u) === normalised);
    const foundInLinks = [...allSearchResultUrls].some(
      u => normaliseLinkedIn(u) === normalised || u.includes(validatedContactLinkedIn!.toLowerCase())
    );
    // Also accept if the profile slug appears in any snippet/title text (AI reads from snippet, not just link)
    const slugFoundInText = slug.length >= 4 && allSearchText.includes(slug);
    const foundInResults = fromHunter || foundInLinks || slugFoundInText;
    if (!foundInResults) {
      console.warn(`⚠️ Contact LinkedIn URL not found in search results or Hunter, rejecting: ${validatedContactLinkedIn}`);
      validatedContactLinkedIn = null;
    } else {
      console.log(`✅ Contact LinkedIn verified (${fromHunter ? 'Hunter' : slugFoundInText ? 'snippet-text' : 'link'}): ${validatedContactLinkedIn}`);
    }
  }
  
  if (validatedCompanyLinkedIn) {
    const normalised = normaliseLinkedIn(validatedCompanyLinkedIn);
    const slug = linkedInSlug(validatedCompanyLinkedIn);
    const foundInLinks = [...allSearchResultUrls].some(
      u => normaliseLinkedIn(u) === normalised || u.includes(validatedCompanyLinkedIn!.toLowerCase())
    );
    const slugFoundInText = slug.length >= 4 && allSearchText.includes(slug);
    const foundInResults = foundInLinks || slugFoundInText;
    if (!foundInResults) {
      console.warn(`⚠️ Company LinkedIn URL not found in search results, rejecting: ${validatedCompanyLinkedIn}`);
      validatedCompanyLinkedIn = null;
    } else {
      console.log(`✅ Company LinkedIn verified in search results: ${validatedCompanyLinkedIn}`);
    }
  }
  
  if (!validatedContactLinkedIn) {
    console.log(`❌ Contact LinkedIn validation failed or not found in search`);
  }
  if (!validatedCompanyLinkedIn) {
    console.log(`❌ Company LinkedIn validation failed or not found in search`);
  }
  
  // Validate contact name - reject placeholders
  console.log(`👤 Validating contact: ${companyData.contact_name}`);
  const validatedContactName = validateContactName(companyData.contact_name);
  console.log(`✅ Contact name validated: ${validatedContactName || 'NONE'}`);

  // Cross-check: reject contact if their position/title names a DIFFERENT company
  // e.g. reject "CMO at NVIDIA" when researching Google Cloud
  const contactPosition: string = companyData.contact_position || '';
  const positionLower = contactPosition.toLowerCase();
  const companyNameLowerOuter = companyName.toLowerCase();

  // Known brand aliases — so "AWS" isn't flagged as different from "Amazon Web Services"
  const BRAND_ALIASES: Record<string, string[]> = {
    'amazon web services': ['aws', 'amazon'],
    'google': ['google cloud', 'gcp', 'google llc', 'alphabet'],
    'google cloud': ['gcp', 'google', 'alphabet'],
    'microsoft': ['microsoft azure', 'azure', 'msft'],
    'microsoft azure': ['azure', 'microsoft', 'msft'],
    'salesforce': ['sfdc', 'salesforce.com'],
    'meta': ['facebook', 'instagram', 'meta platforms'],
    'alphabet': ['google', 'google cloud', 'gcp'],
  };

  const isKnownAlias = (mentionedLower: string): boolean => {
    // Check if mentionedLower is an alias for the company being researched
    for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
      const researchingCanonical = companyNameLowerOuter.includes(canonical) || canonical.includes(companyNameLowerOuter);
      if (researchingCanonical && aliases.some(a => mentionedLower === a || mentionedLower.includes(a) || a.includes(mentionedLower))) {
        return true;
      }
      // Also check if the mentioned brand IS the canonical and our company is an alias of it
      if (mentionedLower === canonical && aliases.some(a => companyNameLowerOuter.includes(a) || a.includes(companyNameLowerOuter))) {
        return true;
      }
    }
    return false;
  };

  // Build a list of known other company names from position text
  const atOtherCompany = (() => {
    // Extract "at X" or "@ X" or "| X" patterns from the position string
    const otherCompanyPattern = /(?:\bat\b|@|\|)\s+([A-Z][A-Za-z0-9&. ]+)/g;
    let match;
    while ((match = otherCompanyPattern.exec(contactPosition)) !== null) {
      const mentioned = match[1].trim().toLowerCase();
      // If the mentioned company is clearly NOT the one we're researching, reject
      if (
        mentioned.length > 2 &&
        !companyNameLowerOuter.includes(mentioned) &&
        !mentioned.includes(companyNameLowerOuter) &&
        !isKnownAlias(mentioned)
      ) {
        // Also check it's not a generic word
        const genericWords = ['the', 'a', 'an', 'inc', 'llc', 'ltd', 'co', 'corp', 'group'];
        if (!genericWords.includes(mentioned)) {
          console.warn(`⚠️ Contact position "${contactPosition}" mentions a different company "${match[1]}" — clearing contact`);
          return true;
        }
      }
    }
    // Also check "Former X" pattern — person no longer works there
    if (positionLower.includes('former') && !positionLower.includes(companyNameLowerOuter)) {
      console.warn(`⚠️ Contact appears to be a former employee at a different company — clearing`);
      return true;
    }
    return false;
  })();

  // Additional staleness check: scan the LinkedIn search snippets for the chosen contact's name
  // and look for signals that they have LEFT the company (e.g. "left", "now at", "joined X")
  const contactLinkedInUrl: string = companyData.contact_linkedin || '';
  const isStaleContact = (() => {
    if (!validatedContactName || atOtherCompany) return false;

    const nameLower = validatedContactName.toLowerCase();
    // Use word-boundary patterns to avoid false positives like "joined us", "left-brained", "formerly known"
    const staleSignalPatterns: RegExp[] = [
      /\bleft\s+(the\s+)?(company|role|position|team|aws|google|microsoft|meta|amazon)\b/i,
      /\bdeparted\b/i,
      /\bnow\s+at\b/i,
      /\bmoved\s+to\b/i,
      /\bjoined\s+[A-Z][a-z]/,        // "joined Google", "joined Microsoft" — capital word after "joined"
      /\bno\s+longer\s+(at|with)\b/i,
      /\bformer\s+(cmo|vp|head|director|employee|executive)\b/i,
      /\bex-[a-z]/i,                   // "ex-CMO", "ex-VP"
      /\bpreviously\s+at\b/i,
      /\brecently\s+left\b/i,
      /\btransitioned\s+(from|to)\b/i,
    ];

    // Gather all snippets — keep TWO versions: lowercased for signal matching, original case for company detection
    const rawPeopleResults = [
      ...linkedInPeopleResults,
      ...linkedInCurrentResults,
      ...contactSearchResults,
    ].filter((r) => {
      const textToCheck = `${r.title || ''} ${r.snippet || ''} ${r.link || ''}`.toLowerCase();
      return (
        textToCheck.includes(nameLower.split(' ')[0]) ||
        (contactLinkedInUrl && textToCheck.includes(contactLinkedInUrl.toLowerCase().split('/in/')[1]?.split('/')[0] || ''))
      );
    });

    for (const result of rawPeopleResults) {
      const snippet = `${result.title || ''} ${result.snippet || ''}`.toLowerCase(); // lowercased for signal matching
      const rawSnippet = `${result.title || ''} ${result.snippet || ''}`; // original case for company name matching

      for (const signal of staleSignalPatterns) {
        if (signal.test(snippet)) {
          console.warn(`⚠️ Stale contact signal detected in snippet: "${signal}" — clearing contact`);
          console.warn(`   Snippet: "${snippet.substring(0, 200)}"`);
          return true;
        }
      }

      // Check if the snippet explicitly places this person at a DIFFERENT company.
      // Use original-case rawSnippet so we can require Title Case company names
      // (avoids matching "at the", "at experience", "at companies" etc.)
      // Only match: "@ CompanyName", "· CompanyName" (explicit separator markers)
      // Do NOT match bare "at X" — too many false positives with common English phrases
      const companyNameLower = companyName.toLowerCase();
      const atAnotherPattern = /(?:@\s*|·\s*)([A-Z][A-Za-z0-9](?:[A-Za-z0-9& ]{0,28}?)?)(?=\s*(?:·|\||$|,|\.))/g;
      let m;
      while ((m = atAnotherPattern.exec(rawSnippet)) !== null) {
        const mentionedCo = m[1].trim().toLowerCase();
        const stopWords = new Set(['the', 'a', 'an', 'inc', 'llc', 'ltd', 'co', 'corp', 'group',
          'linkedin', 'twitter', 'facebook', 'instagram', 'youtube', 'github',
          'university', 'college', 'school', 'institute', 'us', 'usa']);
        if (
          mentionedCo.length > 3 &&
          !stopWords.has(mentionedCo) &&
          !companyNameLower.includes(mentionedCo) &&
          !mentionedCo.includes(companyNameLower) &&
          !isKnownAlias(mentionedCo)
        ) {
          // Only flag stale if BOTH first + last name appear in snippet — avoid partial matches
          const firstName = nameLower.split(' ')[0];
          const lastName = nameLower.split(' ').pop()!;
          if (
            firstName.length > 2 && lastName.length > 2 &&
            snippet.includes(firstName) && snippet.includes(lastName)
          ) {
            console.warn(`⚠️ Contact snippet places "${nameLower}" at "${m[1]}" (not ${companyName}) — possible stale contact`);
            return true;
          }
        }
      }
    }
    return false;
  })();

  if (isStaleContact) {
    console.warn(`⚠️ Contact rejected: stale employment signals detected in search snippets`);
  }

  const finalContactName = (atOtherCompany || isStaleContact) ? null : validatedContactName;
  const finalContactLinkedIn = (atOtherCompany || isStaleContact) ? null : validatedContactLinkedIn;
  const finalContactPosition = (atOtherCompany || isStaleContact) ? 'Not found' : (companyData.contact_position || 'Not found');

  if (atOtherCompany) {
    console.warn(`⚠️ Contact rejected: works at a different company`);
  }
  
  // Validate email
  const validatedContactEmail = validatorValidateEmail(companyData.contact_info);
  
  // Validate emails found on website
  const validatedEmails: string[] = [];
  for (const email of emails.slice(0, 3)) {
    const valid = validatorValidateEmail(email);
    if (valid) {
      validatedEmails.push(valid);
    }
  }

  // Validate relevant links - only include real URLs from search results
  const validatedLinks: string[] = [];
  if (Array.isArray(companyData.relevant_links)) {
    for (const link of companyData.relevant_links) {
      const validated = validateUrlInSearchResults(link, allSearchResults);
      if (validated) {
        validatedLinks.push(validated);
      }
    }
  }

  // Run comprehensive validation check
  const validation = validateCompanyData({
    company_name: validatedCompanyName,
    website: validatedWebsite || undefined,
    contact_name: finalContactName || undefined,
    contact_linkedin: finalContactLinkedIn || undefined,
    linkedin_company: validatedCompanyLinkedIn || undefined,
    contact_info: validatedContactEmail || undefined,
  });

  // Log validation results
  console.log(`📊 Validation for ${validatedCompanyName}:`, {
    score: validation.score,
    errors: validation.errors,
    warnings: validation.warnings,
  });

  // Reject if validation score is too low (minimum 30/100 to allow some flexibility)
  if (validation.score < 30) {
    console.error(`❌ REJECTED: Data quality too low (${validation.score}/100)`);
    throw new Error(
      `Data quality too low for ${validatedCompanyName} (score: ${validation.score}/100). Errors: ${validation.errors.join(', ')}`
    );
  }

  console.log(`✅ ACCEPTED: ${validatedCompanyName} passed validation (${validation.score}/100)`);

  // Sanitize text fields to remove markdown artifacts
  const sanitizedWhyFit = sanitizeText(companyData.why_good_fit);
  const sanitizedNotes = sanitizeText(companyData.relevant_notes);
  const sanitizedWhatSponsored = sanitizeText(companyData.what_they_sponsored);

  // Build plain-text notes (warnings + quality score only — the main fields get their own columns)
  const notesArray: string[] = [];
  if (sanitizedNotes) notesArray.push(sanitizedNotes);
  if (validation.warnings.length > 0) {
    notesArray.push(`Data Warnings: ${validation.warnings.join('; ')}`);
  }
  notesArray.push(`Data Quality Score: ${validation.score}/100`);

  // Build relevant links array
  const relevantLinks: string[] = [];
  if (validatedLinks.length > 0) relevantLinks.push(...validatedLinks);

  // ── #10: Contact confidence level — based on how it was found ──
  const contactConfidence: 'high' | 'medium' | 'low' | 'unverified' = (() => {
    if (!finalContactName) return 'unverified';
    const nameLower = finalContactName.toLowerCase();
    const firstName = nameLower.split(' ')[0];

    // Hunter.io verified = highest confidence (they crawl published sources)
    const inHunter = hunterContacts.some(c =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(firstName)
    );
    if (inHunter) return 'high';

    // Named in press quotes or exec searches = very current
    const inPress = [...execSearchResults, ...pressQuoteResults].some(r =>
      `${r.title || ''} ${r.snippet || ''}`.toLowerCase().includes(firstName)
    );
    if (inPress) return 'high';

    // In current-year LinkedIn signals AND recent news = high
    const inCurrentYear = linkedInCurrentResults.some(r =>
      `${r.title || ''} ${r.link || ''}`.toLowerCase().includes(firstName)
    );
    const inRecentNews = recentNewsResults.some(r =>
      `${r.title || ''} ${r.snippet || ''}`.toLowerCase().includes(firstName)
    );
    if (inCurrentYear && inRecentNews) return 'high';
    if (inCurrentYear || inRecentNews) return 'medium';

    // Found on leadership page = medium (published but may not be updated)
    const inLeadership = leadershipContent.toLowerCase().includes(firstName);
    if (inLeadership) return 'medium';

    return 'low';
  })();
  console.log(`🎯 Contact confidence for ${validatedCompanyName}: ${contactConfidence}`);

  // ── #5: Grounded sponsorship score — derived from real signals, not AI vibes ──
  const scoreSignals = {
    hasWebsite:           validatedWebsite ? 10 : 0,
    hasContactName:       finalContactName ? 15 : 0,
    hasContactLinkedIn:   finalContactLinkedIn ? 15 : 0,
    hasCompanyLinkedIn:   validatedCompanyLinkedIn ? 5 : 0,
    hasEmail:             validatedContactEmail ? 10 : 0,
    hasPreviousSponsored: (Array.isArray(companyData.previously_sponsored) &&
                           companyData.previously_sponsored.length > 0) ? 20 : 0,
    hasIndustry:          (companyData.industry && companyData.industry !== 'Unknown') ? 5 : 0,
    hasCompanySize:       (companyData.company_size && companyData.company_size !== 'Unknown') ? 5 : 0,
    hasRelevantNotes:     sanitizedNotes ? 5 : 0,
    dataQualityBonus:     validation.score >= 80 ? 10 : validation.score >= 60 ? 5 : 0,
  };
  const groundedScore = Math.min(10, Math.max(1,
    Math.round(Object.values(scoreSignals).reduce((a, b) => a + b, 0) / 10)
  ));
  console.log(`📊 Grounded score for ${validatedCompanyName}: ${groundedScore}/10`, scoreSignals);

  // Return structured, validated company data
  return {
    company_name: validatedCompanyName,
    draft: false,
    outreach_status: 'not_started',
    email_format: companyData.email_format || 'Not available',
    contact_name: finalContactName || 'Not found',
    contact_position: finalContactPosition,
    contact_confidence: contactConfidence,
    contact_info: validatedContactEmail || 'Not found',
    contact_linkedin: finalContactLinkedIn || undefined,
    linkedin_company: validatedCompanyLinkedIn || undefined,
    confirmed_emails: validatedEmails,
    bounced_emails: [],
    previously_sponsored: Array.isArray(companyData.previously_sponsored) && 
      companyData.previously_sponsored.length > 0,
    previous_events: Array.isArray(companyData.previously_sponsored) ? 
      companyData.previously_sponsored.map((e: string) => sanitizeText(e)).filter(Boolean) : 
      [],
    what_they_sponsored: sanitizedWhatSponsored || undefined,
    why_good_fit: sanitizedWhyFit || undefined,
    relevant_links: relevantLinks,
    industry: sanitizeText(companyData.industry) || 'Technology',
    company_size: sanitizeText(companyData.company_size) || 'Unknown',
    website: validatedWebsite || 'Not found',
    notes: notesArray.join('\n\n'),
    sponsorship_likelihood_score: groundedScore,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Deep LinkedIn contact search — dedicated contact-only research ──────────────
// Used when we already have a company in the DB but need to find/update its contact.
// Does 8 targeted searches specifically for current decision-makers, then uses AI
// to pick the best one, then PATCHes the company record directly.
export async function findContactForCompany(
  companyName: string,
  existingCompanyId?: string,
  originUrl?: string
): Promise<{
  contact_name: string | null;
  contact_position: string | null;
  contact_linkedin: string | null;
  contact_info: string | null;
  confidence: string;
  source: string;
}> {
  const currentYear = new Date().getFullYear();
  console.log(`\n🎯 Deep contact search for "${companyName}"…`);

  // Fire 8 highly targeted searches in parallel
  const [
    s1, s2, s3, s4, s5, s6, s7, s8
  ] = await Promise.all([
    // LinkedIn profiles — CMO / VP Marketing at this company right now
    searchWeb(`site:linkedin.com/in "${companyName}" (CMO OR "Chief Marketing Officer" OR "VP of Marketing" OR "VP Marketing") -former -"ex-" -left -departed`),
    // LinkedIn profiles — Partnerships / Sponsorships
    searchWeb(`site:linkedin.com/in "${companyName}" ("Head of Partnerships" OR "Director of Partnerships" OR "Head of Sponsorships" OR "Sponsorship Manager" OR "Community Partnerships") -former -"ex-"`),
    // LinkedIn profiles — current year signal
    searchWeb(`site:linkedin.com/in "${companyName}" (marketing OR partnerships OR sponsorships) "${currentYear}" -former -"ex-"`),
    // Named in press — people quoted or credited for the company in news
    searchWeb(`"${companyName}" ("CMO" OR "Chief Marketing Officer" OR "VP Marketing" OR "Head of Partnerships") "${currentYear}" said OR announced OR commented -site:linkedin.com`),
    // Conference/event sponsorship contacts — often named in event pages
    searchWeb(`"${companyName}" sponsorship contact OR "sponsorship team" OR "partnerships team" "${currentYear}"`),
    // Apollo / ZoomInfo / Clearbit leaks (public data aggregators often index company contacts)
    searchWeb(`"${companyName}" (CMO OR "VP Marketing" OR "Head of Partnerships") email site:apollo.io OR site:rocketreach.co OR site:contactout.com OR site:signalhire.com`),
    // Official company about/team pages
    searchWeb(`"${companyName}" "head of" OR "director of" OR "vice president" marketing OR partnerships site:${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com OR "${companyName.toLowerCase()}.com"`),
    // Twitter/X — often the fastest way to find who speaks for a company publicly
    searchWeb(`site:twitter.com OR site:x.com "${companyName}" (CMO OR "VP Marketing" OR "Head of Partnerships" OR "Director of Sponsorships") "${currentYear}"`),
  ]);

  // Aggregate all unique results
  const allResults = [...s1, ...s2, ...s3, ...s4, ...s5, ...s6, ...s7, ...s8];
  const allUrls = new Set(allResults.map(r => r.link?.toLowerCase()).filter(Boolean));

  // Hunter.io domain search — if configured, this gives us verified emails + LinkedIn
  let hunterText = '';
  const hunterResults: HunterContact[] = [];
  try {
    // Try to derive domain from company name
    const domainGuess = companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
    const hc = await hunterDomainSearch(domainGuess);
    hunterResults.push(...hc);
    if (hc.length > 0) {
      hunterText = hc
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 5)
        .map(c =>
          `• ${c.first_name} ${c.last_name}` +
          (c.position ? ` — ${c.position}` : '') +
          ` | Email: ${c.value}` +
          (c.linkedin ? ` | LinkedIn: ${c.linkedin}` : '') +
          (c.confidence ? ` | Confidence: ${c.confidence}%` : '')
        )
        .join('\n');
    }
  } catch { /* ignore */ }

  // Build AI prompt with all gathered data
  const prompt = `You are finding the BEST sponsorship/marketing contact at "${companyName}" for a tech conference outreach.

TODAY: ${new Date().toISOString().split('T')[0]} — only ${currentYear} data.

${hunterText ? `## HUNTER.IO VERIFIED CONTACTS (highest trust — real emails):\n${hunterText}\n` : ''}

## LINKEDIN SEARCH RESULTS (CMO / VP Marketing):
${JSON.stringify(s1.slice(0, 4), null, 2)}

## LINKEDIN SEARCH RESULTS (Partnerships / Sponsorships):
${JSON.stringify(s2.slice(0, 4), null, 2)}

## LINKEDIN CURRENT (${currentYear} signals):
${JSON.stringify(s3.slice(0, 4), null, 2)}

## PRESS / NEWS — NAMED EXECUTIVES:
${JSON.stringify(s4.slice(0, 5), null, 2)}

## SPONSORSHIP CONTACT PAGES:
${JSON.stringify(s5.slice(0, 3), null, 2)}

## DATA AGGREGATORS (Apollo/RocketReach):
${JSON.stringify(s6.slice(0, 3), null, 2)}

## COMPANY TEAM/ABOUT PAGES:
${JSON.stringify(s7.slice(0, 3), null, 2)}

## SOCIAL MEDIA SIGNALS:
${JSON.stringify(s8.slice(0, 3), null, 2)}

INSTRUCTIONS:
1. Pick the SINGLE best contact for sponsorship outreach at "${companyName}"
   - Best roles IN ORDER: Head of Sponsorships > Director of Partnerships > CMO > VP Marketing > Community Lead > CEO
   - Must be CURRENTLY at ${companyName} — reject anyone with "former", "ex-", "left", "now at", "joined [other company]"
2. Extract their LinkedIn URL — must be a real linkedin.com/in/... URL from the search results above
3. Extract their email — use Hunter.io email if available, otherwise "Not found"
4. Determine your confidence: "high" (Hunter verified or leadership page), "medium" (LinkedIn snippet clear), "low" (inferred)
5. Note your source: "hunter", "linkedin", "press", "team_page", "aggregator"

Return ONLY this JSON (no markdown, no explanation):
{
  "contact_name": "Full Name or null",
  "contact_position": "Exact title or null",
  "contact_linkedin": "https://linkedin.com/in/... URL (must appear in search results above) or null",
  "contact_info": "email@company.com or null",
  "confidence": "high|medium|low",
  "source": "hunter|linkedin|press|team_page|aggregator|not_found",
  "reasoning": "1 sentence explaining why you chose this person"
}

If NO credible current contact found, return:
{ "contact_name": null, "contact_position": null, "contact_linkedin": null, "contact_info": null, "confidence": "low", "source": "not_found", "reasoning": "No verified current contact found" }`;

  let result: {
    contact_name: string | null;
    contact_position: string | null;
    contact_linkedin: string | null;
    contact_info: string | null;
    confidence: string;
    source: string;
    reasoning?: string;
  } = {
    contact_name: null,
    contact_position: null,
    contact_linkedin: null,
    contact_info: null,
    confidence: 'low',
    source: 'not_found',
  };

  try {
    const aiRaw = await extractContactWithAI(prompt);
    const jsonMatch = aiRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Validate LinkedIn URL — check link fields AND snippet/title text (LinkedIn URLs appear in both)
      if (parsed.contact_linkedin) {
        const liUrl = validateLinkedInUrl(parsed.contact_linkedin);
        if (liUrl) {
          const liPath = liUrl.toLowerCase().split('/in/')[1]?.split('/')[0] || '';
          const fromHunter = hunterResults.some(h =>
            h.linkedin?.toLowerCase().includes(liPath)
          );
          // Check link fields
          const inLinkFields = [...allUrls].some(u => u && u.includes(liPath));
          // Check snippet + title text (LinkedIn slugs appear in snippets even when link is the page URL)
          const inSnippetText = allResults.some(r =>
            (`${r.title || ''} ${r.snippet || ''}`).toLowerCase().includes(liPath)
          );
          const foundInSearch = fromHunter || inLinkFields || inSnippetText;
          parsed.contact_linkedin = foundInSearch ? liUrl : null;
          if (!foundInSearch) {
            console.warn(`⚠️ Contact LinkedIn slug "${liPath}" not found in results — cleared`);
          }
        } else {
          parsed.contact_linkedin = null;
        }
      }

      // Validate name
      parsed.contact_name = validateContactName(parsed.contact_name) || null;
      result = parsed;
      console.log(`✅ Contact found for ${companyName}: ${result.contact_name} (${result.confidence}, ${result.source})`);
      if (result.reasoning) console.log(`   Reasoning: ${result.reasoning}`);
    }
  } catch (e) {
    console.error(`AI parse error for contact search:`, e);
  }

  // If company ID + origin provided, PATCH the record directly
  if (existingCompanyId && originUrl && result.contact_name) {
    try {
      const patchBody: Record<string, string | null> = {
        contact_name: result.contact_name,
        contact_position: result.contact_position,
        contact_linkedin: result.contact_linkedin,
        contact_info: result.contact_info,
      };
      await axios.patch(`${originUrl}/api/companies/${existingCompanyId}`, patchBody, {
        headers: { 'Content-Type': 'application/json' },
      });
      console.log(`💾 Patched company ${existingCompanyId} with new contact`);
    } catch (e) {
      console.error(`Failed to PATCH company ${existingCompanyId}:`, e);
    }
  }

  return result;
}

// Batch research multiple companies
export async function batchResearchCompanies(
  companyNames: string[],
  onProgress?: (progress: number, currentCompany: string) => void
): Promise<Company[]> {
  const results: Company[] = [];

  for (let i = 0; i < companyNames.length; i++) {
    const companyName = companyNames[i];
    if (onProgress) {
      onProgress((i / companyNames.length) * 100, companyName);
    }

    try {
      const companyData = await researchCompany(companyName);
      results.push(companyData);
    } catch (err) {
      console.error(`Error researching ${companyName}:`, err);
    }

    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (onProgress) {
    onProgress(100, 'Complete');
  }

  return results;
}
