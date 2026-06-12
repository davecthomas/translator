#!/usr/bin/env bash
# Kol — one-command launcher.
# Installs deps if needed, checks for an API key, opens the browser, and starts the app.
set -euo pipefail

cd "$(dirname "$0")"

URL="http://localhost:5173"

# 1. Dependencies
if [ ! -d node_modules ]; then
  echo "→ Installing dependencies…"
  npm install
fi

# 2. API key — from .env (auto-loaded by the server) or the environment
if [ ! -f .env ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "⚠  No API key found."
  echo "   Create one at https://console.anthropic.com/ then either:"
  echo "     cp .env.example .env   # and paste your key into .env"
  echo "   or:"
  echo "     export ANTHROPIC_API_KEY=sk-ant-..."
  echo
  echo "   Starting anyway — translation will fail until a key is set."
fi

# 3. Open the browser shortly after the dev server comes up
( sleep 2
  if command -v open >/dev/null 2>&1; then open "$URL"          # macOS
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" # Linux
  fi
) >/dev/null 2>&1 &

# 4. Launch (Vite on 5173 + Express API on 3001)
echo "→ Starting Kol at $URL  (Ctrl-C to stop)"
exec npm run dev
