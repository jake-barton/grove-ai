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
    sameSite: 'lax',
    path: '/',
    // Session cookie — expires when browser closes
    // For persistent login add: maxAge: 60 * 60 * 24 * 7
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('grove-session');
  return res;
}
