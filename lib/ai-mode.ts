// Runtime AI mode store — persisted to .ai-mode file so it survives hot reloads
// but can be toggled without restarting the server.
import fs from 'fs';
import path from 'path';

const MODE_FILE = path.join(process.cwd(), '.ai-mode');

export type AIMode = 'openai' | 'lmstudio';

export function getAIMode(): AIMode {
  try {
    const val = fs.readFileSync(MODE_FILE, 'utf8').trim();
    if (val === 'lmstudio' || val === 'openai') return val;
  } catch {
    // file doesn't exist — fall back to env var
  }
  return process.env.LMSTUDIO_MODE === 'true' ? 'lmstudio' : 'openai';
}

export function setAIMode(mode: AIMode): void {
  fs.writeFileSync(MODE_FILE, mode, 'utf8');
}
