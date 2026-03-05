#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Initialize Google Sheets Headers
 * Run this after creating and sharing your spreadsheet
 */

const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

async function initializeSpreadsheet() {
  try {
    console.log('🔧 Initializing Google Sheets...');

    // Check credentials
    if (!process.env.GOOGLE_SHEETS_PRIVATE_KEY || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
      console.error('❌ Missing Google Sheets credentials in .env.local');
      process.exit(1);
    }

    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID === 'your_spreadsheet_id_here') {
      console.error('❌ Please add your GOOGLE_SHEETS_SPREADSHEET_ID to .env.local');
      console.log('📝 Follow the instructions in setup-google-sheets.md');
      process.exit(1);
    }

    // Initialize Google Sheets API
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    console.log('✅ Connected to Google Sheets API');
    console.log(`📊 Spreadsheet ID: ${spreadsheetId}`);

    // Set up headers
    const headers = [
      'ID',
      'Company Name',
      'Industry',
      'Company Size',
      'Website',
      'LinkedIn Company',
      'Contact Name',
      'Contact Position',
      'Contact LinkedIn',
      'Contact Email',
      'Email Format',
      'Previously Sponsored',
      'Sponsorship Score',
      'Status',
      'Notes',
      'Created At',
      'Updated At'
    ];

    // Clear existing data and add headers
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Sheet1!A:Z',
    });

    console.log('🧹 Cleared existing data');

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1:Q1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });

    console.log('✅ Added headers');

    // Format the header row (blue background, white text, bold)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.26, green: 0.52, blue: 0.96 },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true,
                  },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: 0,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ],
      },
    });

    console.log('🎨 Applied formatting');

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    console.log('\n🎉 Success! Your spreadsheet is ready!');
    console.log(`📎 Open it here: ${spreadsheetUrl}`);
    console.log('\n✨ You can now add companies and they will sync automatically!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 403) {
      console.log('\n💡 Make sure you shared the spreadsheet with:');
      console.log('   sponsor-research@techbirmingham.iam.gserviceaccount.com');
    }
    process.exit(1);
  }
}

initializeSpreadsheet();
