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
> | **A. Demo preview** (easiest) | Open `/demo` in the preview | The real dashboard data, readable without signing in, with a switcher to compare roles |
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
{"ok":true,"data":{"status":"ok","service":"ClubHub","phase":2,
 "database":{"status":"up","latencyMs":86}}}
```

**What this means:** "I'm alive, and I can reach the database in 86 milliseconds." Every real
service has a page like this — it's how robots monitor whether a website is healthy at 3 AM.

### Step 3 — Open the demo dashboard (no sign-in needed)

Click **"See the demo dashboard (no sign-in)"** on the front page, or go to `/demo`.

You'll see a **dashboard** with an amber banner explaining it's a read-only preview. Look at the data:

- **Tenant roles:** "Vadodara Institute of Technology — Owner"
- **Club roles:** Robotics Club → **President**, Debate Society → **Member**
- **Upcoming events:** real events with dates and sign-up counts

**Why this matters:** Aarav is a *boss in one club and an ordinary member in another*. That's the
hardest requirement in the whole project, and it's working.

### Step 4 — Switch to an ordinary member (the real proof)

At the top of the demo page, click **"Kabir Rao"** under *View as:*.

Same page, same clubs, same events — but **no "President" anywhere**. Same software, different
powers. That's RBAC. You can also try **Meera Patel** (Event Manager) and **Nisha Verma** (college
admin with no club role).

### Step 5 — See the app defend itself

While signed out (or in the demo), visit `/dashboard` in the preview. You get bounced to the sign-in
page. You can't sneak into a protected page by typing its address — the app checks every single time.

### Step 6 — (Optional) the real sign-in experience

Sign-in needs cookies, so run the app on your own machine (§4) and use
`aarav.president@vit.ac.in` / `password123`. You'll land on the same dashboard — but this time the
app knows who you are because you *proved* it with a password.

### Step 7 — Your colleges and clubs

Go to `/onboarding` (or click **"Create or browse clubs"** on the dashboard).

You'll see **Vadodara Institute of Technology** with its two clubs, each showing *your* role:
**Robotics Club → President**, **Debate Society → Member**. Because you're a college Owner, a
**Create a club** box sits right there — in real life that's how a new club gets started.

### Step 8 — Open a club and make an invite link

Click **Robotics Club**. You get its member list, its upcoming events, and an **Invite links** box.
Set the role you're giving away (Member / Event Manager / President), how long the link lasts and how
many times it can be used, then **Create link** and **Copy**.

**Why this is clever:** the link *is* the permission. Whatever role you picked is the role the person
gets — they cannot upgrade themselves, and a 1-use link genuinely only works once, even if two people
click it in the same second.

### Step 9 — Be the person joining

Open the copied link (`/join/...`) **while signed out** — you'll see *"You have been invited to
Robotics Club as Member"* plus a **Sign in and join** button. That's the whole joining experience: no
setup, no admin approval.

*(New accounts need cookies, so this last part is smoothest on your own machine — §4.)*

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
npm run test          # 142 automated checks — the "robot inspectors"
npm run test:smoke    # 67 checks against the running website
```

The 142 tests answer questions like:

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

And the 67 smoke checks drive the real website: log in, submit a bad form, try to exceed a rate
limit, read the dashboard as two different people, mint an invite link and redeem it as a brand-new
account.

**The golden rule:** before finishing any phase, we run

```bash
npm run verify
```

…which does *checking for typos* → *checking for type mistakes* → *running all 142 tests* → *building
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
| 3 | Creating colleges & clubs, inviting members | ✅ Done (you're here) |
| 4 | Creating events (the actual dashboard) | ⬜ Next |
| 5 | Sign-ups that can't overbook + QR tickets | ⬜ |
| 6 | The phone scanner + works without internet | ⬜ |
| 7 | Make it pretty and bulletproof | ⬜ |

**In plain words, right now:** you can log in, create a college, create clubs inside it, see who is
in each club, change someone's role, and invite people with a link that can be used once. What you
*cannot* do yet is create events — that's Phase 4, and it's the next thing we build.

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

**Phase 3 is built** — using the three defaults I proposed, because you said "start phase 3" without
picking between the options. Here is exactly what that means, so you can change any of it:

1. **How people join → invite links.** The president creates a link, shares it in the class group,
   anyone with the link joins. (You can still restrict a link to one email address if you want.)
   *Alternative:* email invitations, which would need an email-sending service.
2. **Who can create a college → anyone.** Sign up, create your college, you're its Owner.
   *Alternative:* only you approve new colleges.
3. **Club names → unique per college.** Two colleges can both have a "Robotics Club"; inside one
   college the second one becomes "Robotics Club 2" in the web address.

If you'd rather have email invitations or an approval step, say so — it's cheaper to change now than
after events are built on top.

**Phase 4 — creating events.** This is the dashboard people actually came for: an event with a title,
description, start and end time, venue, capacity, a "members only" switch, and Draft → Published →
Cancelled. Two of your original requirements land here: **all times are stored in UTC** and shown in
the college's timezone, and an event whose end time is before its start time is rejected on the
server (not just in the browser).

**How to approve Phase 3:**

```bash
npm run app:up        # start the app
npm run test:smoke    # watch it check all 67 behaviours
```

Then tell me *"Phase 3 looks good"* (or what you'd like changed) and I'll start Phase 4.
