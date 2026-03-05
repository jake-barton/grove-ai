# TechBirmingham AI Sponsor Research Platform

## 🚀 Setup Instructions

### 1. Install Ollama (Local AI)

**macOS:**
```bash
brew install ollama
```

**Or download from:** https://ollama.ai/download

**Start Ollama:**
```bash
ollama serve
```

**Download AI Model:**
```bash
ollama pull llama3.1:8b
```

### 2. Set Up Supabase Database

1. Go to https://supabase.com and create a free account
2. Create a new project
3. Go to **SQL Editor** and run the schema from SETUP.md

### 3. Get API Keys (Free Tiers Available)

**Serper API:** https://serper.dev (2,500 free searches)
**Hunter.io:** https://hunter.io (50 free searches/month)

### 4. Set Up Google Sheets Integration

See SETUP.md for detailed instructions

### 5. Configure Environment Variables

Fill in `.env.local` with your credentials

### 6. Run the App

```bash
npm install
npm run dev
```

Open http://localhost:3000

---

## 🎯 Features

- 🤖 AI-powered company research
- 💬 Conversational interface
- 📊 Smart sponsorship scoring
- ✉️ Email finding & validation
- �� Auto-export to Google Sheets
- 🔄 Real-time sync with database

---

## 📝 Usage

Talk to the AI naturally:
- "Find tech companies in Birmingham"
- "Research Microsoft"
- "Export all to Google Sheets"

See SETUP.md for complete documentation.
