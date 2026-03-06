import { NextResponse } from 'next/server';
import { getAIMode } from '@/lib/ai-mode';

export async function GET() {
  const mode = getAIMode();
  const hasOpenAIKey =
    !!process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY !== 'your_openai_api_key_here';

  if (mode === 'lmstudio') {
    const base = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';
    try {
      const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        const model: string = data?.data?.[0]?.id ?? 'local model';
        return NextResponse.json({ status: 'connected', mode: 'lmstudio', model });
      }
    } catch {
      // LM Studio not reachable
    }
    return NextResponse.json({ status: 'disconnected', mode: 'lmstudio', model: null });
  }

  return NextResponse.json({
    status: hasOpenAIKey ? 'connected' : 'no-key',
    mode: 'openai',
    model: 'gpt-4o',
  });
}
