import { NextRequest, NextResponse } from 'next/server';
import { getAIMode, setAIMode } from '@/lib/ai-mode';

export async function GET() {
  const mode = getAIMode();
  return NextResponse.json({ mode });
}

export async function POST(req: NextRequest) {
  const { mode } = await req.json();
  if (mode !== 'openai' && mode !== 'lmstudio') {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }
  setAIMode(mode);
  return NextResponse.json({ mode, ok: true });
}
