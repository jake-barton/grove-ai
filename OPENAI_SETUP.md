# OpenAI Setup Guide

Your app now uses **OpenAI GPT-4** instead of local Ollama! This makes your AI chat assistant much smarter and better at understanding requests.

## Why OpenAI is Better

- **Smarter**: GPT-4 is significantly more intelligent than llama3:instruct
- **Better JSON**: No more JSON parsing errors - GPT-4 outputs clean, valid JSON
- **Context Understanding**: Understands nuanced requests like "delete all" vs "research all"
- **Reliable**: Much more consistent results
- **Cost**: Only ~$0.01-0.05 per conversation (very affordable)

## Setup Steps

### 1. Get an OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to **API Keys** section
4. Click **"Create new secret key"**
5. Copy your key (starts with `sk-...`)

**New users get $5 free credit!**

### 2. Add Key to .env.local

Open `.env.local` and replace:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

With your actual key:

```bash
OPENAI_API_KEY=sk-proj-abc123...
```

### 3. Restart Your Dev Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

## What Changed

### Chat Route (`app/api/chat/route.ts`)
- Now uses `chatWithOpenAI()` instead of `chatWithOllama()`
- Much better at understanding user intent
- Handles delete, format, and research requests intelligently

### Research Agent (`lib/ai-agent.ts`)
- Now uses `generateWithOpenAI()` for company research
- Better JSON generation - no more parse errors
- More accurate data extraction from search results

### New File (`lib/openai.ts`)
- OpenAI integration with GPT-4 Turbo
- Temperature tuned for best results (0.7 for chat, 0.3 for JSON)
- Proper error handling

## Cost Estimate

**GPT-4 Turbo Pricing:**
- Input: $0.01 per 1K tokens (~750 words)
- Output: $0.03 per 1K tokens

**Typical Usage:**
- Chat message: ~500-1000 tokens = $0.01-0.02
- Company research: ~2000-3000 tokens = $0.05-0.10
- Daily heavy use (50 companies): ~$2.50

**For your use case:** Probably $1-5 per month even with heavy use.

## Testing

Try these commands to see how much smarter it is:

```
"Delete all companies from the spreadsheet"
→ Should immediately understand and call clear API

"Make the spreadsheet look professional"
→ Should understand formatting request

"Research Microsoft for sponsorship"
→ Should generate clean JSON with accurate data
```

## Fallback to Ollama

If you want to use Ollama again, just:
1. Change imports from `@/lib/openai` back to `@/lib/ollama`
2. Comment out `OPENAI_API_KEY` in `.env.local`

But I strongly recommend sticking with OpenAI - the quality difference is huge!
