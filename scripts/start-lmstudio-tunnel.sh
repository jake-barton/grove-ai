#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Grove × LM Studio — Cloudflare Quick Tunnel
#  No account needed. No token. Just double-click and go.
#
#  What this does:
#   1. Waits for LM Studio to start on port 1234
#   2. Opens a free Cloudflare HTTPS tunnel (trycloudflare.com)
#   3. Registers the URL with Grove on Vercel (stored in DB)
#   4. Grove switches to your local AI model instantly
#   5. Auto-reconnects if the tunnel drops
#   6. On quit → Grove switches back to OpenAI gpt-4o
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

LM_PORT=1234
TUNNEL_SECRET="grove-tunnel-2026"
VERCEL_URL="https://techbirmingham-sponsor-ai.vercel.app"
POLL_INTERVAL=5
CF_PID=""
PUBLIC_URL=""

G="\033[0;32m"; Y="\033[0;33m"; R="\033[0;31m"; B="\033[0;34m"; N="\033[0m"; BOLD="\033[1m"

ok()   { echo -e "  ${G}✅  $*${N}"; }
warn() { echo -e "  ${Y}⚠️   $*${N}"; }
err()  { echo -e "  ${R}❌  $*${N}"; }
info() { echo -e "  ${B}ℹ️   $*${N}"; }

cleanup() {
  echo ""
  warn "Shutting down..."
  if [ -n "$CF_PID" ]; then
    kill "$CF_PID" 2>/dev/null || true
    wait "$CF_PID" 2>/dev/null || true
  fi
  info "Telling Vercel to switch back to OpenAI..."
  curl -s -X POST "${VERCEL_URL}/api/tunnel" \
    -H "Content-Type: application/json" \
    -d "{\"secret\":\"${TUNNEL_SECRET}\",\"action\":\"disconnect\"}" \
    > /dev/null 2>&1 && ok "Grove is back on OpenAI gpt-4o" || warn "Couldn't reach Vercel"
  echo ""
  echo -e "  ${BOLD}Goodbye! 👋${N}"
  echo ""
  exit 0
}
trap cleanup INT TERM EXIT

clear
echo ""
echo -e "${BOLD}  ╔══════════════════════════════════════════════════╗"
echo -e "  ║   🌳  Grove × LM Studio — Quick Tunnel            ║"
echo -e "  ║       Cloudflare · No account needed              ║"
echo -e "  ╚══════════════════════════════════════════════════╝${N}"
echo ""

CF_BIN="$(command -v cloudflared 2>/dev/null || echo /opt/homebrew/bin/cloudflared)"
if [ ! -x "$CF_BIN" ]; then
  err "cloudflared is not installed."
  info "Install it: brew install cloudflare/cloudflare/cloudflared"
  exit 1
fi

wait_for_lmstudio() {
  local attempt=0
  while true; do
    if lsof -i ":${LM_PORT}" -sTCP:LISTEN -t > /dev/null 2>&1; then
      ok "LM Studio is running on port ${LM_PORT}"
      return 0
    fi
    if [ $attempt -eq 0 ]; then
      warn "Waiting for LM Studio to start..."
      info "Open LM Studio → load a model → click Start Server"
      echo ""
    fi
    attempt=$((attempt + 1))
    sleep "$POLL_INTERVAL"
  done
}

start_tunnel() {
  [ -n "$CF_PID" ] && kill "$CF_PID" 2>/dev/null || true
  CF_PID=""
  PUBLIC_URL=""
  local LOG=/tmp/grove-cf.log
  info "Opening Cloudflare tunnel..."
  "$CF_BIN" tunnel --url "http://localhost:${LM_PORT}" --no-autoupdate > "$LOG" 2>&1 &
  CF_PID=$!
  local tries=0
  while [ $tries -lt 40 ]; do
    PUBLIC_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1 || true)
    if [ -n "$PUBLIC_URL" ]; then
      ok "Tunnel open: ${PUBLIC_URL}"
      return 0
    fi
    tries=$((tries + 1))
    sleep 0.5
  done
  err "Cloudflare tunnel did not start. Log:"
  tail -10 "$LOG" 2>/dev/null || true
  return 1
}

get_model() {
  curl -s "http://localhost:${LM_PORT}/v1/models" 2>/dev/null \
    | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    models=d.get('data',[])
    print(models[0]['id'] if models else 'unknown')
except:
    print('unknown')
" 2>/dev/null || echo "unknown"
}

register_with_vercel() {
  local url="${PUBLIC_URL}/v1"
  info "Connecting Grove to your LM Studio..."
  local response
  response=$(curl -s -X POST "${VERCEL_URL}/api/tunnel" \
    -H "Content-Type: application/json" \
    -d "{\"secret\":\"${TUNNEL_SECRET}\",\"action\":\"connect\",\"url\":\"${url}\"}" 2>/dev/null || echo "{}")
  if echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
    local model
    model=$(get_model)
    echo ""
    echo -e "  ${BOLD}${G}╔══════════════════════════════════════════════════╗${N}"
    echo -e "  ${BOLD}${G}║  🟢  Grove is using your local AI!               ║${N}"
    echo -e "  ${BOLD}${G}║                                                  ║${N}"
    printf "  ${BOLD}${G}║  🌍  %-44s║${N}\n" "${VERCEL_URL}"
    printf "  ${BOLD}${G}║  🤖  Model: %-38s║${N}\n" "${model}"
    echo -e "  ${BOLD}${G}╚══════════════════════════════════════════════════╝${N}"
    echo ""
    info "The green dot in the app header confirms the connection."
    info "Keep this window open while you use Grove."
    info "Press Ctrl+C or close this window to stop."
    echo ""
    # Open Grove in the browser automatically (first time only)
    if [ "${GROVE_OPENED:-}" != "1" ]; then
      open "${VERCEL_URL}" 2>/dev/null || true
      export GROVE_OPENED=1
    fi
  else
    warn "Could not reach Vercel. Response: ${response}"
  fi
}

watch_loop() {
  local lm_was_online=true
  while true; do
    sleep "$POLL_INTERVAL"
    if ! kill -0 "$CF_PID" 2>/dev/null; then
      warn "Tunnel dropped — restarting..."
      if start_tunnel; then register_with_vercel; fi
      continue
    fi
    if ! lsof -i ":${LM_PORT}" -sTCP:LISTEN -t > /dev/null 2>&1; then
      if $lm_was_online; then
        warn "LM Studio stopped — Grove falling back to OpenAI..."
        curl -s -X POST "${VERCEL_URL}/api/tunnel" \
          -H "Content-Type: application/json" \
          -d "{\"secret\":\"${TUNNEL_SECRET}\",\"action\":\"disconnect\"}" > /dev/null 2>&1 || true
        lm_was_online=false
      fi
    else
      if ! $lm_was_online; then
        ok "LM Studio is back — reconnecting..."
        if start_tunnel; then register_with_vercel; fi
        lm_was_online=true
      fi
    fi
  done
}

wait_for_lmstudio
if start_tunnel; then
  register_with_vercel
  watch_loop
else
  err "Could not open tunnel. Please try again."
  exit 1
fi
