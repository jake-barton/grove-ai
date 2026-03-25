// Legacy route — kept for backward compat, proxies to /api/settings logic
import { NextRequest, NextResponse } from 'next/server';
import { getAIModeFromRequest, setAIMode, AI_MODE_COOKIE } from '@/lib/ai-mode';

export async function GET(req: NextRequest) {
  return NextResponse.json({ mode: getAIModeFromRequest(req) });
}

export async function POST(req: NextRequest) {
  const { mode } = await req.json();
  if (mode !== 'openai' && mode !== 'lmstudio') {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }
  setAIMode(mode);
  const res = NextResponse.json({ mode, ok: true });
  res.cookies.set(AI_MODE_COOKIE, mode, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false,
  });
  return res;
}
