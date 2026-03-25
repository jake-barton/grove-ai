import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  if (password !== appPassword) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('grove-session', 'authenticated', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    // No maxAge = pure session cookie. Browser SHOULD clear on close,
    // but we also expire it via DELETE on every page load (see GET below).
  });
  return res;
}

// Called on every page load to clear the session — forces re-auth each visit
export async function GET() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('grove-session', '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('grove-session', '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return res;
}
