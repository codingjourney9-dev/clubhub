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
| 9 | Gate | ✅ lint + typecheck + build |
| 10 | Smoke test | ✅ `npm run test:smoke` → 25/25 checks |

---

## Phase 3 — Tenant & Club Scaffolding (next)

- Onboarding flow: create a tenant (with timezone + branding) or join via invite.
- Club CRUD scoped to the active tenant; invite members by email with role selection.
- `requireTenantMember()` / `requireClubRole()` guards applied to every handler, plus the RBAC
  matrix from architecture §4 encoded once in `lib/auth/rbac.ts`.
- Tenant switcher in the UI; 404 (not 403) for cross-tenant probes.

**Acceptance criteria:** a user is President in Club A and Member in Club B and sees exactly the
right actions in each; cross-tenant access attempts return 404; every new endpoint has a Zod schema
and a guard; verify gate passes.

---

## Phase 4 — Event Management CRUD

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

### After a fresh sandbox session, run these three commands

Sandbox snapshots persist `*.ts/.tsx/.sql/.prisma` files, the Postgres **data directory** and the
repo history — but they deliberately exclude `node_modules`, installed apt packages, `.next`, and
**empty directories**. So:

```bash
npm install        # ~35s: restores deps and re-runs `prisma generate` (postinstall)
npm run db:start   # reinstalls Postgres binaries if needed, repairs the data dir, starts the server
npm run dev        # start the app
```

`scripts/db.sh start` now self-heals the three things a restore breaks:

1. **Missing binaries** — apt packages are not persisted, so it reinstalls `postgresql` on demand.
2. **Missing empty directories** — Postgres needs `pg_notify`, `pg_stat_tmp`, `pg_arch…` etc., and
   archives drop empty dirs; it recreates them (this was the "could not open directory pg_notify"
   failure).
3. **Widened data-directory permissions** — Postgres refuses anything looser than `0750`; the
   directory is normalised to `0700`.

If the cluster is ever unrecoverable, the schema and data are reproducible in seconds:

```bash
npm run db:reset                 # drop + recreate the database
npx prisma migrate deploy        # replay migrations
npm run db:seed                  # re-seed demo data
```

### Development gotchas

- `next dev` and `next build` share `.next`: stop the dev server before `npm run verify`, or restart
  it afterwards (a production build while dev is live kills the dev process).
- `npm run test:smoke` requires a running dev server and derives a fresh rate-limit bucket per run
  via a random `X-Forwarded-For`, so it is safely repeatable.
- The in-app preview renders inside a sandboxed iframe, which can block session cookies. Open the
  preview URL in a normal browser tab to exercise sign-in.
