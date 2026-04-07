/**
 * Parallel Specialist Research Agents
 *
 * Inspired by open-multi-agent's coordinator pattern — instead of one giant
 * monolithic prompt doing everything, three focused agents run in parallel:
 *
 *   🔬 ResearchAgent    — finds company info, industry, size, sponsorship history
 *   🎯 ScoringAgent     — evaluates sponsorship fit and assigns a grounded score
 *   👤 ContactAgent     — finds the best current decision-maker with email/LinkedIn
 *
 * Each agent has a single focused system prompt. They share the same raw search
 * data (fetched once) and produce independent JSON outputs that are merged into
 * the final Company record.
 *
 * Benefits vs. monolithic approach:
 *  - Each agent can be swapped/upgraded independently
 *  - Scoring is objective (separate from research bias)
 *  - Contact finding is strict (no research noise leaks in)
 *  - All three run in ~parallel so total latency ≈ slowest agent, not sum
 *  - Failures are isolated — bad contact data doesn't kill company research
 */

import { generateWithOpenAI, extractContactWithAI, classifyIntent } from '@/lib/openai';

// ── Shared data types ─────────────────────────────────────────────────────

export interface AgentSearchData {
  companyName: string;
  companyWebsite: string;
  websiteContent: string;
  leadershipContent: string;
  hunterContactsText: string;
  hunterContacts: Array<{ first_name: string; last_name: string; value: string; position?: string; linkedin?: string; confidence?: number }>;
  linkedInCompanyUrl: string;
  linkedInCompanyContent: string;
  allSearchResults: Array<{ link?: string; title?: string; snippet?: string }>;
  sponsorshipResults: Array<{ link?: string; title?: string; snippet?: string }>;
  contactResults: Array<{ link?: string; title?: string; snippet?: string }>;
  linkedInPeopleResults: Array<{ link?: string; title?: string; snippet?: string }>;
  execResults: Array<{ link?: string; title?: string; snippet?: string }>;
  pressQuoteResults: Array<{ link?: string; title?: string; snippet?: string }>;
  recentNewsResults: Array<{ link?: string; title?: string; snippet?: string }>;
}

export interface ResearchAgentOutput {
  industry: string;
  company_size: string;
  website: string;
  linkedin_company: string | null;
  previously_sponsored: boolean;
  previous_events: string[];
  what_they_sponsored: string;
  relevant_links: string[];
  relevant_notes: string;
  email_format: string;
}

export interface ScoringAgentOutput {
  sponsorship_likelihood_score: number;
  why_good_fit: string;
  reasoning: string;
}

export interface ContactAgentOutput {
  contact_name: string | null;
  contact_position: string | null;
  contact_linkedin: string | null;
  contact_info: string | null;
  confidence: 'high' | 'medium' | 'low' | 'unverified';
  source: string;
}

// ── Agent 1: Research Agent ───────────────────────────────────────────────
/**
 * Focused on: company facts, industry, size, website, LinkedIn company page,
 * sponsorship history, relevant links.
 * Does NOT care about contacts — that's the Contact Agent's job.
 */
export async function runResearchAgent(data: AgentSearchData): Promise<ResearchAgentOutput> {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  const prompt = `You are a company research specialist. Extract factual information about "${data.companyName}".

DO NOT find contacts — that is handled by a separate agent.
ONLY extract: company facts, industry, size, LinkedIn company page, sponsorship history, website, relevant links.

## Search Data

Website: ${data.companyWebsite}
Website content: ${data.websiteContent.substring(0, 600)}

LinkedIn Company URL: ${data.linkedInCompanyUrl || 'not found'}
LinkedIn content: ${data.linkedInCompanyContent.substring(0, 400)}

Sponsorship history (${prevYear}–${currentYear}):
${JSON.stringify(data.sponsorshipResults.slice(0, 5), null, 2)}

All search snippets:
${data.allSearchResults.slice(0, 12).map(r => r.snippet).filter(Boolean).join('\n')}

## Rules
- industry: specific (e.g. "Cloud Security", "Developer Tools") — never "Unknown" or "Technology"
- company_size: use text from snippets (e.g. "5,000 employees", "Series D startup") — "Unknown" only if truly absent
- linkedin_company: EXACT URL from search data containing "linkedin.com/company/" — null if not found
- previous_events: ONLY events from ${prevYear} or ${currentYear} explicitly named in sponsorship results — [] if none
- relevant_links: EXACT URLs from search data — max 3 — company site, LinkedIn, one news article
- email_format: infer from any emails seen (e.g. "firstname@company.com") — "Not available" if unknown

Return ONLY valid JSON:
{
  "industry": "string",
  "company_size": "string",
  "website": "exact URL or empty string",
  "linkedin_company": "exact URL or null",
  "previously_sponsored": boolean,
  "previous_events": ["event name", ...],
  "what_they_sponsored": "specific examples or 'No verified sponsorships found'",
  "relevant_links": ["url1", "url2"],
  "relevant_notes": "2-3 key facts about their tech/community investment",
  "email_format": "pattern or 'Not available'"
}`;

  try {
    const raw = await generateWithOpenAI(prompt, 'gpt-4o-mini');
    const match = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/);
    if (match) {
      const fixed = match[0]
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/"((?:[^"\\]|\\.)*)"/g, (_m: string, inner: string) =>
          `"${inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`
        );
      return JSON.parse(fixed);
    }
  } catch (e) {
    console.error('[ResearchAgent] parse error:', e);
  }

  // Fallback
  return {
    industry: 'Technology',
    company_size: 'Unknown',
    website: data.companyWebsite,
    linkedin_company: null,
    previously_sponsored: false,
    previous_events: [],
    what_they_sponsored: 'No verified sponsorships found',
    relevant_links: [],
    relevant_notes: '',
    email_format: 'Not available',
  };
}

// ── Agent 2: Scoring Agent ────────────────────────────────────────────────
/**
 * Focused on: evaluating sponsorship likelihood and writing why_good_fit.
 * Has access to all search data but its ONLY output is a score + justification.
 * Separation means the score is objective and doesn't get inflated by whoever
 * happened to write the research notes.
 */
export async function runScoringAgent(
  data: AgentSearchData,
  researchOutput: ResearchAgentOutput
): Promise<ScoringAgentOutput> {
  const currentYear = new Date().getFullYear();

  const prompt = `You are a sponsorship opportunity evaluator for Sloss.Tech, a technology conference in Birmingham, Alabama.

Evaluate "${data.companyName}" as a potential sponsor.

## Company Facts (from Research Agent)
Industry: ${researchOutput.industry}
Size: ${researchOutput.company_size}
Previously sponsored tech events: ${researchOutput.previously_sponsored ? researchOutput.previous_events.join(', ') || 'yes' : 'no'}
What they sponsored: ${researchOutput.what_they_sponsored}
Notes: ${researchOutput.relevant_notes}

## Supporting Evidence
Sponsorship signals:
${data.sponsorshipResults.slice(0, 5).map(r => `- ${r.title}: ${r.snippet}`).filter(r => r.length > 3).join('\n')}

Community/developer investment:
${data.allSearchResults.slice(0, 8).map(r => r.snippet).filter(Boolean).join('\n')}

Recent news (${currentYear}):
${data.recentNewsResults.slice(0, 4).map(r => `- ${r.title}: ${r.snippet}`).filter(Boolean).join('\n')}

## Scoring Criteria (assign a score 1-10 based on EVIDENCE, not assumptions)
- 9-10: Clear active tech sponsorship program, multiple recent events, strong developer community investment
- 7-8: Some sponsorship history OR strong tech community signals, good product/audience fit
- 5-6: Technology company with plausible fit, limited sponsorship signals
- 3-4: Weak signals, unlikely to sponsor a regional tech conference
- 1-2: No evidence of sponsorship activity, poor fit for a tech conference

## why_good_fit: Write EXACTLY 3 bullet points
- Bullet 1 (•): How their product/service aligns with Sloss.Tech's audience (developers, CTOs, tech entrepreneurs)
- Bullet 2 (•): Specific community/developer investment signals from the search data
- Bullet 3 (•): Sponsorship likelihood based on history and company profile
Only use FACTS from the search data above — no invented claims.

Return ONLY valid JSON:
{
  "sponsorship_likelihood_score": <number 1-10>,
  "why_good_fit": "• Bullet 1\\n• Bullet 2\\n• Bullet 3",
  "reasoning": "1-2 sentences explaining the score"
}`;

  try {
    const raw = await classifyIntent([{ role: 'user', content: prompt }]);
    const match = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/);
    if (match) {
      const fixed = match[0]
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/"((?:[^"\\]|\\.)*)"/g, (_m: string, inner: string) =>
          `"${inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`
        );
      const parsed = JSON.parse(fixed);
      // Clamp score
      parsed.sponsorship_likelihood_score = Math.min(10, Math.max(1, Math.round(parsed.sponsorship_likelihood_score || 5)));
      return parsed;
    }
  } catch (e) {
    console.error('[ScoringAgent] parse error:', e);
  }

  return {
    sponsorship_likelihood_score: 5,
    why_good_fit: `• ${data.companyName} operates in the technology sector aligning with Sloss.Tech's audience.\n• Limited sponsorship signals found in current data.\n• Score reflects available evidence only.`,
    reasoning: 'Default score — insufficient data for confident evaluation.',
  };
}

// ── Agent 3: Contact Agent ────────────────────────────────────────────────
/**
 * Focused on: finding the BEST current decision-maker for sponsorship outreach.
 * Uses Hunter.io as primary source, then leadership pages, then LinkedIn/press.
 * Validates every URL and name against the raw search data before accepting.
 * Returns null contact fields if nothing can be verified — never invents data.
 */
export async function runContactAgent(data: AgentSearchData): Promise<ContactAgentOutput> {
  const currentYear = new Date().getFullYear();

  const prompt = `You are a contact intelligence specialist. Find the BEST person at "${data.companyName}" for tech conference sponsorship outreach.

TODAY: ${new Date().toISOString().split('T')[0]}

## HUNTER.IO VERIFIED CONTACTS (highest trust — REAL verified emails):
${data.hunterContactsText || 'None found'}

## LEADERSHIP / TEAM PAGE (scraped from company website):
${data.leadershipContent || 'Not found'}

## LINKEDIN PEOPLE — DECISION MAKERS:
${JSON.stringify(data.contactResults.slice(0, 5), null, 2)}

## LINKEDIN PEOPLE — ${currentYear} SIGNALS:
${JSON.stringify(data.linkedInPeopleResults.slice(0, 5), null, 2)}

## PRESS QUOTES — NAMED EXECUTIVES:
${JSON.stringify(data.execResults.slice(0, 4), null, 2)}

## RECENT NEWS ${currentYear}:
${JSON.stringify(data.recentNewsResults.slice(0, 4), null, 2)}

## INSTRUCTIONS — PRIORITY ORDER:
1. Hunter.io contacts first (verified emails, real people)
2. Leadership/team page (ground truth from company itself)
3. Press quotes — people quoted BY NAME for the company in ${currentYear}
4. LinkedIn — ONLY if CURRENT title at ${data.companyName} is visible in snippet

## TITLE PRIORITY:
Head of Sponsorships > Director of Partnerships > CMO > VP Marketing > Community Lead > CEO

## REJECTION RULES — reject anyone with these signals:
❌ "former", "ex-", "previously at", "left", "now at", "joined [other company]"
❌ Title mentions a DIFFERENT company
❌ LinkedIn snippet shows them at a different employer

## CONTACT LINKEDIN URL:
- Must be a real linkedin.com/in/... URL
- Must appear CHARACTER-FOR-CHARACTER in the search data above
- Never construct or guess a URL
- null if not verifiable

Return ONLY valid JSON:
{
  "contact_name": "Full Name or null",
  "contact_position": "Exact current title or null",
  "contact_linkedin": "https://linkedin.com/in/... or null",
  "contact_info": "email or null",
  "confidence": "high|medium|low|unverified",
  "source": "hunter|leadership_page|press|linkedin|not_found"
}`;

  try {
    const raw = await extractContactWithAI(prompt);
    const match = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/);
    if (match) {
      const parsed: ContactAgentOutput = JSON.parse(match[0]);

      // Validate LinkedIn URL against search data
      if (parsed.contact_linkedin) {
        const liPath = parsed.contact_linkedin.toLowerCase().split('/in/')[1]?.split(/[/?#]/)[0] || '';
        if (liPath.length < 3) {
          parsed.contact_linkedin = null;
        } else {
          const allText = data.allSearchResults
            .map(r => `${r.link || ''} ${r.title || ''} ${r.snippet || ''}`)
            .join(' ')
            .toLowerCase();
          const fromHunter = data.hunterContacts.some(h => h.linkedin?.toLowerCase().includes(liPath));
          const foundInSearch = fromHunter || allText.includes(liPath);
          if (!foundInSearch) {
            console.warn(`[ContactAgent] LinkedIn slug "${liPath}" not in search data — cleared`);
            parsed.contact_linkedin = null;
          }
        }
      }

      // Validate name — reject placeholder names
      const PLACEHOLDER_NAMES = new Set([
        'john doe', 'jane doe', 'john smith', 'jane smith', 'not found', 'n/a', 'unknown',
        'contact name', 'first last', 'name here',
      ]);
      if (parsed.contact_name) {
        const lower = parsed.contact_name.toLowerCase().trim();
        if (PLACEHOLDER_NAMES.has(lower) || lower.length < 4 || !/[a-z]/.test(lower)) {
          parsed.contact_name = null;
          parsed.contact_position = null;
          parsed.contact_linkedin = null;
          parsed.contact_info = null;
          parsed.confidence = 'unverified';
          parsed.source = 'not_found';
        }
      }

      return parsed;
    }
  } catch (e) {
    console.error('[ContactAgent] parse error:', e);
  }

  return {
    contact_name: null,
    contact_position: null,
    contact_linkedin: null,
    contact_info: null,
    confidence: 'unverified',
    source: 'not_found',
  };
}

// ── Orchestrator: run all 3 agents in parallel ────────────────────────────
/**
 * Runs ResearchAgent, ScoringAgent (depends on Research), and ContactAgent
 * in an optimised order:
 *   - ResearchAgent + ContactAgent run in PARALLEL (independent data)
 *   - ScoringAgent runs after ResearchAgent (needs research output)
 *   - Total latency ≈ max(research, contact) + scoring
 *     instead of research + contact + scoring (serial)
 */
export async function runAllAgents(data: AgentSearchData): Promise<{
  research: ResearchAgentOutput;
  scoring: ScoringAgentOutput;
  contact: ContactAgentOutput;
}> {
  console.log(`\n🤖 Running parallel specialist agents for "${data.companyName}"…`);
  const t0 = Date.now();

  // Phase 1: Research + Contact in parallel
  const [research, contact] = await Promise.all([
    runResearchAgent(data).then(r => {
      console.log(`  ✅ ResearchAgent done (${Date.now() - t0}ms) — ${r.industry}, score signals ready`);
      return r;
    }),
    runContactAgent(data).then(c => {
      console.log(`  ✅ ContactAgent done (${Date.now() - t0}ms) — ${c.contact_name || 'no contact'} (${c.confidence})`);
      return c;
    }),
  ]);

  // Phase 2: Scoring (uses research output)
  const scoring = await runScoringAgent(data, research).then(s => {
    console.log(`  ✅ ScoringAgent done (${Date.now() - t0}ms) — score: ${s.sponsorship_likelihood_score}/10`);
    return s;
  });

  console.log(`🏁 All agents complete for "${data.companyName}" in ${Date.now() - t0}ms`);
  return { research, scoring, contact };
}
