// AI Agent that orchestrates web search and research tasks
import { extractContactWithAI } from '@/lib/openai';
import { Company } from '@/lib/types';
import { runAllAgents, type AgentSearchData } from '@/lib/research-agents';
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
      { q: query, num: 10 },
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
    const msg = error instanceof Error ? error.message : String(error);
    // Serper returns 429 on rate limit and 402 on quota exhaustion
    if (msg.includes('429') || msg.includes('402') || msg.includes('quota') || msg.includes('credits')) {
      console.warn('⚠️ Serper API quota/rate limit hit — search skipped. Research quality will be reduced.');
    } else {
      console.error('❌ Web search error:', error);
    }
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

// Helper: run searches in small concurrent batches with a pause between batches
// This avoids hammering Serper with 10 simultaneous requests (which causes rate-limit silent failures)
async function batchedSearches(queries: string[], batchSize = 3, delayMs = 400): Promise<SearchResult[][]> {
  const results: SearchResult[][] = new Array(queries.length).fill([]);
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(q => searchWeb(q)));
    for (let j = 0; j < batch.length; j++) {
      results[i + j] = batchResults[j];
    }
    if (i + batchSize < queries.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}

// Main AI research agent
export async function researchCompany(companyName: string): Promise<Company> {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  // Run searches in batches of 3 with 400ms gaps to avoid Serper rate-limit silent failures
  console.log(`🚀 Launching batched searches for "${companyName}"…`);
  const searchQueries = [
    // 1: Company website
    `${companyName} official website`,
    // 2: Sponsorship history
    `"${companyName}" tech conference sponsorship ${currentYear} OR ${prevYear}`,
    // 3: LinkedIn decision-makers
    `"${companyName}" (CMO OR "VP Marketing" OR "Head of Sponsorships" OR "Director of Partnerships") site:linkedin.com -former -"ex-" -left`,
    // 4: Recent company initiatives
    `"${companyName}" tech community sponsorship developer investment ${currentYear}`,
    // 5: LinkedIn company page
    `site:linkedin.com/company "${companyName}"`,
    // 6: LinkedIn people — senior marketing/partnerships roles
    `site:linkedin.com/in "${companyName}" (CMO OR "VP Marketing" OR "Director of Sponsorships" OR "Head of Partnerships") -"former" -"ex-"`,
    // 7: Recent news/PR
    `"${companyName}" (CMO OR "VP Marketing" OR "Head of Partnerships") ${currentYear} news interview`,
    // 8: Named exec searches — finds people actually quoted/named in press
    `"${companyName}" (CMO OR "VP of Marketing" OR "Head of Sponsorships") ${currentYear} -site:linkedin.com`,
    // 9: Press quotes — finds named people actively speaking for the company right now
    `"${companyName}" sponsorship OR partnership "${currentYear}" "said" OR "announced"`,
  ];

  const searchResultsArr = await batchedSearches(searchQueries, 3, 500);
  const [
    companySearchResults,
    sponsorshipSearchResults,
    contactSearchResults,
    initiativesSearchResults,
    linkedInCompanyResults,
    linkedInPeopleResults,
    recentNewsResults,
    execSearchResults,
    pressQuoteResults,
  ] = searchResultsArr;
  // Keep linkedInCurrentResults as alias to peopleResults for prompt compatibility
  const linkedInCurrentResults = linkedInPeopleResults;
  console.log(`✅ All searches complete for "${companyName}" (${searchResultsArr.reduce((s, r) => s + r.length, 0)} total results)`);

  // Pick the best company website — prefer actual company domain over Wikipedia/news sites
  const NON_COMPANY_DOMAINS = new Set([
    'wikipedia.org', 'wikimedia.org', 'britannica.com', 'crunchbase.com',
    'bloomberg.com', 'forbes.com', 'techcrunch.com', 'reuters.com', 'cnbc.com',
    'businessinsider.com', 'fortune.com', 'wsj.com', 'nytimes.com', 'theverge.com',
    'wired.com', 'zdnet.com', 'venturebeat.com', 'cnet.com', 'engadget.com',
    'linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
    'youtube.com', 'glassdoor.com', 'indeed.com', 'quora.com', 'reddit.com',
    'g2.com', 'capterra.com', 'trustpilot.com', 'producthunt.com',
    'zoominfo.com', 'dnb.com', 'apollo.io',
  ]);
  const companyWebsite = (() => {
    for (const result of companySearchResults) {
      if (!result.link) continue;
      try {
        const host = new URL(result.link).hostname.replace(/^www\./, '');
        if (!NON_COMPANY_DOMAINS.has(host) && !NON_COMPANY_DOMAINS.has(host.split('.').slice(-2).join('.'))) {
          return result.link;
        }
      } catch { /* skip */ }
    }
    return companySearchResults[0]?.link || '';
  })();
  console.log(`🌐 Company website: ${companyWebsite || 'not found'}`);

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
    console.log(`📋 Leadership page content found (${leadershipContent.length} chars)`);
  }

  // Format Hunter contacts as readable text for the AI agents
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

  // Collect all search results for the agents
  const allSearchResults = [
    ...companySearchResults,
    ...sponsorshipSearchResults,
    ...contactSearchResults,
    ...initiativesSearchResults,
    ...linkedInCompanyResults,
    ...linkedInPeopleResults,
    ...recentNewsResults,
    ...execSearchResults,
    ...pressQuoteResults,
  ];

  // Build the shared data payload passed to all three agents
  const agentData: AgentSearchData = {
    companyName,
    companyWebsite,
    websiteContent,
    leadershipContent,
    hunterContactsText,
    hunterContacts,
    linkedInCompanyUrl,
    linkedInCompanyContent,
    allSearchResults,
    sponsorshipResults: sponsorshipSearchResults,
    contactResults: contactSearchResults,
    linkedInPeopleResults,
    execResults: execSearchResults,
    pressQuoteResults,
    recentNewsResults,
  };

  // ── Run all three specialist agents in parallel ──────────────────────────
  // ResearchAgent + ContactAgent run simultaneously; ScoringAgent follows after Research
  const { research, scoring, contact } = await runAllAgents(agentData);

  // ── Merge agent outputs ──────────────────────────────────────────────────
  const companyData = {
    company_name: companyName,
    industry: research.industry,
    company_size: research.company_size,
    website: research.website || companyWebsite,
    linkedin_company: research.linkedin_company,
    contact_name: contact.contact_name,
    contact_position: contact.contact_position,
    contact_linkedin: contact.contact_linkedin,
    contact_info: contact.contact_info,
    email_format: research.email_format,
    previously_sponsored: research.previously_sponsored ? research.previous_events : [],
    what_they_sponsored: research.what_they_sponsored,
    why_good_fit: scoring.why_good_fit,
    sponsorship_likelihood_score: scoring.sponsorship_likelihood_score,
    relevant_notes: research.relevant_notes,
    relevant_links: research.relevant_links,
  };

  // ── Validation (same as before — agents are trusted but we still sanity-check) ──
  console.log(`\n🔍 AGENT OUTPUTS merged for ${companyName}:`, JSON.stringify(companyData, null, 2));

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
  originUrl?: string,
  knownWebsite?: string,
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

  // Fire searches in batches of 3 to avoid Serper rate-limit silent failures
  const contactQueries = [
    // LinkedIn profiles — CMO / VP Marketing at this company right now
    `site:linkedin.com/in "${companyName}" (CMO OR "Chief Marketing Officer" OR "VP of Marketing" OR "VP Marketing") -former -"ex-" -left -departed`,
    // LinkedIn profiles — Partnerships / Sponsorships
    `site:linkedin.com/in "${companyName}" ("Head of Partnerships" OR "Director of Partnerships" OR "Head of Sponsorships" OR "Sponsorship Manager") -former -"ex-"`,
    // Named in press — people quoted or credited for the company in news
    `"${companyName}" ("CMO" OR "Chief Marketing Officer" OR "VP Marketing" OR "Head of Partnerships") "${currentYear}" said OR announced -site:linkedin.com`,
    // Conference/event sponsorship contacts
    `"${companyName}" sponsorship contact OR "sponsorship team" OR "partnerships team" "${currentYear}"`,
    // Apollo / ZoomInfo data aggregators
    `"${companyName}" (CMO OR "VP Marketing" OR "Head of Partnerships") email site:apollo.io OR site:rocketreach.co OR site:contactout.com`,
    // Twitter/X — often the fastest way to find who speaks for a company publicly
    `site:twitter.com OR site:x.com "${companyName}" (CMO OR "VP Marketing" OR "Head of Partnerships") "${currentYear}"`,
  ];

  const contactSearchResults = await batchedSearches(contactQueries, 3, 400);
  const [s1, s2, s3, s4, s5, s6] = contactSearchResults;
  const s7: SearchResult[] = [];
  const s8: SearchResult[] = [];

  // Aggregate all unique results
  const allResults = [...s1, ...s2, ...s3, ...s4, ...s5, ...s6];
  const allUrls = new Set(allResults.map(r => r.link?.toLowerCase()).filter(Boolean));

  // Hunter.io domain search — if configured, this gives us verified emails + LinkedIn
  let hunterText = '';
  const hunterResults: HunterContact[] = [];
  try {
    // Use the known website domain if available, otherwise guess from company name
    let domain = '';
    if (knownWebsite) {
      try { domain = new URL(knownWebsite).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    }
    if (!domain) {
      domain = companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
    }
    const hc = await hunterDomainSearch(domain);
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
