# Google Sheets Setup - Quick Fix

## The Issue
Your service account doesn't have permission to create spreadsheets automatically.

## Solution: Create Spreadsheet Manually (2 minutes)

### Step 1: Create the Spreadsheet
1. Go to https://docs.google.com/spreadsheets/
2. Click "Blank" to create a new spreadsheet
3. Name it: **Sloss.Tech Sponsors**

### Step 2: Share with Service Account
1. Click the "Share" button (top right)
2. Add this email as an editor:
   ```
   sponsor-research@techbirmingham.iam.gserviceaccount.com
   ```
3. Make sure the role is set to **Editor**
4. Click "Send" (ignore the warning about it being a service account)

### Step 3: Get the Spreadsheet ID
1. Look at the URL of your spreadsheet:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
   ```
2. Copy the long string between `/d/` and `/edit` - that's your Spreadsheet ID

### Step 4: Update .env.local
Add the Spreadsheet ID to your `.env.local` file:
```bash
GOOGLE_SHEETS_SPREADSHEET_ID=paste_your_spreadsheet_id_here
```

### Step 5: Restart Server
```bash
# Stop the server (Ctrl+C in terminal)
# Then restart:
npm run dev
```

## That's it! 🎉
Now when you add a company, it will sync to your Google Spreadsheet in real-time!
