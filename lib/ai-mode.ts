// Runtime AI mode + API key store.
// Uses in-memory state so it works on both local Node.js and Vercel serverless.
// On local, the .ai-mode file is also read/written as a fallback so the setting
// survives hot reloads across requests in the same process.
import fs from 'fs';
import path from 'path';

export type AIMode = 'openai' | 'lmstudio';

// ── In-memory store (shared within a serverless instance / local process) ────
let _mode: AIMode | null = null;
let _runtimeApiKey: string | null = null;

const MODE_FILE = path.join(process.cwd(), '.ai-mode');

function readModeFile(): AIMode | null {
  try {
    const val = fs.readFileSync(MODE_FILE, 'utf8').trim();
    if (val === 'lmstudio' || val === 'openai') return val;
  } catch { /* file doesn't exist or not writable (Vercel) */ }
  return null;
}

export function getAIMode(): AIMode {
  if (_mode) return _mode;
  const fromFile = readModeFile();
  if (fromFile) { _mode = fromFile; return _mode; }
  _mode = process.env.LMSTUDIO_MODE === 'true' ? 'lmstudio' : 'openai';
  return _mode;
}

export function setAIMode(mode: AIMode): void {
  _mode = mode;
  // Best-effort file write for local dev (silently ignored on Vercel read-only FS)
  try { fs.writeFileSync(MODE_FILE, mode, 'utf8'); } catch { /* ok on Vercel */ }
}

// ── Runtime OpenAI API key (user-supplied, overrides env var) ────────────────
export function getRuntimeApiKey(): string | null {
  return _runtimeApiKey;
}

export function setRuntimeApiKey(key: string | null): void {
  _runtimeApiKey = key && key.trim().startsWith('sk-') ? key.trim() : null;
}
