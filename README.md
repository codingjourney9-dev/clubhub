# ClubHub

Multi-tenant SaaS for college and university clubs: create events, cap capacity, sell/issue QR
tickets, and check attendees in at the door — even when the venue has no signal.

> **Build status: Phase 1 of 7 complete.** This repo is being built phase by phase, with each
> phase linted, type-checked and built before the next begins. See `docs/PHASES.md`.

## Stack (as built)

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 15.5 (App Router) · React 19 | Server Components by default, client islands only where needed |
| Language | TypeScript 5, `strict` + `noUncheckedIndexedAccess` | Nullable DB reads and tenant scoping fail at compile time |
| Styling | Tailwind CSS v4 (CSS-first) + shadcn/ui | Primitives come from `@base-ui/react`; variants via `cva` |
| Database | PostgreSQL | Pool model: one schema, `tenantId` on every core table |
| ORM | Prisma | Interactive transactions + `SELECT … FOR UPDATE` for the capacity race |
| Auth | Auth.js v5 (NextAuth) + Postgres | RBAC lives in our `TenantMember` / `ClubMember` tables |
| Validation | Zod v4 | Same schemas shared by forms and route handlers |
| Client state | TanStack Query v5 + Zustand | Server state vs. ephemeral UI state |
| Forms | React Hook Form + `@hookform/resolvers` | Zod resolver, inline field errors |
| QR | `qrcode` (render) + `qr-scanner` (scan) | Added in Phases 5–6 |

## Quickstart

```bash
cp .env.example .env      # then fill DATABASE_URL and AUTH_SECRET
npm install
npm run dev               # http://localhost:3000
```

The landing page renders the current build phase, the tenancy model and the roadmap. The API layer
is live at `/api/health`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build (fails on type errors) |
| `npm run lint` | ESLint (flat config, `next/core-web-vitals` + TS rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | lint → typecheck → build, the gate every phase must pass |

## Project layout

```
src/
├─ app/                     # App Router routes (pages + route handlers)
│  ├─ api/health/           # ✅ liveness probe using the shared response envelope
│  ├─ layout.tsx            # root layout: fonts + AppProviders
│  └─ page.tsx              # build-status landing page
├─ components/
│  ├─ layout/               # site chrome (header, nav, shells)
│  ├─ providers/            # theme, TanStack Query, sonner toaster
│  └─ ui/                   # shadcn/ui primitives (generated — avoid hand edits)
├─ config/site.ts           # client-safe app config + phase roadmap
├─ lib/
│  ├─ api/response.ts       # ok() / fail() / ApiError / handleRouteError
│  └─ env.ts                # server env contract (lazy, Zod-validated)
└─ types/api.ts             # request/response envelope types

docs/
├─ architecture.md          # decisions, tenancy & isolation rules, edge-case playbooks
└─ PHASES.md                # phase-by-phase plan, acceptance criteria, progress log
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — tenancy model, RBAC matrix, isolation rules,
  concurrency/offline/timezone strategies, API conventions.
- [`docs/PHASES.md`](docs/PHASES.md) — the seven implementation phases and what "done" means for each.
