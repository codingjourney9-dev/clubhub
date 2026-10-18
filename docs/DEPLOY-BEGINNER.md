# Putting ClubHub on the internet — the slow, plain-English version

> **Haven't even got the code onto your computer yet?** Read
> [`FROM-ZERO.md`](./FROM-ZERO.md) first — it covers downloading the zip, installing Git, creating a
> GitHub account and repository, and pushing the folder up. Come back here for the database and the
> hosting.

This assumes you have never deployed anything. Every word that might be new is explained before it is
used. If you already know what a container is, read [`DEPLOY.md`](./DEPLOY.md) instead — it is the
short reference; this is the hand-holding.

---

## Part 0 — What "deploying" actually means

Right now your app lives in a **sandbox**: a temporary computer that someone else owns. When it gets
cleaned out, your app is gone — that is why `node_modules` disappears and the server stops between
sessions. That is normal for a workshop. It is not a website.

Deploying means **moving the app onto a computer that stays on**, with an address people can type.

Three things have to exist for that to work:

| Thing | Plain English | Analogy |
| --- | --- | --- |
| **A computer that stays on** | a rented machine running 24/7 | an apartment you rent, not a hotel room |
| **The database** | a separate program that stores your rows (colleges, clubs, events, tickets) | a filing cabinet that must be there before the app can file anything |
| **A name and a lock** | a domain people type, and HTTPS so the padlock appears | a street address and a front door lock |

You already have all three pieces *in code*. What is missing is a place to run them.

### Two ways to get that place

| | **Path A — Vercel + Neon** | **Path B — your own server** |
| --- | --- | --- |
| What it is | a company runs the computer for you | you rent a Linux machine and look after it |
| Cost | free tier is enough for a club | roughly ₹400–900 / month |
| Time to first deploy | ~30 minutes | ~90 minutes |
| You need to know | nothing about Linux | a little about the terminal |
| Best for | showing it, a pilot with one college | "I want to own the whole thing" |

**Start with Path A.** It is genuinely enough for a college club, it is free, and you can move to
Path B later without rewriting anything.

---

## Part 1 — Words you will meet (skip until you need them)

| Word | What it means here |
| --- | --- |
| **Terminal / command line** | the black window where you type commands instead of clicking |
| **`npm install`** | downloads the libraries the app needs ("dependencies") into a folder called `node_modules` |
| **`npm run build`** | converts your code into the fast, finished version the server will actually run |
| **`npm start`** | runs that finished version |
| **Environment variable** | a setting stored outside the code, like a password or an address. The app reads it when it starts. Never put these in code, because code goes into git and git goes to the internet. |
| **`.env` file** | a plain text file holding your environment variables, one `NAME=value` per line |
| **Migration** | a saved instruction that changes the database's shape ("add a `waitlisted_count` column"). Running it applies those instructions in order. |
| **Container / Docker** | a sealed box containing your app plus everything it needs to run. Same box works on any machine. |
| **`docker compose`** | a tool that starts several boxes together (in our case: database, migrations, app) |
| **Reverse proxy** | a doorman in front of your app that handles HTTPS and forwards visitors to it |
| **HTTPS / TLS** | the padlock. Without it, browsers warn visitors and login cookies get dropped. |
| **DNS** | the phone book that turns `clubs.yourcollege.edu` into a machine's address |
| **Cold start** | a serverless platform starting your app fresh after it was idle; the first visitor waits a second or two |

---

## Part 2 — Before either path: two things to understand

### 2.1 There are two kinds of "it's running"

A server can be **alive** and still be **unable to work**. Postgres might be down, or the database
might be empty because nobody ran the migrations. That is why the app has `/api/health`:

```json
{ "ready": true, "checks": { "database": {"state":"up"}, "migrations": {"applied":2} } }
```

`ready: true` is the only answer that means "a real person can use this". If you ever wonder whether a
deployment worked, open that address — do not trust "the page loaded".

### 2.2 The three settings that cause real incidents

These are not hypothetical; they are the mistakes people actually make.

| Setting | The mistake | What happens |
| --- | --- | --- |
| `DEMO_MODE` | left `on` | `/demo` shows **real student names, emails and tickets to anyone with the link, with no login**. In production it must be `off`. |
| `AUTH_SECRET` | copied from the example file | it literally says `replace-me-...`; sign-in breaks and every session becomes forgeable |
| Migration order | app restarted before migrating | the new code asks the database for a column that does not exist yet → 500s for real users |

The app now refuses to start if any of these are dangerously wrong, and `npm run deploy:check` fails
loudly. **Run that command.** It exists because I made all three mistakes while writing this.

---

# Path A — Vercel + Neon, click by click

You will end up with: `https://clubhub-yourname.vercel.app` and a free Postgres database.

## A1. Get the code onto GitHub (10 min)

Vercel deploys from a git repository.

1. Create a GitHub account if you do not have one.
2. Create a **new empty repository** — private is fine. Do not tick "add a README".
3. In your terminal, inside the project folder:

```bash
git remote add origin https://github.com/YOURNAME/clubhub.git
git branch -M main
git push -u origin main
```

> **Check first:** `.env` must **not** be in the repo. Type `git ls-files .env` — it should print
> nothing. If it prints `.env`, stop and remove it (`git rm --cached .env`); your secrets would
> otherwise be public forever, even if you delete them later.

## A2. Create the database (5 min)

1. Go to **neon.com** → sign up (GitHub login is fastest).
2. Create a project. Pick the region closest to you — `Singapore` or `Mumbai` for India.
3. Neon shows you a **connection string** that looks like:

```
postgresql://neondb_owner:AbCdEf123@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

4. You need **two** versions of it. On the dashboard, use the **"Connection string"** panel and
   toggle **"Pooled connection"** on and off:

| Name | Which one | Where it goes |
| --- | --- | --- |
| `DATABASE_URL` | **Pooled** (the host contains `-pooler`) | the app uses this |
| `DIRECT_DATABASE_URL` | **Direct** (no `-pooler`) | migrations use this |

Why two: a pooler sits between the app and the database to share connections, but it refuses the
special lock that migrations need. Using the direct URL for migrations is the fix. Our config already
prefers `DIRECT_DATABASE_URL` when it exists.

## A3. Put the app on Vercel (10 min)

1. **vercel.com** → sign up with GitHub.
2. **Add New → Project** → pick your repository → **Import**.
3. Before clicking Deploy, open **Environment Variables** and add these seven:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the **pooled** Neon string |
| `DIRECT_DATABASE_URL` | the **direct** Neon string |
| `AUTH_SECRET` | run `openssl rand -base64 48` in your terminal and paste the output |
| `AUTH_URL` | `https://your-project.vercel.app` (you can correct it after the first deploy) |
| `NEXT_PUBLIC_APP_URL` | same as `AUTH_URL` |
| `DEMO_MODE` | `off` |
| `DATABASE_POOL_MAX` | `1` |

`DATABASE_POOL_MAX=1` matters: each copy of your app that Vercel starts gets its own connections, and
free database plans allow only a handful in total. Without it you will meet
`P2037: too many database connections`.

4. Open **Build & Development Settings** and change the **Build Command** to:

```
npx prisma migrate deploy && npm run build
```

This creates the tables on the very first deploy, and does nothing on later ones. It is safe to repeat
— that is what "migration" means.

5. Click **Deploy** and watch the log. You want it to end with `Deployment completed`.

## A4. Check it (2 min)

Open these in order:

| Address | What you want |
| --- | --- |
| `https://your-project.vercel.app/api/health` | `"ready": true`, `"applied": 2` (or more) |
| `https://your-project.vercel.app/sign-in` | the sign-in form |
| `https://your-project.vercel.app/demo` | **404** — this is correct. Demo mode is off in production. |

Then run the automated version from your own machine:

```bash
BASE_URL=https://your-project.vercel.app npm run deploy:check
```

Fourteen checks in ten seconds. If it says `All checks passed`, you are done.

## A5. Make yourself the first user (2 min)

1. Go to `/sign-up` and create your account.
2. You will be sent to `/onboarding` — create your college. **Whoever creates the college becomes its
   Owner.** There is no separate admin account to configure.
3. Create a club, open it, invite a friend with a link.

### If you want a closed pilot
Sign-ups are open to anyone who finds the URL. There is no off switch yet, so either:
- keep the URL private for now, or
- put the app behind your college's login proxy, or
- ask me to add a `SIGNUPS_ENABLED` flag (a small, contained change).

---

# Path B — your own server

Only read this if you want to own the whole machine. You will need to be comfortable typing commands
into a terminal.

## B1. Rent the machine (10 min)

Any provider works: Hetzner, DigitalOcean, Linode, Vultr, or an Indian one like E2E Networks. What to
pick:

- **1 vCPU / 1 GB RAM / 20 GB disk** is enough for a club (the app uses well under 200 MB).
- **Ubuntu 24.04 LTS** as the image — the most documented Linux there is.
- Add your **SSH key** during creation. If you do not have one, run `ssh-keygen -t ed25519` and press
  Enter three times, then paste the contents of `~/.ssh/id_ed25519.pub`.

You get an IP address like `203.0.113.42`.

## B2. Point a name at it (5 min, optional but worth it)

In your domain's DNS settings, add an **A record**:

| Type | Name | Value |
| --- | --- | --- |
| A | `clubs` | `203.0.113.42` |

Now `clubs.yourcollege.edu` will point at your server. DNS can take up to an hour; usually minutes.

## B3. Install the tools (10 min)

```bash
ssh root@203.0.113.42

# Docker: the program that runs the containers
curl -fsSL https://get.docker.com | sh

# Confirm it works
docker --version
```

## B4. Put the code on the machine (5 min)

```bash
mkdir -p /srv && cd /srv
git clone https://github.com/YOURNAME/clubhub.git
cd clubhub

cp .env.example .env
nano .env          # edit the values, Ctrl+O to save, Ctrl+X to exit
```

What to put in `.env` for this path:

```ini
DATABASE_URL="postgresql://clubhub:SOMETHING_LONG_AND_RANDOM@db:5432/clubhub?schema=public"
POSTGRES_PASSWORD="SOMETHING_LONG_AND_RANDOM"     # must match the one in DATABASE_URL
AUTH_SECRET="paste output of: openssl rand -base64 48"
AUTH_URL="https://clubs.yourcollege.edu"
NEXT_PUBLIC_APP_URL="https://clubs.yourcollege.edu"
DEMO_MODE="off"
NODE_ENV="production"
```

> `db` is the service name in `docker-compose.yml`. Inside Docker's private network, containers find
> each other by name, so the host is `db`, **not** `localhost`. Using `localhost` here is the single
> most common reason a first deploy fails.

## B5. Start it (10 min)

```bash
docker compose up -d --build      # the first run takes a few minutes
docker compose logs -f migrate    # watch this until it says "All migrations have been applied"
docker compose ps                 # db and app should say "healthy"
```

Then, before doing anything else:

```bash
curl -s localhost:3000/api/health
```

Look for `"ready":true`.

## B6. Put HTTPS in front (10 min)

Your app speaks plain HTTP. Browsers need HTTPS for login cookies to work. Use **Caddy** — it fetches
the certificate by itself.

```bash
apt install -y caddy
nano /etc/caddy/Caddyfile
```

Replace the contents with (change the domain):

```
clubs.yourcollege.edu {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
systemctl restart caddy
```

Caddy needs port **80** and **443** reachable. If your provider has a firewall, open them. Caddy will
have a certificate within a minute; then `https://clubs.yourcollege.edu` works.

## B7. Check it

```bash
BASE_URL=https://clubs.yourcollege.edu npm run deploy:check
```

---

# Part 3 — How do I know it really worked?

Do these five things, in order. If all five pass, it is genuinely deployed.

| # | Do this | You should see |
| --- | --- | --- |
| 1 | Open `/api/health` | `"ready": true`, `"database": {"state":"up"}` |
| 2 | Open `/` and `/sign-in` | real pages with styling (not plain black text) |
| 3 | Open `/dashboard` while signed out | you are sent to the sign-in page |
| 4 | Open `/demo` | **404** — production is meant to hide it |
| 5 | Sign up, create a college, create a club | it saves and survives a page refresh |

**And one that catches more bugs than the rest:** press **sign out**, then **sign in** again. That is
the only way to prove your `AUTH_SECRET` and `AUTH_URL` are right, and it is what a real student does
first.

---

# Part 4 — When something goes wrong

Find your symptom. The fix column is the actual fix, not "check your settings".

| Symptom | What it means | Fix |
| --- | --- | --- |
| `P1001: Can't reach database server` | the app cannot reach Postgres | Vercel: are you using the string with `sslmode=require`? Compose: is the host `db`, not `localhost`? |
| `P2037: too many database connections` | every app instance opened 10 connections | set `DATABASE_POOL_MAX=1` and redeploy |
| `prisma migrate deploy` hangs or errors on a cloud DB | a pooler refused the migration lock | set `DIRECT_DATABASE_URL` to the non-pooled string |
| `Invalid server environment variables: DATABASE_URL…` at startup | a variable is missing or misspelled | re-add it in Vercel's settings / check `.env`, then redeploy |
| Page loads but is **unstyled** | the static asset folder was not copied into the image | you are on a hand-rolled image — use the provided `Dockerfile`, which copies it |
| Sign-in appears to work but you are signed out immediately | `AUTH_URL` does not match the address in the browser, so the cookie is dropped | set `AUTH_URL` to the exact public URL including `https://` |
| Everyone sees "Not Found" on `/demo` | correct in production | nothing to fix — that is the safety switch |
| `ready: false` but the page loads | database up? migrations run? | open `/api/health`; it names which check failed |
| 500 on every page after a deploy | code expects a column the database does not have | run `npx prisma migrate deploy`, then restart |
| `RATE_LIMIT_DRIVER="redis"` and the app will not start | that driver does not exist | set it to `memory` |

### Where the logs are

Every response carries an `x-request-id` header, and every API request writes one JSON line — with
that same id, the route, the status, how long it took, and who was signed in. On Vercel: **Project →
Logs**. On your own server: `docker compose logs -f app`.

If a user says "it broke", ask for the reference shown in the error message. That id finds the line.

---

# Part 5 — Everyday operations

**Deploying a change**

Vercel does it when you push to `main`. On your own server:

```bash
cd /srv/clubhub
git pull
docker compose up -d --build
```

Migration order matters: `docker compose` runs the `migrate` container before it starts `app`, every
time. That is why deploy order is not something you have to remember here.

**Backups**

The whole system is one database. Nothing else needs saving except `.env`.

```bash
# every night at 2am, keep two weeks
0 2 * * * docker compose exec -T db pg_dump -U clubhub clubhub | gzip > /var/backups/clubhub-$(date +\%F).sql.gz
0 3 * * * find /var/backups -name 'clubhub-*.sql.gz' -mtime +14 -delete
```

Restore:

```bash
gunzip -c /var/backups/clubhub-2026-10-17.sql.gz | docker compose exec -T db psql -U clubhub -d clubhub_restored
```

Test a restore once, on a throwaway database, before you need it. A backup you have never restored is
a rumour.

**Rolling back**

```bash
git checkout <the previous commit>
docker compose up -d --build
```

The code is stateless, so this is safe — as long as the change did not alter the database shape. If it
did, restore the backup first.

---

# Part 6 — What I could not test for you

I ran the deployment path without containers in this environment, and I am telling you exactly where
the line is.

**Verified:**
- migrations applied to a completely empty database, and a user registered over HTTP on it
- a production build with **no** database or secret present (this used to fail — see below)
- production mode correctly hiding `/demo` (404) while `/` and `/sign-in` work
- the standalone build serving its CSS
- `deploy:check` passing on a healthy deployment, and failing on a short `AUTH_SECRET`, a bogus
  `RATE_LIMIT_DRIVER`, and demo mode left on

**Not verified:** there is no Docker daemon here, so the image was never built and Compose never ran
end to end. If your first `docker compose up` fails, run `docker compose logs migrate` — nine times
out of ten it is `localhost` where `db` belongs.

## Two bugs this walkthrough found (both fixed)

1. **The build used to require your production password.** Creating the database client happened at
   import time, so `npm run build` demanded `DATABASE_URL`. That means every CI run and every pull
   request would need production database credentials. The client is now created on first use, so
   **builds need no secrets**.
2. **That fix, done naively, created a new connection pool per query** — which is how I met
   `P2037: too many database connections` on a production build and not in development. The smoke
   test caught it within a minute (a page that had returned 500 for every visitor). The client is a
   real singleton now.

Both are exactly the kind of thing that only appears on a real deployment. Better that they appeared
here.

---

# The shortest possible version

If you only read one paragraph:

> Put the code on GitHub. Make a free Neon database and copy its **pooled** and **direct** connection
> strings. Import the repo into Vercel, add `DATABASE_URL`, `DIRECT_DATABASE_URL`, `AUTH_SECRET`,
> `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `DEMO_MODE=off`, `DATABASE_POOL_MAX=1`, and set the build command
> to `npx prisma migrate deploy && npm run build`. Deploy. Open `/api/health` and make sure it says
> `ready: true`. Sign up, create your college, and you are live.
