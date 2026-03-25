// Settings API — manage AI mode + runtime OpenAI API key
import { NextRequest, NextResponse } from 'next/server';
import { getAIMode, setAIMode, getRuntimeApiKey, setRuntimeApiKey } from '@/lib/ai-mode';

export async function GET() {
  const mode = getAIMode();
  const runtimeKey = getRuntimeApiKey();
  const hasEnvKey =
    !!process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY !== 'your_openai_api_key_here';

  return NextResponse.json({
    mode,
    // Never expose the actual key — just signal which one is active
    keySource: runtimeKey ? 'runtime' : hasEnvKey ? 'env' : 'none',
    // Return last 4 chars of active key so user can confirm which key is set
    keyHint: runtimeKey
      ? `…${runtimeKey.slice(-4)}`
      : hasEnvKey
        ? `…${(process.env.OPENAI_API_KEY as string).slice(-4)}`
        : null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if ('mode' in body) {
    const { mode } = body;
    if (mode !== 'openai' && mode !== 'lmstudio') {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }
    setAIMode(mode);
  }

  if ('apiKey' in body) {
    const key: string = body.apiKey ?? '';
    if (key === '') {
      // Empty string = clear the runtime key, fall back to env
      setRuntimeApiKey(null);
    } else if (!key.startsWith('sk-')) {
      return NextResponse.json({ error: 'Invalid API key format' }, { status: 400 });
    } else {
      setRuntimeApiKey(key);
    }
  }

  return NextResponse.json({ ok: true, mode: getAIMode() });
}
