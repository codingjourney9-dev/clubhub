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

## Phase 2 — Database & Auth (next)

- Prisma schema for `Tenant`, `User`, `TenantMember`, `Club`, `ClubMember`, `Event`, `Ticket`,
  `Attendance` with the storage rules from architecture §2 (UTC timestamps, soft deletes, unique
  constraints, indexes).
- Local Postgres provisioned and migrated; seed script with one tenant, two clubs, three users
  holding different roles.
- Auth.js v5 (credentials + optional OAuth) with Prisma adapter, JWT session strategy, typed
  session augmentation (`session.user.id`).
- `src/lib/db/client.ts` singleton (dev-safe) and `src/middleware.ts` protecting `(dashboard)` and
  `scanner` route groups.
- `/api/health` extended with a database round-trip check.

**Acceptance criteria:** migrations apply from scratch; seed runs; sign-in/sign-out works; a signed-out
request to a protected route redirects; `/api/health` reports `database: "up"`; verify gate passes.

---

## Phase 3 — Tenant & Club Scaffolding

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
