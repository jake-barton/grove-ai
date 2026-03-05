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
  const { action, url, model } = body;

  if (action === 'connect') {
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    // Normalise — strip trailing slash, add /v1 if missing
    let baseURL = url.trim().replace(/\/+$/, '');
    if (!baseURL.endsWith('/v1')) baseURL = baseURL + '/v1';

    // Save to DB — reachability was already tested by the browser
    await setLMStudioURL(baseURL);
    await setLMStudioActive(true);

    return NextResponse.json({ ok: true, model: model ?? 'unknown', url: baseURL });
  }

  if (action === 'disconnect') {
    await clearLMStudioURL();
    await setLMStudioActive(false);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
