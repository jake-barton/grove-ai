// Legacy route — kept for backward compat, now proxies to /api/settings
import { NextRequest, NextResponse } from 'next/server';
import { getAIMode, setAIMode } from '@/lib/ai-mode';

export async function GET() {
  return NextResponse.json({ mode: getAIMode() });
}

export async function POST(req: NextRequest) {
  const { mode } = await req.json();
  if (mode !== 'openai' && mode !== 'lmstudio') {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }
  setAIMode(mode);
  return NextResponse.json({ mode, ok: true });
}
