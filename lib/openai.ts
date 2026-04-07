// OpenAI integration for chat
// Works with OpenAI API OR LM Studio local server (OpenAI-compatible)
import OpenAI from 'openai';
import { getAIMode, getRuntimeApiKey, AIMode } from '@/lib/ai-mode';

function isLMStudio(modeOverride?: AIMode) {
  return (modeOverride ?? getAIMode()) === 'lmstudio';
}

const lmStudioBaseURL = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';

// Cache the active LM Studio model so we don't re-fetch it every call
let _cachedLMModel: string | null = null;
async function getActiveLMStudioModel(): Promise<string> {
  if (_cachedLMModel) return _cachedLMModel;
  try {
    const res = await fetch(`${lmStudioBaseURL}/models`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      const model = data?.data?.[0]?.id;
      if (model) {
        _cachedLMModel = model;
        return model;
      }
    }
  } catch { /* fallback */ }
  return 'local-model';
}

/** Returns the OpenAI API key to use — runtime key (user-supplied) takes priority */
function getOpenAIKey(): string {
  return getRuntimeApiKey() || process.env.OPENAI_API_KEY || '';
}

/**
 * Get the AI client.
 * @param forceOpenAI — always use real OpenAI (for classifiers, extraction etc.)
 * @param modeOverride — pass the mode from the request cookie (Vercel-safe)
 */
function getClient(forceOpenAI = false, modeOverride?: AIMode) {
  const useLM = !forceOpenAI && isLMStudio(modeOverride);
  return new OpenAI({
    apiKey: useLM ? 'lm-studio' : getOpenAIKey(),
    baseURL: useLM ? lmStudioBaseURL : 'https://api.openai.com/v1',
  });
}

async function getDefaultChatModel(modeOverride?: AIMode): Promise<string> {
  if (isLMStudio(modeOverride)) return await getActiveLMStudioModel();
  return 'gpt-4o';
}
async function getDefaultJsonModel(modeOverride?: AIMode): Promise<string> {
  if (isLMStudio(modeOverride)) return await getActiveLMStudioModel();
  return 'gpt-4o';
}
export async function getFastExtractionModel(modeOverride?: AIMode): Promise<string> {
  if (isLMStudio(modeOverride)) return await getActiveLMStudioModel();
  return 'gpt-4o-mini';
}
export const FAST_EXTRACTION_MODEL = 'gpt-4o-mini'; // kept for backward compat

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Retry wrapper with exponential backoff for 429 rate limits ────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 5000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const is429 = msg.includes('429') || msg.includes('rate limit') || msg.includes('Rate limit');
      const isQuotaExhausted = msg.includes('quota') || msg.includes('insufficient_quota') || msg.includes('billing');
      const isAuthError = msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('Incorrect API key');

      // Hard failures — no point retrying
      if (isAuthError) {
        throw new Error('OpenAI API key is invalid or not set. Please check your OPENAI_API_KEY in Vercel environment variables.');
      }
      if (isQuotaExhausted) {
        throw new Error('OpenAI quota exhausted. Please check your billing at platform.openai.com/usage and add credits if needed.');
      }

      if (is429 && attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 5s, 10s, 20s
        console.warn(`⏳ OpenAI rate limited (429) — retrying in ${delay / 1000}s (attempt ${attempt}/${maxAttempts})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retry attempts exceeded');
}

/**
 * Chat — uses LM Studio model or gpt-4o depending on mode.
 * Pass modeOverride (from request cookie) for Vercel-safe mode selection.
 */
export async function chatWithOpenAI(
  messages: ChatMessage[],
  modelOverride?: string,
  modeOverride?: import('@/lib/ai-mode').AIMode
): Promise<string> {
  const model = modelOverride ?? await getDefaultChatModel(modeOverride);
  return withRetry(async () => {
    const response = await getClient(false, modeOverride).chat.completions.create({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 2000,
    });
    return response.choices[0]?.message?.content || 'No response';
  });
}

/**
 * Intent classification — ALWAYS uses OpenAI gpt-4o-mini regardless of mode toggle.
 * Fast, cheap, and LM Studio can't reliably load models for this.
 */
/**
 * Intent classification using OpenAI function/tool calling.
 * Much more reliable than asking the model to output JSON and parsing it —
 * the model is forced to use the schema, so we get guaranteed structure.
 */
export async function classifyIntentWithTools(
  userMessage: string,
  companySummary: string
): Promise<Record<string, unknown>> {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'research_new_companies',
        description: 'Find and research NEW companies not already in the pipeline as potential sponsors for Sloss.Tech.',
        parameters: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'How many companies to research. Default 5.' },
            query: { type: 'string', description: 'Any specific criteria the user mentioned (industry, size, location, etc.)' },
          },
          required: ['count'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_contacts',
        description: 'Find or update LinkedIn/email contacts for existing pipeline companies.',
        parameters: {
          type: 'object',
          properties: {
            targets: {
              type: 'array',
              items: { type: 'string' },
              description: 'Company names to update. Empty array means ALL companies.',
            },
          },
          required: ['targets'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'edit_company_fields',
        description: 'Change specific data fields (score, status, notes, contact info, etc.) on one or more existing companies.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 're_research_companies',
        description: 'Fully re-research companies already in the pipeline to refresh their data.',
        parameters: {
          type: 'object',
          properties: {
            targets: {
              type: 'array',
              items: { type: 'string' },
              description: 'Company names to re-research. Empty array means ALL companies.',
            },
          },
          required: ['targets'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_companies',
        description: 'Delete companies from the pipeline. IMPORTANT: always show a preview/confirmation before deleting.',
        parameters: {
          type: 'object',
          properties: {
            targets: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific company names to delete. Use empty array if deleting by score or all.',
            },
            score_below: {
              type: 'number',
              description: 'Delete companies with sponsorship_likelihood_score strictly LESS THAN this number. E.g. score_below:3 deletes scores 1 and 2. Use when user says "below X", "under X", "X/10 companies", "low scores", etc.',
            },
            delete_all: {
              type: 'boolean',
              description: 'True ONLY if user explicitly wants to delete every single company with no filter. Never set this if any score/name is mentioned.',
            },
          },
          required: ['targets', 'delete_all'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'undo_last_action',
        description: 'Restore the database to its state before the last destructive action (delete/clear). Use when user says "undo", "restore", "bring back", "I made a mistake", etc.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'sync_sheet',
        description: 'Sync the Google Sheet to match the current database.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'compare_sheet',
        description: 'Compare what is in the app/database vs what is in the Google Sheet.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'format_sheet',
        description: 'Format or style the Google Sheet (colors, sorting, highlights, column widths).',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'chat',
        description: 'Answer a general question, provide information, or handle anything not covered by the other tools.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  ];

  return withRetry(async () => {
    const response = await getClient(true).chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.0,
      tool_choice: 'required',
      tools,
      messages: [
        {
          role: 'system',
          content: `You are Grove, an AI assistant for Sloss.Tech sponsor research. You MUST call exactly one function to handle the user's request. Never respond with text — always use a function call.

Current pipeline (${companySummary.split('\n').length} companies):
${companySummary}

Key rules:
- If the user mentions a score number with delete ("3/10", "below 4", "low scores"), use delete_companies with score_below set — NEVER set delete_all:true when a score is mentioned.
- "delete all 2/10 companies" → score_below:3 (scores of 2 or less), delete_all:false
- "delete everything" with no other qualifier → delete_all:true, score_below omitted
- "undo", "restore", "bring back my companies" → undo_last_action
- Prefer specific actions over chat when the user's intent is clear.`,
        },
        { role: 'user', content: userMessage },
      ],
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) return { intent: 'CHAT' };

    const fnCall = toolCall.type === 'function' ? toolCall.function : null;
    if (!fnCall) return { intent: 'CHAT' };

    let args: Record<string, unknown> = {};
    try { args = JSON.parse(fnCall.arguments); } catch { /* empty args */ }

    return { intent: fnCall.name.toUpperCase(), ...args };
  });
}

export async function classifyIntent(messages: ChatMessage[]): Promise<string> {
  return withRetry(async () => {
    const response = await getClient(true).chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.0,
      max_tokens: 300,
    });
    return response.choices[0]?.message?.content || '';
  });
}

/**
 * Generate structured JSON response — full research.
 * ALWAYS uses OpenAI (gpt-4o) regardless of mode toggle.
 * Reason: the research prompt is 8-12k tokens — LM Studio models don't have the context window for it.
 */
export async function generateWithOpenAI(
  prompt: string,
  modelOverride?: string
): Promise<string> {
  // Force OpenAI — LM Studio context windows can't handle the full research prompt
  const model = modelOverride ?? 'gpt-4o';
  return withRetry(async () => {
    const response = await getClient(true).chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
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
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 8000,
    });
    return response.choices[0]?.message?.content || '';
  });
}

/**
 * Fast contact extraction — always uses OpenAI gpt-4o-mini (reliable, cheap)
 */
export async function extractContactWithAI(prompt: string): Promise<string> {
  return withRetry(async () => {
    const response = await getClient(true).chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You extract contact information from search results. Output ONLY valid JSON. Never invent data — only use what appears in the provided search results.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.0,
      max_tokens: 500,
    });
    return response.choices[0]?.message?.content || '';
  });
}

/**
 * Generate with an explicit system prompt (used by sheets formatter etc.)
 * Pass modeOverride (from request cookie) for Vercel-safe mode selection.
 */
export async function generateWithSystemPrompt(
  systemPrompt: string,
  userPrompt: string,
  modelOverride?: string,
  modeOverride?: import('@/lib/ai-mode').AIMode
): Promise<string> {
  const model = modelOverride ?? await getDefaultJsonModel(modeOverride);
  try {
    const response = await getClient(false, modeOverride).chat.completions.create({
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

