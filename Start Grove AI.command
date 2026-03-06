#!/bin/bash
# -------------------------------------------------------
#  🌳 Grove AI — TechBirmingham Sponsor Research
#  Double-click this file to start the app.
# -------------------------------------------------------

# Move to the folder this script lives in (works wherever it's placed)
cd "$(dirname "$0")"

echo ""
echo "🌳 Grove AI — TechBirmingham Sponsor Research"
echo "=============================================="
echo ""

# ── 1. Check Node.js ──────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "❌  Node.js is not installed."
  echo "    Download it from: https://nodejs.org  (LTS version)"
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi
NODE_VER=$(node -v)
echo "✅  Node.js $NODE_VER"

# ── 2. Check .env.local ───────────────────────────────
if [ ! -f ".env.local" ]; then
  echo ""
  echo "❌  .env.local not found."
  echo "    Copy .env.local.example → .env.local and fill in your API keys."
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi
echo "✅  Environment variables (.env.local)"

# ── 3. Install / verify dependencies ─────────────────
if [ ! -d "node_modules" ]; then
  echo ""
  echo "📦  Installing dependencies (first-time only — may take 1–2 min)..."
  npm install
  if [ $? -ne 0 ]; then
    echo "❌  npm install failed. Check your internet connection and try again."
    read -p "Press Enter to exit..."
    exit 1
  fi
fi
echo "✅  Dependencies installed"

# ── 4. Kill any previous instance on port 3000 ───────
PREV=$(lsof -ti tcp:3000 2>/dev/null)
if [ -n "$PREV" ]; then
  echo "♻️   Stopping previous server on port 3000..."
  kill -9 $PREV 2>/dev/null
  sleep 1
fi

# ── 5. Start the dev server ───────────────────────────
echo ""
echo "🚀  Starting Grove AI on http://localhost:3000 ..."
echo "    (Close this window to stop the server)"
echo ""

# Start Next.js in background, then open browser after a short wait
npm run dev &
SERVER_PID=$!

# Wait for server to be ready (poll up to 20s)
echo -n "   Waiting for server"
for i in {1..20}; do
  sleep 1
  echo -n "."
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo " ready!"
    break
  fi
done

# Open in default browser
echo ""
echo "🌐  Opening http://localhost:3000 in your browser..."
open http://localhost:3000

echo ""
echo "✅  Grove AI is running. Keep this window open."
echo "    Press Ctrl+C or close this window to stop."
echo ""

# Keep the terminal open so the server keeps running
wait $SERVER_PID
