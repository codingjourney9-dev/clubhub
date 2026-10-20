# Implementation phases

Each phase is reviewed and approved before the next one starts. Every phase ends with the same
gate — no exceptions:

```bash
npm run lint && npm run typecheck && npm run build
# or: npm run verify
```

---

## Phase 1 — Initialization & Boilerplate ✅ Complete

**Delivered**

- Next.js 15.5 App Router + React 19 + TypeScript with `strict`, `noUncheckedIndexedAccess`.
- Tailwind CSS v4 (CSS-first `@theme`) and shadcn/ui primitives themed via CSS variables;
  Geist font variables correctly mapped onto Tailwind's font utilities.
- Client foundation: TanStack Query provider (mutation retries disabled on purpose — see
  architecture §5.1), `next-themes`, sonner toaster, tooltip provider.
- Request/response contract: `ok()` / `fail()` / `ApiError` / `handleRouteError` / `toFieldErrors`
  in `src/lib/api/response.ts` and shared types in `src/types/api.ts`.
- Lazy, Zod-validated server env contract (`src/lib/env.ts`) — importing it never breaks the build.
- Working liveness endpoint: `GET /api/health`.
- Module skeleton for every later phase (`lib/auth`, `lib/db`, `lib/services`, `lib/validation`,
  `lib/rate-limit`, `lib/qr`, `lib/offline`), documented in `docs/architecture.md`.
- Build-status landing page + site chrome, `README.md`, `.env.example`, `docs/`.
- Vitest wired up (config, disposable test database, `server-only` stub) with the response-envelope
  and timezone suites.

**Acceptance criteria**

| # | Criterion | How it's checked |
| --- | --- | --- |
| 1 | `npm run dev` serves the app | Landing page renders with no console errors |
| 2 | `GET /api/health` returns the envelope | `{ ok: true, data: { status: "ok", … } }` with 200 |
| 3 | Type safety holds | `npm run typecheck` passes |
| 4 | Lint is clean | `npm run lint` passes |
| 5 | Production build succeeds | `npm run build` passes |
| 6 | Env problems are actionable | Removing `DATABASE_URL` from `.env` yields a named-field error, not a stack trace |

---

## Phase 2 — Database & Auth ✅ Complete

**Delivered**

- PostgreSQL 17.11 cluster provisioned locally, controlled by `scripts/db.sh`; data directory lives
  outside the repo so it is never committed.
- Prisma 7 schema for `Tenant`, `User`, `TenantMember`, `Club`, `ClubMember`, `Event`, `Ticket`,
  `Attendance`: composite `(id, tenant_id)` foreign keys, `deleted_at` soft deletes, UTC
  `timestamptz`, and the indexes the UI will query on. Migration
  `20261014131604_init_tenancy_and_ticketing` applied.
- Idempotent seed (`prisma/seed.ts`, fixed UUIDs): 1 tenant, 2 clubs, 4 users, 6 club memberships,
  3 events — one account is deliberately President in one club and a plain Member in another.
- Auth.js v5 credentials provider (bcrypt, 12 rounds) with identity-only JWT sessions, typed session
  augmentation, and an edge-safe split config so middleware never bundles Prisma.
- `POST /api/auth/register`: Zod-validated, `409` on duplicates (unique index is the authority),
  per-IP rate limiting (5 per 15 minutes, `429` + `Retry-After`).
- `src/middleware.ts` gates `/dashboard`, `/scanner`, `/onboarding`; `/api/health` now reports
  database readiness and returns `503` when Postgres is unreachable.
- Sign-in / sign-up UI (React Hook Form + Zod + toasts), auth-aware header, and a dashboard that
  renders the caller's tenant and club roles plus upcoming events in the tenant timezone.

**Acceptance criteria — verified**

| # | Criterion | Result |
| --- | --- | --- |
| 1 | Migrations apply from scratch | ✅ `prisma migrate deploy` on a fresh database |
| 2 | Seed runs and is safely re-runnable | ✅ fixed UUIDs + upserts |
| 3 | Sign-in works; sign-out works | ✅ 302 + session cookie; a wrong password creates no session |
| 4 | Signed-out hits on protected routes redirect | ✅ → `/sign-in?callbackUrl=…` |
| 5 | `/api/health` reports the database | ✅ `"status":"up"` with latency; `503` when down |
| 6 | Server-side validation is authoritative | ✅ `422` + named field errors on a malformed body |
| 7 | Registration rate limiting | ✅ `429` + `Retry-After` once the bucket empties |
| 8 | Roles are per club, from one session | ✅ President in club A, Member in club B |
| 9 | Gate | ✅ lint + typecheck + test + build |
| 10 | Smoke test | ✅ `npm run test:smoke` → 25/25 checks |
| 11 | Automated test suite | ✅ `npm run test` → 51/51 (6 files) |

**What the automated suite actually proves**

| Suite | Claim under test |
| --- | --- |
| `tests/integration/tenancy.test.ts` (12) | An event whose `tenant_id` disagrees with its club's tenant is **rejected by Postgres** (`P2003`), same for tickets and attendance; one ticket per user per event (`P2002`); QR secrets are globally unique; a ticket can be checked in once; replayed `scanUuid`s collapse; a club with events cannot be hard-deleted; attendance survives a soft-deleted event; scoped reads return only the requested tenant's rows |
| `tests/integration/seed.test.ts` (5) | The seed produces the documented fixture, every demo account has a real bcrypt hash, one user genuinely holds `PRESIDENT` in one club and `MEMBER` in another, and re-running it creates no duplicates |
| `tests/unit/validation.test.ts` (12) | Email normalisation, the bcrypt 72-byte ceiling, and that `registerSchema` rejects unknown fields (mass-assignment guard) |
| `tests/unit/api-response.test.ts` (11) | Every error code maps to its documented status; 500s never leak internals (asserted against a thrown `postgres://` string) |
| `tests/unit/rate-limit.test.ts` (6) | Burst allowance, per-key isolation, refill, and the cap after idling |
| `tests/unit/format-date.test.ts` (5) | UTC storage renders correctly per zone, including DST boundaries (Europe/London BST vs GMT) and venue-day grouping |

**Bug found by the new tests (fixed):** `z.email().max(254).trim().toLowerCase()` validated the
*raw* string first, so `"  Aarav@VIT.ac.in "` — a routine copy-paste — was rejected as invalid.
The schema now pipes: `z.string().trim().toLowerCase().pipe(z.email().max(254))`, which also restores
the custom error message. Regression covered in `tests/unit/validation.test.ts`.

---

## Phase 3 — Tenant & Club Scaffolding ✅ Complete

Built on the proposed defaults: **invite links** (no email provider needed), **self-serve college
creation** (the creator becomes Owner), and **club slugs unique per college**.

- **Onboarding** (`/onboarding`): create a college (name, email domain, timezone, brand colour) or
  see the colleges and clubs you belong to. Club creation lives here for Owners/Admins.
- **Club workspace** (`/clubs/[clubId]`): roster with roles, invite links, upcoming events. One page,
  three different experiences depending on who opens it.
- **Join page** (`/join/[token]`): a safe public preview ("You have been invited to X as Y"), then
  redemption once signed in.
- **RBAC as data** (`src/lib/auth/rbac.ts`): the whole permission matrix in one place, with
  anti-escalation rules — you may only hand out roles you could hold yourself.
- **Guards** (`src/lib/auth/guards.ts`): `requireTenantAccess` / `requireClubAccess`. A caller with no
  membership in the college gets **404, never 403**, so probing another college's ids reveals nothing.
- **19 API handlers** under `/api/tenants`, `/api/clubs`, `/api/invites` — every one behind a guard,
  a Zod schema and the shared route error handler.

**Invite semantics:** the token (32 random bytes, base64url) is the only thing that appears in a link;
the role comes from the invite record, never the request; `maxUses` is enforced under
`SELECT … FOR UPDATE`, so a one-use link cannot be redeemed twice at the same moment; redemption also
joins the college as a plain member, because every read is tenant-scoped; unsubscribing/removal is
soft (`deletedAt`), so history survives.

**Tests added (91 → 142 total):**

| File | Cases |
| --- | --- |
| `tests/unit/rbac.test.ts` (13) | Every role × action pair, the college-admin override, `club:delete` deferring to the tenant matrix, and the anti-escalation rules |
| `tests/unit/slug.test.ts` (9) | Slug generation, accent stripping, collision suffixes and the unguessable 43-character invite token |
| `tests/integration/guards.test.ts` (11) | 404-vs-403 for tenants and clubs, soft-deleted memberships/clubs/colleges, and the college-admin override |
| `tests/integration/invites.test.ts` (19) | Creation rights, previews, **concurrent redemption of a one-use link**, double-clicks, expiry, revocation, email-restricted links, membership revival, and the college join |
| `tests/integration/clubs.test.ts` (18) | Founder becomes President, per-college slugs, tenant isolation, the **last-President** rule, and the refusal to delete a club with published events |
| `tests/integration/tenants.test.ts` (8) | Self-serve creation, domain conflicts, branding merges and tenant-scoped listing |

Smoke test grew to 12 sections / 82 checks, including the full invite lifecycle over real HTTP
(create → preview → join page → register → redeem → double-click → `used_up`).

**Reviewing inside the chat frame.** A signed-in session needs a cookie, and an embedded preview
frame is not allowed to store one — so the club pages were previously invisible in the chat. They now
have a cookie-free twin at `/demo/clubs/[clubId]` that renders the same club, the same roster and the
same permission decisions for a chosen seeded viewer, with the write buttons left out. It also shows,
for each capability, *why* a role does or does not have it. The sample data plants one deliberately
public invite link (`DEMO_INVITE_TOKEN`, MEMBER of the seeded Robotics Club) so the joining page can
be reviewed too; the smoke test now asserts that **no other invite token ever appears** in the demo
output.

**Bugs the new tests found (all fixed):**

1. A duplicate college *domain* reported "that college name is already taken" — the P2002 target was
   not inspected properly. The domain is now checked up front and named exactly.
2. A club invite granted club membership **without** college membership, so the newcomer would have
   signed in to an empty app. Redeeming a club link now also joins the college as a plain member
   (an existing OWNER/ADMIN role is never downgraded).
3. Clicking an already-used one-use link reported "this link has already been used" to the person who
   had just used it. Membership is now checked before the link's own state, so the second click
   succeeds and reports the membership instead.
4. Opening a club you cannot see returned a **500 crash** instead of the 404 page, because a thrown
   guard error is a page-level crash. `/clubs/[clubId]` now translates guard outcomes into a redirect
   to sign-in (signed out), a 404 page (not visible) or an explanatory "not in this club yet" screen
   (in the college, not in the club).

**Also found this phase (environment, not product):** the hosted machine has ~2 GB of RAM, and a
hot-reloading dev server compiling pages on demand grows past it and gets killed mid-request — which
looks like the preview silently dying. `npm run app:up` therefore serves the preview from a
production build now (roughly a fifth of the memory, pages in milliseconds); `APP_MODE=dev npm run
app:up` still starts the hot-reloading dev server when editing code.

**Acceptance criteria met:** a user is President in one club and Member in another and sees exactly
the right actions in each; cross-college access returns 404 rather than 403; every endpoint validates
with Zod server-side and passes a guard; invite links are single-use under concurrency; the last
President cannot be removed; the verify gate passes (lint, types, 142 tests, production build).

---

## Phase 4 — Event Management CRUD ✅ Complete

- **Event lifecycle** on the club page: create, edit, publish, cancel, delete. A new event is always a
  **Draft**, because publishing is an announcement and deserves its own, deliberate action.
  Status only moves Draft → Published → Cancelled; a cancelled event stays visible (so nobody turns
  up) and keeps its tickets and attendance rows for reporting.
- **Times without ambiguity.** The browser sends a *wall clock* reading (`2026-11-01T09:00`) from a
  `datetime-local` input. The server resolves it in the **college's** timezone and stores a UTC
  instant; every screen renders it back in the college's zone with its offset (`GMT+5:30`).
- **Members-only events** (`isPublic: false`) answer **404** to anyone outside the club — not 403 —
  so their existence cannot be probed. Drafts are invisible to plain members as well.
- **Capacity and waitlist** are validated together: a waitlist without a capacity is refused, and a
  capacity cannot be lowered below the number of people already holding places.
- **Delete is not the same as cancel.** A published event cannot be deleted until it is cancelled, so
  a student's ticket never points at something that silently vanished.

**Timezone engine** (`src/lib/format/date.ts`): `wallClockToUtc`, `utcToWallClock`, `parseWallClock`.
It asks `Intl` for the offset *at the instant in question*, which is what makes daylight saving
correct: the same 09:00 is `03:30Z` in India, `08:00Z` in a London July and `09:00Z` in a London
December. Two edge cases are handled explicitly:

- an hour that **never happens** (the spring-forward gap, 01:30 in London on 29 March 2026) is
  rejected with a field error instead of being silently shifted;
- an hour that happens **twice** (the autumn fall-back) resolves to the *earlier* occurrence, which is
  what "01:30" normally means to whoever typed it.

**Tests added (142 → 187):**

| File | Cases |
| --- | --- |
| `tests/unit/wall-clock.test.ts` (18) | Fixed-offset zones, both directions of a DST change in London and New York, the non-existent hour, the repeated hour, midnight (the classic `24:00` bug), malformed input, and six round trips |
| `tests/integration/events.test.ts` (27) | UTC storage from a wall clock, drafts hidden from members, members-only 404s, publish/cancel/delete transitions, capacity-below-registrations, waitlist-without-capacity, and cross-college isolation |

Smoke test grew to 12 sections / 107 checks, driving the whole lifecycle over HTTP: create → publish
→ publish again → refuse delete → cancel → delete → confirm it is gone.

**Bug found by the new tests (fixed):** filtering drafts out of a listing was implemented as
`status: "PUBLISHED"`, which also hid **cancelled** events — the one case where visibility matters
most, because people need to see that an event is off. The filter now keeps `PUBLISHED` and
`CANCELLED` together and excludes only `DRAFT`.

**Acceptance criteria met:** an end time before the start time is rejected server-side with an error
attached to the `end` field; a members-only event 404s for non-members; a soft-deleted event
disappears from listings while its attendance rows survive; the verify gate passes (lint, types, 187
tests, production build).

---

## Phase 5 — Ticketing & Concurrency ✅ Complete

- **Taking a seat.** `POST /api/events/:eventId/register` → `REGISTERED`, `WAITLISTED`, or a 409 when
  the room is full and nobody opened a queue. Registration closes when the event **starts**, not when
  it ends.
- **The race.** Every write that can change the number of seats held takes a Postgres row lock first:
  `SELECT … FROM events WHERE id = $1 FOR UPDATE`, then counts, then writes. Requests for the same
  event queue on that lock; different events never block each other.
- **The database has its own opinion.** `UNIQUE (event_id, user_id)` makes a second ticket for one
  person on one event impossible even if this code were wrong.
- **Waitlist.** FIFO by an ever-increasing `waitlistPosition`. Cancelling a seat promotes the person
  at the front **inside the same transaction**, so two people cancelling at once cannot promote the
  same waiter twice. Leaving the queue promotes nobody. Raising an event's capacity promotes as many
  people as the new seats allow.
- **QR tickets.** Each ticket carries a `qrCodeUuid` secret, separate from its id, encoded as
  `clubhub:ticket:<uuid>` and rendered **server-side** into a data-URI PNG (`qrcode`). A waitlisted
  person gets no QR code — a queue place is not a seat. Re-registering after a cancellation **rotates
  the secret**, so a screenshot of the old ticket stops working.
- **Pages:** `/events` (what is on), `/events/[eventId]` (register / join queue / cancel, plus the
  organiser's guest list), `/tickets` (wallet) and `/tickets/[ticketId]` (the QR itself).
- **Rate limiting** per **user id**, not per IP — a campus lab shares one address. `429` carries
  `Retry-After`.

**Route surface**

| Route | Who | What |
| --- | --- | --- |
| `POST /api/events/:eventId/register` | any tenant member who can see the event | claim a seat / join the queue |
| `DELETE /api/tickets/:ticketId` | the owner, or an organiser (`ticket:manage`) | give the seat back |
| `GET /api/events/:eventId/tickets` | President / Event Manager | the guest list, without any QR secrets |
| `GET /api/tickets` | the signed-in user | their own tickets, across colleges |

**The concurrency proof.** `tests/integration/tickets.test.ts` fires 20 simultaneous RSVPs at a
5-seat room and asserts exactly 5 `REGISTERED`, 15 `WAITLISTED`, 20 rows. The test was then run
against a version of the service **with the `FOR UPDATE` line removed**: it sold **10 seats in a
5-seat room** and failed loudly. With the lock restored it passes. (Also covered: 15 concurrent
requests against 3 seats with no waitlist → 3 successes, 12 clean 409s; one person tapping five times
at once → exactly one ticket.)

**Tests added (187 → 231):**

| File | Cases |
| --- | --- |
| `tests/unit/ticket-rules.test.ts` (15) | seat decisions at the exact boundary, unlimited capacity, overbooked rooms, position numbering that never reuses a number, queue ranks with gaps, and the registration window |
| `tests/unit/ticket-qr.test.ts` (5) | payload round trip, case/whitespace normalisation, and rejection of foreign QR codes |
| `tests/integration/tickets.test.ts` (23) | the whole lifecycle, both concurrency stampedes, promotion on cancel and on capacity increase, 404 for someone else's ticket, tenant scoping, and QR rotation on re-registration |
| `tests/integration/seed.test.ts` (+1) | the demo really contains a full room with a queue behind it |

Smoke test grew to **13 sections / 130 checks**; section `[13]` drives a one-seat event over HTTP:
claim → queue → double tap → guest-list 403 → QR page 200 → somebody else's ticket 404 → cancel →
promotion to Meera → empty queue → full room without waitlist → 409 → unknown body field → 422.

**Bug found by the new tests (fixed):** `registeredCount` was `_count.tickets`, which counts
**cancelled** tickets too. Harmless while nobody could cancel; the first cancellation would have shown
"7 / 6". Counts are now grouped by status, and the events list carries `registeredCount` and
`waitlistedCount` separately.

**Acceptance criteria met:** the concurrency test passes repeatedly (and provably fails without the
lock); duplicate RSVPs hit `UNIQUE(event_id, user_id)` and return the existing ticket; QR payloads
round-trip and reject foreign codes; verify gate passes (lint, types, 231 tests, production build).

---

## Phase 6 — Scanner & Edge Cases — Complete

**Goal.** Let an organiser run a door on a bad phone on bad campus Wi-Fi, and lose nothing.

**What was built**

- A mobile-first scanner page at `/door` (every event you may scan) and `/events/:eventId/door`.
  Camera via `qr-scanner` (worker copied to `public/`), plus a **typed door code** fallback for the
  very common case of a phone with no camera permission, a cracked lens, or a preview that is not a
  real browser session.
- **Door codes.** Every ticket gets a short, human-readable code: the last 8 hex characters of its
  QR secret, upper-cased and grouped (`4F1A 9C02`). Printed on the ticket page under the QR. It is
  derived, not stored, so no new column and no migration.
- **Offline queue.** Accepted scans are appended to a `localStorage` queue tagged with a
  client-generated `scanUuid`; a background flusher batches them to
  `POST /api/events/:eventId/check-in/sync` (1–200 scans per request) and removes only the ones the
  server acknowledged. Pending / rejected counts are always visible on screen.
- **Offline verification.** The door downloads a manifest (`GET …/check-in/manifest`) when the
  network is healthy and keeps it in local storage. Each row carries a **SHA-256 fingerprint** of the
  ticket secret and the printable door code — *never* the secret itself. With no connection, a scan
  is hashed in the browser (`crypto.subtle`, no `node:crypto` in the bundle) and matched against the
  cached fingerprint, so an offline verdict is a real verification, not a substring guess.
- **Server-side validation of every scan.** One `decideCheckIn` function, used by the API, the
  attendance page and the read-only demo, answers in a fixed order:
  `EVENT_CANCELLED → CANCELLED_TICKET → WAITLISTED → ALREADY_CHECKED_IN → CHECKED_IN`, with
  `NOT_FOUND` for a code that belongs to another event or to nobody.
- **Check-in window.** Local midnight on the event's own day through `max(end of that local day,
  endTime + 3 h)`. A 19:00–22:00 IST event opens at midnight IST and closes at 01:00 IST; the
  next day is computed with calendar arithmetic, not by adding 24 hours to an instant.
- Attendance report at `/events/:eventId/attendance` with registered / waitlisted / checked-in counts
  and turn-up rate.

**The idempotency trick.** `Attendance.scanUuid` is `UNIQUE`. A retried request, a queue that flushes
twice, or a browser that loses the response all collide on that column instead of inserting a second
row. `POST /check-in` with a known `scanUuid` returns the original verdict with `"replayed": true`;
the unique `ticketId` is a second wall behind it (P2002 → `ALREADY_CHECKED_IN`, never a 500).

**Route surface**

| Route | Who | What |
| --- | --- | --- |
| `POST /api/events/:eventId/check-in` | Event Manager+ (`attendance:scan`) | scan one ticket |
| `POST /api/events/:eventId/check-in/sync` | Event Manager+ | sync a queued batch (1–200) |
| `GET /api/events/:eventId/check-in/manifest` | Event Manager+ | the offline guest list (fingerprints + door codes, no secrets) |
| `GET /api/events/:eventId/attendance` | Event Manager+ (`attendance:report`) | counts and the full sheet |

**The offline test.** `tests/integration/check-in.test.ts` simulates the whole thing at the service
layer: the same three queued scans are sent twice, and the attendance table must still hold exactly
**3** rows — then the individual `scanUuid`s are verified to be the originals. `scannedAt` is preserved
from the phone, so the attendance sheet shows when people actually walked in, not when the Wi-Fi came
back. Section `[14]` of the smoke test does the same over HTTP: scan → replay → duplicate → garbage QR
→ manifest leaks nothing → batch → batch again → still one row per ticket.

**Tests added (231 → 272):**

| File | Cases |
| --- | --- |
| `tests/unit/check-in-rules.test.ts` (20) | window edges in IST and London, the grace period crossing midnight, verdict ordering, door-code derivation, both fingerprint implementations agreeing |
| `tests/integration/check-in.test.ts` (20) | scan, double scan, replay by `scanUuid`, cancelled event, cancelled ticket, waitlisted ticket, foreign tenant, offline batch of 3 synced twice, manifest never leaks a secret, attendance counts |
| `tests/integration/seed.test.ts` (+1, updated) | the seeded open house is mid-event with some already inside and some still to scan; 5 events / 12 tickets / 5 attendance rows |

Smoke test is now **14 sections / 162 checks** (up from 13 / 130).

**Bugs found by the new tests (fixed):**

1. `checkInWindow` computed "the next local day" as `start + 36 h`, which lands on the wrong date for
   early-morning events. Replaced with calendar arithmetic on the day key.
2. The first version of offline verification matched a *substring* of the fingerprint — that is not
   verification. It now hashes the scanned secret with `crypto.subtle` and compares the full digest.

**Acceptance criteria met:** offline scans sync without duplicates (proved by replaying the same
batch twice); a double scan returns `ALREADY_CHECKED_IN` with HTTP 200, not an error; verify gate
passes (lint, types, 272 tests, production build, 162/162 smoke).

---

## Phase 7 — Polish & Observability — Complete

**Goal.** The difference between "it works" and "it can be handed to a volunteer".

### 1. Every failure says something a person can act on

`src/lib/api/client.ts` is now the only way a screen talks to the API. It fixes three silent
failures that every component used to have:

| Before | After |
| --- | --- |
| `fetch` rejected with no `catch` → the button quietly stopped spinning | `{ code: "NETWORK_ERROR", message: "You appear to be offline…" }` |
| A proxy error returned HTML → `response.json()` threw a syntax error | `{ code: "INTERNAL_ERROR", message: "The server sent an unexpected reply…" }` |
| A hung request span forever | a 20 s abort → `{ code: "TIMEOUT", … }` |

It also carries the server's `x-request-id` through to the toast, so a screenshot of an error is
enough to find the exact log line. `fieldErrorsOf()` lifts a 422's per-field messages onto the right
inputs, and every call site in the app (register, cancel, create/edit event, publish, delete, create
club, invite, revoke, change role, remove member, create college, sign up, accept invite) now uses
it.

### 2. Optimistic updates with rollback

`src/lib/ui/optimistic.ts` — 9 unit tests. Publishing or cancelling an event flips the badge the
moment you press the button, then either the refresh confirms it or the claim is taken back and the
row snaps to the truth. The subtle part is *when* a claim stops being a claim: `settlePatches()`
drops it only when the server's own data agrees, so a claim cannot outlive its request, and a claim
that the server later contradicts (somebody else cancelled the event) cannot stick.

### 3. Empty states, skeletons and an error boundary

- `EmptyState` — events, tickets; each explains what would fill the space and offers the next step.
- `PageSkeleton` — shape-matching placeholders wired as `loading.tsx`.
- `app/error.tsx` — a page that throws renders "That page did not load", the `digest`, a retry and a
  way back; `app/global-error.tsx` covers a failure in the root layout itself.
- `app/not-found.tsx` — one page for "wrong address" and "not yours", deliberately identical.

**A trap worth recording:** a `loading.tsx` makes its whole subtree stream, and once the shell is on
the wire the HTTP status is already sent. A `notFound()` below it then renders the right page with
**200**, and a `redirect()` turns into a client-side hop. This was caught by the smoke test (pages
that had answered 404 started answering 200) and fixed by keeping `loading.tsx` only where nothing
below it can 404 or redirect — the dashboard and `/door`, which is now also protected by middleware
so its redirect keeps its 307.

### 4. Responsive and keyboard pass

- `npm run test:layout` drives headless Chromium over seven routes at **360, 390, 768, 1024 and 1440
  px** and asserts, per width: no horizontal overflow, every image has `alt`, every button and link
  has an accessible name, every form control has a label, exactly one `<h1>`. **100 checks.**
  (The overflow detector was itself verified by injecting a 2000 px element and watching it fail.)
- A skip-to-content link is the first thing the keyboard reaches; `#main-content` is focusable; a
  global `:focus-visible` ring covers links, buttons, inputs, selects, textareas and summaries.
- `overflow-wrap: break-word` on `body` kills the classic "one long email address widens the page"
  bug; the sign-up name fields stack below `sm`.

### 5. Structured logging with tenant/user context

- `src/lib/observability/context.ts` — an `AsyncLocalStorage` "backpack" per request. Guards drop
  the user id (in `requireUser`) and the tenant + role (in `requireClubAccess`/`requireEventAccess`/
  `requireTenantAccess`); the wrapper reads them when the response is done.
- `src/lib/observability/logger.ts` — one JSON line per API request:
  `{"event":"api.request","requestId":…,"method":"POST","path":…,"status":201,"durationMs":12,
  "userId":…,"tenantId":…,"actorRole":"PRESIDENT"}`. 4xx logs at `warn`, 5xx at `error`;
  `LOG_LEVEL` filters; tests default to quiet.
- **`redactPath`** hides invite tokens (a token in a URL *is* a credential) while keeping UUIDs.
  Email addresses are never logged — ids and roles only.
- `withApiRoute` wraps **all 23 route files** (everything except the NextAuth catch-all): it mints or
  accepts `x-request-id`, opens the context, times the handler, writes the line and echoes the id
  back in the response header.

### 6. Health that means something

`/api/health` now separates *liveness* from *readiness*: `ready` is true only when Postgres answers
**and** `_prisma_migrations` says a migration has been applied; the payload carries `version`,
`phase`, `checks.database.latencyMs`, `checks.migrations.applied` + `latest`, and whether demo mode
is on. A deploy that forgot `prisma migrate deploy` now shows `degraded` with a 503 instead of
serving 500s while looking healthy.

**Tests added (272 → 299):**

| File | Cases |
| --- | --- |
| `tests/unit/api-client.test.ts` (9) | success, JSON body, dead network, HTML reply, error envelope, 422 field errors, junk details, timeout, friendly titles |
| `tests/unit/logger.test.ts` (9) | path redaction, single-line JSON, `LOG_LEVEL`, context inheritance, "no request" safety, one line per request with tenant/user, level by status |
| `tests/unit/optimistic.test.ts` (9) | claim, immutability, rollback, optimistic delete, settle on agreement, no-op identity |

Smoke is now **15 sections / 178 checks**, including: correlation id on every response, an error body
that never leaks `node_modules`/stack frames, the 404 page explaining itself, the skip link, and
health reporting demo mode. Layout check adds **100** browser assertions.

**Acceptance criteria met:** no layout breakage from 360 px to 1440 px (100 browser checks across
7 routes × 5 widths); every API error surfaces a human-readable sentence (single client bridge, with
the network/HTML/timeout cases covered by tests); verify gate passes (lint, types, 299 tests,
production build).

---

## Deployment readiness (post-Phase 7)

Not a phase — the work needed to make the seven phases deployable, requested after Phase 7.

- **`Dockerfile`** (three stages: deps → builder → runner), `.dockerignore`, `docker-compose.yml`
  with `db` → `migrate` → `app` ordering. Standalone output is opt-in via `BUILD_STANDALONE=1` so the
  sandbox preview keeps using `next start`.
- **`scripts/deploy-check.sh`** (`npm run deploy:check`) — 14–15 pre/post-flight assertions: runtime,
  env, production safety, migration state, and the running service.
- **`docs/DEPLOY.md`** — three targets (Compose, Vercel, plain systemd), env table, first deploy,
  every-deploy order, backups, rollback, and an explicit list of what was and was not verified.

**Two real bugs found while writing it:**

1. `RATE_LIMIT_DRIVER=redis` was advertised in `.env.example` and accepted by the env schema, but no
   Redis driver exists. Setting it did nothing, so an operator could believe rate limits were shared
   across instances while each process kept its own — a silent under-limit on any scaled deploy. The
   app now **refuses to boot** with a message naming the missing implementation (`rate-limit/driver.ts`,
   6 tests). The whitespace case (`"memory "` in a `.env`) was caught by the tests and fixed.
2. `next build` copies a project-root `.env` into `.next/standalone/`, which would have baked secrets
   into the image. `.dockerignore` excludes it and the Dockerfile deletes it after copying.

**Also added:** `DIRECT_DATABASE_URL`, preferred by `prisma7.config.ts` so migrations take advisory
locks against a real connection instead of a transaction-mode pooler — the usual cause of
"migrations work locally, fail in CI" with Prisma 7.

**Verified here:** migrations against a genuinely empty database; registration over HTTP on that fresh
database; `/demo` returning 404 in production with `DEMO_MODE=off`; the standalone build serving the
hashed CSS; the deploy check passing and failing on each of the three dangerous misconfigurations.
**Not verified here:** no Docker daemon, so the image was not built and Compose was not run end to end.

---

## Phase 8 — Front door & guest browsing — Built, awaiting review

From the club-platform blueprint (Phases 8–13). Decisions agreed before building: keep the current
stack; guests see **one combined feed from every college**; professor verification will show the code
on screen while practising (Phase 12); posters are pasted links (Phase 9); a club's college is matched
by **email domain** (Phase 12); Leads accept Member applicants, only the President accepts Lead
applicants (Phase 11).

- **`/dashboard` is open to guests.** Removed from `PROTECTED_PREFIXES` and the middleware matcher. With
  no session the page renders the guest board (`GuestDashboard`); signed in, the member overview gains a
  "Happening across campuses" section. `/onboarding`, `/door`, `/scanner` stay gated.
- **One public-visibility rule** — `src/lib/services/public-event-service.ts`: published (or cancelled,
  for direct links) **and** `isPublic` **and** not deleted **and** its club and college not deleted.
  Selects only internet-safe fields; malformed ids return `null`, not a database error.
- **Public event pages.** `/events/[id]` falls back to `PublicEventView` for guests (401) and for
  signed-in people from another college (404) when the event is public; otherwise behaviour is
  unchanged (sign in, or 404). Guests get "Sign in to get a ticket"; outsiders are told which college
  the tickets are for.
- **"Start a new club" interceptor.** `StartClubButton`: a link when signed in; for guests a dialog
  offering sign-in / sign-up that both return to `/onboarding`. Floating on both dashboards.
- **Safe return paths.** `safeCallbackUrl` accepts only same-site paths (rejects `//host`, `/\host`,
  control characters, absolute URLs and the auth pages themselves); used by the sign-in and sign-up
  pages and forms, which previously followed `callbackUrl` blindly (an open redirect). `signInReason`
  tells the visitor why they were sent to sign in.
- **Wording.** The event switch "Open to the whole college" became **"Open to everyone"**, because
  public events are now visible on the open internet. Badges changed to match.
- **Landing.** Centre-stage **Explore events as a guest**; guests get an **Explore events** link in the
  header.

**Gate:** typecheck ✅ lint ✅ build ✅ vitest 351/351 ✅ smoke 190/190 ✅ (12 new guest checks) ·
browser-checked: landing, guest board, interceptor dialog → sign-in with reason → back to
`/onboarding`, signed-in dashboard, public event page at 390 px in dark mode.

---

## Progress log

| Date | Phase | Result |
| --- | --- | --- |
| 2026-10-14 | 1 — Initialization & Boilerplate | Complete. Next 15.5.27 + React 19 + Tailwind v4 + shadcn (`@base-ui/react`), strict TS, response envelope, env contract, `/api/health`, landing page, docs. Gate: lint ✅ typecheck ✅ build ✅ |
| 2026-10-14 | 2 — Database & Auth | Complete. Postgres 17 + Prisma 7 (driver adapter, composite tenant FKs), migration + idempotent seed, Auth.js v5 credentials/JWT, register API with rate limiting, middleware gate, dashboard reading tenant/club roles in zone-correct time. Gate: lint ✅ typecheck ✅ build ✅ smoke 25/25 ✅ |
| 2026-10-15 | 3 — Tenant & Club Scaffolding | Complete. Colleges, clubs, RBAC matrix, invite links, cookie-free `/demo` preview. Gate: lint ✅ typecheck ✅ build ✅ 142 tests ✅ smoke 82/82 ✅ |
| 2026-10-17 | 4 — Event Management CRUD | Complete. Event lifecycle with UTC storage and college-time rendering, DST gap/repeat handling, members-only 404s. Gate: lint ✅ typecheck ✅ build ✅ 187 tests ✅ smoke 107/107 ✅ |
| 2026-10-17 | 5 — Ticketing & Concurrency | Complete. Row-locked registration (proved by a test that fails without the lock), FIFO waitlist with automatic promotion, server-rendered QR tickets, per-user rate limiting. Gate: lint ✅ typecheck ✅ build ✅ 231 tests ✅ smoke 130/130 ✅ |
| 2026-10-17 | 6 — Scanner & Edge Cases | Complete. Mobile-first scanner with typed door-code fallback, offline queue with idempotent `scanUuid`, browser-side fingerprint verification against a cached manifest, single `decideCheckIn` verdict used by API and UI, attendance report. Gate: lint ✅ typecheck ✅ build ✅ 272 tests ✅ smoke 162/162 ✅ |
| 2026-10-17 | 7 — Polish & Observability | Complete. One client bridge so every failure is a sentence, optimistic updates with rollback, empty states + skeletons + error boundaries, 100 browser-verified layout checks at 360–1440 px, structured request logs with user/tenant context on all 23 routes, readiness-aware `/api/health`. Gate: lint ✅ typecheck ✅ build ✅ 299 tests ✅ smoke 178/178 ✅ layout 100/100 ✅ |
| 2026-10-17 | Deploy readiness | Complete. Multi-stage Dockerfile + Compose (db → migrate → app), `npm run deploy:check` (14 checks), `docs/DEPLOY.md` for Compose/Vercel/systemd. Fixed a silent rate-limit driver lie and a `.env`-in-image leak. Gate: lint ✅ typecheck ✅ build ✅ 305 tests ✅ smoke 178/178 ✅ |
| 2026-10-20 | 8 — Front door & guest browsing | Built, awaiting review. Guest `/dashboard` with public events from every college, public event pages, "Start a new club" sign-in interceptor, `safeCallbackUrl` open-redirect fix. Gate: lint ✅ typecheck ✅ build ✅ 351 tests ✅ smoke 190/190 ✅ |

---

## Operational notes

### One command to bring the app back

```bash
npm run app:up     # deps (if missing) → Postgres → dev server on 0.0.0.0:3000
```

Sandbox snapshots persist source code, git history and the Postgres **data directory** — but they
exclude `node_modules`, installed apt packages, `.next`, and **empty directories**. `npm run app:up`
checks all of that and repairs what is missing in one step.

If you prefer the manual version (same three things):

```bash
npm install        # restores deps; postinstall re-runs `prisma generate`
npm run db:start   # reinstalls Postgres binaries if needed, repairs the data dir, starts the server
npm run dev        # start the app
```

`scripts/db.sh start` self-heals the three things a restore breaks:

1. **Missing binaries** — apt packages are not persisted, so it reinstalls `postgresql` on demand.
2. **Missing empty directories** — Postgres needs `pg_notify`, `pg_stat_tmp` etc., and archives drop
   empty dirs; it recreates them (this was the "could not open directory pg_notify" failure).
3. **Widened data-directory permissions** — Postgres refuses anything looser than `0750`; the
   directory is normalised to `0700`.

It also clears a stale `postmaster.pid` left behind when a session ends without stopping Postgres.

If the cluster is ever unrecoverable, schema and data are reproducible in seconds:

```bash
npm run db:reset                 # drop + recreate the database
npx prisma migrate deploy        # replay migrations
npm run db:seed                  # re-seed demo data
```

### Why a "hung" sign-in happens, and how the UI now handles it

Auth.js's client `signIn()` makes **three sequential requests** — `GET /api/auth/providers`,
`GET /api/auth/csrf`, then `POST /api/auth/callback/credentials` — and none of them have a timeout of
their own. If the server dies *while* one of those is in flight (which is exactly what a sandbox
restart does), the promise never settles and the button spins forever with no explanation.

`src/components/features/auth/sign-in-form.tsx` now bounds every call:

| Guard | Behaviour |
| --- | --- |
| Preflight `GET /api/health` (4 s) | Catches a dead server immediately and says so, with the command to start it |
| `signIn()` raced against a 12 s deadline | Turns a hung request into "the server never replied — try again" |
| `try/catch` around the whole flow | Network failures show an actionable message instead of a silent unhandled rejection |

Nothing is submitted when the preflight fails, so a stalled click can never create a half-finished
sign-in.

### Development gotchas

- `next dev` and `next build` share `.next`: stop the dev server before `npm run verify`, or restart
  it afterwards (a production build while dev is live kills the dev process).
- `npm run test` (and therefore `npm run verify`) needs **Postgres running** — the integration tests
  create a real `clubhub_test` database. If it is down, the suite now prints
  `Start it with: npm run db:start` instead of a wall of `ECONNREFUSED` noise.
- `npm run test:smoke` requires a running dev server and derives a fresh rate-limit bucket per run
  via a random `X-Forwarded-For`, so it is safely repeatable.
- The in-app preview renders inside a sandboxed iframe, which can block session cookies. Open the
  preview URL in a normal browser tab to exercise sign-in.
