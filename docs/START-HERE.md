# START HERE — a beginner's guide to ClubHub

You don't need to know how any of this works yet. Read this file top to bottom and you'll know:
what we're building, what's already done, how to poke at it, and what happens next.

---

## 1. What are we building? (the 60-second version)

Imagine your college decides every club has to manage events properly. Right now that means:

- A WhatsApp group for announcements 📱
- A Google Form for sign-ups 📝
- A spreadsheet to count who's coming 📊
- A paper list at the door to tick people off ✔️

It breaks constantly. Two people take the last seat. 40 people sign up and 12 show up, and nobody
knows why. The basement has no internet so the door list is useless.

**ClubHub replaces all of that with one website.** Clubs create an event, students sign up, each
student gets a **QR code** (like a ticket), and at the door a club volunteer opens a page on their
phone, points the camera at the QR code, and the person is checked in.

Two things make it more than a form:

1. **Many colleges use it at the same time.** Your college's data and another college's data never
   mix. This is what "multi-tenant" means — the building has many tenants, each with their own key.
2. **It's built for reality.** Bad WiFi, 500 people clicking at once, one person being a club
   president in one club and a nobody in another — all handled on purpose.

---

## 2. The words you'll hear (plain English)

| Word | What it actually means |
| --- | --- |
| **Tenant** | One college. Its own space in the system. |
| **Club** | A student club *inside* a college — robotics, debate, drama. |
| **User** | One human being. A person is one user whether they're in 1 club or 5. |
| **Role** | What you're allowed to do. You can be *President* of Robotics and plain *Member* of Debate at the same time. |
| **Event** | Something happening on a date — a workshop, a competition. |
| **Ticket / Registration** | A student's spot in an event. |
| **QR code** | A square barcode that proves "this ticket is real". |
| **Check-in / Attendance** | Marking a student as actually arrived, by scanning their QR. |
| **Dashboard** | The screen a club leader sees — "what's coming, how many signed up". |
| **Database** | The computer's filing cabinet where everything is stored permanently. |
| **Migration** | A precise set of instructions that builds the filing cabinet's shelves. Runs once, in order. |
| **Seed** | Sample data we insert so there's something to look at (fake colleges, clubs, events). |
| **API** | The "back door" of the website, used by code instead of humans. Returns data, not pretty pages. |
| **Auth** | Logging in. Proving you are who you say you are. |
| **RBAC** | "Role-Based Access Control" — deciding what you may do based on your role. |
| **Test** | A little robot that checks the app still behaves correctly after every change. |

---

## 3. Try it yourself — click by click

The app is running right now. **The preview panel next to this chat is the website.**

> ⚠️ **Read this first:** the embedded preview is not allowed to store **cookies**, and cookies are
> how a website remembers you're logged in. That means a real sign-in cannot complete inside the
> preview — the server refuses the request before it even checks your password. This is a browser
> security rule, not a bug in our app.
>
> **You have two ways to see the app working:**
>
> | Option | How | What you get |
> | --- | --- | --- |
> | **A. Demo preview** (easiest) | Open `/demo` in the preview, then the "Open a club" buttons | The real dashboard **and club pages**, readable without signing in, with a switcher to compare roles |
> | **B. Real sign-in** | Run the app on your own machine (`npm run dev`, see §4) | The genuine login flow, cookies and all |
>
> Opening the preview link in a separate browser tab does **not** work — that address only serves
> inside the chat.

### Step 1 — Look at the front page

You should see a page titled **"One platform for every club event on campus."**

Scroll down. Note three sections:
- **The stack** — the tools we used (skip it, it's for developers)
- **How tenancy is modelled** — the college → club → member picture
- **Edge cases this build is designed around** — the six hard problems we're solving, each labelled
  with the phase (P5, P6…) where it gets built

### Step 2 — Check the app's "pulse"

Click **"API health"** in the top-right (or open `/api/health`).

You'll see something like:

```json
{"ok":true,"data":{"status":"ok","service":"ClubHub","phase":3,
 "database":{"status":"up","latencyMs":86}}}
```

**What this means:** "I'm alive, and I can reach the database in 86 milliseconds." Every real
service has a page like this — it's how robots monitor whether a website is healthy at 3 AM.

### Step 3 — Open the demo dashboard (no sign-in needed)

Click **"See the demo dashboard (no sign-in)"** on the front page, or go to `/demo`.

You'll see a **dashboard** with an amber banner explaining it's a read-only preview. (This page needs
no sign-in at all, which is why it works inside the chat frame.) Look at the data:

- **Tenant roles:** "Vadodara Institute of Technology — Owner"
- **Club roles:** Robotics Club → **President**, Debate Society → **Member**
- **Upcoming events:** real events with dates and sign-up counts

**Why this matters:** Aarav is a *boss in one club and an ordinary member in another*. That's the
hardest requirement in the whole project, and it's working.

### Step 4 — Open a club (the new part)

Scroll down the demo dashboard to the card **"Open a club as Aarav Shah"**. Click **Robotics Club**.

You are now on the club page. Three things to look at, in order:

1. **"What Aarav Shah can do here"** — a list of every action, with **Yes** or **No** next to it and a
   plain-English reason underneath. Aarav is the club's President, so everything says Yes. This list
   is generated from one file of permission rules (`src/lib/auth/rbac.ts`) that the server checks on
   every single request — not from the buttons you happen to see.
2. **Members (7)** — the real roster, each person with their role.
3. **Invite links** — the links this club has issued, with their status. Some say **used up**: those
   are one-use links that have already been used (some of them by the automatic tests — that's real
   behaviour, not mock data).

### Step 5 — See the joining page

In that Invite links table, one row is marked **"open the joining page →"**. Click it.

You get what a student sees when they open an invite in the class group:

> **You have been invited to Robotics Club**
> Club · Member · 25 uses remaining · expires 15 Nov 2026
> **Sign in and join**

**Why that row is clickable:** a link's secret part is normally shown only to the signed-in President
who created it. The sample data plants this *one* public link on purpose (it grants nothing but
ordinary membership of a demo club), so you can look at the joining experience without signing in.
Every other row keeps its secret hidden.

### Step 6 — Watch the powers change (the whole point of Phase 3)

Click **Back to the dashboard preview**, then click **Kabir Rao** under *View as:*, then open
**Robotics Club** again.

Same page, same club, same members — but now:

| | Aarav (President) | Kabir (ordinary member) |
| --- | --- | --- |
| "Change someone's role, or remove them" | **Yes** | **No** — *only the club's President can manage members* |
| "Create invite links" | **Yes** | **No** — the invite table is gone entirely |
| "Edit the club's name and description" | **Yes** | **No** |
| "Open this club's page" | **Yes** | **Yes** |

Try **Meera Patel** too: she gets events and door-scanning (Phases 4 and 5) but not member
management. Try **Nisha Verma**: she has no club role at all, yet as a college Admin she has authority
over *every* club in the college — the note under each Yes explains exactly why.

**Why this matters:** it is the same page and the same code for all four people. What changes is one
answer from one function. That is how you avoid permission bugs — the rule lives in one place instead
of being re-guessed in every screen.

### Step 7 — Look at events (new in Phase 4)

At the bottom of the club preview, the **Events** card lists this club's events with a status badge.

Look closely at one row: it says **28 Oct 2026, 9:00 am … GMT+5:30**. Now look at the database: the
very same row is stored as **03:30 UTC**. Same moment, two ways of writing it — the app stores the
precise instant and shows it in your college's timezone, so nobody has to guess whether "9:00" meant
India or London.

A few things worth noticing:

| What you see | Why it is like that |
| --- | --- |
| One event is a **Draft** | A new event is invisible until its organisers publish it. Writing an event and announcing it are deliberately two steps. |
| One says **Members only** | That event 404s for anyone outside the club — not "access denied", which would confirm it exists. |
| **waitlist on** next to a capacity | The waitlist only works once a room can fill up, so it can't be switched on without a capacity. |

When you run this signed in (§4), the same card gives you **New event**, **Publish**, **Edit** and
**Cancel** — and a published event has to be cancelled before it can be deleted, so a student's
ticket never points at something that quietly vanished.

### Step 8 — See the app defend itself

While signed out (or in the demo), visit `/dashboard` in the preview. You get bounced to the sign-in
page. You can't sneak into a protected page by typing its address — the app checks every single time.

### Step 9 — (Optional) the real sign-in experience

Sign-in needs cookies, so run the app on your own machine (§4) and use
`aarav.president@vit.ac.in` / `password123`. You'll land on the same dashboard — but this time the
app knows who you are because you *proved* it with a password.

---

## 4. Run it on your own computer

You'll need two things installed: **Node.js** (runs JavaScript outside a browser) and
**PostgreSQL** (the filing cabinet). Node 20 or newer; Postgres 17.

```bash
# 1. Get your own copy of the settings file
cp .env.example .env
#    Inside .env, set AUTH_SECRET to any long random string (32+ characters).

# 2. Download the tools the project needs (like installing apps)
npm install

# 3. Start the database and build its shelves
npm run db:start
npx prisma migrate deploy

# 4. Put sample data in it (college, clubs, people, events)
npm run db:seed

# 5. Start the website
npm run dev
#    Now open http://localhost:3000
```

**Reading that again in plain words:** install apps → switch on the filing cabinet → install the
shelves → put sample folders in → switch on the website.

---

## 5. How to check everything still works

Two commands do the checking for you. This is the habit that separates "it works on my laptop" from
real software.

```bash
npm run test          # 187 automated checks — the "robot inspectors"
npm run test:smoke    # 107 checks against the running website
```

The 187 tests answer questions like:

- *"If someone tries to sneak an event from College B into College A's data, does the filing cabinet
  slam the drawer shut?"* → Yes, it refuses. (That's not politeness; the database physically can't
  store it.)
- *"Can the same student sign up twice for one event?"* → No.
- *"If we re-run the sample data, do we get duplicates?"* → No.
- *"If two people click the same one-use invite link at the same instant, can both get in?"* → No,
  exactly one gets in.
- *"Can a club's last President remove themselves and leave the club with nobody in charge?"* → No,
  it's refused with a message telling you what to do instead.
- *"If someone from another college guesses a club's web address, what do they see?"* → A plain
  "not found" page. Nothing confirms whether that club exists.

And the 107 smoke checks drive the real website: log in, submit a bad form, try to exceed a rate
limit, read the dashboard as two different people, mint an invite link and redeem it as a brand-new
account.

**The golden rule:** before finishing any phase, we run

```bash
npm run verify
```

…which does *checking for typos* → *checking for type mistakes* → *running all 187 tests* → *building
the final version*. If any step fails, the phase isn't done. One tip: stop the preview server first
(`Ctrl-C`), because the build and the server share the same temporary folder.

---

## 6. Where we are on the map

The project is built in 7 phases. Each one ends with a review, and nothing starts until the previous
one passes.

| Phase | In plain words | Status |
| --- | --- | --- |
| 1 | Set up the empty house — tools, styles, structure | ✅ Done |
| 2 | Build the filing cabinet + install the front door lock | ✅ Done |
| 3 | Creating colleges & clubs, inviting members | ✅ Done |
| 4 | Creating events (the actual dashboard) | ✅ Done (you're here) |
| 5 | Sign-ups that can't overbook + QR tickets | ⬜ Next |
| 6 | The phone scanner + works without internet | ⬜ |
| 7 | Make it pretty and bulletproof | ⬜ |

**In plain words, right now:** you can log in, create a college, create clubs inside it, invite
people with a link that works once, and — new in Phase 4 — **create events**, write them as drafts,
publish them to the whole college, cancel them, and set a capacity with an optional waitlist. Every
time you type is stored as a precise moment in UTC and shown back in your college's own timezone.
What you *cannot* do yet is register for an event and get a QR ticket — that's Phase 5.

---

## 7. Beginner gotchas (things that trip everyone up once)

| Symptom | Cause | Fix |
| --- | --- | --- |
| **The app is "gone" after a break** | The sandbox forgets installed tools between sessions | `npm run app:up` — that one command puts everything back |
| **The preview suddenly stops responding** | The hosted machine has ~2 GB of memory; a hot-reloading dev server can get killed while compiling | `npm run app:up` (it serves a production build now, which needs a fifth of the memory). Use `APP_MODE=dev npm run app:up` only when editing code |
| Error mentions `pg_filenode.map` or "cannot open file global/…" | The database was still running while its files got swapped during a restore | `npm run db:start` — it now detects this and restarts the database |
| "Signing in…" spins forever | The server stopped while the request was in flight | The form now notices within 4 seconds and tells you. Restart with `npm run app:up` |
| Sign-in button seems to do nothing | The preview frame blocks cookies | Use the cookie-free `/demo` page — the preview cannot be opened in a separate tab |
| "Cannot connect to database" | Postgres isn't running | `npm run db:start` |
| Tests fail with `ECONNREFUSED` | Tests need the database | `npm run db:start`, then `npm run test` |
| `next: not found` after reopening the project | `node_modules` folder is not saved in snapshots | `npm install` (or `npm run app:up`) |
| Weird errors after running `verify` | The build and the server share a temp folder | Restart with `npm run app:up` |
| Editing code and nothing changes | The preview serves a production build | `APP_MODE=dev npm run app:up` while editing, then `npm run build` when you're happy |
| Changes to `.env` have no effect | The server reads settings at startup | Stop the server and run `npm run app:up` again |

---

## 8. Peek at the code (optional, gentle)

You don't need to read code to follow this project. But if you're curious, these are the friendly
doors to open:

| I want to see… | Open this file |
| --- | --- |
| The front page text | `src/app/page.tsx` |
| The dashboard screen | `src/app/(dashboard)/dashboard/page.tsx` |
| The sign-in screen | `src/app/(auth)/sign-in/page.tsx` |
| The colleges-and-clubs screen | `src/app/onboarding/page.tsx` |
| One club's page | `src/app/clubs/[clubId]/page.tsx` |
| The "you've been invited" page | `src/app/join/[token]/page.tsx` |
| The read-only club preview you just explored | `src/app/demo/clubs/[clubId]/page.tsx` |
| The event list and its buttons | `src/components/features/event/event-list.tsx` |
| The event form | `src/components/features/event/event-form.tsx` |
| **How a typed time becomes a precise moment** | `src/lib/format/date.ts` — `wallClockToUtc` |
| **Who is allowed to do what** | `src/lib/auth/rbac.ts` — the whole permission table in one file |
| The rules for a valid email/password | `src/lib/validation/auth.ts` |
| The shape of the whole database | `prisma/schema.prisma` |
| The sample data | `prisma/seed.ts` |
| The list of tasks/phases | `docs/PHASES.md` |
| Why we chose each technology | `docs/architecture.md` |

Rule of thumb while learning: **a screen lives in `src/app`, reusable pieces live in
`src/components`, thinking lives in `src/lib`.**

---

## 9. What's next, and how you can steer it

**Phase 4 is built.** Events now exist: drafts, publishing, cancelling, capacities and waitlists, all
stored in UTC and shown in your college's timezone. The three defaults from Phase 3 (invite links,
self-serve colleges, per-college club names) were accepted when you approved that phase.

**Phase 5 — sign-ups that cannot overbook, and QR tickets.** This is the phase your original
specification called the hard one:

- **Registering** for an event, with the last seat protected by a database lock — two students
  clicking "register" at the same instant for the final place cannot both get it.
- A **waitlist** that promotes people automatically (first come, first served) when someone drops out.
- A **QR ticket** for each registration, and a wallet page listing your tickets.

That is where *"the database never books more people than the room holds"* stops being a promise and
becomes a test that fires dozens of simultaneous requests at the last seat.

**How to approve Phase 4:**

```bash
npm run app:up        # start the app
npm run test:smoke    # watch it check all 107 behaviours
```

Then tell me *"Phase 4 looks good"* (or what you would like changed) and I'll start Phase 5.
