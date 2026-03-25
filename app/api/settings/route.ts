// Settings API — manage AI mode + runtime OpenAI API key
import { NextRequest, NextResponse } from 'next/server';
import { getAIModeFromRequest, setAIMode, getRuntimeApiKey, setRuntimeApiKey, AI_MODE_COOKIE } from '@/lib/ai-mode';

export async function GET(req: NextRequest) {
  const mode = getAIModeFromRequest(req);
  const runtimeKey = getRuntimeApiKey();
  const hasEnvKey =
    !!process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY !== 'your_openai_api_key_here';

  return NextResponse.json({
    mode,
    keySource: runtimeKey ? 'runtime' : hasEnvKey ? 'env' : 'none',
    keyHint: runtimeKey
      ? `…${runtimeKey.slice(-4)}`
      : hasEnvKey
        ? `…${(process.env.OPENAI_API_KEY as string).slice(-4)}`
        : null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  let newMode = getAIModeFromRequest(req);

  if ('mode' in body) {
    const { mode } = body;
    if (mode !== 'openai' && mode !== 'lmstudio') {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }
    newMode = mode;
    setAIMode(mode); // also update in-memory + local file for local dev
  }

  if ('apiKey' in body) {
    const key: string = body.apiKey ?? '';
    if (key === '') {
      setRuntimeApiKey(null);
    } else if (!key.startsWith('sk-')) {
      return NextResponse.json({ error: 'Invalid API key format' }, { status: 400 });
    } else {
      setRuntimeApiKey(key);
    }
  }

  const res = NextResponse.json({ ok: true, mode: newMode });

  // Set cookie so mode persists across Vercel cold starts
  res.cookies.set(AI_MODE_COOKIE, newMode, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
    httpOnly: false, // readable by client JS for status display
  });

  return res;
}
