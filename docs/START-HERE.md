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

> ⚠️ One important quirk: the preview runs inside a "sandboxed frame", which sometimes blocks
> **cookies**. Cookies are how a website remembers you're logged in. If sign-in seems to do nothing
> in the preview, **open the preview link in a new browser tab** and it'll work.

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

### Step 3 — Log in as a club president

1. Click **"Sign in"** (top right).
2. Type: `aarav.president@vit.ac.in` / `password123`

You'll land on a **dashboard**. Look closely — this is the important part:

- **Tenant roles:** "Vadodara Institute of Technology — Owner"
- **Club roles:** Robotics Club → **President**, Debate Society → **Member**
- **Upcoming events:** real events with dates and sign-up counts

**Why this matters:** Aarav is a *boss in one club and an ordinary member in another* — from **one
single login**. That's the hardest requirement in the whole project, and it's working.

### Step 4 — Log in as an ordinary member

Sign out (top right) and sign in as `kabir.member@vit.ac.in` / `password123`.

Same dashboard — but **no "President" anywhere**. Same software, different powers. That's RBAC.

### Step 5 — See the app defend itself

Try to visit `/dashboard` **while logged out** (sign out first, then edit the address bar to
`/dashboard`). You get bounced to the sign-in page. You can't sneak in by typing a URL.

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
npm run test          # 51 automated checks — the "robot inspectors"
npm run test:smoke    # 25 checks against the running website
```

The 51 tests answer questions like:

- *"If someone tries to sneak an event from College B into College A's data, does the filing cabinet
  slam the drawer shut?"* → Yes, it refuses. (That's not politeness; the database physically can't
  store it.)
- *"Can the same student sign up twice for one event?"* → No.
- *"If we re-run the sample data, do we get duplicates?"* → No.

And the 25 smoke checks drive the real website: log in, submit a bad form, try to exceed a rate
limit, read the dashboard as two different people.

**The golden rule:** before finishing any phase, we run

```bash
npm run verify
```

…which does *checking for typos* → *checking for type mistakes* → *running all 51 tests* → *building
the final version*. If any step fails, the phase isn't done.

---

## 6. Where we are on the map

The project is built in 7 phases. Each one ends with a review, and nothing starts until the previous
one passes.

| Phase | In plain words | Status |
| --- | --- | --- |
| 1 | Set up the empty house — tools, styles, structure | ✅ Done |
| 2 | Build the filing cabinet + install the front door lock | ✅ Done (you're here) |
| 3 | Creating colleges & clubs, inviting members | ⬜ Next |
| 4 | Creating events (the actual dashboard) | ⬜ |
| 5 | Sign-ups that can't overbook + QR tickets | ⬜ |
| 6 | The phone scanner + works without internet | ⬜ |
| 7 | Make it pretty and bulletproof | ⬜ |

**In plain words, right now:** you can log in, and you can *see* your clubs and roles. But you can't
yet *create* a club or an event — that's Phases 3 and 4.

---

## 7. Beginner gotchas (things that trip everyone up once)

| Symptom | Cause | Fix |
| --- | --- | --- |
| Sign-in button seems to do nothing | Preview frame blocks cookies | Open the preview in a new tab |
| "Cannot connect to database" | Postgres isn't running | `npm run db:start` |
| `next: not found` after reopening the project | `node_modules` folder is not saved in snapshots | `npm install` |
| Weird errors after running `verify` | The build and the dev server share a temp folder | Restart `npm run dev` |
| Changes to `.env` have no effect | The server reads settings at startup | Stop and restart `npm run dev` |

---

## 8. Peek at the code (optional, gentle)

You don't need to read code to follow this project. But if you're curious, these are the friendly
doors to open:

| I want to see… | Open this file |
| --- | --- |
| The front page text | `src/app/page.tsx` |
| The dashboard screen | `src/app/(dashboard)/dashboard/page.tsx` |
| The sign-in screen | `src/app/(auth)/sign-in/page.tsx` |
| The rules for a valid email/password | `src/lib/validation/auth.ts` |
| The shape of the whole database | `prisma/schema.prisma` |
| The sample data | `prisma/seed.ts` |
| The list of tasks/phases | `docs/PHASES.md` |
| Why we chose each technology | `docs/architecture.md` |

Rule of thumb while learning: **a screen lives in `src/app`, reusable pieces live in
`src/components`, thinking lives in `src/lib`.**

---

## 9. What's next, and how you can steer it

**Phase 3 — creating colleges and clubs, and inviting people.** Before I write any code, three
choices are yours to make (or you can just say "use your defaults"):

1. **How do people join a club?**
   - *Invite links* (recommended): the president generates a link, sends it in the class WhatsApp
     group, anyone who clicks it joins. No email system needed.
   - *Add by email*: the president types your email address; only works if you already have an
     account.
   - *Both*.

2. **Who can create a college in the system?**
   - *Anyone* (recommended): sign up, create your college, you're its Owner.
   - *Approval needed*: only we can create colleges.

3. **Can two clubs in the same college have the same name?**
   - *No* (recommended) — keeps links tidy and unique.

Say **"go with your defaults"** and I'll build Phase 3, then show you exactly how to test it
yourself — same as this walkthrough.
