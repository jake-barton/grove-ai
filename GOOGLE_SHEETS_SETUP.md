# Google Sheets Integration Setup Guide

## Overview
The app now automatically syncs all companies to Google Sheets in real-time. No export button needed - every add, edit, delete, or approve action instantly updates the spreadsheet!

## Features
- ✅ **Persistent Storage** - Companies saved to `data/companies.json` (survives server restarts)
- ✅ **Live Sync** - Every CRUD operation automatically syncs to Google Sheets
- ✅ **No Export Button** - Changes happen in real-time
- ✅ **Auto-Create Spreadsheet** - Creates a new spreadsheet if needed
- ✅ **Formatted Headers** - Blue header row with white bold text
- ✅ **17 Columns** - All company data including approval status

## Setup Instructions

### 1. Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Note your project ID

### 2. Enable Google Sheets API
1. In Google Cloud Console, go to **APIs & Services > Library**
2. Search for "Google Sheets API"
3. Click **Enable**

### 3. Create a Service Account
1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > Service Account**
3. Name it: `sponsor-research-sheets`
4. Click **Create and Continue**
5. Click **Done**

### 4. Generate Service Account Key
1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key > Create New Key**
4. Choose **JSON**
5. Download the JSON file (keep it secure!)

### 5. Add Credentials to .env.local
Open the downloaded JSON file and copy these values to your `.env.local`:

```bash
# The private_key field (keep the quotes and \n characters)
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Key_Here\n-----END PRIVATE KEY-----\n"

# The client_email field
GOOGLE_SHEETS_CLIENT_EMAIL=sponsor-research-sheets@your-project.iam.gserviceaccount.com

# Leave this empty for now (will be auto-created)
GOOGLE_SHEETS_SPREADSHEET_ID=
```

### 6. First Run
1. Start your dev server: `npm run dev`
2. Add a company via the AI research
3. Check the terminal - you'll see:
   ```
   📊 Created new spreadsheet: <SPREADSHEET_ID>
   🔗 View at: https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>
   ```
4. Copy the `<SPREADSHEET_ID>` and add it to your `.env.local`
5. Click the link to view your new spreadsheet!

### 7. Share the Spreadsheet (Optional)
The spreadsheet is initially private to the service account. To access it:
1. Open the spreadsheet link from the terminal
2. Click **Share**
3. Add your email or make it accessible to your organization
4. Now you and your team can view/edit the live data!

## How It Works

### Automatic Sync Events
Every action triggers a Google Sheets update:

- **Add Company** → New row appended to spreadsheet
- **Update Company** → Existing row updated in spreadsheet
- **Delete Company** → Row removed from spreadsheet
- **Approve Company** → Status column updated to "Approved"

### Data Persistence
Companies are stored in two places:
1. **File System** - `data/companies.json` (local persistence)
2. **Google Sheets** - Live spreadsheet (collaboration & viewing)

### Error Handling
If Google Sheets sync fails:
- ⚠️ Warning logged to console
- ✅ Company still saved locally
- 🔄 Next sync will catch up

## Spreadsheet Columns

| Column | Description |
|--------|-------------|
| ID | Unique identifier |
| Company Name | Company name |
| Industry | Industry/sector |
| Company Size | Number of employees |
| Website | Company website URL |
| LinkedIn Company | Company LinkedIn page |
| Contact Name | Decision maker name |
| Contact Position | Job title (CMO, VP Marketing, etc.) |
| Contact LinkedIn | Personal LinkedIn profile |
| Contact Email | Email address |
| Email Format | Email pattern (firstname@company.com) |
| Previously Sponsored | Past events sponsored |
| Sponsorship Score | Likelihood score (1-10) |
| Status | Approved or Pending |
| Notes | Additional insights |
| Created At | Timestamp created |
| Updated At | Last modified timestamp |

## Troubleshooting

### "Google Sheets credentials not configured"
- Check that `GOOGLE_SHEETS_PRIVATE_KEY` and `GOOGLE_SHEETS_CLIENT_EMAIL` are set in `.env.local`
- Ensure the private key includes the full `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` sections
- Keep the `\n` characters in the private key

### "Permission denied" errors
- Make sure you've shared the spreadsheet with your email
- Or make the service account email (`GOOGLE_SHEETS_CLIENT_EMAIL`) an editor of the spreadsheet

### Sync not working
- Check the terminal logs for error messages
- Verify the Google Sheets API is enabled in your Google Cloud project
- Ensure the service account key JSON is valid

## Benefits

### For You
- 📊 Live dashboard of all research
- 🤝 Easy sharing with team members
- 📈 Track progress in real-time
- 💾 Automatic backups

### For Your Team
- 👀 View sponsor pipeline without coding
- ✏️ Add notes directly in the sheet
- 🎯 Filter and sort by any column
- 📧 Easy email copy-paste for outreach

## Next Steps

After setup, you can:
1. Use the spreadsheet as your source of truth
2. Add custom columns for your workflow
3. Create charts/dashboards in Google Sheets
4. Export to other tools (Salesforce, HubSpot, etc.)
5. Set up Google Sheets notifications for new sponsors

Enjoy your live sponsor research dashboard! 🚀
