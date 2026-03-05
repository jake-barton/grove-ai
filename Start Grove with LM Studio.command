#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Double-click this file to start Grove with LM Studio.
#  macOS will open it in Terminal automatically.
# ─────────────────────────────────────────────────────────────
cd "$(dirname "$0")"
exec bash scripts/start-lmstudio-tunnel.sh
