# ClubHub — the complete tour

Every feature from all seven phases, in the order they were built, with the exact clicks to see
each one.

There are **two ways to look at the app**, and the difference matters:

| | What it is | What you can do |
| --- | --- | --- |
| **The demo preview** | `/demo/...` pages. **No sign-in, no cookies.** | Everything *readable*: dashboards, clubs, events, tickets, the door, attendance. Nothing that writes. |
| **The real app** | `/dashboard`, `/clubs`, `/events`... **requires a password.** | Everything: create, publish, register, scan, invite, change roles. |

Why the split exists: the app opens inside a chat preview frame, and a frame like that is not
allowed to store the cookie a login needs. So the demo renders the same data through the same code,
read-only. The tour below covers both, and tells you which is which.

---

## The 60-second version

Paste these five links, one after another. If they all work, the whole build is alive.

| # | Link | What you should see |
| --- | --- | --- |
| 1 | `/` | The landing page, with a **build roadmap** showing all seven phases |
| 2 | `/demo?as=aarav` | A dashboard: your colleges, your clubs, your tickets |
| 3 | `/demo/clubs/0f1d2c3b-4a59-4e6d-8b7c-200000000001?as=aarav` | Robotics Club: members, permissions, events |
| 4 | `/demo/events/0f1d2c3b-4a59-4e6d-8b7c-300000000005?as=aarav` | Open House — a live event, 4 of 40 seats taken |
| 5 | `/demo/events/0f1d2c3b-4a59-4e6d-8b7c-300000000005/door?as=aarav` | **The door** — the scanner, and the offline test |

Everything except links 1 and 2 needs the correct prefix. All demo links start with `/demo`.

---

## The cast

Four seeded people. Swap between them at any time with the **View as** buttons at the top of any
demo page — or by changing `?as=` in the address.

| Key | Person | Role | Why they are interesting |
| --- | --- | --- | --- |
| `aarav` | Aarav Shah | Owner of the college · **President** of Robotics · plain *Member* of Debate | Powerful in one club, ordinary in the other |
| `meera` | Meera Patel | **Event Manager** of Robotics | Can run events and the door, **cannot** manage members |
| `kabir` | Kabir Rao | Plain **Member** of both clubs | The restricted view — no rosters, no scanner |
| `dean` | Nisha Verma | **College Admin** | Authority over the whole college, but no club role |

Password for all four, for the signed-in version: `password123`.

The seeded world: **1 college**, **2 clubs** (Robotics, Debate Society), **5 events**, **12 tickets**,
**5 check-ins**.

| Event | When | State |
| --- | --- | --- |
| Open House — Robot Demos | **today**, 7:32 pm – 10:00 pm | 4 / 40 taken, 1 already inside — *the door demo* |
| Debug Night: RoboWars Warm-up | 21 Oct | 3 / 3 — **full**, 1 person waiting |
| Inter-College Parliamentary Debate | 22 Oct | Debate Society |
| RoboWars 2026 — Qualifiers | 29 Oct | 4 / 120 |
| Line-Follower Workshop | 7 Nov | **Draft**, members only |

---

# Phase 1 — The foundation

**What was built:** the app itself, the page shell, the API envelope, the health check.

### Demo preview
- **`/`** — the landing page. Scroll: the seven-phase roadmap is a live status board, not a
  marketing list.
- **`/api/health`** — JSON. This is the app reporting on itself.

### What to look at
On the landing page, every phase row has a coloured badge: *Complete* or *In progress*. That badge
is rendered from a single config file (`src/config/site.ts`), so the app can never drift out of step
with what was actually built.

---

# Phase 2 — Database, accounts and the permission model

**What was built:** Postgres + Prisma, password sign-in, colleges ("tenants"), the session, rate
limiting, and the sample data everything else runs on.

### Demo preview
- **`/sign-in`** — the real login form. On the hosted preview it cannot complete (no cookies in a
  frame); it explains that instead of spinning forever.
- **`/sign-up`** — account creation form, with full validation.

### The real app (your own machine, §4 of `START-HERE.md`)
- Sign in as `aarav.president@vit.ac.in` / `password123` → you land on **`/dashboard`**.
- Type a **wrong** password → you get a specific message, never an infinite spinner.
- Sign up a new account and watch the rate limiter refuse the sixth rapid attempt.

### What this phase proves
Try `/dashboard` while signed out (in the preview or a private window): you are bounced to sign-in.
You cannot reach a protected page by typing its address — access is decided on every request by the
server, not by hiding buttons.

---

# Phase 3 — Colleges, clubs, roles and invites

**What was built:** create a college, create clubs inside it, invite people by link, and a
permission matrix that answers "may *this person* do *this thing*".

### Demo preview — the best fifteen minutes in the whole app
Open **`/demo/clubs/0f1d2c3b-4a59-4e6d-8b7c-200000000001?as=aarav`** (Robotics Club), then press each
**View as** button in turn and watch the *same page* rewrite itself:

| As | Members list | The permission table | Invite links |
| --- | --- | --- | --- |
| **Aarav** (President) | full, with role controls | eleven green ticks | visible |
| **Meera** (Event Manager) | visible | *scan the door* yes, *manage members* **no** | no |
| **Kabir** (Member) | **hidden** | mostly red crosses | no |
| **Nisha** (College Admin) | visible, but no club role | authority without membership | no |

Nothing about the page changed except **who the server thinks you are**. That is the entire point of
multi-tenancy.

### The joining page
Open **`/join/demo-invite-robotics-club-000000000001`**. This is what a stranger with an invite link
sees: which club, which college, what role they would get, and what clicking Join would do. The
button is read-only in the preview; in the real app it adds you to the club.

### The real app
`/onboarding` → create a club → the club page → **Invites** card → generate a link → open it in a
private window → join as a new account.

### What this phase proves
An invite link is a secret with rules: it expires, it can be single-use, it can be revoked, and
redeeming it is refused if you are in another college. All four are enforced in SQL, not in the
browser.

---

# Phase 4 — Events

**What was built:** full event lifecycle — draft → published → cancelled, with capacity, visibility,
and every time stored in UTC but shown in the college's own clock.

### Demo preview
Open the club page again and look at the **Events** table:

- **Open House** — published, whole college, happening now
- **Debug Night** — published, 3 / 3, "1 waiting"
- **RoboWars 2026** — published, 4 / 120
- **Line-Follower Workshop** — **Draft**, members only

As **Kabir**, that last row **disappears entirely**. As Aarav or Meera it is there. A draft is not a
greyed-out row for students — it does not exist.

### The timezone proof
Every event shows two timestamps and the zone abbreviation, e.g. `21 Oct 2026, 7:00 pm ·
GMT+5:30`. Those are stored in UTC in the database and converted for display by the college's IANA
zone (`Asia/Kolkata`). Change a college's timezone and every date on every page moves with it — no
data migration, no stored local times to fix.

### The real app
Club page → **New event** → leave the end time before the start → the server refuses with an error
attached to the *end* field. That's server-side Zod validation: the browser form is a convenience,
never the authority.

---

# Phase 5 — Tickets, capacity and the queue

**What was built:** RSVP with a hard capacity limit that survives simultaneous requests, a FIFO
waitlist that promotes itself, and a QR ticket per person.

### Demo preview
Open **`/demo/events/0f1d2c3b-4a59-4e6d-8b7c-300000000004?as=aarav`** (Debug Night — the full one) and
switch viewers:

| As | What you get |
| --- | --- |
| **Aarav** (holds a seat) | *You are registered* + a **QR code**, and below it the guest list and the waitlist |
| **Kabir** (waiting) | *On the waitlist — number 1*. **No QR code**, because a place in a queue is not a seat. And **no guest list** — students don't see who else is coming |

Same event. Same instant. Two different truths, both decided on the server.

Then open **Open House** (`...300000000005`) as Aarav: that one has room, so he sees a real QR plus a
**door code** printed underneath it.

### The concurrency proof (the best story in the build)
The rule is: **a room never sells more seats than it has.** This was proven by firing 20 simultaneous
registrations at a 5-seat event:

- without the database row lock: **10 people got into a 5-seat room**
- with it: exactly **5** got seats, **15** joined the queue, **20** rows total

The test still exists in `tests/integration/tickets.test.ts`. It is not a claim, it is a measurement.

### The real app
Sign in as Kabir → open Debug Night → **Join waitlist**. Sign in as Aarav → **Cancel my spot** →
Kabir is promoted **automatically**, and Aarav is told by name: *"Kabir Rao just moved up from the
waitlist and took your seat."*

---

# Phase 6 — The door

**What was built:** a mobile-first scanner; an offline queue that survives a dead network; and an
attendance sheet.

### Demo preview — this is the centrepiece
**`/demo/events/0f1d2c3b-4a59-4e6d-8b7c-300000000005/door?as=aarav`**

The page has four parts, top to bottom:

1. **Is the door open?** — a live verdict computed from the event's day and the 3-hour grace period.
   Debug Night says *"not today yet"*; Open House says *open*.
2. **The scanner** — a camera square (needs a real phone; says so), and a **typed code** box.
3. **The offline test** — the part to actually do. See below.
4. **What the scanner would say** — one row per ticket, with the verdict the server would return.

### Do this: the offline drill
In the card titled **"Offline test: scan three people with no signal"**:

1. Press **Simulate: go offline**.
2. Press **Scan** on each of the three people marked *expected*.
   → **Pending 3**. Nobody is inside yet: the phone has not told the server anything.
3. Press **Reconnect & sync**.
   → **Pending 0**, **Saved rows 1 → 4** — exactly three new rows.
4. Press **Scan** on somebody again and sync again.
   → **Saved rows refuses to move.** That is idempotency, visible.
5. Scan the person who was already inside.
   → amber **"already checked in"** — a receipt, not an error.

### Why it works offline (and why it is safe)
Before the door opens the phone downloads a **guest list** with a **fingerprint** of each ticket — a
one-way hash — and **no secrets**. With no signal it hashes what it scanned and compares. A stolen
phone cannot mint tickets, because a fingerprint doesn't reverse.

### The real version
Sign in as Aarav → `/door` lists every door you may work → open one. Real camera, real queue stored
in the phone's local storage, real batch upload to `/check-in/sync`, plus a per-phone scan log with
pending/rejected counts. Then `/events/<id>/attendance` shows the sheet: registered, checked in,
no-shows, turn-up rate, and **the time each person actually walked in** (taken from the phone, not
from when the signal came back).

### What this phase proves
Three scans that sync twice still produce **three** rows — that assertion is in the integration
suite, and the smoke test repeats it over HTTP.

---

# Phase 7 — Polish and observability

**What was built:** one error-handling bridge for the whole UI, optimistic updates with rollback,
empty states, error boundaries, real browser layout tests, and structured logs with a readiness
probe.

Most of this phase is *deliberately invisible*: it only shows up when something goes wrong.

### Try these four things

| Do this | What happens |
| --- | --- |
| Visit **`/nonsense`** | *"There is nothing at this address"* — a real page with two ways back, not a blank screen and not a stack trace |
| Press **Tab** the moment any page loads | A **Skip to content** link appears first; keep tabbing and every control shows a focus ring |
| Open **`/api/health`** | `ready: true` only when Postgres answers **and** migrations have been applied; also latency, migration name, version, whether demo mode is on |
| Read the server log (your own machine) | One JSON line per API request: `requestId`, method, path, status, `durationMs`, user id, tenant id, role |

### What "human-readable failure" means in practice
Every screen now talks to the API through one bridge (`src/lib/api/client.ts`). Before it, three
things failed silently:

- Wi-Fi died → the button just stopped spinning
- a proxy returned HTML → a JSON parse error nobody saw
- a request hung → forever

All three now produce a sentence plus a **reference id** that matches the exact line in the server
log. A screenshot of "ref 4f9a2c1e" is enough to find the request.

### Optimistic updates with rollback
In the real app, press **Publish** on a draft event: the badge turns green **immediately**. If the
server refuses, the badge snaps back and a toast explains why. The hard part — knowing when the
guess stops being a guess — is covered by nine unit tests.

### The browser test
`npm run test:layout` opens seven pages in headless Chromium at **360, 390, 768, 1024 and 1440 px**
and fails if:

- anything sticks out sideways (a horizontal scrollbar)
- an image has no `alt`
- a button or link has no accessible name
- a field has no label
- a page has more than one `<h1>`

100 assertions. The overflow detector was itself verified by injecting a deliberately 2000 px
element and watching it fail — a test that cannot fail is not a test.

---

# The whole thing, as one table

| Phase | Feature | See it at |
| --- | --- | --- |
| 1 | Landing page, roadmap, envelope, health | `/` · `/api/health` |
| 2 | Sign-in, sign-up, rate limiting, session | `/sign-in` · `/sign-up` · `/dashboard` (signed in) |
| 3 | Colleges, clubs, RBAC matrix, invites, joining | `/demo/clubs/<club>?as=…` · `/join/demo-invite-robotics-club-000000000001` |
| 4 | Event lifecycle, drafts, visibility, UTC→local time | `/demo/clubs/<club>?as=kabir` vs `?as=aarav` |
| 5 | Seats, capacity race, waitlist, QR ticket | `/demo/events/<event>?as=…` |
| 6 | Scanner, offline queue, idempotency, attendance | `/demo/events/<event>/door?as=aarav` |
| 7 | Error pages, keyboard access, logs, readiness | `/nonsense` · Tab key · `/api/health` |

### Demo links you can paste

```
/demo?as=aarav
/demo?as=meera
/demo?as=kabir
/demo?as=dean

/demo/clubs/0f1d2c3b-4a59-4e6d-8b7c-200000000001?as=aarav     ← Robotics Club
/demo/clubs/0f1d2c3b-4a59-4e6d-8b7c-200000000002?as=aarav     ← Debate Society

/demo/events/0f1d2c3b-4a59-4e6d-8b7c-300000000005?as=aarav    ← Open House (today, seats left)
/demo/events/0f1d2c3b-4a59-4e6d-8b7c-300000000004?as=kabir    ← Debug Night (full, waitlisted)
/demo/events/0f1d2c3b-4a59-4e6d-8b7c-300000000002?as=kabir    ← members-only draft: not even visible
/demo/events/0f1d2c3b-4a59-4e6d-8b7c-300000000005/door?as=aarav   ← the door + offline drill
```

---

# Prove it yourself

Six commands. The first two run offline in seconds.

```bash
npm run test          # 299 automated checks (unit + integration, real Postgres)
npm run test:smoke    # 178 checks over HTTP against the running site
npm run test:layout   # 100 checks in a real browser, 5 widths
npm run verify        # lint → types → 299 tests → production build
npm run db:seed       # reset the sample data
npm run app:up        # start the app on http://localhost:3000
```

Each one answers a different question:

| Command | The question it answers |
| --- | --- |
| `test` | Does the logic hold, including the two-people-at-once cases? |
| `test:smoke` | Does the deployed app actually behave — auth, 403s, 422s, the door? |
| `test:layout` | Does it work on a phone, with a keyboard, with a screen reader? |
| `verify` | Would I ship this right now? |

---

# The honest caveats

Things the preview **cannot** show, and where to see them instead:

| Not visible in the chat preview | Because | See it instead |
| --- | --- | --- |
| Signing in | A frame can't store the cookie a session needs | Run it locally (`npm run dev`) |
| Creating / editing / publishing | The preview is read-only by design — a preview that mutated the database would be one you couldn't trust | Local run, or `/sign-in` in a normal tab |
| The camera | Needs a real phone and permission | Local run on a phone |
| Actual network loss | The demo simulates it honestly | Local run: turn Wi-Fi off mid-queue |

Everything else — every role, every permission decision, every event, every ticket, every verdict at
the door — is the **real** data, rendered by the **real** components, run through the **real** rules.
The preview is not a mock-up; it is the app with the write buttons removed.
