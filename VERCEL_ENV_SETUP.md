# Vercel Environment Variables — Required Setup

Go to your Vercel project → **Settings → Environment Variables** and add all of these.

---

## ✅ Required — App will not work without these

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `prisma+postgres://accelerate.prisma-data.net/?api_key=...` | Your Prisma Postgres connection URL |
| `OPENAI_API_KEY` | `sk-proj-...` | Your OpenAI API key |
| `SERPER_API_KEY` | `d60adf...` | Serper.dev web search key |
| `LMSTUDIO_MODE` | `false` | **Must be `false` on Vercel** — LM Studio is a local-only tool |

## ✅ Required for Google Sheets sync

| Variable | Value | Notes |
|---|---|---|
| `GOOGLE_SHEETS_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` | ⚠️ See note below |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | `sponsor-research@techbirmingham.iam.gserviceaccount.com` | Service account email |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | `1761DIiQvGZ9FoM-EQrPlVdvrwUggtdyQzTsdnt5ccks` | Your spreadsheet ID |

### ⚠️ Private Key formatting on Vercel

When pasting `GOOGLE_SHEETS_PRIVATE_KEY` into Vercel, paste the **entire key including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines**, with actual newlines (not `\n` literally). Vercel's UI will preserve the newlines correctly.

If the sync still fails, try pasting it with literal `\n` characters:
```
-----BEGIN PRIVATE KEY-----\nMIIEu...\n-----END PRIVATE KEY-----\n
```

## Optional

| Variable | Value | Notes |
|---|---|---|
| `HUNTER_API_KEY` | `your_key` | Hunter.io for email verification — free tier available |

---

## How to verify everything is working

1. Visit your deployed app
2. The AI status pill in the top-right should show **green — OpenAI · gpt-4o**
3. Ask Grove: *"find 2 new sponsor companies"* — it should research and save them
4. Ask Grove: *"sync our spreadsheet"* — it should say ✅ synced N companies
