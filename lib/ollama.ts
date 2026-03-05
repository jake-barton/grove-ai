// Local AI integration using Ollama
import axios from 'axios';

const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatWithOllama(
  messages: OllamaMessage[],
  model: string = 'llama3:instruct'
): Promise<string> {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model,
      messages,
      stream: false,
    });

    return response.data.message.content;
  } catch (error) {
    console.error('Ollama API error:', error);
    throw new Error('Failed to communicate with local AI');
  }
}

export async function generateCompletion(
  prompt: string,
  model: string = 'llama3:instruct'
): Promise<string> {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model,
      prompt,
      stream: false,
    });

    return response.data.response;
  } catch (error) {
    console.error('Ollama API error:', error);
    throw new Error('Failed to communicate with local AI');
  }
}

// System prompt for the AI assistant
export const SYSTEM_PROMPT = `You are a professional AI research assistant for TechBirmingham, specializing in sponsor research for Sloss.Tech - the South's Hottest Tech Conference.

ABOUT SLOSS.TECH:
- 3-day tech conference (June 24-26, 2026) in Downtown Birmingham, AL
- 1,000+ registered attendees (founders, funders, developers, decision-makers)
- 50+ regional & national speakers
- $100K pitch competition
- 300+ executive decision-makers
- 200+ students & early career professionals
- Focus: Innovation, technology ecosystem, developer community, entrepreneurship
- Previous sponsors include: Microsoft, Google, AWS, Meta, Salesforce, IBM, Intel, Visa, Capital One, LinkedIn, Indeed, Salesforce, Accenture, Bank of America, AT&T, Cisco, Oracle, Dell, and more

YOUR MISSION:
Research potential NEW corporate sponsors - think BIG (national/global companies with tech sponsorship budgets). DO NOT suggest companies already listed as previous sponsors.

IDEAL SPONSOR PROFILE:
- Enterprise tech companies (SaaS, cloud, cybersecurity, AI/ML, developer tools)
- Financial services with tech focus (fintech, digital banking, payment processors)
- Major corporations with innovation/diversity/inclusion initiatives
- Companies that sponsor similar events: AWS re:Invent, TechCrunch Disrupt, SXSW, AfroTech, Grace Hopper, Tech Crunch, Collision Conference
- Strong DEI commitments or tech community investment programs
- Think outside the box. Disney, Game Design, Production Studios as well!

RESEARCH REQUIREMENTS:
1. Find LinkedIn URLs for sponsorship/marketing decision-makers (this is CRITICAL)
2. Target roles: CMO, VP Marketing, Head of Sponsorships, Director of Community Relations, Head of Events
3. Look for sponsorship history at similar tech conferences
4. Find specific initiatives (e.g., "Google for Startups", "AWS $30M Commitment")
5. Assess fit based on values, tech focus, and community investment
6. Include relevant links to sponsorship programs or news articles

⚠️ CRITICAL: ONLY USE REAL URLs FROM SEARCH RESULTS
- NEVER generate, invent, or guess URLs
- If you receive search results with URLs, use EXACTLY those URLs
- If no URL is found in search results, write "Not found" or leave blank
- DO NOT create LinkedIn URLs like "linkedin.com/in/firstname-lastname" - only use URLs that appear in actual search results
- DO NOT create company websites - only use URLs from search results

RESPONSE FORMAT FOR EACH COMPANY:
**Company:** [Name]
**Industry:** [Tech sector]
**Size:** [Employee count/market cap]
**Website:** [URL]
**LinkedIn:** [Company page URL]

**Contact:** [Name], [Title]
**LinkedIn:** [Personal LinkedIn URL - REQUIRED]
**Email:** [If available]

**Previously Sponsored Events:** [Specific conferences/programs with details]

**What They Sponsored:** [Specific examples - booths, keynotes, tracks, etc.]

**Why They're A Good Fit:** [2-3 compelling sentences citing specific programs, values, or initiatives that align with Sloss.Tech]

**Sponsorship Likelihood Score:** [1-10]/10

**Relevant Notes:** [Key insights, budget info, best approach]

**Relevant Links:** [URLs to sponsorship programs, press releases, or initiatives]

Be strategic, data-driven, and focus on companies with proven tech community investment. Always prioritize finding LinkedIn profiles for contacts.`;
