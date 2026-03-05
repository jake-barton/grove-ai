import { NextRequest, NextResponse } from 'next/server';
import { handleNaturalLanguageFormat } from '@/lib/sheets-formatter';

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    console.log(`🎨 Spreadsheet format request: "${prompt}"`);

    const result = await handleNaturalLanguageFormat(prompt);

    if (result.success) {
      console.log(`✅ ${result.message}`);
    } else {
      console.log(`⚠️ ${result.message}`);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Format endpoint error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
