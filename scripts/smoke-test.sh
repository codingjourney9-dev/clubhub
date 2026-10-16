#!/usr/bin/env bash
# Phase 2 smoke test — exercises the real HTTP surface against a running dev server.
#
#   npm run dev            # in one shell
#   ./scripts/smoke-test.sh
#
# Covers: health/readiness, auth-gated middleware redirect, server-side Zod
# validation, duplicate-account conflict, registration rate limiting,
# credentials sign-in, role-specific dashboard content, the cookie-free demo
# preview, and (phase 3) colleges, clubs, the RBAC-guarded club page and the
# full invite lifecycle.
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
expect_contains "health reports phase 3" "$TMP/health.json" '"phase":3'

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

echo "[10] phase 3 — college, club and role-aware club pages"
# The seeded college, from prisma/seed.ts.
TENANT_ID="0f1d2c3b-4a59-4e6d-8b7c-100000000001"

LOCATION=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/onboarding")
case "$LOCATION" in
  */sign-in*) pass "anonymous /onboarding redirects to sign-in" ;;
  *) fail "anonymous /onboarding should redirect to sign-in, got: $LOCATION" ;;
esac

STATUS=$(curl -s -b "$TMP/aarav.jar" -o "$TMP/onboarding.html" -w '%{http_code}' "$BASE/onboarding")
expect_status "GET /onboarding as the college owner" 200 "$STATUS"
expect_contains "college rendered" "$TMP/onboarding.html" "Vadodara Institute of Technology"
expect_contains "club rendered" "$TMP/onboarding.html" "Robotics Club"

STATUS=$(json_status GET "/api/clubs?tenantId=$TENANT_ID" "" "$TMP/aarav.jar")
expect_status "GET /api/clubs" 200 "$STATUS"

# Pick one club the president runs and one where he is only a member: the SAME
# page must render differently for the two roles.
PRESIDENT_CLUB=$(node -e 'const b=require(process.argv[1]);const c=(b.data.clubs||[]).find(x=>x.viewerRole==="PRESIDENT");process.stdout.write(c?c.id:"")' "$TMP/body.json")
MEMBER_CLUB=$(node -e 'const b=require(process.argv[1]);const c=(b.data.clubs||[]).find(x=>x.viewerRole==="MEMBER");process.stdout.write(c?c.id:"")' "$TMP/body.json")

if [ -n "$PRESIDENT_CLUB" ] && [ -n "$MEMBER_CLUB" ]; then
  pass "club roles resolved from the database"

  STATUS=$(curl -s -b "$TMP/aarav.jar" -o "$TMP/club-president.html" -w '%{http_code}' "$BASE/clubs/$PRESIDENT_CLUB")
  expect_status "club page as its president" 200 "$STATUS"
  expect_contains "member roster rendered" "$TMP/club-president.html" "Members"
  expect_contains "invite management rendered" "$TMP/club-president.html" "Invite links"

  STATUS=$(curl -s -b "$TMP/aarav.jar" -o "$TMP/club-member.html" -w '%{http_code}' "$BASE/clubs/$MEMBER_CLUB")
  expect_status "club page where he is only a member" 200 "$STATUS"
  # A college Owner administers EVERY club in their college, so the invite tools
  # appear even here. That override is deliberate — and it is still bounded by
  # the "you may only hand out roles you could hold" rule.
  expect_contains "college owner sees the invite tools on any club" "$TMP/club-member.html" "Invite links"

  # A plain club member gets the read-only view: roster yes, invite tools no.
  STATUS=$(curl -s -b "$TMP/kabir.jar" -o "$TMP/club-kabir.html" -w '%{http_code}' "$BASE/clubs/$PRESIDENT_CLUB")
  expect_status "club page as a plain member" 200 "$STATUS"
  expect_contains "member sees the roster" "$TMP/club-kabir.html" "Members"
  if grep -qF "Invite links" "$TMP/club-kabir.html"; then
    fail "the member view leaked invite management"
  else
    pass "member view hides invite management"
  fi
else
  fail "could not resolve club ids from /api/clubs"
  PRESIDENT_CLUB=""
fi

STATUS=$(curl -s -b "$TMP/aarav.jar" -o /dev/null -w '%{http_code}' "$BASE/clubs/99999999-9999-4999-8999-999999999999")
expect_status "unknown club id shows the 404 page" 404 "$STATUS"

LOCATION=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/clubs/$PRESIDENT_CLUB")
case "$LOCATION" in
  */sign-in*) pass "signed-out visitors are sent to sign-in, not a crash" ;;
  *) fail "signed-out club page should redirect to sign-in, got: $LOCATION" ;;
esac

echo "[11] phase 3 — invite links: rights, validation and redemption"
if [ -n "$PRESIDENT_CLUB" ]; then
  # A request that forgets the role must be rejected by Zod on the server, even
  # though the browser form would never send it.
  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/invites" '{"maxUses":1,"expiresInHours":24}' "$TMP/aarav.jar")
  expect_status "invite without a role is rejected" 422 "$STATUS"
  expect_contains "validation error named" "$TMP/body.json" '"VALIDATION_ERROR"'

  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/invites" '{"role":"MEMBER"}' "")
  expect_status "anonymous invite creation is refused" 401 "$STATUS"

  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/invites" '{"role":"MEMBER","expiresInHours":24,"maxUses":1}' "$TMP/kabir.jar")
  expect_status "a plain member cannot mint links" 403 "$STATUS"

  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/invites" '{"role":"MEMBER","expiresInHours":24,"maxUses":1}' "$TMP/aarav.jar")
  expect_status "president mints a one-use member link" 201 "$STATUS"
  TOKEN=$(node -e 'const b=require(process.argv[1]);process.stdout.write(((b.data.invite||{}).url||"").split("/join/")[1]||"")' "$TMP/body.json")
  if [ -n "$TOKEN" ]; then pass "invite token issued"; else fail "no token in the invite response"; fi

  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/invites" '{"role":"ADMIN","expiresInHours":24,"maxUses":1}' "$TMP/aarav.jar")
  expect_status "an invalid club role is rejected" 422 "$STATUS"

  if [ -n "$TOKEN" ]; then
    STATUS=$(json_status GET "/api/invites/$TOKEN" "")
    expect_status "public preview of the link" 200 "$STATUS"
    expect_contains "preview names the club" "$TMP/body.json" "Robotics Club"
    expect_contains "preview marks it usable" "$TMP/body.json" '"valid":true'

    STATUS=$(curl -s -o "$TMP/join.html" -w '%{http_code}' "$BASE/join/$TOKEN")
    expect_status "join page renders for a signed-out visitor" 200 "$STATUS"
    expect_contains "join page asks for sign-in" "$TMP/join.html" "Sign in and join"

    # A brand-new account, so the redemption is genuinely a first one on every run.
    # It needs its own forwarded IP: the registration limiter keys on IP and the
    # earlier sections deliberately exhaust this run's bucket.
    INVITEE="smoke.invitee+$(date +%s)@vit.ac.in"
    INVITE_IP="198.51.$(( (RANDOM % 200) + 1 )).$(( (RANDOM % 200) + 1 ))"
    STATUS=$(curl -s -o "$TMP/body.json" -w '%{http_code}' -X POST "$BASE/api/auth/register" \
      -H 'Content-Type: application/json' -H "X-Forwarded-For: $INVITE_IP" \
      --data "{\"firstName\":\"Invite\",\"lastName\":\"Guest\",\"email\":\"$INVITEE\",\"password\":\"$PASSWORD\"}")
    expect_status "invitee account registered" 201 "$STATUS"
    STATUS=$(sign_in "$INVITEE" "$PASSWORD" "$TMP/invitee.jar")
    case "$STATUS" in
      200|302) pass "invitee signed in" ;;
      *) fail "invitee sign-in failed with $STATUS" ;;
    esac

    STATUS=$(json_status POST "/api/invites/$TOKEN" '{}' "$TMP/invitee.jar")
    expect_status "invite redeemed" 200 "$STATUS"
    expect_contains "membership reported as new" "$TMP/body.json" '"alreadyMember":false'

    STATUS=$(json_status GET "/api/clubs?tenantId=$TENANT_ID" "" "$TMP/invitee.jar")
    expect_contains "the newcomer holds the role the link granted" "$TMP/body.json" '"viewerRole":"MEMBER"'

    STATUS=$(json_status POST "/api/invites/$TOKEN" '{}' "$TMP/invitee.jar")
    expect_status "clicking the same link twice is not an error" 200 "$STATUS"
    expect_contains "second click reports an existing membership" "$TMP/body.json" '"alreadyMember":true'

    STATUS=$(json_status GET "/api/clubs/$PRESIDENT_CLUB/invites" "" "$TMP/aarav.jar")
    expect_status "president lists club invites" 200 "$STATUS"
    expect_contains "the one-use link is shown as used up" "$TMP/body.json" '"status":"used_up"'
  fi
fi

echo "──────────────────────────────────────────────"
if [ "$FAILURES" -eq 0 ]; then
  printf '\033[32mAll checks passed.\033[0m\n\n'
else
  printf '\033[31m%d check(s) failed.\033[0m\n\n' "$FAILURES"
  exit 1
fi
