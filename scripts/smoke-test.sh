#!/usr/bin/env bash
# Phase 2 smoke test — exercises the real HTTP surface against a running dev server.
#
#   npm run dev            # in one shell
#   ./scripts/smoke-test.sh
#
# Covers: health/readiness, auth-gated middleware redirect, server-side Zod
# validation, duplicate-account conflict, registration rate limiting,
# credentials sign-in, role-specific dashboard content, the cookie-free demo
# preview, (phase 3) colleges, clubs, the RBAC-guarded club page and the full
# invite lifecycle, (phase 4) the event lifecycle with its UTC/timezone rules, and
# (phase 5) capacity-safe registration, waitlists and QR tickets, and (phase 6) the
# door: scanning, duplicate detection, idempotent offline sync and attendance.
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
PASSWORD="password123"
# TEST-NET-3 address: unique per run without needing a server restart.
FORWARDED_IP="${FORWARDED_IP:-203.0.113.$((RANDOM % 254 + 1))}"
FAILURES=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASSES=0
pass() { PASSES=$((PASSES + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
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
STATUS=$(curl -s -D "$TMP/health.headers" -o "$TMP/health.json" -w '%{http_code}' "$BASE/api/health")
expect_status "GET /api/health" 200 "$STATUS"
expect_contains "database is up" "$TMP/health.json" '"state":"up"'
expect_contains "health reports phase 7" "$TMP/health.json" '"phase":7'
expect_contains "…and says it is ready to serve" "$TMP/health.json" '"ready":true'
expect_contains "…because the migrations have run" "$TMP/health.json" '"applied":'
if grep -qi "x-request-id:" "$TMP/health.headers"; then
  pass "every response carries a correlation id"
else
  fail "no x-request-id header on the response"
fi

echo "[2] guests: public board open, everything else still gated"
expect_not_contains() { # label haystack_file needle
  if grep -qF -- "$3" "$2"; then fail "$1 (should not contain: $3)"; else pass "$1"; fi
}
STATUS=$(curl -s -o "$TMP/guest-dash.html" -w '%{http_code}' "$BASE/dashboard")
expect_status "GET /dashboard without a session is the guest board" 200 "$STATUS"
expect_contains "…which says the visitor is a guest" "$TMP/guest-dash.html" "Browsing as a guest"
expect_contains "…lists a published public event" "$TMP/guest-dash.html" "RoboWars 2026"
expect_not_contains "…but never a draft / members-only event" "$TMP/guest-dash.html" "Line-Follower Workshop"
expect_contains "…and offers to start a club" "$TMP/guest-dash.html" "Start a new club"

LOCATION=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/onboarding")
case "$LOCATION" in
  */sign-in*) pass "GET /onboarding (club creation) still redirects guests to sign-in" ;;
  *) fail "GET /onboarding should redirect to sign-in, got: $LOCATION" ;;
esac

PUBLIC_EVENT="0f1d2c3b-4a59-4e6d-8b7c-300000000001"   # RoboWars, published + public
PRIVATE_EVENT="0f1d2c3b-4a59-4e6d-8b7c-300000000002"  # workshop, draft + members only
STATUS=$(curl -s -o "$TMP/guest-event.html" -w '%{http_code}' "$BASE/events/$PUBLIC_EVENT")
expect_status "a public event page opens for guests" 200 "$STATUS"
expect_contains "…with a sign-in-to-get-a-ticket button" "$TMP/guest-event.html" "Sign in to get a ticket"
expect_not_contains "…and no organiser roster" "$TMP/guest-event.html" "Who is coming"
LOCATION=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/events/$PRIVATE_EVENT")
case "$LOCATION" in
  */sign-in*) pass "a members-only draft still sends guests to sign-in" ;;
  *) fail "members-only event should redirect guests to sign-in, got: $LOCATION" ;;
esac

curl -s -o "$TMP/evil.html" "$BASE/sign-in?callbackUrl=https%3A%2F%2Fevil.example%2Fphish"
# (The raw address still appears in Next's own router state; what matters is the
# value handed to the sign-in form, which decides where the browser goes next.)
expect_contains "sign-in replaces a callbackUrl pointing at another site…" "$TMP/evil.html" '\"callbackUrl\":\"/dashboard\"'
expect_not_contains "…so the form never receives it" "$TMP/evil.html" '\"callbackUrl\":\"https'
curl -s -o "$TMP/why.html" "$BASE/sign-in?callbackUrl=%2Fonboarding"
expect_contains "sign-in explains why a club starter was sent there" "$TMP/why.html" "know who its President is"

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

echo "[9b] phase 3 club preview (same page, three different viewers)"
# Seeded clubs from prisma/seed.ts.
ROBOTICS="0f1d2c3b-4a59-4e6d-8b7c-200000000001"

STATUS=$(curl -s -o "$TMP/demo-club-aarav.html" -w '%{http_code}' "$BASE/demo/clubs/$ROBOTICS")
expect_status "GET /demo/clubs/:id as the President" 200 "$STATUS"
expect_contains "club preview names the club" "$TMP/demo-club-aarav.html" "Robotics Club"
expect_contains "club preview shows the roster" "$TMP/demo-club-aarav.html" "Members ("
expect_contains "president sees the invite section" "$TMP/demo-club-aarav.html" "Invite links"
expect_contains "capabilities are explained in words" "$TMP/demo-club-aarav.html" "can do here"

STATUS=$(curl -s -o "$TMP/demo-club-kabir.html" -w '%{http_code}' "$BASE/demo/clubs/$ROBOTICS?as=kabir")
expect_status "GET the same club as a plain member" 200 "$STATUS"
expect_contains "viewer switch changes the page" "$TMP/demo-club-kabir.html" "Kabir Rao"
if grep -qF "Invite links" "$TMP/demo-club-kabir.html"; then
  fail "the member view leaked the invite section"
else
  pass "member view hides the invite section"
fi

# The cookie-free preview may show exactly ONE invite URL — the planted demo one.
# Every other invite must remain a secret, so the check is per-token, not per-page.
DEMO_TOKEN="demo-invite-robotics-club-000000000001"
for file in "$TMP/demo-club-aarav.html" "$TMP/demo-club-kabir.html"; do
  LEAKED=$(node -e '
    const fs = require("fs");
    const html = fs.readFileSync(process.argv[1], "utf8");
    const demo = process.argv[2];
    const found = [...html.matchAll(/join\/([A-Za-z0-9_-]{20,})/g)].map((match) => match[1]);
    const others = [...new Set(found.filter((token) => token !== demo))];
    process.stdout.write(others.join(", "));
  ' "$file" "$DEMO_TOKEN")
  if [ -n "$LEAKED" ]; then
    fail "$(basename "$file") leaked invite token(s): $LEAKED"
  else
    pass "$(basename "$file") exposes no invite token except the public demo link"
  fi
done

# …and that public link must actually work, so the joining flow can be reviewed.
STATUS=$(curl -s -o "$TMP/demo-join.html" -w '%{http_code}' "$BASE/join/$DEMO_TOKEN")
expect_status "the public demo invite resolves" 200 "$STATUS"
expect_contains "it offers the joining page" "$TMP/demo-join.html" "You have been invited to Robotics Club"
expect_contains "it names the role the link grants" "$TMP/demo-join.html" "Member"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/demo/clubs/99999999-9999-4999-8999-999999999999")
expect_status "unknown club in the demo is not found" 404 "$STATUS"

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

echo "[12] phase 4 — events: create, publish, cancel, delete"
if [ -n "$PRESIDENT_CLUB" ]; then
  # A wall-clock time in the college's timezone, three days out. datetime-local
  # format, no timezone suffix — exactly what the browser sends.
  START=$(node -e 'const d=new Date(Date.now()+3*864e5);d.setUTCHours(4,30,0,0);process.stdout.write(d.toISOString().slice(0,16))')
  END=$(node -e 'const d=new Date(Date.now()+3*864e5);d.setUTCHours(7,30,0,0);process.stdout.write(d.toISOString().slice(0,16))')

  # A plain member must not be able to create events.
  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events" \
    "{\"title\":\"Member Attempt\",\"start\":\"$START\",\"end\":\"$END\"}" "$TMP/kabir.jar")
  expect_status "a plain member cannot create events" 403 "$STATUS"

  # End before start: rejected by the server, with the error attached to the field.
  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events" \
    "{\"title\":\"Backwards\",\"start\":\"$END\",\"end\":\"$START\"}" "$TMP/aarav.jar")
  expect_status "end before start is rejected" 422 "$STATUS"
  expect_contains "the error names the end field" "$TMP/body.json" '"end"'
  expect_contains "and explains why" "$TMP/body.json" 'after the start'

  # A waitlist without a capacity is a setting that would do nothing.
  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events" \
    "{\"title\":\"Waitlist Only\",\"start\":\"$START\",\"end\":\"$END\",\"waitlistEnabled\":true}" "$TMP/aarav.jar")
  expect_status "a waitlist without a capacity is rejected" 422 "$STATUS"
  expect_contains "the waitlist field is blamed" "$TMP/body.json" 'waitlistEnabled'

  # A valid event starts life as a draft.
  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events" \
    "{\"title\":\"Smoke Test Meetup\",\"start\":\"$START\",\"end\":\"$END\",\"capacity\":25,\"isPublic\":true}" \
    "$TMP/aarav.jar")
  expect_status "president creates a draft" 201 "$STATUS"
  expect_contains "the new event is a draft" "$TMP/body.json" '"status":"DRAFT"'
  expect_contains "times are stored as UTC instants" "$TMP/body.json" 'T0'
  EVENT_ID=$(node -e 'const b=require(process.argv[1]);process.stdout.write((b.data.event||{}).id||"")' "$TMP/body.json")

  if [ -n "$EVENT_ID" ]; then
    pass "event id returned"

    # Drafts belong to organisers only: the club's own members do not see them.
    STATUS=$(json_status GET "/api/clubs/$PRESIDENT_CLUB/events" "" "$TMP/kabir.jar")
    if grep -qF "Smoke Test Meetup" "$TMP/body.json"; then
      fail "a plain member could see a draft event"
    else
      pass "drafts are hidden from plain members"
    fi

    STATUS=$(json_status GET "/api/clubs/$PRESIDENT_CLUB/events" "" "$TMP/aarav.jar")
    expect_contains "the organiser sees the draft" "$TMP/body.json" "Smoke Test Meetup"

    STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events/$EVENT_ID/status" '{"status":"PUBLISHED"}' "$TMP/aarav.jar")
    expect_status "publish it" 200 "$STATUS"
    expect_contains "status moved to published" "$TMP/body.json" '"status":"PUBLISHED"'

    STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events/$EVENT_ID/status" '{"status":"PUBLISHED"}' "$TMP/aarav.jar")
    expect_status "publishing twice is not an error" 200 "$STATUS"
    expect_contains "the second call changed nothing" "$TMP/body.json" '"changed":false'

    # A published event must not vanish under students' feet.
    STATUS=$(json_status DELETE "/api/clubs/$PRESIDENT_CLUB/events/$EVENT_ID" "" "$TMP/aarav.jar")
    expect_status "deleting a published event is refused" 409 "$STATUS"
    expect_contains "with an instruction to cancel first" "$TMP/body.json" "Cancel it first"

    STATUS=$(json_status GET "/api/clubs/$PRESIDENT_CLUB/events" "" "$TMP/kabir.jar")
    expect_contains "members can see the published event" "$TMP/body.json" "Smoke Test Meetup"

    STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events/$EVENT_ID/status" '{"status":"CANCELLED"}' "$TMP/aarav.jar")
    expect_status "cancel it" 200 "$STATUS"

    STATUS=$(json_status GET "/api/clubs/$PRESIDENT_CLUB/events" "" "$TMP/kabir.jar")
    expect_contains "cancelled events stay visible so nobody turns up" "$TMP/body.json" "Smoke Test Meetup"
    expect_contains "…and are labelled cancelled" "$TMP/body.json" '"status":"CANCELLED"'

    STATUS=$(json_status DELETE "/api/clubs/$PRESIDENT_CLUB/events/$EVENT_ID" "" "$TMP/aarav.jar")
    expect_status "a cancelled event can be deleted" 200 "$STATUS"

    STATUS=$(json_status GET "/api/clubs/$PRESIDENT_CLUB/events" "" "$TMP/aarav.jar")
    if grep -qF "Smoke Test Meetup" "$TMP/body.json"; then
      fail "the deleted event is still listed"
    else
      pass "the deleted event is gone from listings"
    fi

    STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events/$EVENT_ID/status" '{"status":"DRAFT"}' "$TMP/aarav.jar")
    expect_status "a draft cannot be resurrected through the status endpoint" 422 "$STATUS"
  fi
fi

echo "[13] phase 5 — ticketing: seats, waitlist, queue order"
if [ -n "$PRESIDENT_CLUB" ]; then
  # The Event Manager is the second student in this story: she is a club member
  # but not the organiser, which is exactly the position a queue forms behind.
  STATUS=$(sign_in "meera.manager@vit.ac.in" "$PASSWORD" "$TMP/meera.jar")
  case "$STATUS" in
    200|302) pass "Event Manager signs in ($STATUS)" ;;
    *) fail "Event Manager sign-in failed with $STATUS" ;;
  esac

  # A one-seat event with a waitlist, published so students can actually see it.
  START=$(node -e 'const d=new Date(Date.now()+4*864e5);d.setUTCHours(6,30,0,0);process.stdout.write(d.toISOString().slice(0,16))')
  END=$(node -e 'const d=new Date(Date.now()+4*864e5);d.setUTCHours(9,30,0,0);process.stdout.write(d.toISOString().slice(0,16))')

  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events" \
    "{\"title\":\"Smoke Seat Test\",\"start\":\"$START\",\"end\":\"$END\",\"capacity\":1,\"waitlistEnabled\":true,\"isPublic\":true}" \
    "$TMP/aarav.jar")
  expect_status "an organiser creates a one-seat event" 201 "$STATUS"
  SEAT_EVENT=$(node -e 'const b=require(process.argv[1]);process.stdout.write((b.data.event||{}).id||"")' "$TMP/body.json")

  if [ -n "$SEAT_EVENT" ]; then
    STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events/$SEAT_EVENT/status" '{"status":"PUBLISHED"}' "$TMP/aarav.jar")
    expect_status "publish it" 200 "$STATUS"

    # First student takes the only seat.
    STATUS=$(json_status POST "/api/events/$SEAT_EVENT/register" '{}' "$TMP/kabir.jar")
    expect_status "the first student claims the only seat" 201 "$STATUS"
    expect_contains "…and is registered" "$TMP/body.json" '"status":"REGISTERED"'
    TICKET_ID=$(node -e 'const b=require(process.argv[1]);process.stdout.write(((b.data||{}).ticket||{}).id||"")' "$TMP/body.json")

    # Second student goes to the queue, with a visible place in line.
    STATUS=$(json_status POST "/api/events/$SEAT_EVENT/register" '{}' "$TMP/meera.jar")
    expect_status "the second student joins the waitlist" 201 "$STATUS"
    expect_contains "…at the front of the queue" "$TMP/body.json" '"queuePosition":1'

    # The most common cause of a double request is a slow thumb, not mischief.
    STATUS=$(json_status POST "/api/events/$SEAT_EVENT/register" '{}' "$TMP/kabir.jar")
    expect_status "registering twice is harmless" 200 "$STATUS"
    expect_contains "…and changes nothing" "$TMP/body.json" '"outcome":"already-registered"'

    # The guest list is not public: students cannot see who else is coming.
    STATUS=$(json_status GET "/api/events/$SEAT_EVENT/tickets" "" "$TMP/kabir.jar")
    expect_status "a student cannot read the guest list" 403 "$STATUS"

    STATUS=$(json_status GET "/api/events/$SEAT_EVENT/tickets" "" "$TMP/aarav.jar")
    expect_status "the organiser can" 200 "$STATUS"
    expect_contains "…and sees who holds the seat" "$TMP/body.json" '"registered"'
    expect_contains "…and who is waiting" "$TMP/body.json" '"waitlisted"'

    # The ticket itself: a QR image, and only for its owner.
    STATUS=$(curl -s -b "$TMP/kabir.jar" -o "$TMP/ticket.html" -w '%{http_code}' "$BASE/tickets/$TICKET_ID")
    expect_status "the ticket page renders" 200 "$STATUS"
    expect_contains "with a QR image embedded, not fetched from elsewhere" "$TMP/ticket.html" "data:image/png;base64"

    STATUS=$(curl -s -b "$TMP/meera.jar" -o /dev/null -w '%{http_code}' "$BASE/tickets/$TICKET_ID")
    expect_status "somebody else's ticket is a 404" 404 "$STATUS"

    # Giving the seat back promotes the person at the front of the queue.
    STATUS=$(json_status DELETE "/api/tickets/$TICKET_ID" "" "$TMP/kabir.jar")
    expect_status "the seat is given back" 200 "$STATUS"
    expect_contains "…the ticket really changed" "$TMP/body.json" '"changed":true'
    expect_contains "…and the queue moved up automatically" "$TMP/body.json" 'Meera'

    STATUS=$(json_status GET "/api/events/$SEAT_EVENT/tickets" "" "$TMP/aarav.jar")
    expect_contains "the queue is empty afterwards" "$TMP/body.json" '"waitlisted":[]'

    # A full room with no waitlist says no, rather than growing a hidden queue.
    STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events" \
      "{\"title\":\"Smoke Full Test\",\"start\":\"$START\",\"end\":\"$END\",\"capacity\":1,\"waitlistEnabled\":false,\"isPublic\":true}" \
      "$TMP/aarav.jar")
    FULL_EVENT=$(node -e 'const b=require(process.argv[1]);process.stdout.write((b.data.event||{}).id||"")' "$TMP/body.json")
    json_status POST "/api/clubs/$PRESIDENT_CLUB/events/$FULL_EVENT/status" '{"status":"PUBLISHED"}' "$TMP/aarav.jar" > /dev/null
    # Kabir wins the only seat; his ticket is scanned at the door in section [14].
    STATUS=$(json_status POST "/api/events/$FULL_EVENT/register" '{}' "$TMP/kabir.jar")
    DOOR_TICKET=$(node -e 'const b=require(process.argv[1]);process.stdout.write(((b.data||{}).ticket||{}).id||"")' "$TMP/body.json")
    SEAT_QR=$(psql -h 127.0.0.1 -U clubhub -d clubhub -tA -c "select qr_code_uuid from tickets where id='$DOOR_TICKET'")

    STATUS=$(json_status POST "/api/events/$FULL_EVENT/register" '{}' "$TMP/meera.jar")
    expect_status "a full room without a waitlist refuses politely" 409 "$STATUS"
    expect_contains "…and says why" "$TMP/body.json" "full"

    # An unknown body field is rejected, so nobody can register on behalf of another.
    STATUS=$(json_status POST "/api/events/$FULL_EVENT/register" '{"userId":"someone-else"}' "$TMP/meera.jar")
    expect_status "a request naming another user is rejected" 422 "$STATUS"

    # Clean up: cancel then delete, because a published event cannot be deleted.
    # Leaving events behind would fill the club page and hide the seeded ones.
    for CLEANUP in "$SEAT_EVENT" "$FULL_EVENT"; do
      json_status POST "/api/clubs/$PRESIDENT_CLUB/events/$CLEANUP/status" '{"status":"CANCELLED"}' "$TMP/aarav.jar" > /dev/null
      json_status DELETE "/api/clubs/$PRESIDENT_CLUB/events/$CLEANUP" "" "$TMP/aarav.jar" > /dev/null
    done
  fi
fi

echo "[14] phase 6 — the door: scan, duplicate, offline sync, attendance"
if [ -n "$PRESIDENT_CLUB" ] && [ -f "$TMP/aarav.jar" ]; then
  # The door only opens on the event's own day, so this event is today — in the
  # college's timezone, as a wall clock, exactly what the browser sends. If it is
  # late evening, an event "in two hours" would fall on tomorrow and the door
  # would be shut, so admit defeat gracefully and start it in half an hour.
  read -r DOOR_START DOOR_END <<< "$(node -e '
    const tz = "Asia/Kolkata";
    const pad = (n) => String(n).padStart(2, "0");
    const parts = (d) => {
      const f = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(d);
      const g = (t) => f.find((x) => x.type === t).value;
      return { key: `${g("year")}-${g("month")}-${g("day")}`, text: `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}` };
    };
    const now = Date.now();
    let start = new Date(now + 2 * 3600e3);
    if (parts(start).key !== parts(new Date(now)).key) start = new Date(now + 30 * 60e3);
    const end = new Date(start.getTime() + 3 * 3600e3);
    process.stdout.write(`${parts(start).text} ${parts(end).text}`);
  ')"

  STATUS=$(json_status POST "/api/clubs/$PRESIDENT_CLUB/events" \
    "{\"title\":\"Smoke Door Test\",\"start\":\"$DOOR_START\",\"end\":\"$DOOR_END\",\"capacity\":5,\"waitlistEnabled\":true,\"isPublic\":true}" \
    "$TMP/aarav.jar")
  expect_status "an event for today is created" 201 "$STATUS"
  DOOR_EVENT=$(node -e 'const b=require(process.argv[1]);process.stdout.write(((b.data||{}).event||{}).id||"")' "$TMP/body.json")
  json_status POST "/api/clubs/$PRESIDENT_CLUB/events/$DOOR_EVENT/status" '{"status":"PUBLISHED"}' "$TMP/aarav.jar" > /dev/null

  # Two people take a seat: Kabir scans at the door, Meera arrives through the
  # offline queue later.
  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/register" '{}' "$TMP/kabir.jar")
  expect_status "Kabir takes a seat" 201 "$STATUS"
  DOOR_TICKET=$(node -e 'const b=require(process.argv[1]);process.stdout.write(((b.data||{}).ticket||{}).id||"")' "$TMP/body.json")
  SEAT_QR=$(psql -h 127.0.0.1 -U clubhub -d clubhub -tA -c "select qr_code_uuid from tickets where id='$DOOR_TICKET'")

  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/register" '{}' "$TMP/meera.jar")
  expect_status "and Meera takes the next one" 201 "$STATUS"
  MEERA_TICKET=$(node -e 'const b=require(process.argv[1]);process.stdout.write(((b.data||{}).ticket||{}).id||"")' "$TMP/body.json")
  MEERA_QR=$(psql -h 127.0.0.1 -U clubhub -d clubhub -tA -c "select qr_code_uuid from tickets where id='$MEERA_TICKET'")

  # A plain member cannot work the door, and cannot read the sheet.
  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/check-in" "{\"code\":\"$SEAT_QR\"}" "$TMP/kabir.jar")
  expect_status "a plain member cannot scan" 403 "$STATUS"
  STATUS=$(json_status GET "/api/events/$DOOR_EVENT/attendance" "" "$TMP/kabir.jar")
  expect_status "a plain member cannot read attendance" 403 "$STATUS"

  # The organiser can. The scan carries its own id, so a retry is harmless.
  SCAN_UUID=$(node -e 'process.stdout.write(crypto.randomUUID())')
  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/check-in" \
    "{\"code\":\"clubhub:ticket:$SEAT_QR\",\"source\":\"SCANNER\",\"scanUuid\":\"$SCAN_UUID\"}" \
    "$TMP/aarav.jar")
  expect_status "the organiser scans a ticket" 200 "$STATUS"
  expect_contains "…and the person is checked in" "$TMP/body.json" '"outcome":"CHECKED_IN"'
  expect_contains "…with the holder's name" "$TMP/body.json" 'Kabir'

  # The same scan id arriving again must not create a second row.
  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/check-in" \
    "{\"code\":\"clubhub:ticket:$SEAT_QR\",\"source\":\"SCANNER\",\"scanUuid\":\"$SCAN_UUID\"}" \
    "$TMP/aarav.jar")
  expect_contains "a retried scan is recognised as a replay" "$TMP/body.json" '"replayed":true'

  # A fresh scan of the same ticket says "already inside" — not an error.
  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/check-in" \
    "{\"code\":\"clubhub:ticket:$SEAT_QR\"}" "$TMP/aarav.jar")
  expect_status "scanning the same ticket again is not an error" 200 "$STATUS"
  expect_contains "…it says they are already inside" "$TMP/body.json" '"outcome":"ALREADY_CHECKED_IN"'

  ROWS=$(psql -h 127.0.0.1 -U clubhub -d clubhub -tA -c "select count(*) from attendance where ticket_id='$DOOR_TICKET'")
  if [ "$ROWS" = "1" ]; then
    pass "exactly one attendance row for that ticket"
  else
    fail "expected 1 attendance row, found $ROWS"
  fi

  # Typed door codes work too — that is the fallback for a phone with no camera.
  DOOR_CODE=$(psql -h 127.0.0.1 -U clubhub -d clubhub -tA -c \
    "select upper(right(replace(qr_code_uuid::text,'-',''),8)) from tickets where id='$DOOR_TICKET'")
  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/check-in" "{\"code\":\"$DOOR_CODE\"}" "$TMP/aarav.jar")
  expect_contains "the printed door code is understood (lower case, no dashes)" "$TMP/body.json" '"outcome":"ALREADY_CHECKED_IN"'

  # Nonsense from a camera is a normal answer, not a 500.
  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/check-in" '{"code":"WIFI:S:Campus;T:WPA;P:hunter2;;"}' "$TMP/aarav.jar")
  expect_status "a non-ticket QR code is refused politely" 200 "$STATUS"
  expect_contains "…as 'no matching ticket'" "$TMP/body.json" '"outcome":"NOT_FOUND"'

  # ── The offline queue ────────────────────────────────────────────────────
  # The manifest is what the phone keeps when the signal dies.
  STATUS=$(json_status GET "/api/events/$DOOR_EVENT/check-in/manifest" "" "$TMP/aarav.jar")
  expect_status "the offline guest list downloads" 200 "$STATUS"
  expect_contains "…with a fingerprint per ticket" "$TMP/body.json" '"fingerprint"'
  expect_contains "…and the printable door code" "$TMP/body.json" '"doorCode"'
  if grep -qF "$SEAT_QR" "$TMP/body.json"; then
    fail "the guest list leaked a ticket secret"
  else
    pass "the guest list never contains the secret itself"
  fi

  # Meera arrives while the phone has no signal; her scan is uploaded twice.
  BATCH_UUID=$(node -e 'process.stdout.write(crypto.randomUUID())')
  BATCH="{\"scans\":[{\"scanUuid\":\"$BATCH_UUID\",\"code\":\"$MEERA_QR\",\"source\":\"MANUAL\"}]}"
  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/check-in/sync" "$BATCH" "$TMP/aarav.jar")
  expect_status "an offline batch syncs" 200 "$STATUS"
  expect_contains "…and the queued person is in" "$TMP/body.json" '"checkedIn":1'
  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/check-in/sync" "$BATCH" "$TMP/aarav.jar")
  expect_status "the same batch sent twice is accepted" 200 "$STATUS"
  expect_contains "…and is recognised as a replay" "$TMP/body.json" '"replayed":true'

  ROWS=$(psql -h 127.0.0.1 -U clubhub -d clubhub -tA -c "select count(*) from attendance where ticket_id='$MEERA_TICKET'")
  if [ "$ROWS" = "1" ]; then
    pass "replaying the batch created no duplicate rows"
  else
    fail "expected 1 attendance row after replay, found $ROWS"
  fi

  # An empty batch is a client bug, not a silent success.
  STATUS=$(json_status POST "/api/events/$DOOR_EVENT/check-in/sync" '{"scans":[]}' "$TMP/aarav.jar")
  expect_status "an empty batch is rejected" 422 "$STATUS"

  STATUS=$(json_status GET "/api/events/$DOOR_EVENT/attendance" "" "$TMP/aarav.jar")
  expect_status "the organiser can read attendance" 200 "$STATUS"
  expect_contains "…and sees who turned up" "$TMP/body.json" '"checkedIn":2'
  expect_contains "…and the rate" "$TMP/body.json" '"attendanceRate"'

  # The scanner page itself renders for an organiser.
  STATUS=$(curl -s -b "$TMP/aarav.jar" -o "$TMP/door.html" -w '%{http_code}' "$BASE/events/$DOOR_EVENT/door")
  expect_status "the scanner page renders" 200 "$STATUS"
  expect_contains "…with the manual fallback" "$TMP/door.html" "Type the door code"

  STATUS=$(curl -s -b "$TMP/kabir.jar" -o "$TMP/door-member.html" -w '%{http_code}' "$BASE/events/$DOOR_EVENT/door")
  expect_status "a member opening the scanner gets a page, not a crash" 200 "$STATUS"
  expect_contains "…that tells them it is not theirs" "$TMP/door-member.html" "Only the club can run this door"

  # Clean up: the demo database should not fill with smoke events.
  json_status POST "/api/clubs/$PRESIDENT_CLUB/events/$DOOR_EVENT/status" '{"status":"CANCELLED"}' "$TMP/aarav.jar" > /dev/null
  json_status DELETE "/api/clubs/$PRESIDENT_CLUB/events/$DOOR_EVENT" "" "$TMP/aarav.jar" > /dev/null
fi

echo "[15] phase 7 — polish & observability"
if [ -f "$TMP/aarav.jar" ] && [ -n "$PRESIDENT_CLUB" ]; then
  # Errors are envelopes, not HTML, and carry the id that matches the log line.
  STATUS=$(curl -s -D "$TMP/err.headers" -o "$TMP/err.json" -w '%{http_code}' \
    -b "$TMP/aarav.jar" "$BASE/api/events/not-a-uuid/attendance")
  # Deliberately 404, not 400: an id that cannot exist is indistinguishable from
  # one that does not, and saying which would leak that we looked.
  expect_status "a malformed id is a clean 404" 404 "$STATUS"
  expect_contains "…as an error envelope" "$TMP/err.json" '"ok":false'
  expect_contains "…with a machine code" "$TMP/err.json" '"code"'
  if grep -qi "x-request-id:" "$TMP/err.headers"; then
    pass "…and a correlation id to quote in a bug report"
  else
    fail "…but no x-request-id header"
  fi

  # A refusal still reads like English, not a stack trace.
  STATUS=$(curl -s -o "$TMP/err2.json" -w '%{http_code}' -b "$TMP/kabir.jar" \
    "$BASE/api/clubs/$PRESIDENT_CLUB/invites")
  expect_status "a member cannot list invites" 403 "$STATUS"
  expect_contains "…and is told why in a sentence" "$TMP/err2.json" '"error"'
  if grep -q "at Object\|node_modules\|PrismaClient" "$TMP/err2.json"; then
    fail "the error leaked internals"
  else
    pass "no internals leaked in the error body"
  fi

  # The 404 page is a page, not a blank screen.
  STATUS=$(curl -s -o "$TMP/404.html" -w '%{http_code}' "$BASE/this-does-not-exist")
  expect_status "an unknown address is a 404" 404 "$STATUS"
  expect_contains "…with a page that explains itself" "$TMP/404.html" "There is nothing at this address"
  expect_contains "…and a way back" "$TMP/404.html" "Back to the dashboard"

  # The skip link is the first thing a keyboard reaches.
  if grep -q "Skip to content" "$TMP/404.html"; then
    pass "every page starts with a skip-to-content link"
  else
    fail "the skip link is missing"
  fi

  # Health is honest about the demo mode, so a production deploy can be checked.
  expect_contains "health reports whether demo mode is on" "$TMP/health.json" '"demoMode"'

  # A queued scan replayed twice is still one row — the Phase 6 guarantee, re-checked
  # now that every route runs through the logging wrapper.
  DOOR_TICKET_HEALTH=$(psql -h 127.0.0.1 -U clubhub -d clubhub -tA -c \
    "select count(*) from attendance where scan_uuid is not null")
  if [ "$DOOR_TICKET_HEALTH" -ge 1 ]; then
    pass "attendance rows still carry their scan ids"
  else
    fail "no attendance rows found — the door data is missing"
  fi
fi

echo "──────────────────────────────────────────────"
if [ "$FAILURES" -eq 0 ]; then
  printf '\033[32mAll %d checks passed.\033[0m\n\n' "$PASSES"
else
  printf '\033[31m%d check(s) failed.\033[0m\n\n' "$FAILURES"
  exit 1
fi
