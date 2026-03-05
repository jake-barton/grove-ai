// Returns the current AI provider + model and whether it's reachable
import { NextResponse } from 'next/server';

export async function GET() {
  const useLMStudio =
    process.env.LMSTUDIO_MODE === 'true' ||
    process.env.OPENAI_API_KEY === 'lm-studio';

  const lmStudioBaseURL =
    process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';

  if (useLMStudio) {
    // Try to reach LM Studio's /v1/models endpoint
    try {
      const res = await fetch(`${lmStudioBaseURL}/models`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models: { id: string }[] = data?.data ?? [];
      const modelId = models[0]?.id ?? 'unknown model';
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

  // Real OpenAI — just confirm key is present, don't make a billable call
  const hasKey = !!process.env.OPENAI_API_KEY;
  return NextResponse.json({
    provider: 'OpenAI',
    model: 'gpt-4o',
    connected: hasKey,
    url: 'https://api.openai.com/v1',
  });
}
