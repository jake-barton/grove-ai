// OpenAI integration for chat
// Works with OpenAI API OR LM Studio local server (OpenAI-compatible)
import OpenAI from 'openai';

// LM Studio runs on localhost:1234 with OpenAI-compatible API
// If OPENAI_API_KEY is set to "lm-studio" or LMSTUDIO_MODE is true, use local LM Studio
const useLMStudio = process.env.LMSTUDIO_MODE === 'true' || process.env.OPENAI_API_KEY === 'lm-studio';

// Allow overriding the LM Studio base URL via env var (useful when running on a different machine/port)
const lmStudioBaseURL = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';

// Lazy-initialise clients so the module can be imported at build time without
// throwing "Missing credentials" (env vars aren't available during next build's
// static-analysis phase).
function getLMStudioClient() {
  return new OpenAI({ apiKey: 'lm-studio', baseURL: lmStudioBaseURL });
}

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'placeholder-set-at-runtime',
    baseURL: 'https://api.openai.com/v1',
  });
}

// Use the loaded LM Studio model, or gpt-4o for real OpenAI
const DEFAULT_CHAT_MODEL = useLMStudio ? 'openai/gpt-oss-20b' : 'gpt-4o';
const DEFAULT_JSON_MODEL = useLMStudio ? 'openai/gpt-oss-20b' : 'gpt-4o';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat with OpenAI GPT-4
 * Much smarter than local Ollama models
 */
export async function chatWithOpenAI(
  messages: ChatMessage[],
  model: string = DEFAULT_CHAT_MODEL
): Promise<string> {
  const client = useLMStudio ? getLMStudioClient() : getOpenAIClient();
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 2000,
    });

    return response.choices[0]?.message?.content || 'No response';
  } catch (error: unknown) {
    // If LM Studio was selected but is unreachable, fall back to real OpenAI
    if (useLMStudio) {
      console.warn('LM Studio unreachable — falling back to OpenAI gpt-4o');
      try {
        const fallback = await getOpenAIClient().chat.completions.create({
          model: 'gpt-4o',
          messages,
          temperature: 0.2,
          max_tokens: 2000,
        });
        return fallback.choices[0]?.message?.content || 'No response';
      } catch (fallbackErr) {
        const msg = fallbackErr instanceof Error ? fallbackErr.message : JSON.stringify(fallbackErr);
        throw new Error(`OpenAI fallback failed: ${msg}`);
      }
    }
    const errMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('OpenAI API error:', errMsg);
    throw new Error(`OpenAI request failed: ${errMsg}`);
  }
}

/**
 * Generate structured JSON response from OpenAI
 * Used for company research
 */
export async function generateWithOpenAI(
  prompt: string,
  model: string = DEFAULT_JSON_MODEL
): Promise<string> {
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
    {
      role: 'user' as const,
      content: prompt,
    },
  ];

  const makeRequest = async (client: OpenAI, mdl: string) =>
    client.chat.completions.create({
      model: mdl,
      messages,
      temperature: 0.1,
      max_tokens: 8000,
    });

  const client = useLMStudio ? getLMStudioClient() : getOpenAIClient();
  try {
    const response = await makeRequest(client, model);
    return response.choices[0]?.message?.content || '';
  } catch (error: unknown) {
    // Fall back to real OpenAI if LM Studio is unreachable
    if (useLMStudio) {
      console.warn('LM Studio unreachable — falling back to OpenAI gpt-4o for JSON generation');
      try {
        const fallback = await makeRequest(getOpenAIClient(), 'gpt-4o');
        return fallback.choices[0]?.message?.content || '';
      } catch (fallbackErr) {
        const msg = fallbackErr instanceof Error ? fallbackErr.message : JSON.stringify(fallbackErr);
        throw new Error(`OpenAI fallback failed: ${msg}`);
      }
    }
    const errMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('OpenAI generation error:', errMsg);
    throw new Error(`OpenAI generation failed: ${errMsg}`);
  }
}

/**
 * Generate with an explicit system prompt (used by sheets formatter etc.)
 */
export async function generateWithSystemPrompt(
  systemPrompt: string,
  userPrompt: string,
  model: string = DEFAULT_JSON_MODEL
): Promise<string> {
  const client = useLMStudio ? getLMStudioClient() : getOpenAIClient();
  try {
    const response = await client.chat.completions.create({
      model,
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
    console.error('OpenAI generation error:', errMsg);
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

