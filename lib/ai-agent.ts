// AI Agent that orchestrates web search and research tasks
import { generateWithOpenAI } from '@/lib/openai';
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

  // Run all searches in parallel — 8 queries simultaneously instead of sequentially
  console.log(`🚀 Launching 8 parallel searches for "${companyName}"…`);
  const [
    companySearchResults,
    sponsorshipSearchResults,
    contactSearchResults,
    initiativesSearchResults,
    linkedInCompanyResults,
    linkedInPeopleResults,
    linkedInCurrentResults,
    recentNewsResults,
  ] = await Promise.all([
    // 1: Company website — prefer recent results
    searchWeb(`${companyName} official website ${currentYear} OR ${prevYear}`),
    // 2: Sponsorship history — recent events only
    searchWeb(`"${companyName}" tech conference sponsorship ${currentYear} OR ${prevYear} OR "2025" OR "2026"`),
    // 3: Current decision-makers — filter out former employees
    searchWeb(`"${companyName}" (CMO OR "Chief Marketing Officer" OR "VP Marketing" OR "Head of Sponsorships" OR "Director of Partnerships") site:linkedin.com ${currentYear} -former -"ex-" -left -departed`),
    // 4: Recent company initiatives
    searchWeb(`"${companyName}" tech community sponsorship diversity investment ${currentYear} OR ${prevYear}`),
    // 5: LinkedIn company page
    searchWeb(`site:linkedin.com/company "${companyName}"`),
    // 6: LinkedIn people — current employees only
    searchWeb(`site:linkedin.com/in "${companyName}" (CMO OR "VP Marketing" OR "Director of Sponsorships" OR "Head of Partnerships" OR "Community Manager") -"former" -"ex-" -left`),
    // 7: LinkedIn people with explicit current-year signals
    searchWeb(`site:linkedin.com/in "${companyName}" (marketing OR sponsorships OR partnerships) "${currentYear}" -former -"ex-"`),
    // 8: Recent news/PR to verify who is actively representing the company
    searchWeb(`"${companyName}" (CMO OR "VP Marketing" OR "Head of Partnerships" OR "sponsorship") ${currentYear} news announcement interview`),
  ]);
  console.log(`✅ All 8 searches complete for "${companyName}"`);

  const companyWebsite = companySearchResults[0]?.link || '';

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
  ].forEach((result) => {
    if (result.link) {
      allSearchResultUrls.add(result.link.toLowerCase());
    }
  });

  console.log(`📊 Collected ${allSearchResultUrls.size} unique URLs from search results`);

  // Step 7: Scrape company website if found
  let websiteContent = '';
  if (companyWebsite) {
    websiteContent = await scrapeWebsite(companyWebsite);
  }

  // Step 8: Attempt to scrape the LinkedIn company page (public "about" section)
  let linkedInCompanyContent = '';
  const linkedInCompanyUrl = linkedInCompanyResults[0]?.link || '';
  if (linkedInCompanyUrl && linkedInCompanyUrl.includes('linkedin.com/company')) {
    linkedInCompanyContent = await scrapeWebsite(linkedInCompanyUrl);
    console.log(`🔗 LinkedIn company page scraped: ${linkedInCompanyUrl} (${linkedInCompanyContent.length} chars)`);
  }

  // Step 9: Find emails on website
  let emails: string[] = [];
  if (companyWebsite) {
    emails = await findEmails(companyWebsite);
  }

  // Step 10: Build research prompt for the AI
  const researchPrompt = `Research the company "${companyName}" as a potential sponsor for Sloss.Tech, a technology conference in Birmingham, Alabama.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]} — only use data that reflects the company's CURRENT state in ${currentYear}.

I've gathered this information from web searches:

**Company Website & Info:**
${companyWebsite}
${websiteContent.substring(0, 500)}

**LinkedIn Company Page:**
URL: ${linkedInCompanyUrl || 'Not found'}
Content: ${linkedInCompanyContent.substring(0, 400) || 'Not available'}

**LinkedIn Company Search Results:**
${JSON.stringify(linkedInCompanyResults.slice(0, 3), null, 2)}

**LinkedIn People / Decision-Makers:**
${JSON.stringify(linkedInPeopleResults.slice(0, 4), null, 2)}

**LinkedIn People — Current Employees (${currentYear}):**
${JSON.stringify(linkedInCurrentResults.slice(0, 4), null, 2)}

**Recent News / PR — ${currentYear}:**
${JSON.stringify(recentNewsResults.slice(0, 4), null, 2)}

**Sponsorship History (${prevYear}–${currentYear}):**
${JSON.stringify(sponsorshipSearchResults.slice(0, 4), null, 2)}

**Decision-Maker Search Results:**
${JSON.stringify(contactSearchResults.slice(0, 4), null, 2)}

**Company Snippets:**
${[...companySearchResults, ...sponsorshipSearchResults].slice(0, 8).map(r => r.snippet).filter(Boolean).join('\n')}

**Emails Found:**
${emails.slice(0, 3).join(', ') || 'none'}

Based on the search data above AND your training knowledge about "${companyName}", output a single JSON object. Fill every field with real data — do NOT output the field descriptions as values:

{
  "company_name": "${companyName}",
  "industry": "<e.g. Cloud Computing, Cybersecurity, SaaS, Financial Technology>",
  "company_size": "<e.g. 220,000+ employees (publicly traded) or Series B startup ~150 employees>",
  "website": "${companyWebsite || 'Not found'}",
  "linkedin_company": "<exact URL from LinkedIn Company Search Results above, or Not found>",
  "contact_name": "<exact person name from LinkedIn People results above if they currently work at ${companyName}, or Not found>",
  "contact_position": "<their exact job title, or Not found>",
  "contact_linkedin": "<exact linkedin.com/in/... URL copied from search results above, or Not found>",
  "contact_info": "${emails[0] || 'Not found'}",
  "email_format": "<e.g. firstname@microsoft.com, or Not available>",
  "previously_sponsored": ["<specific events from Sponsorship History above>"],
  "what_they_sponsored": "<what ${companyName} has sponsored or 'No verified sponsorships found'>",
  "why_good_fit": "• <reason 1: how ${companyName}'s products/services align with developers/tech professionals>\n• <reason 2: their investment in developer community, open source, or tech ecosystems>\n• <reason 3: their sponsorship history or company scale that makes them a strong prospect>",
  "sponsorship_likelihood_score": 7,
  "relevant_notes": "<1-2 sentences of useful insight about ${companyName} as a Sloss.Tech sponsor>",
  "relevant_links": ["<up to 3 exact URLs from the search data above>"]
}

Output ONLY the JSON object. No markdown. No code fences. Start with { end with }.`;

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
  ];
  
  console.log(`🔗 Validating LinkedIn URLs...`);
  console.log(`   Contact LinkedIn: ${companyData.contact_linkedin}`);
  console.log(`   Company LinkedIn: ${companyData.linkedin_company}`);
  
  // First validate format
  let validatedContactLinkedIn = validateLinkedInUrl(companyData.contact_linkedin);
  let validatedCompanyLinkedIn = validateLinkedInUrl(companyData.linkedin_company);
  
  // Verify LinkedIn URLs came from search results
  // Extract just the profile slug from a LinkedIn URL (handles all regional subdomains:
  // ca.linkedin.com, in.linkedin.com, uk.linkedin.com, www.linkedin.com — all resolve to same slug)
  const extractLinkedInSlug = (url: string): string => {
    try {
      const path = new URL(url.toLowerCase()).pathname;
      const inMatch = path.match(/\/in\/([^/]+)/);
      const coMatch = path.match(/\/company\/([^/]+)/);
      return inMatch?.[1] ?? coMatch?.[1] ?? '';
    } catch {
      return '';
    }
  };

  if (validatedContactLinkedIn) {
    const slug = extractLinkedInSlug(validatedContactLinkedIn);
    const foundInResults = slug.length > 2 && [...allSearchResultUrls].some(
      u => extractLinkedInSlug(u) === slug
    );
    if (!foundInResults) {
      console.warn(`⚠️ Contact LinkedIn slug "${slug}" not found in search results, rejecting: ${validatedContactLinkedIn}`);
      validatedContactLinkedIn = null;
    } else {
      console.log(`✅ Contact LinkedIn verified in search results: ${validatedContactLinkedIn}`);
    }
  }
  
  if (validatedCompanyLinkedIn) {
    const slug = extractLinkedInSlug(validatedCompanyLinkedIn);
    const foundInResults = slug.length > 2 && [...allSearchResultUrls].some(
      u => extractLinkedInSlug(u) === slug
    );
    if (!foundInResults) {
      console.warn(`⚠️ Company LinkedIn slug "${slug}" not found in search results, rejecting: ${validatedCompanyLinkedIn}`);
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
        !companyName.toLowerCase().includes(mentioned) &&
        !mentioned.includes(companyName.toLowerCase())
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
    if (positionLower.includes('former') && !positionLower.includes(companyName.toLowerCase())) {
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

    // Gather all snippets from people-related searches
    const peopleSnippets = [
      ...linkedInPeopleResults,
      ...linkedInCurrentResults,
      ...contactSearchResults,
    ]
      .filter((r) => {
        const textToCheck = `${r.title || ''} ${r.snippet || ''} ${r.link || ''}`.toLowerCase();
        // Only check results that are about this specific person
        return (
          textToCheck.includes(nameLower.split(' ')[0]) ||
          (contactLinkedInUrl && textToCheck.includes(contactLinkedInUrl.toLowerCase().split('/in/')[1]?.split('/')[0] || ''))
        );
      })
      .map((r) => `${r.title || ''} ${r.snippet || ''}`.toLowerCase());

    for (const snippet of peopleSnippets) {
      for (const signal of staleSignalPatterns) {
        if (signal.test(snippet)) {
          console.warn(`⚠️ Stale contact signal detected in snippet: "${signal}" — clearing contact`);
          console.warn(`   Snippet: "${snippet.substring(0, 200)}"`);
          return true;
        }
      }
      // Also check if the snippet mentions them at a company OTHER than the one we're researching
      // e.g. "Jane Doe | CMO at Google" when researching AWS
      const companyNameLower = companyName.toLowerCase();
      const atAnotherPattern = /(?:at|@|·)\s+([a-z][a-z0-9&. ]{2,30})/g;
      let m;
      while ((m = atAnotherPattern.exec(snippet)) !== null) {
        const mentionedCo = m[1].trim();
        if (
          mentionedCo.length > 3 &&
          !companyNameLower.includes(mentionedCo) &&
          !mentionedCo.includes(companyNameLower) &&
          !['the', 'a', 'an', 'inc', 'llc', 'ltd', 'co', 'corp', 'group', 'linkedin'].includes(mentionedCo)
        ) {
          // Only flag as stale if the snippet is specifically about the contact (name match)
          if (snippet.includes(nameLower.split(' ')[0]) && snippet.includes(nameLower.split(' ').pop()!)) {
            console.warn(`⚠️ Contact snippet mentions "${mentionedCo}" (not ${companyName}) — possible stale contact`);
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
    if (!finalContactName || !finalContactLinkedIn) return 'unverified';
    // High: found in current-year LinkedIn signals AND/OR recent news
    const inCurrentYear = linkedInCurrentResults.some(r =>
      `${r.title || ''} ${r.link || ''}`.toLowerCase().includes(
        finalContactName.toLowerCase().split(' ')[0]
      )
    );
    const inRecentNews = recentNewsResults.some(r =>
      `${r.title || ''} ${r.snippet || ''}`.toLowerCase().includes(
        finalContactName.toLowerCase().split(' ')[0]
      )
    );
    if (inCurrentYear && inRecentNews) return 'high';
    if (inCurrentYear || inRecentNews) return 'medium';
    return 'low';
  })();
  console.log(`🎯 Contact confidence for ${validatedCompanyName}: ${contactConfidence}`);

  // ── #5: Sponsorship likelihood score — based on prospect quality, not just data completeness ──
  // Use the AI's score as the base (it has context on the company's fit), then adjust for signals
  const aiScore = typeof companyData.sponsorship_likelihood_score === 'number'
    ? Math.min(10, Math.max(1, companyData.sponsorship_likelihood_score))
    : 5;

  const scoreAdjustments = {
    hasContact:          finalContactName && finalContactLinkedIn ? +1 : 0,   // bonus for verified contact
    hasPrevSponsored:    (Array.isArray(companyData.previously_sponsored) &&
                          companyData.previously_sponsored.length > 0) ? +1 : 0,
    hasEmail:            validatedContactEmail ? +1 : 0,
    missingWebsite:      !validatedWebsite ? -1 : 0,   // mild penalty only
  };
  const adjustment = Object.values(scoreAdjustments).reduce((a, b) => a + b, 0);
  const groundedScore = Math.min(10, Math.max(1, aiScore + adjustment));
  console.log(`📊 Score for ${validatedCompanyName}: AI=${aiScore} adj=${adjustment} → ${groundedScore}/10`);

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
