#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Grove × LM Studio — Fully Automated Tunnel
#  Double-click "Start Grove.command" to run this.
#
#  What it does automatically:
#   1. Waits for LM Studio to start on port 1234
#   2. Opens an ngrok HTTPS tunnel to your local LM Studio
#   3. Registers the tunnel URL with the live Vercel app (via DB)
#   4. The Vercel app instantly switches to your LM Studio model
#   5. Reconnects if the tunnel drops
#   6. On quit (Ctrl+C / close window) → switches Vercel back to OpenAI
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

LM_PORT=1234
TUNNEL_SECRET="grove-tunnel-2026"
VERCEL_URL="https://techbirmingham-sponsor-ai.vercel.app"
POLL_INTERVAL=5
NGROK_PID=""

G="\033[0;32m"; Y="\033[0;33m"; R="\033[0;31m"; B="\033[0;34m"; N="\033[0m"; BOLD="\033[1m"

log()  { echo -e "  ${N}$*${N}"; }
ok()   { echo -e "  ${G}✅  $*${N}"; }
warn() { echo -e "  ${Y}⚠️   $*${N}"; }
err()  { echo -e "  ${R}❌  $*${N}"; }
info() { echo -e "  ${B}ℹ️   $*${N}"; }

cleanup() {
  echo ""
  warn "Shutting down tunnel..."
  [ -n "$NGROK_PID" ] && kill "$NGROK_PID" 2>/dev/null && wait "$NGROK_PID" 2>/dev/null || true
  log "Switching Vercel back to OpenAI..."
  curl -s -X POST "${VERCEL_URL}/api/tunnel" \
    -H "Content-Type: application/json" \
    -d "{\"secret\":\"${TUNNEL_SECRET}\",\"action\":\"disconnect\"}" \
    > /dev/null 2>&1 && ok "Vercel switched back to OpenAI gpt-4o" || warn "Could not reach Vercel"
  echo ""
  log "Grove is now running on OpenAI. Goodbye! 👋"
  echo ""
  exit 0
}
trap cleanup INT TERM EXIT

clear
echo ""
echo -e "${BOLD}  ╔══════════════════════════════════════════════════╗"
echo -e "  ║   🌳  Grove × LM Studio — Auto Tunnel Launcher   ║"
echo -e "  ╚══════════════════════════════════════════════════╝${N}"
echo ""

if ! command -v ngrok &>/dev/null; then
  err "ngrok is not installed. Run: brew install ngrok/ngrok/ngrok"
  exit 1
fi

wait_for_lmstudio() {
  local attempt=0
  while true; do
    if lsof -i ":${LM_PORT}" -sTCP:LISTEN -t > /dev/null 2>&1; then
      ok "LM Studio detected on port ${LM_PORT}"
      return 0
    fi
    if [ $attempt -eq 0 ]; then
      warn "Waiting for LM Studio to start on port ${LM_PORT}..."
      info "Open LM Studio → load a model → start the local server"
      echo ""
    fi
    attempt=$((attempt + 1))
    sleep "$POLL_INTERVAL"
  done
}

start_tunnel() {
  pkill ngrok 2>/dev/null || true
  sleep 1
  log "Opening ngrok tunnel..."
  ngrok http "$LM_PORT" > /tmp/grove-ngrok.log 2>&1 &
  NGROK_PID=$!
  local tries=0
  while [ $tries -lt 15 ]; do
    PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
      | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    t=[x for x in d.get('tunnels',[]) if x.get('proto')=='https']
    print(t[0]['public_url'] if t else '')
except:
    print('')
" 2>/dev/null)
    if [ -n "$PUBLIC_URL" ]; then
      ok "Tunnel open: ${PUBLIC_URL}"
      echo ""
      return 0
    fi
    tries=$((tries + 1))
    sleep 1
  done
  err "Could not start ngrok tunnel."
  cat /tmp/grove-ngrok.log 2>/dev/null | tail -5
  return 1
}

get_loaded_model() {
  curl -s "http://localhost:${LM_PORT}/v1/models" 2>/dev/null \
    | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    models=d.get('data',[])
    print(models[0]['id'] if models else 'unknown model')
except:
    print('unknown model')
" 2>/dev/null || echo "unknown model"
}

register_with_vercel() {
  local url="${PUBLIC_URL}/v1"
  log "Registering tunnel with Vercel app..."
  local response
  response=$(curl -s -X POST "${VERCEL_URL}/api/tunnel" \
    -H "Content-Type: application/json" \
    -d "{\"secret\":\"${TUNNEL_SECRET}\",\"action\":\"connect\",\"url\":\"${url}\"}" 2>/dev/null)
  if echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
    ok "Vercel app is now using your LM Studio!"
    echo ""
    echo -e "  ${BOLD}${G}══════════════════════════════════════════════════${N}"
    echo -e "  ${BOLD}${G}  🌍  App:   ${VERCEL_URL}${N}"
    echo -e "  ${BOLD}${G}  🤖  Model: $(get_loaded_model)${N}"
    echo -e "  ${BOLD}${G}══════════════════════════════════════════════════${N}"
    echo ""
    info "The status pill in the header will turn green."
    info "Press Ctrl+C or close this window to stop & revert to OpenAI."
    echo ""
  else
    warn "Could not reach Vercel — app will use OpenAI until this is resolved."
    info "Response: ${response}"
  fi
}

watch_loop() {
  local was_online=true
  while true; do
    sleep "$POLL_INTERVAL"
    if ! kill -0 "$NGROK_PID" 2>/dev/null; then
      warn "ngrok tunnel dropped — restarting..."
      if start_tunnel; then register_with_vercel; was_online=true; fi
      continue
    fi
    if ! lsof -i ":${LM_PORT}" -sTCP:LISTEN -t > /dev/null 2>&1; then
      if $was_online; then
        warn "LM Studio stopped. Vercel falling back to OpenAI..."
        curl -s -X POST "${VERCEL_URL}/api/tunnel" \
          -H "Content-Type: application/json" \
          -d "{\"secret\":\"${TUNNEL_SECRET}\",\"action\":\"disconnect\"}" > /dev/null 2>&1 || true
        was_online=false
      fi
    else
      if ! $was_online; then
        ok "LM Studio back online — reconnecting..."
        if start_tunnel; then register_with_vercel; was_online=true; fi
      fi
    fi
  done
}

wait_for_lmstudio
start_tunnel
register_with_vercel
watch_loop

set -e

LM_PORT=1234

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║        LM Studio ↔ Vercel Tunnel Launcher        ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# 1. Check LM Studio is actually running
if ! lsof -i :$LM_PORT -sTCP:LISTEN -t > /dev/null 2>&1; then
  echo "❌  LM Studio doesn't appear to be running on port $LM_PORT."
  echo "    Start LM Studio, enable the local server, then re-run this script."
  exit 1
fi
echo "✅  LM Studio detected on port $LM_PORT"

# 2. Start ngrok tunnel in background, capture the public URL
echo "🚇  Starting ngrok tunnel..."
ngrok http $LM_PORT --log=stdout --log-format=json > /tmp/ngrok-lmstudio.log 2>&1 &
NGROK_PID=$!
sleep 3

# 3. Extract the public URL from ngrok's local API
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels \
  | python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print([x for x in t if x['proto']=='https'][0]['public_url'])" 2>/dev/null)

if [ -z "$PUBLIC_URL" ]; then
  echo "❌  Could not get ngrok URL. Is ngrok authenticated?"
  echo "    Run: ngrok config add-authtoken <your-token>"
  echo "    Get a free token at: https://dashboard.ngrok.com/get-started/your-authtoken"
  kill $NGROK_PID 2>/dev/null
  exit 1
fi

echo ""
echo "🌍  Public URL: $PUBLIC_URL"
echo ""

# 4. Update Vercel env vars automatically (if vercel CLI is logged in)
VERCEL_BASE_URL="${PUBLIC_URL}/v1"
echo "📡  Updating Vercel → LMSTUDIO_BASE_URL = $VERCEL_BASE_URL"
echo "📡  Updating Vercel → LMSTUDIO_MODE = true"

(cd "$(dirname "$0")/.." && \
  vercel env rm LMSTUDIO_BASE_URL production --yes 2>/dev/null || true && \
  echo "$VERCEL_BASE_URL" | vercel env add LMSTUDIO_BASE_URL production 2>/dev/null && \
  vercel env rm LMSTUDIO_MODE production --yes 2>/dev/null || true && \
  echo "true" | vercel env add LMSTUDIO_MODE production 2>/dev/null && \
  echo "" && \
  echo "✅  Vercel env vars updated!" && \
  echo "🚀  Redeploying Vercel to pick up new env vars..." && \
  vercel --prod --yes 2>/dev/null | grep -E "Production:|✅" || echo "   (redeploy triggered)")

echo ""
echo "══════════════════════════════════════════════════"
echo "  Tunnel is LIVE. Keep this terminal open."
echo "  LM Studio requests from Vercel → your Mac."
echo "══════════════════════════════════════════════════"
echo ""
echo "  Press Ctrl+C to stop the tunnel."
echo "  (When stopped, Vercel will fall back to OpenAI gpt-4o)"
echo ""

# 5. Keep running until Ctrl+C, then clean up
cleanup() {
  echo ""
  echo "🛑  Stopping tunnel..."
  kill $NGROK_PID 2>/dev/null

  # Switch Vercel back to OpenAI
  (cd "$(dirname "$0")/.." && \
    vercel env rm LMSTUDIO_MODE production --yes 2>/dev/null || true && \
    echo "false" | vercel env add LMSTUDIO_MODE production 2>/dev/null && \
    vercel --prod --yes 2>/dev/null | grep -E "Production:|✅" || true)

  echo "✅  Vercel switched back to OpenAI gpt-4o."
  exit 0
}

trap cleanup INT TERM
wait $NGROK_PID
