// Returns the current AI provider + model and whether it's reachable
import { NextResponse } from 'next/server';
import { getLMStudioURL, getLMStudioActive } from '@/lib/runtime-config';

export async function GET() {
  // Check DB first (set by tunnel script), fall back to env vars
  let useLMStudio = false;
  let lmStudioBaseURL = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';

  try {
    const [dbActive, dbURL] = await Promise.all([getLMStudioActive(), getLMStudioURL()]);
    if (dbActive && dbURL) {
      useLMStudio = true;
      lmStudioBaseURL = dbURL;
    } else {
      useLMStudio = process.env.LMSTUDIO_MODE === 'true' || process.env.OPENAI_API_KEY === 'lm-studio';
    }
  } catch {
    useLMStudio = process.env.LMSTUDIO_MODE === 'true' || process.env.OPENAI_API_KEY === 'lm-studio';
  }

  if (useLMStudio) {
    try {
      const res = await fetch(`${lmStudioBaseURL}/models`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models: { id: string }[] = data?.data ?? [];
      const modelId = models[0]?.id ?? 'connected';
      return NextResponse.json({
        provider: 'LM Studio',
        model: modelId,
        connected: true,
        url: lmStudioBaseURL,
      });
    } catch {
      return NextResponse.json({
        provider: 'LM Studio',
        model: null,
        connected: false,
        url: lmStudioBaseURL,
      });
    }
  }

  const hasKey = !!process.env.OPENAI_API_KEY;
  return NextResponse.json({
    provider: 'OpenAI',
    model: 'gpt-4o',
    connected: hasKey,
    url: 'https://api.openai.com/v1',
  });
}
