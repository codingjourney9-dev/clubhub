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
> **If you see a grey page saying “403 FORBIDDEN — MISSING TRAFFIC ACCESS TOKEN”, nothing is broken.**
> That page comes from the sandbox that hosts the app, not from ClubHub. Every request into the
> sandbox must carry a short-lived pass, and the chat's preview panel attaches it automatically — a
> normal browser tab cannot, so it is turned away at the door. **Fix: come back to the chat and use
> the preview panel.** Don't paste the address into a new tab.
>
> If the preview panel itself is blank or stuck, the server has probably gone to sleep between
> sessions — say so in the chat and it will be restarted (the data is kept).

> **Want everything in one place?** [`docs/TOUR.md`](./TOUR.md) lists every feature from all seven
> phases with the exact link to see it. This file is the slower, learn-by-doing version.

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

### Step 8 — Take a seat (new in Phase 5)

Open the Robotics Club preview and look at the **Events** card. One event — **Debug Night** — is
deliberately tiny: **3 seats, 3 taken, and one person waiting**.

Click that event's name. You'll land on its own page, showing the time in your college's timezone,
a capacity bar that is completely full, and a line saying **1 waiting**.

Now use the **View as** buttons at the top and watch the *same page* tell a different story:

| View as | What you see |
| --- | --- |
| **Aarav** (President) or **Meera** (Event Manager) | *You are registered* — and their **QR code**, the square black-and-white image that gets scanned at the door. Below it, the **guest list**: the three people with seats, and a separate **waitlist** with Kabir at place 1. |
| **Kabir** (plain member) | *On the waitlist — number 1*. **No QR code**, because a place in a queue is not a seat. And no guest list: students don't get to see who else is coming. |

That last contrast is the whole point of the phase. Same event, same instant, three different truths
— and none of them is decided in the browser. Switch to Kabir and then back to Aarav: nothing about
you changed except who the server thinks you are.

**What happens when somebody gives a seat back?** Kabir moves up *automatically* — no email, no
refresh by an organiser, no admin clicking "promote". If you run the app on your own machine (§4),
you can watch it happen: register for a one-seat event as one account, register a second account (it
joins the queue), then cancel the first. The second person is registered before the page finishes
reloading, and the canceller is told so: *"Meera Patel just moved up from the waitlist and took your
seat."*

### Step 9 — Work the door (new in Phase 6)

This is the phase where the app leaves the laptop and goes to a real room with a real queue of
people and, usually, terrible Wi-Fi.

**First, the paper version.** Go back to the Robotics Club preview and open an event you hold a
ticket for. Under your QR code there is now a line like **Door code: 4F1A 9C02**. That short code is
not a second ticket — it is the last few characters of the same secret, printed so a human can type
it. In a real room you would print the ticket or read it off the student's phone.

**Then the door itself.** On the event page, click **Open the door**. You get a dark, phone-shaped
scanner screen:

| Part of the screen | What it does |
| --- | --- |
| The big camera square | Scans a QR code. **This needs a real phone with a camera** — in the chat preview, or on a laptop without one, it will simply say there is no camera. That is expected, not a bug. |
| **Type the door code** | The always-works fallback. Type `4F1A 9C02` (any case, with or without spaces) and press **Check in**. Use this in the preview. |
| The green / amber / red panel | The verdict. Green = let them in. Amber = they are already inside. Red = they are not on the list. |
| **Pending / rejected** counters | Scans the phone has accepted but the server has not confirmed yet, and scans the server refused. |

Try it in the read-only demo: open **Open House** from the Robotics Club preview and click
**Open the door**. The demo version does not write anything, so you can press every button safely.
Use the **View as** switcher at the top: as Aarav or Meera you are staff and see the whole door page;
as Kabir you are a student and get told you are not allowed.

**The three answers you will see** — these are the same three the real organiser sees:

| Verdict | Plain English |
| --- | --- |
| **CHECKED IN** | Green. Their ticket is valid, it belongs to this event, and this was the first time. |
| **ALREADY CHECKED IN** | Amber, *not* an error. Somebody scanned the same ticket twice (or the same person tried again because the queue behind them pushed them back). The app tells the volunteer "already inside, at 7:41" instead of flashing a scary failure. |
| **WAITLISTED / CANCELLED / NOT FOUND** | Red. Not a seat, a seat given back, or a code that belongs to a different event (or to nobody). |

**Now the interesting part — the bad Wi-Fi test.** This is the requirement the whole phase exists
for, and you can watch it in the demo door: the screen has a **Simulate: go offline** button. Press
it, and the phone "loses" its connection.

The **Open House** list has four people on it. One is already inside (the demo starts you mid-event)
and **three are still outside**. Press **Scan** on each of those three. Each one is answered
**from the guest list the phone already downloaded** before the signal died — the list holds a
fingerprint (a one-way code) for every ticket, and none of the secrets. The three scans pile up in a
queue on the phone, and the counter reads **Pending 3**. Nothing has claimed anybody is inside yet.

Press **Reconnect & sync**. The phone uploads the queue in one batch, the counter drops to
**Pending 0**, and **Saved rows** goes from 1 to 4: exactly three new rows, not six, not zero.

Press **Scan** on somebody again and then sync again if you like — "Saved rows" refuses to move. Now
try it with the person who was already inside, and you get the amber answer instead: *already
checked in*. That is a receipt, not a failure.

Why not more than three? Because every scan carries its own little identity tag (`scanUuid`). If the phone is unsure
whether the batch got through — say the connection came back for a second and dropped again — it
sends the batch again. The server recognises each tag it has already seen and answers *"yes, I have
that one"* without writing a second row. Sending the same batch ten times still leaves three rows.
If you run the app yourself (§4), you can prove it with the real thing instead of the demo
button: turn off Wi-Fi on the laptop mid-queue, scan, turn it back on.

**Why the fingerprint matters.** The phone cannot check a password-like secret it does not have. So
the server sends a *fingerprint* — the result of a one-way scramble of the secret. The phone scrambles
what it scanned and compares the two scrambled values. If they match, the ticket is real. The original
secret never leaves the server, so a stolen phone does not hand out free tickets.

### Step 10 — Read the attendance sheet

From the door page, open **Attendance** (or the link on the event page). You get four numbers —
registered, waitlisted, checked in, and the turn-up rate — and one row per seat with the time each
person actually walked in, in your college's timezone. The times come from the phone, not from when
the server heard about it, so a scan at 7:41 that syncs at 8:15 still reads 7:41.

### Step 11 — Watch it fail gracefully (new in Phase 7)

Everything so far showed the app working. This step is about the other half of a real product: what
somebody sees when something goes wrong.

**A wrong address.** Type `/nonsense` after the preview's address. You get a page that says *"There
is nothing at this address"* and offers two ways back — not a white screen, and not a stack trace.
Deliberately, it does not say whether the thing exists but belongs to another college; that would
leak who exists.

**An HTTPS error, not a dead button.** Every failure in the app now arrives as a sentence with a
small reference code. The reference is the same id as the server's log line, so "it said *ref
4f9a2c1e*" is a thing a real user can report and an engineer can find in ten seconds.

**The app says what it is doing.** Open `/api/health` in the preview. It is meant for machines, but
read it once: `ready: true` only when the database answers *and* the migrations have been applied,
plus latency, the migration name, the version, and whether demo mode is on. A deploy that forgot to
migrate shows `degraded` with a 503 rather than serving errors while looking healthy.

**The polite side of a slow connection.** Pages that take a moment now show their shape — grey
placeholders where the cards will be — instead of an empty page. You will see it on the dashboard on
a slow connection (this is the one place a skeleton is safe; see the note in `docs/PHASES.md` about
why a loading skeleton and a 404 status cannot coexist on the same route).

**Keyboard-only, one press.** Press <kbd>Tab</kbd> as soon as any page loads. The first thing that
appears is a **Skip to content** link — the shortcut screen-reader and keyboard users expect. Every
button, link and field then shows a clear focus ring.

### Step 12 — See the app defend itself

While signed out (or in the demo), visit `/onboarding` (the page for starting a club) in the preview.
You get bounced to the sign-in page. You can't sneak into a protected page by typing its address — the
app checks every single time. (`/dashboard` used to be protected too; since Phase 8 guests may look at
it, and it shows them only public events.)

### Step 12½ — Browse as a guest (new in Phase 8)

1. Open the front page (`/`). The big orange button now says **Explore events as a guest**. Click it.
2. You land on **What's on across campuses** — every published event marked *open to everyone*, from
   every college. Nobody asked you to sign in.
3. Each card is a little ticket stub: date on the left, the college on top, and seats on the bottom
   right (**36 seats left**, **Only 5 left**, **Full · waitlist open**, or **Happening now**).
4. Click **RoboWars 2026 — Qualifiers**. You can read everything about it, and the box on the right
   says **Sign in to get a ticket**. Members-only events and drafts never appear here.
5. Go back and click the round **Start a new club** button in the bottom-right corner. A small box
   explains that a club needs a President, with **Create an account** and **I have an account**.
6. Click **I have an account**. The sign-in page now says *why* you're there: "Starting a club needs an
   account, so we know who its President is." After signing in you're taken straight to club creation.

### Step 12¾ — Posters, tags and links (new in Phase 9)

1. Go to the guest board (`/dashboard`, or **Explore events as a guest** on the front page). Cards now
   show the event's **poster** and small **tags** like *Technical* or *Talk*.
2. Under **Upcoming events** there's a row of round buttons: **All, Technical, Cultural, Workshop…**
   Click **Talk**. Only the debate is left. Click **All** to see everything again.
3. Click **RoboWars 2026 — Qualifiers**. Below the ticket box is **Follow along**: an **Instagram**
   button (anyone can use it) and a grey line with a padlock: **Get a ticket to join the WhatsApp
   group**. The link itself is not on the page at all — not even hidden.
4. See the difference a ticket makes: open `/demo`, click **Robotics Club**, then click
   **Debug Night: RoboWars Warm-up**. Use the **View as** buttons at the top:
   - **Kabir Rao** is only on the *waitlist* → he sees the padlock line.
   - **Aarav Shah** runs the club → he sees a green **Join the WhatsApp group** button.
5. *(On your own computer, signed in as Aarav)* open the Robotics Club page and click **Edit** on an
   event. New fields:
   - **Tags** — click up to three; the rest grey out.
   - **Poster link** — paste an image link. From Google Drive: right-click the file → **Share** →
     *General access* → **Anyone with the link** → **Copy link**, then paste. A small preview appears.
     Paste an Instagram post link instead and it tells you why that won't work.
   - **Instagram** — `@yourclub` is enough.
   - **WhatsApp group** — the group's invite link; the hint reminds you only ticket holders see it.

> The WhatsApp link on the demo events is a dummy (`DemoInviteCodeClubHub0001`) — it won't open a real
> group.

### Step 12⅞ — Leads, one President, announcements (new in Phase 10)

What changed in plain words: the old "Event Manager" is now called a **Lead**. Leads can remove ordinary
members; only the **President** can remove Leads, promote people, or **hand the club over**. A club has
exactly one President — the database itself refuses a second. Leads and the President can post
**announcements** that only club members see.

**In the preview (no sign-in):**

1. Open `/demo` and click **Robotics Club** in the club list.
2. Near the top, the **Announcements** card shows two posts. The first has a small **PINNED** label —
   it stays on top. One was written by Meera, marked **Lead**.
3. Scroll to **What this person can do here**. Click **View as → Meera Patel** at the top. Ticks:
   *Remove a Member*, *Post announcements*. Crosses: *Remove a Lead*, *Hand over the presidency*. Now
   click **Aarav Shah** — everything is ticked.
4. Click **View as → Kabir Rao**: he can *read* announcements but not post them.
5. Click **Back to … dashboard**. As Kabir there is a new **From your clubs → Announcements** section.

**On your own computer (signed in — this is where the buttons are):**

6. Sign in as `meera.manager@vit.ac.in` / `password123` → **Dashboard** → **Robotics Club**.
   - Type a **Title** and a **Message**, click **Post to members**. It appears in the list below.
   - In **Members**, a red **Remove** button sits next to ordinary members only — none next to Aarav
     (President) or yourself.
7. Sign out (the arrow at the top right), sign in as `aarav.president@vit.ac.in`.
   - Next to each member is a dropdown: **Member** / **Lead**. Change one and a message confirms it.
   - Click **Hand over presidency** (top right of the Members card): pick a person, choose whether you
     become a **Lead** or a **Member**, type `Robotics Club` in the box, and the button lights up.
     *Tip: if you try it, sign in as the new President to hand it back — or just run
     `npm run db:seed`, which puts Aarav back.*
8. Try removing someone who holds a ticket for a **members-only** event: the green message says how many
   seats were given back, and the next person on that event's waiting list gets in.

### Step 12 15/16 — The recruitment board (new in Phase 11)

What changed in plain words: clubs can now **advertise roles** ("we need an Electronics team member"),
and **any signed-in student — even from another college — can apply**. The club's Leads accept or reject
Member applicants; Lead applicants are the President's call. Accepting gives the person the role
straight away. Every club also has a **public profile** that anyone can open.

**In the preview (no sign-in):**

1. Click **Openings** in the top bar (or scroll down on `/dashboard` to **Club recruitment board**). You
   see three open roles. The closed one (*Photography & social media*) is not listed.
2. Click **Workshop Lead**. You see what the role involves, the requirements, the club's three questions,
   and — because you're a guest — a **Sign in to apply** button instead of the form.
3. Click **About Robotics Club** (under that button). This is the club's **public profile**: President,
   Leads, member count, open roles and upcoming public events. No emails, no members-only posts.
4. Open `/demo`, click **Robotics Club**, and find the new **Openings** card. As **Aarav** (President) you
   also see **Kabir's application** with his three answers. Click **View as → Meera Patel**: the
   application disappears — Workshop Lead is a *Lead* role, so only the President decides it.

**On your own computer (signed in — this is where the buttons are):**

5. Sign in as `kabir.member@vit.ac.in` / `password123` and click **My applications** in the top bar. His
   Workshop Lead application says **WAITING FOR A DECISION**. Click **Withdraw application** → **Yes,
   withdraw**. Click the opening's title: the form is back. Fill in the three boxes and click **Send
   application** — withdrawing doesn't stop you applying again (being rejected does).
6. Sign out, sign in as `aarav.president@vit.ac.in` → **Dashboard** → **Robotics Club** → scroll to
   **Openings**.
   - Click **Review applications (1 pending)** on Workshop Lead → **Accept** → **Accept as Lead**.
     Kabir is now a Lead (check the Members card).
   - Click **New opening**: give it a title and description, choose **Member** or **Lead**, edit or add
     questions (up to three), optionally a closing date, then **Post opening**. It appears on the board.
   - **Close** stops new applications; **Reopen** brings it back.
7. Create a brand-new account (any email) and apply to **Electronics team member** — that's the
   "another college" case. Sign in as Meera (a Lead) and accept it: the new person is now a Member of
   Robotics and can see its announcements.
8. Done experimenting? `npm run db:seed` puts every opening and Kabir's application back.

### Step 13 — (Optional) the real sign-in experience

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

> **Starting from absolutely nothing?** [`docs/FROM-ZERO.md`](./FROM-ZERO.md) goes from the
> downloaded zip → GitHub account → repository → live site, with a screenshot-description of every
> screen and no assumed knowledge.
>
> **Putting it on the internet?** [`docs/DEPLOY-BEGINNER.md`](./DEPLOY-BEGINNER.md) is the
> hand-holding version (every term explained, two paths: Vercel or your own server).
> [`docs/DEPLOY.md`](./DEPLOY.md) is the short reference. It walks through Docker Compose,
> Vercel, or a plain systemd server — including the three settings that cause real incidents
> (`DEMO_MODE` left on, a missing `AUTH_SECRET`, migrations run after the app instead of before).

## 5. How to check everything still works

Two commands do the checking for you. This is the habit that separates "it works on my laptop" from
real software.

```bash
npm run test          # 453 automated checks — the "robot inspectors"
npm run test:smoke    # 311 checks against the running website
npm run test:layout   # 100 checks in a real browser, at phone and desktop widths
npm run deploy:check  # 14 checks that a real deployment is configured safely
```

The 453 tests answer questions like:

- *"If someone tries to sneak an event from College B into College A's data, does the filing cabinet
  slam the drawer shut?"* → Yes, it refuses. (That's not politeness; the database physically can't
  store it.)
- *"Can the same student sign up twice for one event?"* → No.
- *"If we re-run the sample data, do we get duplicates?"* → No.
- *"If two people click the same one-use invite link at the same instant, can both get in?"* → No,
  exactly one gets in.
- *"If 20 students tap Register in the same second for a 5-seat room, does anybody get a 6th seat?"*
  → No. Exactly 5 get in and 15 join the queue. We proved this test has teeth by deleting the safety
  mechanism and watching it fail — 10 people got into that 5-seat room.
- *"Can a club end up with two Presidents — or a President be removed?"* → No. The President can only
  change by handing over, and the database itself refuses a second President even if the app's code
  had a bug. Two hand-overs at the same instant still end with exactly one.
- *"If someone double-clicks Send application, or two Leads click Accept at the same instant?"* → One
  application, one decision. The database refuses the second.
- *"If someone from another college opens a club's web address, what do they see?"* → Since Phase 11,
  the club's **public profile** — names of the President and Leads, open roles, public events. Never the
  member list, emails, announcements or invite links.

And the 311 smoke checks drive the real website: log in, submit a bad form, try to exceed a rate
limit, read the dashboard as two different people, mint an invite link and redeem it as a brand-new
account, take the last seat in a one-seat event to watch the queue move, and scan that ticket twice
at the door to see the second scan come back as a receipt instead of an error.

The layout check is the newest one: it opens the read-only pages in a headless browser at 360, 390,
768, 1024 and 1440 pixels wide and fails if anything sticks out sideways, if an image has no
description, if a button or link has no name, if a field has no label, or if a page has more than one
top-level heading. In other words, it checks the things that make an app usable on a phone and with a
screen reader, which no amount of code review reliably catches.

It needs a browser. If `npm run test:layout` says it cannot find Chromium, install it once with
`npx playwright install chromium` — it is a one-off download, not part of the app.

**The golden rule:** before finishing any phase, we run

```bash
npm run verify
```

…which does *checking for typos* → *checking for type mistakes* → *running all 453 tests* → *building
the final version*. If any step fails, the phase isn't done. One tip: stop the preview server first
(`Ctrl-C`), because the build and the server share the same temporary folder.

---

## 6. Where we are on the map

The project was built in 7 phases, and 6 more were added for the club-platform features. Each one ends
with a review, and nothing starts until the previous one passes.

| Phase | In plain words | Status |
| --- | --- | --- |
| 1 | Set up the empty house — tools, styles, structure | ✅ Done |
| 2 | Build the filing cabinet + install the front door lock | ✅ Done |
| 3 | Creating colleges & clubs, inviting members | ✅ Done |
| 4 | Creating events (the actual dashboard) | ✅ Done |
| 5 | Sign-ups that can't overbook + QR tickets | ✅ Done |
| 6 | The phone scanner + works without internet | ✅ Done |
| 7 | Make it pretty and bulletproof | ✅ Done |
| 8 | Front door: guests can browse events, "Start a new club" asks them to sign in | ✅ Done |
| 9 | Richer events: poster link, tags, Instagram / WhatsApp links | ✅ Done |
| 10 | Roles: "Lead" instead of Event Manager, removing people, handing over the presidency, members-only announcements | ✅ Done |
| 11 | Recruitment board: clubs post openings, students apply; public club profiles | ✅ Built — waiting for your review |
| 12 | Any student can start a club; it stays Pending until a professor's code is entered | ⬜ Next |
| 13 | The remaining screens in the new look + final checks | ⬜ |

**In plain words, right now:** guests can browse every college's public events; signed-in students
get seats, QR tickets and waitlists; the door scanner works even without internet; events have posters,
tags and links; clubs have **Leads**, exactly **one President** and **members-only announcements**; and —
new in Phase 11 — clubs **advertise openings**, any student can **apply**, accepting **grants the role**,
and every club has a **public profile**.

What you *cannot* do yet: start a club as an ordinary student and have a professor approve it with a
code. That's Phase 12.

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

**Phase 11 is built.** Clubs post openings with their own questions; anyone signed in applies; Leads
decide Member applicants and the President decides Lead applicants; accepting grants the role; students
track everything under **My applications**; and every club has a public profile.

**Phase 12 — start a club, professor approves.** Any signed-in student can request a new club (its
college is matched from their email domain). It stays **Pending** — they're its President already —
until a professor enters a 6-digit code (shown on screen / in the terminal for now).

**How to approve Phase 11:**

```bash
npm run db:deploy     # adds the two new tables (only needed once)
npm run db:seed       # the sample openings and Kabir's application
npm run app:up        # start the app
npm run test:smoke    # watch it check all 311 behaviours
```

Then try Step 12 15/16 above and tell me *"Phase 11 looks good"* (or what you'd like changed) and I'll
start Phase 12.
