# Deploying ClubHub

> **New to this?** Read [`DEPLOY-BEGINNER.md`](./DEPLOY-BEGINNER.md) instead — same content, but every
> term explained and every click spelled out. This file is the reference version.

A real walkthrough: what to run, in what order, and what to check before you let anyone use it.

Three targets, in order of how well they fit this codebase:

| Target | Best for | How much of it I could test here |
| --- | --- | --- |
| **A. Docker Compose on one server** | almost everyone; the closest match to how the app is built | **the build and run path** (verified), not the Docker daemon itself |
| **B. Vercel + Neon/Supabase** | no server to babysit; free tier | configuration verified against the code; not deployed |
| **C. Plain server (systemd + nginx)** | a college VPS with no Docker | the process, env and migration steps (verified) |

I have deliberately marked what was **run** and what was **reasoned about**. The honest summary is
at the end.

---

## 0. What this app needs to run

| Requirement | Why | Notes |
| --- | --- | --- |
| **Node 20.9+** | `package.json` engines; Next 15 | 20 LTS or 22 LTS |
| **PostgreSQL 15+** | Prisma 7 with the `pg` driver adapter | tested on 17 |
| **A writable `/tmp`** | not used at runtime; only the build needs disk | — |
| **Outbound HTTPS** | none at runtime (all fonts are bundled) | nice to know: the app works offline |

There is **no Redis, no queue, no worker, no cron**. One process and one database is the whole
system, which is why deployment is short.

> **Scaling note, stated plainly:** rate limiting is an in-memory token bucket, so it is
> **per process**. Run **one** instance. Two instances means two independent limits. The app now
> refuses to boot if someone sets `RATE_LIMIT_DRIVER=redis`, because that driver does not exist yet —
> a silent fallback would have been a lie.

---

## 1. The environment variables that matter

Copy `.env.example` → `.env` and set these. Everything else has a working default.

| Variable | Required | What it does | How to get it |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes** | Postgres connection string | from your database provider |
| `AUTH_SECRET` | **yes** | signs session cookies; ≥ 32 chars | `npx auth secret` |
| `AUTH_URL` | strongly | the **public** origin, e.g. `https://clubs.example.edu` | yourself |
| `AUTH_TRUST_HOST` | behind a proxy | `true` — the app sits behind nginx/Vercel/a load balancer | `true` |
| `NEXT_PUBLIC_APP_URL` | yes | same as `AUTH_URL`; used to build links | yourself |
| `NODE_ENV` | yes | `production` | deployment platform |
| `DEMO_MODE` | **yes in prod** | `off` — see the warning below | `off` |
| `RATE_LIMIT_DRIVER` | no | only `memory` exists | `memory` |
| `DIRECT_DATABASE_URL` | only with a pooler | migrations bypass PgBouncer | provider's direct URL |
| `DEFAULT_TENANT_TIMEZONE` | no | fallback for colleges that set none | `Asia/Kolkata` |

### Three settings that bite if you get them wrong

**`DEMO_MODE` must be `off`.** The `/demo` pages render real tenant data **without authentication**.
They exist so the app can be reviewed inside a frame that cannot store cookies. In production this is
a data leak, so it is off unless explicitly enabled — and `deploy:check` fails loudly if a production
server has it on.

**`AUTH_URL` must be the URL people actually type.** Auth.js builds callback URLs from it. Behind
HTTPS it must start with `https://`, or the session cookie will not be marked `Secure` and some
browsers will drop it.

**Never run `npm run db:seed` in production.** The seed creates four demo accounts whose password is
`password123`. It is for local development and for the review deployment only.

---

## 2. Target A — Docker Compose on one server (recommended)

Everything needed is committed: `Dockerfile`, `.dockerignore`, `docker-compose.yml`.

```bash
# on the server, as a normal user with docker installed
git clone <your-repo> clubhub && cd clubhub

cp .env.example .env
# edit .env:
#   DATABASE_URL="postgresql://clubhub:CHANGE_ME@db:5432/clubhub?schema=public"
#   POSTGRES_PASSWORD=CHANGE_ME            (compose reads this to create the db)
#   AUTH_SECRET=$(openssl rand -base64 48)
#   AUTH_URL=https://clubs.example.edu
#   NEXT_PUBLIC_APP_URL=https://clubs.example.edu
#   DEMO_MODE=off

docker compose up -d --build
docker compose logs -f migrate      # must end with "All migrations have been applied"
docker compose ps                   # app should be "healthy"
```

What the three containers do:

| Service | Image | Job |
| --- | --- | --- |
| `db` | `postgres:17` | the database, with a named volume `pgdata` |
| `migrate` | the **builder** stage | runs `prisma migrate deploy` **once**, then exits |
| `app` | the **runner** stage | the standalone Next.js server, on port 3000 |

`app` waits for `migrate` to finish *successfully* (`service_completed_successfully`), so a failed
migration stops the deploy instead of serving a half-migrated database.

### Why the image is built the way it is

- **`output: "standalone"`** (enabled only when `BUILD_STANDALONE=1`) traces exactly the modules the
  app uses, so the runtime image does not need `node_modules` from the lockfile — just the traced
  subset plus the Prisma query engine.
- **`.next/static` and `public/` are copied by hand.** Standalone does not include them. Forgetting
  this is the classic "page loads with no CSS" container bug; the Dockerfile comments it so nobody
  deletes it later.
- **`.env` is kept out of the image twice**: `.dockerignore` stops it entering the build context, and
  the Dockerfile deletes it from the standalone output as a second measure (Next copies a root
  `.env` into that folder).
- **The app runs as `node`, not root.**
- **`HEALTHCHECK` calls `/api/health`** with `node -e fetch(...)` because the slim image has no curl.

### Put TLS in front of it

The container speaks plain HTTP on 3000. Terminate TLS at a reverse proxy. With Caddy it is two lines:

```
clubs.example.edu {
    reverse_proxy 127.0.0.1:3000
}
```

With nginx, remember the proxy headers and the upgrade headers:

```nginx
server {
    listen 443 ssl http2;
    server_name clubs.example.edu;

    # ssl_certificate ... (certbot)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Then set `AUTH_URL=https://clubs.example.edu` and restart the app.

---

## 3. Target B — Vercel + a managed Postgres

The app is a standard Next.js 15 project, so it deploys as-is, with **three** provider-specific
settings.

**1. Build command** — migrations must run at deploy time, not at request time:

```
npx prisma migrate deploy && npm run build
```

`postinstall` already runs `prisma generate`, which is required because `src/generated` is gitignored.

**2. Connection string.** Serverless functions open many short-lived connections, so use the
provider's **pooled** URL for `DATABASE_URL` and the **direct** URL for migrations:

| Provider | `DATABASE_URL` | `DIRECT_DATABASE_URL` |
| --- | --- | --- |
| Neon | the `-pooler` host | the direct host |
| Supabase | port `6543` | port `5432` |
| Railway / RDS | usually the same URL | same |

`prisma7.config.ts` prefers `DIRECT_DATABASE_URL` when it is set, so
`prisma migrate deploy` takes advisory locks against the real database instead of a transaction pooler
(where DDL and locks misbehave). This is the single most common cause of "migrations work locally but
fail in CI" with Prisma 7.

**3. Environment variables.** Same table as §1. Vercel sets `NODE_ENV=production` itself; set
`DEMO_MODE=off`, `AUTH_TRUST_HOST=true`, and `AUTH_URL` to the production domain.

**Things that are fine on serverless:** the middleware (it imports only the database-free
`auth.config.ts`), the JWT auth session, and the health probe.

**Things that are not:** the in-memory rate limiter resets on every cold start and is per-instance
(see §0), and `/api/health` should not be used as a *liveness* probe on a platform that already has
one — use it as a **readiness** probe at deploy time.

---

## 4. Target C — a plain server, no Docker

```bash
# 1. Code and dependencies
git clone <your-repo> /srv/clubhub && cd /srv/clubhub
npm ci --legacy-peer-deps        # .npmrc pins legacy-peer-deps
cp .env.example .env             # then edit it (see §1)

# 2. Database
npx prisma migrate deploy

# 3. Build
npm run build

# 4. Smoke it before daemonising
npx next start -p 3000 &
curl -s localhost:3000/api/health | head -c 200
```

Then run it under systemd:

```ini
# /etc/systemd/system/clubhub.service
[Unit]
Description=ClubHub
After=network.target postgresql.service

[Service]
Type=simple
User=clubhub
WorkingDirectory=/srv/clubhub
EnvironmentFile=/srv/clubhub/.env
ExecStart=/usr/bin/npx next start -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5
# A crashed process must not take the box down with it.
MemoryMax=1G

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now clubhub
sudo systemctl status clubhub
```

Put nginx or Caddy in front (§2), then set `AUTH_URL` to the public HTTPS origin.

---

## 5. The deploy check — run it twice

`scripts/deploy-check.sh` is the thing that stops the classic mistakes. It reads `.env`, so it sees
exactly what the app will see.

```bash
npm run deploy:check                                    # before/after deploy, against localhost
BASE_URL=https://clubs.example.edu npm run deploy:check  # against the live site
```

What it verifies:

| Check | What it catches |
| --- | --- |
| Node ≥ 20.9, a build exists | deploying a half-built tree |
| `DATABASE_URL` is a postgres URL (credentials masked in output) | pointing at SQLite or a typo |
| `AUTH_SECRET` ≥ 32 and not the placeholder | sessions that cannot be signed |
| `NODE_ENV=production` | a dev server accidentally exposed |
| **`DEMO_MODE` off** | the unauthenticated `/demo` leak |
| `RATE_LIMIT_DRIVER=memory` | a driver the app will refuse to boot with |
| `.env` not tracked by git | secrets in the repo |
| `prisma migrate status` | **pending migrations** — the deploy that "worked" but breaks |
| `/api/health` says `ready:true` | database down, migrations missing |
| `/demo` is 404 **when the server says demo is off** | a config/process mismatch |
| `/sign-in` 200, `/dashboard` 307 | auth wiring |
| `x-request-id` on responses | the logging wrapper is mounted |

Example of it doing its job — the sandbox preview legitimately runs with demo mode on, so the check
reports it:

```
[3] production safety
  ✗ DEMO_MODE=on — /demo serves tenant data with NO authentication. Turn it off.
```

For the review deployment only, acknowledge it with `DEMO_MODE_EXPECTED=on` and it becomes a warning.

---

## 6. First deploy, in order

1. **Provision Postgres.** Note both the pooled and direct URLs.
2. **Set the environment.** `DEMO_MODE=off`, `AUTH_URL` = the real public URL.
3. **Migrate:** `npx prisma migrate deploy`. It is safe to re-run; it is a no-op when current.
4. **Build and start.**
5. **`npm run deploy:check`** against the public URL.
6. **Create the first real account** at `/sign-up`, then create your college at `/onboarding`. The
   first user to create a college becomes its **Owner** — there is no separate "admin bootstrap".
7. **Turn off sign-ups** if this is a closed pilot: there is no flag for it yet, so put the app behind
   your identity proxy or nginx basic-auth on `/sign-up` until one exists.

---

## 7. Every deploy after that

```bash
git pull
npm ci --legacy-peer-deps
npx prisma migrate deploy     # BEFORE restarting the app
npm run build
systemctl restart clubhub     # or: docker compose up -d --build
npm run deploy:check
```

**Order matters.** Migrations are additive in this project (new columns and tables, no drops), so the
old process keeps working while the new schema lands. Deploying the app first and migrating second
means a window where new code queries columns that do not exist.

---

## 8. Backups, and how to restore one

The entire state is one Postgres database. Nothing else needs backing up except `.env`.

```bash
# nightly at 02:00 — keep 14 days
0 2 * * * pg_dump "$DATABASE_URL" --format=custom --file=/var/backups/clubhub-$(date +\%F).dump
0 3 * * * find /var/backups -name 'clubhub-*.dump' -mtime +14 -delete
```

Restore:

```bash
createdb clubhub_restored
pg_restore --dbname=clubhub_restored --no-owner /var/backups/clubhub-2026-10-17.dump
# then point DATABASE_URL at it and run: npx prisma migrate status
```

Test a restore **once** before you need one. An untested backup is a rumour.

---

## 9. Rolling back

The app is stateless, so rolling back the **code** is trivial:

```bash
git checkout <previous-tag> && npm ci --legacy-peer-deps && npm run build && systemctl restart clubhub
```

Rolling back the **database** is not, because this project never writes "down" migrations. Decide
before you deploy whether a migration is reversible; if it is not, take a backup first
(`pg_dump` takes seconds on a database this size) and restore it if the rollback needs it.

---

## 10. What I actually verified for this document

Run in this workspace, today:

| Verified | How |
| --- | --- |
| Migrations apply to a **completely empty** database | `createdb clubhub_deploy` → `prisma migrate deploy` → both migrations applied |
| A fresh deployment is **usable**, not just running | started the build against that empty DB, registered a user over HTTP, confirmed the row in Postgres |
| `ready:true` only when migrations exist | `/api/health` on the fresh DB reported `applied: 2`, `latest: …_phase3_invites` |
| **Production closes `/demo`** | `NODE_ENV=production DEMO_MODE=off` → `/demo` returned **404**, `/` and `/sign-in` 200, `/dashboard` 307 |
| The **standalone** build runs | `BUILD_STANDALONE=1 next build` → `node .next/standalone/server.js` answered `/api/health` with `ready:true` and served the hashed CSS file (200) |
| `.env` really does land in standalone output | confirmed with `ls -a .next/standalone` — hence the `rm -f .env` line and `.dockerignore` rule |
| The deploy check passes on a healthy deploy and **fails** on `AUTH_SECRET` too short, `RATE_LIMIT_DRIVER=redis`, and demo mode on in production | ran all four scenarios |
| `docker-compose.yml` is valid YAML with the intended graph | parsed it; `app` depends on `migrate: service_completed_successfully` |

**Not verified, stated plainly:** there is no Docker daemon in this sandbox, so the image itself was
**not built** and Compose was **not run end to end**. The two parts that usually break — the
standalone build and the static-asset copy — were both exercised directly, and the Dockerfile mirrors
exactly those steps. The Vercel path was never deployed from here either; the pooling and
`DIRECT_DATABASE_URL` handling is implemented in `prisma7.config.ts` and returns the right URL, but no
cloud provider was contacted.

If anything in §2 fails on your machine, run `docker compose logs migrate` first: nine times out of
ten it is `DATABASE_URL` pointing at `localhost` instead of the `db` service name.
