#!/usr/bin/env bash
# Phase 2 smoke test — exercises the real HTTP surface against a running dev server.
#
#   npm run dev            # in one shell
#   ./scripts/smoke-test.sh
#
# Covers: health/readiness, auth-gated middleware redirect, server-side Zod
# validation, duplicate-account conflict, registration rate limiting,
# credentials sign-in, and role-specific dashboard content.
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
PASSWORD="password123"
# TEST-NET-3 address: unique per run without needing a server restart.
FORWARDED_IP="${FORWARDED_IP:-203.0.113.$((RANDOM % 254 + 1))}"
FAILURES=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

expect_status() { # label expected actual
  if [ "$3" = "$2" ]; then pass "$1 → $3"; else fail "$1 → expected $2, got $3"; fi
}

expect_contains() { # label haystack_file needle
  if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1 (missing: $3)"; fi
}

json_status() { # method path data jar
  # A per-run forwarded IP keeps the rate-limit bucket fresh: the limiter keys
  # on the client IP, so each run gets its own budget instead of inheriting the
  # previous run's exhausted bucket.
  curl -s -o "$TMP/body.json" -w '%{http_code}' -X "$1" "$BASE$2" \
    -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: $FORWARDED_IP" \
    ${4:+-b "$4"} --data "$3"
}

sign_in() { # email password jar  → prints status code
  local email="$1" password="$2" jar="$3"
  rm -f "$jar"
  local csrf
  csrf=$(curl -s -c "$jar" "$BASE/api/auth/csrf" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).csrfToken))')
  curl -s -b "$jar" -c "$jar" -o /dev/null -w '%{http_code}' \
    -X POST "$BASE/api/auth/callback/credentials" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -H "Origin: $BASE" \
    --data-urlencode "csrfToken=$csrf" \
    --data-urlencode "email=$email" \
    --data-urlencode "password=$password" \
    --data-urlencode "callbackUrl=$BASE/dashboard"
}

echo
echo "ClubHub smoke test → $BASE"
echo "──────────────────────────────────────────────"

echo "[1] health & readiness"
STATUS=$(curl -s -o "$TMP/health.json" -w '%{http_code}' "$BASE/api/health")
expect_status "GET /api/health" 200 "$STATUS"
expect_contains "database is up" "$TMP/health.json" '"status":"up"'
expect_contains "health reports phase 2" "$TMP/health.json" '"phase":2'

echo "[2] protected route without a session"
LOCATION=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/dashboard")
case "$LOCATION" in
  */sign-in*) pass "GET /dashboard redirects to sign-in ($LOCATION)" ;;
  *) fail "GET /dashboard should redirect to sign-in, got: $LOCATION" ;;
esac

echo "[3] server-side validation (client checks are not trusted)"
STATUS=$(json_status POST /api/auth/register '{"firstName":"","lastName":"X","email":"not-an-email","password":"short"}')
expect_status "invalid payload rejected" 422 "$STATUS"
expect_contains "field errors returned" "$TMP/body.json" '"VALIDATION_ERROR"'
expect_contains "email error is named" "$TMP/body.json" '"email"'

echo "[4] registration + uniqueness"
EMAIL="smoke+$(date +%s)@vit.ac.in"
STATUS=$(json_status POST /api/auth/register "{\"firstName\":\"Smoke\",\"lastName\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
expect_status "new account created" 201 "$STATUS"
expect_contains "password hash never returned" "$TMP/body.json" '"email"'
if grep -qF 'passwordHash' "$TMP/body.json"; then fail "response leaked passwordHash"; else pass "no passwordHash in response"; fi

STATUS=$(json_status POST /api/auth/register "{\"firstName\":\"Smoke\",\"lastName\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
expect_status "duplicate email rejected" 409 "$STATUS"

echo "[5] registration rate limiting"
SAW_429=0
for _ in 1 2 3 4; do
  STATUS=$(json_status POST /api/auth/register '{"firstName":"R","lastName":"L","email":"rl@vit.ac.in","password":"password123"}')
  [ "$STATUS" = "429" ] && SAW_429=1
done
if [ "$SAW_429" = "1" ]; then pass "429 returned once the bucket is empty"; else fail "rate limit never triggered"; fi

echo "[6] credentials sign-in (President account)"
STATUS=$(sign_in "aarav.president@vit.ac.in" "$PASSWORD" "$TMP/aarav.jar")
case "$STATUS" in
  200|302) pass "sign-in accepted ($STATUS)" ;;
  *) fail "sign-in failed with $STATUS" ;;
esac
curl -s -b "$TMP/aarav.jar" "$BASE/api/auth/session" -o "$TMP/session.json"
expect_contains "session carries identity" "$TMP/session.json" 'aarav.president@vit.ac.in'

STATUS=$(curl -s -b "$TMP/aarav.jar" -o "$TMP/dash-aarav.html" -w '%{http_code}' "$BASE/dashboard")
expect_status "authenticated dashboard" 200 "$STATUS"
# Note: React splits adjacent text nodes in SSR output ("Hello, <!-- -->Aarav"),
# so assertions match on content that survives that splitting.
expect_contains "dashboard greets the user" "$TMP/dash-aarav.html" "Aarav Shah"
expect_contains "tenant role read from DB" "$TMP/dash-aarav.html" "Tenant roles"
expect_contains "tenant role label rendered" "$TMP/dash-aarav.html" "Owner"
expect_contains "president role in club A" "$TMP/dash-aarav.html" "President"
expect_contains "member role in club B" "$TMP/dash-aarav.html" "Debate Society"
expect_contains "seeded event listed" "$TMP/dash-aarav.html" "RoboWars 2026"

echo "[7] wrong password"
STATUS=$(sign_in "aarav.president@vit.ac.in" "definitely-wrong" "$TMP/bad.jar")
curl -s -b "$TMP/bad.jar" "$BASE/api/auth/session" -o "$TMP/bad-session.json"
if grep -qF 'aarav.president' "$TMP/bad-session.json"; then fail "bad password created a session"; else pass "no session created with a bad password"; fi

echo "[8] same-email-different-role isolation"
STATUS=$(sign_in "kabir.member@vit.ac.in" "$PASSWORD" "$TMP/kabir.jar")
STATUS=$(curl -s -b "$TMP/kabir.jar" -o "$TMP/dash-kabir.html" -w '%{http_code}' "$BASE/dashboard")
expect_status "member dashboard" 200 "$STATUS"
if grep -qF "President" "$TMP/dash-kabir.html"; then
  fail "member account shows a President role"
else
  pass "member account holds no President role"
fi

echo "[9] cookie-free demo preview (for frames that cannot store cookies)"
STATUS=$(curl -s -o "$TMP/demo-aarav.html" -w '%{http_code}' "$BASE/demo")
expect_status "GET /demo without a session" 200 "$STATUS"
expect_contains "demo renders the seeded president" "$TMP/demo-aarav.html" "Aarav Shah"
expect_contains "president's club role is visible" "$TMP/demo-aarav.html" "President"

STATUS=$(curl -s -o "$TMP/demo-kabir.html" -w '%{http_code}' "$BASE/demo?as=kabir")
expect_status "GET /demo?as=kabir" 200 "$STATUS"
expect_contains "switching viewer changes the data" "$TMP/demo-kabir.html" "Kabir Rao"
if grep -qF "President" "$TMP/demo-kabir.html"; then
  fail "the member demo view leaked a President role"
else
  pass "member demo view holds no President role"
fi

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/demo?as=nobody")
expect_status "unknown viewer falls back safely" 200 "$STATUS"

echo "──────────────────────────────────────────────"
if [ "$FAILURES" -eq 0 ]; then
  printf '\033[32mAll checks passed.\033[0m\n\n'
else
  printf '\033[31m%d check(s) failed.\033[0m\n\n' "$FAILURES"
  exit 1
fi
