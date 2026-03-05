// OpenAI integration for chat
// Works with OpenAI API OR LM Studio local server (OpenAI-compatible)
import OpenAI from 'openai';
import { getLMStudioURL, getLMStudioActive } from './runtime-config';

// Static env-based LM Studio mode (local dev)
const envLMStudio = process.env.LMSTUDIO_MODE === 'true' || process.env.OPENAI_API_KEY === 'lm-studio';
const envLMStudioBaseURL = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';

// Resolve the active LM Studio URL — DB takes priority over env var
// (DB is set by the tunnel script when ngrok connects)
async function resolveLMConfig(): Promise<{ active: boolean; baseURL: string }> {
  try {
    const [dbActive, dbURL] = await Promise.all([getLMStudioActive(), getLMStudioURL()]);
    if (dbActive && dbURL) return { active: true, baseURL: dbURL };
  } catch {
    // DB unavailable — fall through to env var
  }
  return { active: envLMStudio, baseURL: envLMStudioBaseURL };
}

// Lazy client factories
function makeLMStudioClient(baseURL: string) {
  return new OpenAI({ apiKey: 'lm-studio', baseURL });
}

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'placeholder-set-at-runtime',
    baseURL: 'https://api.openai.com/v1',
  });
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Pick the right client based on DB config (tunnel URL) or env var fallback */
async function getActiveClient(): Promise<{ client: OpenAI; useLM: boolean; model: string }> {
  const { active, baseURL } = await resolveLMConfig();
  if (active) {
    return { client: makeLMStudioClient(baseURL), useLM: true, model: 'openai/gpt-oss-20b' };
  }
  return { client: getOpenAIClient(), useLM: false, model: 'gpt-4o' };
}

/**
 * Chat with Grove's AI
 */
export async function chatWithOpenAI(
  messages: ChatMessage[],
  model?: string
): Promise<string> {
  const { client, useLM, model: defaultModel } = await getActiveClient();
  const mdl = model ?? defaultModel;
  try {
    const response = await client.chat.completions.create({
      model: mdl,
      messages,
      temperature: 0.2,
      max_tokens: 2000,
    });
    return response.choices[0]?.message?.content || 'No response';
  } catch (error: unknown) {
    if (useLM) {
      console.warn('LM Studio unreachable — falling back to OpenAI gpt-4o');
      try {
        const fallback = await getOpenAIClient().chat.completions.create({
          model: 'gpt-4o', messages, temperature: 0.2, max_tokens: 2000,
        });
        return fallback.choices[0]?.message?.content || 'No response';
      } catch (fe) {
        throw new Error(`OpenAI fallback failed: ${fe instanceof Error ? fe.message : fe}`);
      }
    }
    const errMsg = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`OpenAI request failed: ${errMsg}`);
  }
}

/**
 * Generate structured JSON response — used for company research
 */
export async function generateWithOpenAI(
  prompt: string,
  model?: string
): Promise<string> {
  const { client, useLM, model: defaultModel } = await getActiveClient();
  const mdl = model ?? defaultModel;

  const messages = [
    {
      role: 'system' as const,
      content: `You are a strict research assistant that outputs only verified, factual data as JSON.

🚨 ABSOLUTE RULES — NEVER VIOLATE:
- NEVER invent, guess, or hallucinate: names, LinkedIn URLs, email addresses, job titles, company details, or events
- ONLY use data that is explicitly present in the provided search results and snippets
- If a field cannot be confirmed from the provided data, output "Not found" — do not fill it with assumptions
- LinkedIn URLs must be copied character-for-character from search results — never construct them
- Contact names must come directly from search result titles/snippets — never infer them
- A "Not found" answer is always correct and preferred over an invented one

You output ONLY valid JSON. No explanations, no markdown, no prose outside the JSON object.`,
    },
    { role: 'user' as const, content: prompt },
  ];

  const makeRequest = (c: OpenAI, m: string) =>
    c.chat.completions.create({ model: m, messages, temperature: 0.1, max_tokens: 8000 });

  try {
    const response = await makeRequest(client, mdl);
    return response.choices[0]?.message?.content || '';
  } catch (error: unknown) {
    if (useLM) {
      console.warn('LM Studio unreachable — falling back to OpenAI gpt-4o for JSON generation');
      try {
        const fallback = await makeRequest(getOpenAIClient(), 'gpt-4o');
        return fallback.choices[0]?.message?.content || '';
      } catch (fe) {
        throw new Error(`OpenAI fallback failed: ${fe instanceof Error ? fe.message : fe}`);
      }
    }
    const errMsg = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`OpenAI generation failed: ${errMsg}`);
  }
}

/**
 * Generate with an explicit system prompt (used by sheets formatter etc.)
 */
export async function generateWithSystemPrompt(
  systemPrompt: string,
  userPrompt: string,
  model?: string
): Promise<string> {
  const { client, model: defaultModel } = await getActiveClient();
  const mdl = model ?? defaultModel;
  try {
    const response = await client.chat.completions.create({
      model: mdl,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    });
    return response.choices[0]?.message?.content || '';
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`OpenAI generation failed: ${errMsg}`);
  }
}

export const SYSTEM_PROMPT = `You are Grove, an AI assistant helping with sponsor research for Sloss.Tech, a technology conference in Birmingham, Alabama.

Your capabilities:
- Research companies for sponsorship potential
- Answer questions about companies in the database
- Format and organize spreadsheet data
- Provide insights and recommendations

You have access to:
- A database of researched companies with sponsorship data
- Google Sheets integration for data management
- Web search capabilities for company research

Be helpful, concise, and action-oriented. When users ask you to do something, understand their intent and take action rather than just explaining what could be done.

🚨 CRITICAL ANTI-HALLUCINATION RULES — NEVER VIOLATE THESE 🚨

NEVER invent, fabricate, or guess:
- People's names (contacts, executives, employees)
- LinkedIn profile URLs (e.g. linkedin.com/in/...) 
- Email addresses
- Job titles for specific named individuals
- Company org structure details you haven't verified

If a user asks for a contact person at a specific company (e.g. "who is the CMO of AWS?", "find me a contact at Google"), you MUST:
1. Tell them you cannot invent contacts — only real verified data is safe to use
2. Instruct them to use Grove's research pipeline to get verified contacts, e.g.:
   "To get a verified, current contact for [Company], say: **research [Company]** — I'll run a real web search and only save contacts I can confirm are currently employed there."
3. NEVER produce a table, list, or suggestion with made-up names/URLs

If you don't have verified data from a real web search, say so honestly. A "Not found" result is always better than a fabricated one.`;

