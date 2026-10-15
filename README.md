# ClubHub

Multi-tenant SaaS for college and university clubs: create events, cap capacity, issue QR tickets,
and check attendees in at the door — even when the venue has no signal.

> **Build status: Phase 2 of 7 complete.** Database schema, migrations, seed data and Auth.js
> sessions are live. Each phase is reviewed, then linted, type-checked and built before the next
> begins — see `docs/PHASES.md`.

## Stack (as built)

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 15.5 (App Router) · React 19 | Server Components by default, client islands only where needed |
| Language | TypeScript 5, `strict` + `noUncheckedIndexedAccess` | Nullable DB reads and tenant scoping fail at compile time |
| Styling | Tailwind CSS v4 (CSS-first) + shadcn/ui | Primitives come from `@base-ui/react`; variants via `cva` |
| Database | PostgreSQL 17 | Pool model: one schema, `tenantId` on every core table |
| ORM | Prisma 7 (`prisma-client` + `@prisma/adapter-pg`) | Interactive transactions + `SELECT … FOR UPDATE` for the capacity race |
| Auth | Auth.js v5 (credentials + bcrypt) with JWT sessions | RBAC lives in `TenantMember` / `ClubMember`, re-read every request |
| Validation | Zod v4 | The same schemas validate forms and route handlers |
| Client state | TanStack Query v5 + Zustand | Server state vs. ephemeral UI state |
| Forms | React Hook Form + `@hookform/resolvers` | Zod resolver, inline field errors, toasts |

## Quickstart

```bash
cp .env.example .env                 # DATABASE_URL, AUTH_SECRET (npx auth secret)
npm install                          # postinstall runs `prisma generate`

./scripts/db.sh init                 # create + start the local Postgres cluster (port 5432)
npx prisma migrate deploy            # apply migrations
npm run db:seed                      # tenant, 2 clubs, 4 users, 3 events (password123)

npm run dev                          # http://localhost:3000
```

Already have Postgres? Point `DATABASE_URL` at it and skip `scripts/db.sh init`.

### Coming back to this project in a new session

Sandbox snapshots keep the source, git history and the Postgres **data**, but drop `node_modules`,
installed packages and empty directories. Recovery is three commands:

```bash
npm install        # restores deps; postinstall regenerates the Prisma client
npm run db:start   # reinstalls Postgres binaries if needed, repairs + starts the cluster
npm run dev
npm run test:smoke # 25 end-to-end checks against the running server
```

`scripts/db.sh start` self-heals missing binaries, missing empty data directories and
over-permissive directory mode. See `docs/PHASES.md` → *Operational notes*.

**Demo accounts** (all with password `password123`):

| Email | Roles — deliberately different in each club |
| --- | --- |
| `aarav.president@vit.ac.in` | Tenant Owner · **President** of Robotics, **Member** of Debate |
| `meera.manager@vit.ac.in` | Event Manager of Robotics |
| `kabir.member@vit.ac.in` | Plain member of both clubs |
| `dean.admin@vit.ac.in` | Tenant Admin, no club role |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build (fails on type errors) |
| `npm run lint` | ESLint (flat config, `next/core-web-vitals` + TS rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | lint → typecheck → build; the gate every phase must pass |
| `npm run test:smoke` | HTTP smoke test against a running dev server (health, validation, rate limit, sign-in, RBAC) |
| `npm run db:start` / `db:stop` | Control the local Postgres cluster |
| `npm run db:migrate` | `prisma migrate dev` (create + apply a migration) |
| `npm run db:deploy` | `prisma migrate deploy` (apply existing migrations) |
| `npm run db:seed` | Idempotent demo seed (fixed UUIDs, safe to re-run) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Drop, re-migrate and re-seed |

## Project layout

```
prisma/
├─ schema.prisma            # 8 entities, composite tenant FKs, soft deletes
├─ migrations/              # applied SQL history
└─ seed.ts                  # idempotent demo data (fixed UUIDs)
prisma7.config.ts           # Prisma 7 config: schema path, migration dir, seed, connection URL
scripts/
├─ db.sh                    # local Postgres cluster control
└─ smoke-test.sh            # end-to-end HTTP checks for Phase 2
src/
├─ app/
│  ├─ (auth)/               # sign-in, sign-up (centered shell)
│  ├─ (dashboard)/          # auth-gated admin surfaces
│  ├─ api/
│  │  ├─ auth/[...nextauth]/# Auth.js handlers
│  │  ├─ auth/register/     # POST register — Zod validated, rate limited
│  │  └─ health/            # liveness + database readiness
│  └─ page.tsx              # build-status landing page
├─ components/{ui,layout,features,providers}
├─ config/site.ts           # client-safe config + phase roadmap
├─ generated/prisma/        # Prisma client output (gitignored, regenerated on install)
├─ lib/
│  ├─ api/                  # response envelope, request parsing
│  ├─ auth/                 # auth config, guards, session helpers
│  ├─ db/                   # Prisma client singleton (driver adapter)
│  ├─ format/               # UTC-in / zone-out date formatting
│  ├─ rate-limit/           # token bucket
│  ├─ services/             # business logic (register user, …)
│  └─ validation/           # shared Zod schemas
├─ types/                   # API envelope + NextAuth augmentation
└─ middleware.ts            # edge gate for /dashboard, /scanner, /onboarding
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — tenancy model, RBAC matrix, isolation rules,
  concurrency/offline/timezone/rate-limit strategies, Prisma 7 notes, decision log.
- [`docs/PHASES.md`](docs/PHASES.md) — the seven phases, their acceptance criteria and progress.
