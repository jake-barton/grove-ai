// Runtime AI mode + API key store.
//
// MODE PERSISTENCE (Vercel-safe):
//   The toggle sets a "grove-ai-mode" cookie via /api/settings response.
//   API routes read the mode from that cookie using getAIModeFromRequest(req).
//   This works across Vercel cold starts — no filesystem or in-memory state needed.
//   Falls back to LMSTUDIO_MODE env var when no cookie is present.
//
// API KEY:
//   Runtime key is in-memory only (session, per instance).
//   For permanent keys, set OPENAI_API_KEY in Vercel dashboard.

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

export type AIMode = 'openai' | 'lmstudio';

export const AI_MODE_COOKIE = 'grove-ai-mode';

// ── In-memory fallback (local dev / within a single warm instance) ────────────
let _mode: AIMode | null = null;
let _runtimeApiKey: string | null = null;

const MODE_FILE = path.join(process.cwd(), '.ai-mode');

function readModeFile(): AIMode | null {
  try {
    const val = fs.readFileSync(MODE_FILE, 'utf8').trim();
    if (val === 'lmstudio' || val === 'openai') return val;
  } catch { /* not available on Vercel read-only FS */ }
  return null;
}

/** Env/file fallback — use when no request context is available. */
export function getAIMode(): AIMode {
  if (_mode) return _mode;
  const fromFile = readModeFile();
  if (fromFile) { _mode = fromFile; return _mode; }
  _mode = process.env.LMSTUDIO_MODE === 'true' ? 'lmstudio' : 'openai';
  return _mode;
}

/**
 * Read mode from the incoming request cookie.
 * Use this in ALL API routes — it's the only method that persists across Vercel cold starts.
 */
export function getAIModeFromRequest(req: NextRequest): AIMode {
  const cookie = req.cookies.get(AI_MODE_COOKIE)?.value;
  if (cookie === 'lmstudio' || cookie === 'openai') return cookie;
  return getAIMode(); // env/file fallback
}

export function setAIMode(mode: AIMode): void {
  _mode = mode;
  try { fs.writeFileSync(MODE_FILE, mode, 'utf8'); } catch { /* ok on Vercel */ }
}

// ── Runtime OpenAI API key ────────────────────────────────────────────────────
export function getRuntimeApiKey(): string | null {
  return _runtimeApiKey;
}

export function setRuntimeApiKey(key: string | null): void {
  _runtimeApiKey = key && key.trim().startsWith('sk-') ? key.trim() : null;
}
