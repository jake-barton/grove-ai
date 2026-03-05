# Complete Setup Guide

## Database Schema (Supabase)

Run this SQL in your Supabase SQL Editor:

```sql
-- Create companies table
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  draft BOOLEAN DEFAULT false,
  outreach_status TEXT CHECK (outreach_status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
  email_format TEXT,
  contact_name TEXT,
  contact_position TEXT,
  contact_info TEXT,
  confirmed_emails TEXT[] DEFAULT '{}',
  bounced_emails TEXT[] DEFAULT '{}',
  previously_sponsored BOOLEAN DEFAULT false,
  previous_events TEXT[] DEFAULT '{}',
  industry TEXT,
  company_size TEXT,
  website TEXT,
  notes TEXT,
  sponsorship_likelihood_score INTEGER CHECK (sponsorship_likelihood_score >= 1 AND sponsorship_likelihood_score <= 10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_companies_created_at ON companies(created_at DESC);
CREATE INDEX idx_companies_sponsorship_score ON companies(sponsorship_likelihood_score DESC);

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations" ON companies FOR ALL USING (true);
```

## Google Sheets Setup

### Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click "Select a project" → "New Project"
3. Name it "TechBirmingham Sponsor Research"
4. Click "Create"

### Step 2: Enable Google Sheets API

1. In the project, go to "APIs & Services" → "Library"
2. Search for "Google Sheets API"
3. Click "Enable"

### Step 3: Create Service Account

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Name: "sponsor-research-bot"
4. Click "Create and Continue"
5. Skip optional steps, click "Done"

### Step 4: Create Key

1. Click on the service account you just created
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose "JSON"
5. Download the key file

### Step 5: Extract Credentials

Open the downloaded JSON file and find:
- `private_key` - Copy this (include the BEGIN and END lines)
- `client_email` - Copy this

### Step 6: Create & Share Google Sheet

1. Go to https://docs.google.com/spreadsheets
2. Create a new sheet
3. Name it "TechBirmingham Sponsors"
4. Click "Share" button
5. Paste the `client_email` from step 5
6. Give it "Editor" permissions
7. Copy the Spreadsheet ID from the URL:
   - URL: `https://docs.google.com/spreadsheets/d/1ABC123XYZ/edit`
   - ID: `1ABC123XYZ`

## Environment Variables Format

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Ollama (Local AI)
OLLAMA_API_URL=http://localhost:11434

# Serper API (Web Search)
SERPER_API_KEY=a1b2c3d4e5f6...

# Hunter.io (Email Validation)
HUNTER_API_KEY=a1b2c3d4e5f6...

# Google Sheets
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEF...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_CLIENT_EMAIL=sponsor-research-bot@techbirmingham-12345.iam.gserviceaccount.com
GOOGLE_SHEETS_SPREADSHEET_ID=1ABC123XYZ
```

**Important:** 
- Private key must be wrapped in double quotes
- Keep the `\n` characters (they represent newlines)
- Don't add extra spaces or line breaks

## Testing

After setup, test each component:

### 1. Test Ollama
```bash
ollama list  # Should show llama3.1:8b
curl http://localhost:11434/api/generate -d '{"model":"llama3.1:8b","prompt":"Hello"}'
```

### 2. Test Supabase
- Go to your Supabase project
- Table Editor → companies
- Try inserting a test row manually

### 3. Test APIs
Use the app's chat interface:
- "Find tech companies in Birmingham" (tests Serper)
- The AI will automatically validate emails (tests Hunter)

### 4. Test Google Sheets
- Click "Export to Sheets" button in the app
- Check your Google Sheet for data

## Troubleshooting

### Ollama Not Working
```bash
# Check if Ollama is running
ps aux | grep ollama

# Start Ollama
ollama serve

# Pull model if needed
ollama pull llama3.1:8b
```

### Supabase Connection Failed
- Verify URLs don't have trailing slashes
- Check API key is the "anon/public" key, not the service key
- Ensure RLS policies are set correctly

### Google Sheets Permission Denied
- Verify the sheet is shared with the service account email
- Check the service account has "Editor" permissions
- Ensure private key is properly formatted in `.env.local`

### API Rate Limits
- Serper: 2,500 searches/month free, then $50/5k searches
- Hunter: 50 searches/month free, then $49/month for 1,000

## Cost Optimization

To minimize API costs:

1. **Cache aggressively** - App already does this in database
2. **Batch research** - Research multiple companies at once
3. **Use free tiers** - Should be enough for moderate use
4. **Local AI does heavy lifting** - Only pay for web search/email validation

**Estimated monthly costs for 100 company researches:**
- Ollama (local AI): $0
- Serper (search): $0-5
- Hunter (email validation): $0-10
- Supabase (database): $0
- Vercel (hosting): $0
- **Total: $0-15/month**

## Next Steps

1. ✅ Complete all setup steps above
2. 🧪 Test with 2-3 companies
3. 📊 Import existing sponsor data (if any)
4. 🎯 Train AI on TechBirmingham-specific patterns
5. 👥 Onboard team members
6. 🚀 Start researching sponsors!
