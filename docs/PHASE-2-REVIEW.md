# Phase 2 review — Database & Auth

Status: **closed — complete and verified end to end, awaiting your go-ahead for Phase 3.**
Date: 2026-10-16 · Gate: `npm run verify` ✅ (lint · typecheck · **51 tests** · build) · Smoke: `npm run test:smoke` ✅ 25/25

---

## 1. Try it in 30 seconds

```bash
./scripts/db.sh status          # is Postgres up?  (start it with: npm run db:start)
npm run test:smoke              # 25 end-to-end HTTP checks, no browser needed
curl -s localhost:3000/api/health | jq
```

> The in-app preview runs in a sandboxed iframe, which can block session cookies. To click through
> sign-in and the dashboard, open the preview URL in a **new browser tab**.

Demo accounts (password `password123`):

| Email | Roles |
| --- | --- |
| `aarav.president@vit.ac.in` | Tenant Owner · **President** of Robotics, **Member** of Debate |
| `meera.manager@vit.ac.in` | Event Manager of Robotics |
| `kabir.member@vit.ac.in` | Member of both clubs (restricted view) |
| `dean.admin@vit.ac.in` | Tenant Admin, no club role |

---

## 2. Evidence, not claims

| Requirement | Proof |
| --- | --- |
| Migrations apply from scratch | `npx prisma migrate deploy` on an empty database |
| Seed is idempotent | re-run `npm run db:seed` → same 8 rows, no duplicates (fixed UUIDs) |
| Sign-in / sign-out | 302 + session cookie; `GET /api/auth/session` returns the identity |
| Wrong password creates nothing | sign-in → 302 to error, `session` stays empty |
| Protected routes redirect | `/dashboard` → `/sign-in?callbackUrl=%2Fdashboard` |
| `/api/health` reflects Postgres | `"database":{"status":"up","latencyMs":127}`; `503` if the DB stops |
| Server-side validation is authoritative | malformed body → `422` `VALIDATION_ERROR` with named fields |
| Duplicate signup | `409 CONFLICT` (the unique index is the authority, not a pre-check) |
| Registration rate limit | 6th attempt → `429` + `Retry-After` |
| Roles differ per club, one session | Aarav's dashboard shows President *and* Member; Kabir's shows no President |
| Cross-tenant rows are impossible | `tests/integration/tenancy.test.ts` — Postgres rejects the insert (`P2003`), 12 cases |
| Seed is genuinely idempotent | `tests/integration/seed.test.ts` — runs the seed twice, counts stay stable |
| Gate | lint ✅ · typecheck ✅ · test 51/51 ✅ · build ✅ (8 routes + middleware) |

### Tenancy is structural, not aspirational

```sql
FOREIGN KEY ("club_id", "tenant_id")  REFERENCES "clubs"("id", "tenant_id")    -- events
FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id")   -- tickets
FOREIGN KEY ("ticket_id", "tenant_id") REFERENCES "tickets"("id", "tenant_id") -- attendance
```

Postgres rejects any child row whose `tenant_id` disagrees with its parent's — cross-tenant data is
impossible to *insert*, before any application logic runs.

---

## 3. Deviations & decisions you may want to revisit

| # | Decision | Why | Reversible? |
| --- | --- | --- | --- |
| 1 | **Prisma 7.10** (not 6.x) | What npm resolves today; driver adapter is now mandatory and the connection URL moved to `prisma7.config.ts` | Pinning to 6.x is a deliberate downgrade — say the word |
| 2 | **JWT sessions, no `@auth/prisma-adapter` yet** | The spec's entity list has no `Account`/`Session`/`VerificationToken` tables, and JWT needs none | Adding OAuth/magic-link = adapter + 3 tables |
| 3 | **Roles are re-read from Postgres every request** (never baked into the token) | Demoting a president takes effect immediately instead of at token expiry | — |
| 4 | **Registration rate limiting shipped in Phase 2**, not Phase 5 | The endpoint is public the moment it exists | — |
| 5 | **`Event.capacity` permits NULL** = unlimited, per the spec (capacity is optional in the entity list) | Unlimited events then use no row lock arithmetic | — |
| 6 | `Tenant.domain` is `@unique` and optional | Only one college can own a domain — right for the pool model | — |
| 7 | Local Postgres data dir lives at `/home/user/pgdata` (outside the repo) | Never committed; survives across sessions | — |

### Open questions for Phase 3

1. **Invites:** tokenised invite links (works for people without accounts, no email provider needed),
   direct add-by-email (requires an existing account), or both with a pluggable email interface?
   My default if you don't care: **invite links**, since students often don't have accounts yet.
2. **Tenant creation:** self-serve signup that creates a tenant, or is tenant creation restricted
   (you approve colleges)? My default: **self-serve, creator becomes Tenant Owner**, which matches
   the B2B SaaS framing.
3. **Club slug collisions** are per tenant (`@@unique([tenantId, slug])`) — should two clubs in the
   same college be able to share a name? Default: no, slugs collide within a tenant.

---

## 4. Phase 3 plan (on approval)

1. `lib/auth/rbac.ts` — the RBAC matrix from `docs/architecture.md` §4 encoded once as data, plus
   `requireTenantMember()` / `requireClubRole()` guards that throw `ApiError.forbidden()`.
2. Tenant onboarding: `POST /api/tenants` (creator → `OWNER`), tenant switcher in the header.
3. Club CRUD scoped to the active tenant: `POST|PATCH|DELETE /api/clubs`, slug generation from name.
4. Membership: invite creation/acceptance, role changes, soft-leave (`deleted_at`) so history holds.
5. UI: tenant onboarding page, club list/detail, members table with role controls.
6. Tests: a **cross-tenant isolation suite** — tenant B's user hitting tenant A's club/event/member
   endpoints must get `404`, never `403` (existence must not leak).

No code for Phase 3 will be written until you confirm.
