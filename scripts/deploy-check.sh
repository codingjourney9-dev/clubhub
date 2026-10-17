#!/usr/bin/env bash
#
# Pre-flight and post-flight checks for a ClubHub deployment.
#
#   bash scripts/deploy-check.sh            # check this directory
#   BASE_URL=https://club.example.edu bash scripts/deploy-check.sh
#
# DEMO_MODE_EXPECTED=on says "yes, this server is meant to expose /demo" — used for
# the read-only review deployment, never for a real one.
#
# Run it BEFORE the first deploy (catches configuration mistakes) and AFTER every
# deploy (proves the thing you just shipped actually answers). It reads .env when
# present, so it sees exactly what the app will see.
#
# Exit code 0 = safe to serve. 1 = at least one check failed.

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

# ── Load .env if it exists, without clobbering real environment variables ─────
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    key=${line%%=*}
    value=${line#*=}
    # Trim surrounding quotes.
    value=${value%\"}; value=${value#\"}
    value=${value%\'}; value=${value#\'}
    if [ -z "${!key:-}" ]; then
      export "$key=$value"
    fi
  done < .env
fi

BASE_URL=${BASE_URL:-http://localhost:3000}
PASSES=0
FAILURES=0
WARNINGS=0

pass() { PASSES=$((PASSES + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { FAILURES=$((FAILURES + 1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }
warn() { WARNINGS=$((WARNINGS + 1)); printf '  \033[33m!\033[0m %s\n' "$1"; }

echo "ClubHub deploy check"
echo "──────────────────────────────────────────────"

# ── 1. Runtime ───────────────────────────────────────────────────────────────
echo "[1] runtime"
NODE_VERSION=$(node -v 2>/dev/null | sed 's/^v//')
if [ -z "$NODE_VERSION" ]; then
  fail "node is not installed"
else
  NODE_MAJOR=${NODE_VERSION%%.*}
  if [ "$NODE_MAJOR" -ge 20 ]; then
    pass "node v$NODE_VERSION (needs >= 20.9)"
  else
    fail "node v$NODE_VERSION is too old — the app requires >= 20.9"
  fi
fi

if [ -f .next/BUILD_ID ]; then
  pass "a production build exists (.next/BUILD_ID)"
else
  fail "no production build — run 'npm run build' first"
fi

# ── 2. Environment ───────────────────────────────────────────────────────────
echo "[2] environment"

if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL is not set"
elif [[ "$DATABASE_URL" != postgres* ]]; then
  fail "DATABASE_URL must start with postgres:// or postgresql://"
else
  # Never print the credential — only the host and database name.
  URL_TAIL=${DATABASE_URL#*://}      # strip scheme
  URL_TAIL=${URL_TAIL#*@}            # strip user:password@
  pass "DATABASE_URL points at ${URL_TAIL}"
fi

SECRET=${AUTH_SECRET:-}
if [ -z "$SECRET" ]; then
  fail "AUTH_SECRET is not set — sign-in cookies cannot be signed"
elif [ ${#SECRET} -lt 32 ]; then
  fail "AUTH_SECRET is ${#SECRET} characters; it must be at least 32"
elif [[ "$SECRET" == replace-me* ]]; then
  fail "AUTH_SECRET is still the placeholder from .env.example"
else
  pass "AUTH_SECRET is set (${#SECRET} characters)"
fi

if [ "${NODE_ENV:-}" = "production" ]; then
  pass "NODE_ENV=production"
else
  warn "NODE_ENV is '${NODE_ENV:-unset}' — set it to production when deploying"
fi

# ── 3. Things that are dangerous to get wrong in production ─────────────────
echo "[3] production safety"

DEMO=${DEMO_MODE:-}
if [ "${NODE_ENV:-}" = "production" ]; then
  if [ "$DEMO" = "on" ] || [ "$DEMO" = "true" ]; then
    if [ "${DEMO_MODE_EXPECTED:-}" = "on" ]; then
      warn "DEMO_MODE=$DEMO acknowledged by DEMO_MODE_EXPECTED=on (review deployment only)"
    else
      fail "DEMO_MODE=$DEMO — /demo serves tenant data with NO authentication. Turn it off."
    fi
  else
    pass "DEMO_MODE is off, so /demo stays closed in production"
  fi
else
  if [ "$DEMO" = "on" ]; then
    warn "DEMO_MODE=on (fine locally; it is off by default in production)"
  fi
fi

DRIVER=${RATE_LIMIT_DRIVER:-memory}
if [ "$DRIVER" = "memory" ]; then
  pass "RATE_LIMIT_DRIVER=memory"
  warn "rate limits are per-process — run ONE instance, or implement a shared driver before scaling"
else
  fail "RATE_LIMIT_DRIVER=$DRIVER is not implemented; the app will refuse to start"
fi

if [ -n "${DIRECT_DATABASE_URL:-}" ]; then
  pass "DIRECT_DATABASE_URL is set (migrations bypass the pooler)"
elif [[ "${DATABASE_URL:-}" == *pooler* || "${DATABASE_URL:-}" == *pgbouncer* ]]; then
  warn "DATABASE_URL looks pooled — migrations may fail; set DIRECT_DATABASE_URL"
fi

if [ -f .env ] && git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env is committed to git — it must be gitignored"
else
  pass ".env is not tracked in git"
fi

# The seed creates accounts with a known password. It must never run here.
if [ "${CLUBHUB_SEEDED:-}" = "1" ]; then
  fail "demo seed data detected in this deployment — never run 'npm run db:seed' in production"
else
  pass "no demo-seed marker set"
fi

# ── 4. Database and migrations ──────────────────────────────────────────────
echo "[4] database"

if npx prisma migrate status >/tmp/deploy-migrate.log 2>&1; then
  if grep -qi "pending\|not yet been applied" /tmp/deploy-migrate.log; then
    fail "migrations are pending — run 'npx prisma migrate deploy'"
  else
    pass "database reachable and every migration is applied"
  fi
else
  fail "cannot read migration state — is Postgres running and DATABASE_URL correct?"
  sed -n '1,3p' /tmp/deploy-migrate.log | sed 's/^/      /'
fi

# ── 5. Is it actually serving? ──────────────────────────────────────────────
echo "[5] the running service ($BASE_URL)"

HEALTH=$(curl -s --max-time 10 "$BASE_URL/api/health" 2>/dev/null)
if [ -z "$HEALTH" ]; then
  fail "no response from $BASE_URL/api/health — is the app running?"
else
  if printf '%s' "$HEALTH" | grep -q '"ready":true'; then
    pass "health reports ready:true"
  else
    fail "health is not ready — check the database and migrations"
    printf '      %s\n' "$(printf '%s' "$HEALTH" | head -c 300)"
  fi

  if printf '%s' "$HEALTH" | grep -q '"state":"up"'; then
    pass "database check is up"
  else
    fail "database check is down"
  fi
fi

# Judge the RUNNING server, not this shell: the app reports its own demo state,
# so a mismatch between the two is exactly what needs catching.
DEMO_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE_URL/demo" 2>/dev/null)
if printf '%s' "$HEALTH" | grep -q '"demoMode":{"state":"off"}'; then
  if [ "$DEMO_CODE" = "404" ]; then
    pass "/demo is closed (404) — the server reports demo mode off"
  else
    fail "/demo answered $DEMO_CODE while the server reports demo mode off — it must be 404"
  fi
elif printf '%s' "$HEALTH" | grep -q '"demoMode":{"state":"on"}'; then
  if [ "${DEMO_MODE_EXPECTED:-}" = "on" ]; then
    warn "/demo is open and DEMO_MODE_EXPECTED=on acknowledges it (review deployment only)"
  elif [ "${NODE_ENV:-}" = "production" ]; then
    fail "this server has demo mode ON in production — it serves tenant data with no session"
  else
    warn "/demo is open (expected outside production)"
  fi
fi

SIGNIN_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE_URL/sign-in" 2>/dev/null)
if [ "$SIGNIN_CODE" = "200" ]; then
  pass "/sign-in renders"
else
  fail "/sign-in answered $SIGNIN_CODE"
fi

DASH_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE_URL/dashboard" 2>/dev/null)
if [ "$DASH_CODE" = "307" ] || [ "$DASH_CODE" = "302" ] || [ "$DASH_CODE" = "303" ]; then
  pass "/dashboard redirects a signed-out visitor to sign-in"
else
  fail "/dashboard answered $DASH_CODE to a signed-out visitor (expected a redirect)"
fi

HEADERS=$(curl -sI --max-time 10 "$BASE_URL/api/health" 2>/dev/null)
if printf '%s' "$HEADERS" | grep -qi "x-request-id"; then
  pass "responses carry a correlation id"
else
  fail "no x-request-id header — the logging wrapper may not be mounted"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo "──────────────────────────────────────────────"
if [ "$FAILURES" -eq 0 ]; then
  printf '\033[32mAll %d checks passed.\033[0m' "$PASSES"
  [ "$WARNINGS" -gt 0 ] && printf ' \033[33m(%d warning(s))\033[0m' "$WARNINGS"
  printf '\n'
  exit 0
else
  printf '\033[31m%d check(s) failed\033[0m' "$FAILURES"
  [ "$WARNINGS" -gt 0 ] && printf ', %d warning(s)' "$WARNINGS"
  printf '.\n'
  exit 1
fi
