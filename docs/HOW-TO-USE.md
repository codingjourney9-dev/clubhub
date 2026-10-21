# How to use everything in ClubHub

This is the **user manual**: what each part of the app is for and exactly which buttons to press.
You don't need to know anything about code to follow it.

> **Two other guides exist:** [`START-HERE.md`](./START-HERE.md) explains how the project was built
> and how to run it, and [`TOUR.md`](./TOUR.md) lists every feature by phase. This file is the one to
> hand to a club President who just wants to *use* the app.

---

## 0. Before you start

**Open the app.** On your own computer, open a terminal in the `clubhub` folder, type
`npm run app:up`, wait for **Ready**, then open **http://localhost:3000** in your browser.
(On the live site, just open your Vercel address.)

**Practice accounts.** The sample data comes with four people. All of them use the password
**`password123`**:

| Sign in as | Email | Who they are |
| --- | --- | --- |
| Aarav Shah | `aarav.president@vit.ac.in` | Runs the whole college (Owner) and is **President** of Robotics Club |
| Meera Patel | `meera.manager@vit.ac.in` | A **Lead** of Robotics Club |
| Kabir Rao | `kabir.member@vit.ac.in` | A plain **Member** of two clubs. Also waiting for his own club, *Chess Circle*, to be confirmed |
| Nisha Verma | `dean.admin@vit.ac.in` | A college **Admin** (has power over the college but no club role) |

Signing in as each of them is the fastest way to see how the app changes with your role.

---

## 1. Finding your way around

The bar at the top of every page has the same things:

| What you see | What it does |
| --- | --- |
| **ClubHub** (top left) | Takes you to the front page |
| **Dashboard · Events · Openings · My tickets · My applications** | The main sections. Guests only see Events and Openings |
| **☀ / ☾ button** | Switches between light and dark mode. Your choice is remembered |
| **☰ button** (phones only) | Opens the menu with the same links. Tap a link or press **Esc** to close it |
| **Your name** and the **exit arrow** (top right) | Shows who you're signed in as. The arrow signs you out (on phones, **Sign out** is at the bottom of the ☰ menu) |
| **Round red ＋ button** (bottom right of the dashboard) | **Start a new club** |

**Using only a keyboard?** Press **Tab** to move between buttons. The first Tab shows a **Skip to
content** link, which jumps past the top bar. On a club page, use the **← →** arrow keys to move
between tabs.

---

## 2. As a guest (no account)

You can look at almost everything without signing up.

1. On the front page, click **Explore events as a guest**.
2. You'll see **Upcoming events** from every college. Each card shows the college's name.
3. Click a tag chip (**Technical**, **Cultural**, **Workshop** …) to show only that kind of event.
   Click **All** to go back.
4. Click any event to see its poster, time, venue, seats left and Instagram link.
5. Click **Openings** in the top bar to see the **Club recruitment board**: roles clubs want filled.
6. Click a club's name anywhere to see its **public profile**: description, President, Leads,
   member count, open roles and upcoming events.

**What needs an account:** getting a ticket, applying for a role and starting a club. If you try
one of these, the app takes you to **Sign in** and then brings you back to where you were.

---

## 3. As a student

### Create an account
1. Click **Create account** (top right).
2. Fill in your first and last name, your **college email** and a password (at least 8 characters).
3. Click **Create account**. You're signed in and taken to your dashboard.

You become part of a college automatically when you open a club's invite link, get accepted for a
role, or start a club. You don't need to do anything else.

### Get a ticket for an event
1. Open the event (from **Events** or your dashboard).
2. In the **Your seat** box, click **Register**.
   - If the event is full and has a queue, the button says **Join the waitlist** instead. If someone
     cancels, the first person in the queue gets the seat automatically.
3. Click **Open your ticket** to see your **QR code**. Show this at the door.
   It's also always under **My tickets** in the top bar.
4. Changed your mind? On the event page, click **Cancel my spot** (or **Leave the waitlist**).
   Your seat goes to the next person in the queue.

The **WhatsApp group** link on an event only appears once you have a ticket.

### Apply for a role in a club
1. Click **Openings** in the top bar and open a role.
2. Read **What the role involves**, **Requirements** and **The club asks**.
3. Answer every question in the **Apply** box and click **Send application**.
4. Follow it under **My applications**. Each one says **Waiting for a decision**, accepted or not.
5. While it's still waiting, you can click **Withdraw application**. You can apply again later, but
   not after you've been turned down.

If you're accepted, you get the role straight away (Member or Lead) and join that college if you
weren't in it already.

---

## 4. Starting your own club

1. On the dashboard, click the round red **＋** (or **Start a new club**).
2. Type the **Club name**, an optional **Category** and **What will the club do?**
3. Under **2 · Your professor**, type the professor's name and email. It can't be your own email.
4. Click **Send code to professor**.
5. You are now the club's **President**, but the club is **Pending**: nobody else can see it yet.
6. Ask your professor for the **6-digit code** and type it on the page. Click **Confirm club**.
   - The code works for **15 minutes**, and you get **5 tries**.
   - If it runs out, click **Send a new code** (you have to wait 30 seconds between sends).
   - Don't want the club any more? Click **Cancel this request**.
7. Once the code is right, the club goes **live** and you can start using everything in §5.

**About the code:** this version doesn't send real emails. On your own computer the code appears
on the page and in the terminal. On the live site it's in Vercel → your project → **Logs**: search
for `club.verification_code`. For practice, sign in as Kabir: his *Chess Circle* code after a
fresh `npm run db:seed` is **246810**.

You can have at most **2** clubs waiting at once. A college Owner or Admin who creates a club skips
the code: their club is live immediately.

---

## 5. Running a club (Leads and the President)

Open your club from the dashboard (under **Your clubs**). A club page has **tabs**:

| Tab | What's in it | Who sees it |
| --- | --- | --- |
| **Overview** | Next event, members, open roles at a glance, plus announcements | Members |
| **Events** | All the club's events, including drafts | Members |
| **Members** | The full list, with role changes and removal | Members (changes: Leads/President) |
| **Openings** | Recruitment roles and applications | Members (changes: Leads/President) |
| **Invite links** | Links that let people join directly | Leads/President |

The small tiles on Overview (**All events →**, **See members →** …) jump to the matching tab.
**See the public profile** (under the club name) shows what outsiders see.

### Events
1. **Events** tab → **New event**.
2. Fill in **Event name**, **Starts**, **Ends**, **Venue** and **Capacity** (how many seats).
   Times are in the college's local time.
3. Optional extras: **Poster link** (paste an image address), up to **3 tags**, an **Instagram**
   link, a **WhatsApp group** link (only ticket holders see it) and the **Start a waitlist when full** switch.
4. Leave the **Open to everyone** switch on for a public event, or turn it off so only club members
   can see it and get tickets.
5. Click **Create draft**. The event starts as a **Draft** that only organisers can see.
6. Click **Publish** when it's ready. Now it appears on the events page.
7. Later, use **Edit** (then **Save changes**) to change it, or **Cancel event** if it's off. Cancelled events stay visible
   so nobody turns up by mistake.

### Announcements (Overview tab)
1. Type a **Title** and **Message** in the announcement box.
2. Click **Post to members**. Only club members can read announcements.
3. To keep an important one first, click **Pin to top** on it (only one can be pinned at a time;
   **Unpin** undoes it).

### Members
- Type in **Find a member** to search a long list.
- **Change someone's role** (President only): use the **Role** dropdown next to their name to switch
  between Member and Lead.
- **Remove someone**: click **Remove**, then **Remove from club** to confirm.
  Leads can remove Members, and the President can remove Leads too. Nobody can remove the
  President. A removed person loses any **members-only** event tickets, and the seats go to the queue.
- **Hand over presidency** (President only): pick the **New President**, choose whether you become a
  Lead or a Member, and confirm. A club always has exactly one President.

### Openings (recruitment)
1. **Openings** tab → **New opening**.
2. Fill in **Title**, **Role it offers** (Member or Lead), **What the role involves**,
   requirements, **1 to 3 questions** for applicants, and an optional closing date.
   Leads can post Member openings. Only the President can post Lead openings.
3. Click **Post opening**. It appears on the public recruitment board.
4. When people apply, click **Review applications (N pending)**. Read their answers and click
   **Accept** or **Reject**. Leads decide on Member applicants; the President decides on Lead
   applicants. Accepting gives them the role immediately.
5. Use **Close** to stop taking applications (and **Reopen** to start again).

### Invite links
1. **Invite links** tab → choose the role and **How many people may use it**.
2. Click **Create invite link**, then **Copy link** and send it (for example in your WhatsApp group).
3. Anyone who opens it and signs in joins the club with that role.
4. Used-up or expired links are tucked away under **Show N old links**.

---

## 6. On the day of the event (the door)

You need to be a Lead or the President of the club (or a college Owner/Admin).

1. On the dashboard, click **Run the door**. You'll see **Doors**: today's events you can check
   people in to.
2. Click **Open scanner** next to the event. **Do this before you lose Wi-Fi**: it downloads the
   guest list.
3. Click **Start camera** and point the phone at each person's QR code. Each scan shows a clear
   verdict: checked in, already used, wrong event, and so on.
4. If the camera won't focus, type the **eight-character door code** printed under the QR code.
5. **No internet?** Keep scanning. Scans are saved on the phone, and the box says how many are
   waiting. When you're back online they upload automatically, or press **Sync now**.
6. Afterwards, open the event and click **Attendance report**: how many registered, turned up and
   didn't show.

---

## 7. College Owners and Admins

- **Create a college:** someone who isn't in any college yet can open **/onboarding** and fill in
  **Create your college**. The person who creates it becomes its **Owner**.
- **Create a club** for your college: it goes live at once, with no professor code.
- **Pending club requests:** your dashboard lists students' clubs that are waiting for a code. You
  can open one and **Remove this request**, but you **can't approve** it. Only the professor's code
  does that.
- **Override:** Owners and Admins can manage any club in their college, including events, members
  and the door.

---

## 8. Who can do what

| | Guest | Signed in | Member | Lead | President |
| --- | :---: | :---: | :---: | :---: | :---: |
| Browse events, openings, club profiles | ✅ | ✅ | ✅ | ✅ | ✅ |
| Get tickets, apply for roles, start a club | | ✅ | ✅ | ✅ | ✅ |
| Read members-only announcements and events | | | ✅ | ✅ | ✅ |
| Create events, post announcements, run the door | | | | ✅ | ✅ |
| Remove Members, post Member openings, decide Member applicants, invite links | | | | ✅ | ✅ |
| Remove Leads, change Member ↔ Lead, post Lead openings, hand over presidency | | | | | ✅ |

---

## 9. Where is…?

| I want to… | Go to |
| --- | --- |
| See all upcoming events | **Events** in the top bar |
| Find my QR ticket | **My tickets** |
| Check on my applications | **My applications** |
| Find clubs that are recruiting | **Openings** |
| Start a club | Round red **＋** on the dashboard |
| Post something to my club | Club page → **Overview** |
| Make a new event | Club page → **Events** → **New event** |
| Add someone to my club | Club page → **Invite links** |
| Check people in | Dashboard → **Run the door** |
| See who turned up | Event page → **Attendance report** |
| Switch to dark mode | **☀ / ☾** in the top bar |
| Compare what each role sees, without signing in | **/demo** (front page → **Demo dashboard (no sign-in)**) |

---

## 10. If something looks wrong

| What you see | What it means | What to do |
| --- | --- | --- |
| **"There is nothing at this address"** | The page doesn't exist, **or** it belongs to a club or college you're not part of. ClubHub deliberately doesn't say which | Check you're signed in as the right person |
| A button you expected is missing | Your role doesn't allow it (see §8) | Ask your club's President |
| **"That code isn't right. N tries left."** | Wrong professor code | Check the code with your professor. After 5 wrong tries, use **Send a new code** |
| **"The last code has expired"** | More than 15 minutes have passed | Click **Send a new code** |
| **"Slow down a moment"** / "Try again in N seconds" | The app slows down repeated requests to protect itself | Wait that long and try again |
| The page won't load at all on your computer | The app isn't running | In the terminal, run `npm run app:up` |
| Signing in does nothing inside the chat preview | The preview can't keep you signed in | Use **/demo** in the preview, or run the app on your own computer |
