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

## Phase 4 — Event Management CRUD (next)

- Dashboard: upcoming events, registration counts, capacity fill, attendance rate.
- Event create/edit form (React Hook Form + Zod): title, description, start/end, location, capacity,
  waitlist toggle, `is_public`, status transitions Draft → Published → Cancelled.
- Listings: public event page per tenant vs. member-only events; soft-delete with `deleted_at`.
- Timezone handling: naive input interpreted in tenant zone, stored UTC, rendered locally.

**Acceptance criteria:** an end time before the start time is rejected server-side with field
errors; a member-only event 404s for non-members; a soft-deleted event disappears from listings but
keeps its attendance rows; verify gate passes.

---

## Phase 5 — Ticketing & Concurrency

- RSVP endpoint inside an interactive transaction with `SELECT … FOR UPDATE` on the event row.
- Waitlist: when capacity is reached, `Waitlisted` tickets; promotion on cancellation (FIFO).
- QR generation (`qrcode`) for each `Registered` ticket; ticket wallet page.
- Rate limiting on RSVP/invite endpoints (`429` + `Retry-After`).
- **Concurrency test:** fire N parallel RSVPs at the last seat(s) and assert the database never
  exceeds capacity and exactly the expected number succeed.

**Acceptance criteria:** the concurrency test passes repeatedly; duplicate RSVPs hit
`UNIQUE(event_id, user_id)`; QR payloads verify; verify gate passes.

---

## Phase 6 — Scanner & Edge Cases

- Mobile-first scanner view (camera + manual UUID fallback) for Event Managers and above.
- Offline resilience: local queue of accepted scans when the network fails, automatic batch sync
  with idempotent `scan_uuid`, and a visible pending/rejected indicator.
- Server-side validation of every scan: ticket belongs to this event, status is `Registered`, not
  already checked in, event is today.
- **Offline test:** disable the network mid-session, scan 3 tickets, restore, confirm exactly 3
  attendance rows.

**Acceptance criteria:** offline scans sync without duplicates; double-scan shows "already checked
in" rather than erroring; verify gate passes.

---

## Phase 7 — Polish & Observability

- Skeleton loaders, empty states, optimistic updates with rollback, toast notifications for every
  failure path (wired to the shared envelope's error codes).
- Responsive pass across dashboard, event pages and scanner; keyboard/ARIA pass on forms and dialogs.
- Structured request logging with tenant/user context, error boundary, and a `/api/health`
  readiness payload.

**Acceptance criteria:** no layout breakage from 360 px to 1440 px; every API error surfaces a
human-readable message; verify gate passes.

---

## Progress log

| Date | Phase | Result |
| --- | --- | --- |
| 2026-10-14 | 1 — Initialization & Boilerplate | Complete. Next 15.5.27 + React 19 + Tailwind v4 + shadcn (`@base-ui/react`), strict TS, response envelope, env contract, `/api/health`, landing page, docs. Gate: lint ✅ typecheck ✅ build ✅ |
| 2026-10-14 | 2 — Database & Auth | Complete. Postgres 17 + Prisma 7 (driver adapter, composite tenant FKs), migration + idempotent seed, Auth.js v5 credentials/JWT, register API with rate limiting, middleware gate, dashboard reading tenant/club roles in zone-correct time. Gate: lint ✅ typecheck ✅ build ✅ smoke 25/25 ✅ |

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
