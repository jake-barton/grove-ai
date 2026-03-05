// In-app LM Studio connection management
// Called directly from the browser UI — no script or secret needed
import { NextRequest, NextResponse } from 'next/server';
import {
  getLMStudioURL,
  getLMStudioActive,
  setLMStudioURL,
  setLMStudioActive,
  clearLMStudioURL,
} from '@/lib/runtime-config';

/** GET — returns current LM Studio config */
export async function GET() {
  const [active, url] = await Promise.all([getLMStudioActive(), getLMStudioURL()]);
  return NextResponse.json({ active, url });
}

/** POST — connect to an LM Studio URL or disconnect */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, url } = body;

  if (action === 'connect') {
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    // Normalise — strip trailing slash, add /v1 if missing
    let baseURL = url.trim().replace(/\/+$/, '');
    if (!baseURL.endsWith('/v1')) baseURL = baseURL + '/v1';

    // Test that the URL is actually reachable before saving
    try {
      const test = await fetch(`${baseURL}/models`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!test.ok) throw new Error(`HTTP ${test.status}`);
      const data = await test.json();

      await setLMStudioURL(baseURL);
      await setLMStudioActive(true);

      const models: { id: string }[] = data?.data ?? [];
      const modelId = models[0]?.id ?? 'unknown';

      return NextResponse.json({ ok: true, model: modelId, url: baseURL });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Could not reach LM Studio at ${baseURL} — ${msg}` },
        { status: 400 }
      );
    }
  }

  if (action === 'disconnect') {
    await clearLMStudioURL();
    await setLMStudioActive(false);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
