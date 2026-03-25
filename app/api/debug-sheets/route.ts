import { NextResponse } from 'next/server';
export async function GET() {
  const raw = process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? 'MISSING';
  return NextResponse.json({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    keyLength: raw.length,
    keyStart: raw.substring(0, 40),
    keyEnd: raw.substring(raw.length - 40),
    hasLiteralBackslashN: raw.includes('\\n'),
    hasRealNewline: raw.includes('\n'),
    newlineCount: (raw.match(/\n/g) || []).length,
  });
}
