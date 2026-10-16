#!/usr/bin/env bash
# ClubHub health check — run me when something looks broken.
#
#   npm run doctor
#
# Checks, in plain language: project files → installed tools → database →
# running app → a real sign-in. Every failure prints the exact command to fix it.
set -uo pipefail

cd "$(dirname "$0")/.."

PASS=0
WARN=0
FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '      → %s\n' "$2"; WARN=$((WARN + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '      → FIX: %s\n' "$2"; FAIL=$((FAIL + 1)); }

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}"
DEMO_EMAIL="aarav.president@vit.ac.in"
DEMO_PASSWORD="password123"

echo
echo "ClubHub doctor"
echo "══════════════════════════════════════════════"

echo "Project files"
[ -f package.json ] && ok "package.json found" || bad "not in the project folder" "cd into the clubhub folder"
[ -f .env ] && ok ".env settings file found" || bad ".env is missing" "cp .env.example .env, then set AUTH_SECRET"

echo "Installed tools"
if [ -x node_modules/.bin/next ]; then
  ok "dependencies installed ($(node_modules/.bin/next --version 2>/dev/null))"
else
  bad "dependencies are missing (snapshots do not keep node_modules)" "npm install"
fi

echo "Database"
if [ -x /usr/lib/postgresql/17/bin/pg_ctl ]; then
  ok "PostgreSQL programs installed"
else
  warn "PostgreSQL programs missing (they do not survive a sandbox restart)" "npm run db:start  (reinstalls them)"
fi
if [ -s /home/user/pgdata/PG_VERSION ]; then
  ok "database files present (v$(cat /home/user/pgdata/PG_VERSION))"
else
  warn "no database cluster yet" "npm run db:start  (creates it), then npx prisma migrate deploy && npm run db:seed"
fi
if pgrep -x postgres >/dev/null 2>&1; then
  ok "database server is running"
else
  bad "database server is not running" "npm run db:start"
fi

echo "Application"
HEALTH=$(curl -s -m 8 "${BASE}/api/health" 2>/dev/null)
if [ -z "$HEALTH" ]; then
  bad "nothing is answering on port ${PORT}" "npm run app:up"
else
  ok "the app is responding on port ${PORT}"
  case "$HEALTH" in
    *'"status":"up"'*) ok "the app can reach the database" ;;
    *'"status":"down"'*) bad "the app cannot reach the database" "npm run db:start" ;;
  esac
fi

echo "Demo sign-in"
if [ -n "$HEALTH" ]; then
  JAR="$(mktemp)"
  TOKEN=$(curl -s -m 10 -c "$JAR" "${BASE}/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
  if [ -n "$TOKEN" ]; then
    curl -s -m 15 -b "$JAR" -c "$JAR" -o /dev/null -X POST "${BASE}/api/auth/callback/credentials" \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      -H "Origin: ${BASE}" \
      --data-urlencode "csrfToken=${TOKEN}" \
      --data-urlencode "email=${DEMO_EMAIL}" \
      --data-urlencode "password=${DEMO_PASSWORD}" \
      --data-urlencode "callbackUrl=${BASE}/dashboard"
    WHO=$(curl -s -m 10 -b "$JAR" "${BASE}/api/auth/session" | sed -n 's/.*"email":"\([^"]*\)".*/\1/p')
    if [ "$WHO" = "$DEMO_EMAIL" ]; then
      ok "signed in as ${DEMO_EMAIL}"
    else
      bad "the demo account could not sign in" "npm run db:seed  (re-creates the demo users)"
    fi
  else
    warn "could not fetch a sign-in token" "restart the app: npm run app:up"
  fi
  rm -f "$JAR"
else
  warn "skipped (the app is not running)" "npm run app:up, then re-run npm run doctor"
fi

echo "══════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
  printf '\033[32mEverything is healthy.\033[0m Open %s and sign in with %s / %s\n\n' "$BASE" "$DEMO_EMAIL" "$DEMO_PASSWORD"
  exit 0
elif [ "$FAIL" -eq 0 ]; then
  printf '\033[33m%d warning(s), nothing broken.\033[0m\n\n' "$WARN"
  exit 0
else
  printf '\033[31m%d problem(s) found — run the FIX commands above, then re-run: npm run doctor\033[0m\n\n' "$FAIL"
  exit 1
fi
