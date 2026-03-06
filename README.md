# Grove AI - TechBirmingham Sponsor Research Platform

> AI-powered sponsorship research tool built for TechBirmingham.
> Automatically researches companies, finds decision-maker contacts, scores sponsorship fit, and exports everything to Google Sheets.

---

## What It Does

- **AI research** - Type a company name and Grove finds the right contact (CMO, VP Marketing, Head of Partnerships, etc.), their LinkedIn, email, and a sponsorship fit score
- **Smart scoring** - Each company is rated on tech relevance, Birmingham connection, and likelihood to sponsor
- **Google Sheets export** - One click to push all results to your shared spreadsheet
- **Persistent database** - All research is saved so you can pick up where you left off
- **Chat interface** - Talk to the AI naturally ("Research Microsoft", "Find tech companies in Birmingham")

---

## Quick Start (macOS)

### Option 1 - Double-click to launch (easiest)

1. Complete the Setup steps below
2. Double-click **`Start Grove AI.command`** in the project folder
3. A terminal opens, the server starts, and your browser opens automatically

> **First run only:** macOS may block the file. Right-click > Open > Open to allow it once.

### Option 2 - Terminal

```bash
cd sponsor-research-ai
npm install        # first time only
npm run dev
```

Then open **http://localhost:3000**

---

## Setup

### 1. Prerequisites

- **Node.js 18+** (LTS) - Download from https://nodejs.org
- Check with: `node -v`

---

### 2. Clone & Install

```bash
git clone https://github.com/YOUR_ORG/grove-ai.git
cd grove-ai
npm install
```

---

### 3. Configure Environment Variables

Copy the example file:

```bash
cp .env.local.example .env.local
```

Then open `.env.local` and fill in the values below.

---

### 4. Get Your API Keys

#### OpenAI (required - powers the AI research)
1. Go to https://platform.openai.com/api-keys
2. Create a new secret key
3. Paste it into `.env.local` as `OPENAI_API_KEY`
4. Set `LMSTUDIO_MODE=false`

#### Serper - Web Search (required)
1. Sign up at https://serper.dev (free - 2,500 searches/month)
2. Copy your API key and paste as `SERPER_API_KEY`

#### Hunter.io - Email Finder (optional but recommended)
1. Sign up at https://hunter.io (free - 50 searches/month)
2. Go to API, copy your key, and paste as `HUNTER_API_KEY`

---

### 5. Set Up the Database (Prisma Cloud)

1. Go to https://console.prisma.io and sign in with GitHub
2. Create a new **Prisma Postgres** project (free tier available)
3. Copy the `DATABASE_URL` connection string
4. Paste it into `.env.local` as `DATABASE_URL`
5. Run the database migration:

```bash
npx prisma migrate dev
```

---

### 6. Set Up Google Sheets Export (optional)

This lets Grove push research results directly to a shared spreadsheet.

**A) Create a Google Cloud Service Account**
1. Go to https://console.cloud.google.com
2. Create a new project (or use an existing one)
3. Enable **Google Sheets API**: APIs & Services > Enable APIs > search "Sheets"
4. Go to **IAM & Admin > Service Accounts** > Create service account
5. Give it a name (e.g. `grove-sheets`)
6. Click the account > **Keys** > **Add Key** > **JSON** > download the file

**B) Extract the credentials**

Open the downloaded JSON file and copy:
- `client_email` - paste as `GOOGLE_SHEETS_CLIENT_EMAIL`
- `private_key` - paste as `GOOGLE_SHEETS_PRIVATE_KEY` (keep the `\n` newlines)

**C) Share your spreadsheet**
1. Create or open your Google Sheet
2. Share it with the `client_email` address (Editor access)
3. Copy the spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
4. Paste as `GOOGLE_SHEETS_SPREADSHEET_ID`

---

### 7. Run It

```bash
npm run dev
```

Open **http://localhost:3000**

---

## Usage

Type naturally in the chat interface:

| What you say | What happens |
|---|---|
| `Research Microsoft` | Finds CMO/VP, LinkedIn, email, score |
| `Find tech companies in Birmingham` | Suggests local sponsors |
| `Export all to Google Sheets` | Pushes everything to your sheet |
| `Clear all companies` | Resets the database |
| `Show me high priority companies` | Filters by score |

---

## Project Structure

```
sponsor-research-ai/
├── app/                   # Next.js app router pages & API routes
│   ├── api/               # Backend API endpoints
│   │   ├── research/      # Main AI research endpoint
│   │   ├── companies/     # CRUD for saved companies
│   │   ├── ai-status/     # AI connectivity check
│   │   └── export-sheets/ # Google Sheets export
│   └── page.tsx           # Main chat UI
├── components/            # React components (Header, CompanyCard, etc.)
├── lib/                   # Core logic
│   ├── ai-agent.ts        # Main research pipeline
│   ├── openai.ts          # OpenAI / LM Studio client
│   ├── memory-store.ts    # In-memory + DB state
│   └── types.ts           # TypeScript types
├── prisma/                # Database schema & migrations
├── public/                # Static assets (logo, animations)
├── .env.local.example     # <- copy this to .env.local
└── Start Grove AI.command # <- double-click to launch on macOS
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Prisma Cloud connection string |
| `OPENAI_API_KEY` | Yes | OpenAI secret key |
| `LMSTUDIO_MODE` | Yes | `false` for OpenAI, `true` for LM Studio |
| `SERPER_API_KEY` | Yes | Serper web search key |
| `HUNTER_API_KEY` | Optional | Hunter.io email finder |
| `GOOGLE_SHEETS_PRIVATE_KEY` | Optional | Google service account private key |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | Optional | Google service account email |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Optional | Target spreadsheet ID |

---

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript**
- **OpenAI GPT-4o** - AI research & contact extraction
- **Serper.dev** - Google Search API
- **Hunter.io** - Email & contact enrichment
- **Prisma + Prisma Postgres** - Database
- **Google Sheets API** - Export
- **Tailwind CSS** - Styling
- **Lottie** - Loading animation

---

## Troubleshooting

**"Cannot connect to AI"** - Check your `OPENAI_API_KEY` in `.env.local` and make sure `LMSTUDIO_MODE=false`

**"Database error"** - Run `npx prisma migrate dev` and check your `DATABASE_URL`

**"No contacts found"** - Add a `HUNTER_API_KEY` for significantly better contact results. Also check your `SERPER_API_KEY` quota at serper.dev

**Port 3000 in use** - Run `lsof -ti tcp:3000 | xargs kill -9` then try again

**`.command` file blocked by macOS** - Right-click > Open > Open (you only need to do this once)

---

## License

Internal tool - TechBirmingham 2026
