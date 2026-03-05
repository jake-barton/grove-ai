#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  LM Studio → ngrok tunnel launcher
#  Run this script on your Mac whenever you want the Vercel
#  deployment to use your local LM Studio instead of OpenAI.
#
#  Usage:
#    chmod +x scripts/start-lmstudio-tunnel.sh   (first time only)
#    ./scripts/start-lmstudio-tunnel.sh
# ─────────────────────────────────────────────────────────────

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
