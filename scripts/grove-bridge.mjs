#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  Grove Bridge — Local tunnel server
//  Runs on localhost:7842, bridging LM Studio → Vercel via Cloudflare
//
//  The Grove web app talks to this server directly from the browser.
//  No Terminal knowledge needed — just double-click the .command file.
// ═══════════════════════════════════════════════════════════════

import http from 'http';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const PORT = 7842;
const LM_PORT = 1234;
const VERCEL_URL = 'https://techbirmingham-sponsor-ai.vercel.app';
const TUNNEL_SECRET = 'grove-tunnel-2026';
const CF_BIN = '/opt/homebrew/bin/cloudflared';

// ── State ────────────────────────────────────────────────────────────────────
let state = {
  phase: 'waiting',   // waiting | tunneling | connected | error | stopped
  tunnelURL: null,
  model: null,
  log: [],
  cfProcess: null,
  lmCheckInterval: null,
};

function addLog(level, msg) {
  const line = { level, msg, ts: Date.now() };
  state.log.push(line);
  if (state.log.length > 200) state.log.shift();
  process.stdout.write(`[${level}] ${msg}\n`);
}

// ── LM Studio check ──────────────────────────────────────────────────────────
async function isLMRunning() {
  try {
    const res = await fetch(`http://localhost:${LM_PORT}/v1/models`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch { return false; }
}

async function getModel() {
  try {
    const res = await fetch(`http://localhost:${LM_PORT}/v1/models`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    return data?.data?.[0]?.id ?? 'unknown model';
  } catch { return 'unknown model'; }
}

// ── Register URL with Vercel ─────────────────────────────────────────────────
async function registerWithVercel(tunnelURL) {
  try {
    const res = await fetch(`${VERCEL_URL}/api/tunnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: TUNNEL_SECRET, action: 'connect', url: `${tunnelURL}/v1` }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return data.ok === true;
  } catch (e) {
    addLog('error', `Vercel register failed: ${e.message}`);
    return false;
  }
}

async function disconnectVercel() {
  try {
    await fetch(`${VERCEL_URL}/api/tunnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: TUNNEL_SECRET, action: 'disconnect' }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* best effort */ }
}

// ── Start Cloudflare tunnel ──────────────────────────────────────────────────
function startTunnel() {
  return new Promise((resolve, reject) => {
    if (state.cfProcess) {
      try { state.cfProcess.kill(); } catch {}
      state.cfProcess = null;
    }

    state.phase = 'tunneling';
    state.tunnelURL = null;
    addLog('info', 'Starting Cloudflare tunnel...');

    const cf = spawn(CF_BIN, ['tunnel', '--url', `http://localhost:${LM_PORT}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    state.cfProcess = cf;

    // cloudflared writes the URL to stderr
    const rl = createInterface({ input: cf.stderr });
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Tunnel did not start within 20s'));
      }
    }, 20000);

    rl.on('line', async (line) => {
      const match = line.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        state.tunnelURL = match[0];
        addLog('ok', `Tunnel open: ${state.tunnelURL}`);
        resolve(state.tunnelURL);
      }
      // Log relevant lines only
      if (line.includes('ERR') || line.includes('error') || line.includes('trycloudflare')) {
        addLog('info', line.trim());
      }
    });

    cf.on('exit', (code) => {
      addLog('warn', `cloudflared exited (code ${code})`);
      state.cfProcess = null;
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited early (code ${code})`));
      }
      // If we were connected, tunnel dropped
      if (state.phase === 'connected') {
        state.phase = 'error';
        addLog('warn', 'Tunnel dropped — will restart shortly');
        setTimeout(restartTunnel, 3000);
      }
    });

    cf.stdout?.on('data', () => {}); // drain stdout
  });
}

async function restartTunnel() {
  addLog('info', 'Restarting tunnel...');
  try {
    const url = await startTunnel();
    const ok = await registerWithVercel(url);
    if (ok) {
      state.model = await getModel();
      state.phase = 'connected';
      addLog('ok', `Reconnected! Model: ${state.model}`);
    }
  } catch (e) {
    state.phase = 'error';
    addLog('error', `Restart failed: ${e.message}`);
    setTimeout(restartTunnel, 5000);
  }
}

// ── Main startup flow ────────────────────────────────────────────────────────
async function start() {
  addLog('info', `Grove Bridge starting on localhost:${PORT}`);
  addLog('info', 'Waiting for LM Studio...');

  // Poll until LM Studio is up
  while (!(await isLMRunning())) {
    await new Promise(r => setTimeout(r, 2000));
  }
  addLog('ok', `LM Studio detected on port ${LM_PORT}`);

  const url = await startTunnel();
  addLog('info', 'Registering with Grove...');
  const ok = await registerWithVercel(url);

  if (ok) {
    state.model = await getModel();
    state.phase = 'connected';
    addLog('ok', `Connected! Grove is using: ${state.model}`);
  } else {
    state.phase = 'error';
    addLog('error', 'Could not register with Vercel — check your internet connection');
  }

  // Watch for LM Studio going away
  state.lmCheckInterval = setInterval(async () => {
    if (state.phase === 'connected' && !(await isLMRunning())) {
      addLog('warn', 'LM Studio stopped — Grove falling back to OpenAI');
      state.phase = 'waiting';
      await disconnectVercel();
      // Wait for it to come back
      while (!(await isLMRunning())) await new Promise(r => setTimeout(r, 3000));
      addLog('ok', 'LM Studio back — reconnecting...');
      await restartTunnel();
    }
  }, 5000);
}

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown() {
  addLog('info', 'Shutting down Grove Bridge...');
  state.phase = 'stopped';
  if (state.lmCheckInterval) clearInterval(state.lmCheckInterval);
  if (state.cfProcess) { try { state.cfProcess.kill(); } catch {} }
  await disconnectVercel();
  addLog('ok', 'Grove switched back to OpenAI. Goodbye!');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ── HTTP server ──────────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = VERCEL_URL;

const server = http.createServer((req, res) => {
  // CORS — allow the Vercel app to call us
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /status — returns current state
  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      phase: state.phase,
      tunnelURL: state.tunnelURL,
      model: state.model,
      log: state.log.slice(-20),
    }));
    return;
  }

  // POST /stop — disconnect and quit
  if (req.method === 'POST' && url.pathname === '/stop') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    setTimeout(shutdown, 500);
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  addLog('ok', `Bridge listening on localhost:${PORT}`);
  start().catch(e => {
    addLog('error', `Fatal: ${e.message}`);
    process.exit(1);
  });
});
