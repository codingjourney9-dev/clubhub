#!/usr/bin/env bash
# One-command resume for this project.
#
#   npm run app:up              preview server (production build)
#   APP_MODE=dev npm run app:up hot-reload dev server, for editing code
#
# Sandbox snapshots do not keep node_modules, installed apt packages or empty
# directories, so "the app is gone" after a restart usually means exactly three
# things need rebuilding. This script does all of them, then starts the server:
#
#   1. dependencies  (npm install when node_modules is missing)
#   2. database      (scripts/db.sh start — self-heals binaries/dirs/permissions)
#   3. web server    (Next.js on 0.0.0.0:3000, visible to the preview proxy)
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"

if [ -n "${SKIP_PORT_CHECK:-}" ]; then
  :
elif command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":${PORT}\b"; then
  echo "Port ${PORT} is already in use — the app may already be running."
  echo "  Check:  curl -s localhost:${PORT}/api/health"
  echo "  Stop:   kill \$(pgrep -f '[n]ext')"
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

# Hosted on a ~2 GB machine. A hot-reloading dev server compiling pages on demand
# needs more memory than that and gets killed mid-request (the preview simply
# stops responding), so the preview is served from a production build instead —
# roughly a fifth of the memory and much faster page loads.
#
#   npm run app:up              preview server (builds once if needed)
#   APP_MODE=dev npm run app:up hot-reload dev server, for editing code
#
# This sandbox has ~2 GB of RAM. Node sizes its heap from the machine total, so
# without a cap it grows until the kernel kills the server mid-request.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=768"

if [ "${APP_MODE:-preview}" = "dev" ]; then
  echo "▶ Starting the DEV server on 0.0.0.0:${PORT} (hot reload, Ctrl-C to stop)…"
  exec npm run dev -- -H 0.0.0.0 -p "$PORT"
fi

if [ ! -f .next/BUILD_ID ]; then
  echo "▶ No build found (builds are not kept in snapshots) — running npm run build…"
  npm run build
fi

echo "▶ Starting the PREVIEW server on 0.0.0.0:${PORT} (Ctrl-C to stop)…"
exec npx next start -H 0.0.0.0 -p "$PORT"
