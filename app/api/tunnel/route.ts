// Called by the local tunnel script when ngrok starts/stops
// Stores the live ngrok URL in the DB so the app can use it without redeploying
import { NextRequest, NextResponse } from 'next/server';
import { setLMStudioURL, setLMStudioActive, clearLMStudioURL } from '@/lib/runtime-config';

// Simple shared secret so only the tunnel script can call this
const TUNNEL_SECRET = process.env.TUNNEL_SECRET || 'grove-tunnel-2026';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.secret !== TUNNEL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { action, url } = body;

  if (action === 'connect' && url) {
    await setLMStudioURL(url);
    await setLMStudioActive(true);
    console.log('[tunnel] LM Studio connected:', url);
    return NextResponse.json({ ok: true, message: `LM Studio connected at ${url}` });
  }

  if (action === 'disconnect') {
    await clearLMStudioURL();
    await setLMStudioActive(false);
    console.log('[tunnel] LM Studio disconnected, falling back to OpenAI');
    return NextResponse.json({ ok: true, message: 'Switched back to OpenAI' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
