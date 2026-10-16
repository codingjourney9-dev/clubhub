#!/usr/bin/env bash
# One-command resume for this project.
#
#   npm run app:up
#
# Sandbox snapshots do not keep node_modules, installed apt packages or empty
# directories, so "the app is gone" after a restart usually means exactly three
# things need rebuilding. This script does all of them, then starts the server:
#
#   1. dependencies  (npm install when node_modules is missing)
#   2. database      (scripts/db.sh start — self-heals binaries/dirs/permissions)
#   3. dev server    (Next.js on 0.0.0.0:3000, visible to the preview proxy)
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"

if [ -n "${SKIP_PORT_CHECK:-}" ]; then
  :
elif command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":${PORT}\b"; then
  echo "Port ${PORT} is already in use — the app may already be running."
  echo "  Check:  curl -s localhost:${PORT}/api/health"
  echo "  Stop:   kill \$(pgrep -f '[n]ext dev')"
  exit 1
fi

if [ ! -x node_modules/.bin/next ]; then
  echo "▶ Installing dependencies (node_modules is not part of snapshots)…"
  npm install --no-audit --no-fund
else
  echo "▶ Dependencies present."
fi

echo "▶ Starting PostgreSQL…"
bash ./scripts/db.sh start

echo "▶ Starting the dev server on 0.0.0.0:${PORT} (Ctrl-C to stop)…"
exec npm run dev -- -H 0.0.0.0 -p "$PORT"
