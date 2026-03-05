# 🎉 New Features: Persistent Storage & Live Google Sheets Sync

## What's New?

### 1. 📂 Persistent Storage
Companies are now saved to `data/companies.json` and survive server restarts!

**Benefits:**
- No more losing data when you restart the server
- Companies persist across sessions
- Automatic file backup
- Easy to backup/transfer (just copy the JSON file)

**Location:** `/data/companies.json`

### 2. 📊 Live Google Sheets Sync
Every CRUD operation automatically syncs to Google Sheets in real-time!

**Auto-Sync Events:**
- ✅ Add company → New row in spreadsheet
- ✅ Update company → Row updated
- ✅ Delete company → Row removed
- ✅ Approve company → Status changed to "Approved"

**No Export Button Needed** - Changes happen instantly!

## Quick Start

### Without Google Sheets (Works Immediately)
Just start the server - persistent storage works out of the box:

```bash
npm run dev
```

Companies are saved to `data/companies.json` automatically!

### With Google Sheets (5-Minute Setup)
Follow the detailed guide in `GOOGLE_SHEETS_SETUP.md`

**Quick version:**
1. Create a Google Cloud project
2. Enable Google Sheets API
3. Create a service account
4. Download the JSON key
5. Add credentials to `.env.local`:

```bash
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Key_Here\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_SPREADSHEET_ID=  # Leave empty, will auto-create
```

6. Start the server and add a company
7. Check the terminal for the spreadsheet link!

## How It Works

### File Structure
```
sponsor-research-ai/
├── data/
│   └── companies.json          # Persistent storage
├── lib/
│   ├── memory-store.ts         # File-backed storage
│   └── sheets-sync.ts          # Google Sheets integration
└── GOOGLE_SHEETS_SETUP.md      # Detailed setup guide
```

### Data Flow
```
User Action (Add/Edit/Delete/Approve)
    ↓
API Route (/api/companies or /api/companies/[id])
    ↓
Memory Store (data/companies.json) ← Always succeeds
    ↓
Google Sheets Sync ← Optional, fails gracefully
    ↓
Success Response
```

### Error Handling
If Google Sheets sync fails:
- ⚠️ Warning logged to console
- ✅ Company still saved locally
- 🔄 Manual resync available

## Testing

### 1. Test Persistent Storage
```bash
# Start server
npm run dev

# Add a company via deep research
# (Use the web interface)

# Stop server (Ctrl+C)
# Start server again
npm run dev

# Companies should still be there! ✅
```

### 2. Test Google Sheets Sync
```bash
# After setup, add a company
# Check terminal output:
# ✅ Synced to Google Sheets

# Open the spreadsheet link
# See your company data in real-time!
```

## Troubleshooting

### "Permission denied" when writing to data/
The app automatically creates the `data/` directory. If you see permission errors, manually create it:

```bash
mkdir data
chmod 755 data
```

### Google Sheets not syncing
Check the terminal logs:
- `⚠️ Google Sheets credentials not configured` → Add credentials to `.env.local`
- `⚠️ Google Sheets sync error` → Check service account permissions

### Companies not persisting
1. Check if `data/companies.json` exists
2. Check file permissions
3. Look for errors in terminal logs

## Benefits

### For Development
- Fast iteration (no database setup needed)
- Easy data inspection (just open JSON file)
- Simple backup (copy the file)

### For Production
- Real-time collaboration via Google Sheets
- Easy sharing with non-technical team members
- Visual dashboard without coding
- Export to other tools (Excel, Salesforce, etc.)

## Next Steps

1. ✅ **Set up Google Sheets** (optional but recommended)
2. ✅ **Test CRUD operations** (add, edit, delete, approve)
3. ✅ **Share spreadsheet** with your team
4. ✅ **Customize columns** in Google Sheets as needed
5. ✅ **Set up notifications** for new sponsors (Google Sheets feature)

## Files Modified

- `lib/memory-store.ts` - Added file system persistence
- `lib/sheets-sync.ts` - New Google Sheets integration
- `lib/types.ts` - Added `contact_linkedin` and `linkedin_company` fields
- `app/api/companies/route.ts` - Added auto-sync on POST
- `app/api/companies/[id]/route.ts` - Added auto-sync on PATCH/DELETE
- `.gitignore` - Added `/data` to prevent committing local data

## Security Notes

- `data/companies.json` is in `.gitignore` (not committed to git)
- Google Sheets credentials in `.env.local` (not committed)
- Service account has limited permissions (Sheets API only)
- Spreadsheet initially private (you control who can access)

Enjoy your persistent, synced sponsor research platform! 🚀
