# From zero: the downloaded folder → a live website

This assumes **nothing**. Not that you have Git, not that you have a GitHub account, not that you
have ever used a terminal. Follow it top to bottom and do not skip steps.

You will go from "a zip file in my Downloads folder" to "a website other people can open".

**Time:** about 45 minutes, most of it waiting for downloads.
**Cost:** ₹0. Everything here has a free tier that is enough for a college club.
**Prerequisites:** a computer with an internet connection. That's it.

---

## Contents

| Part | What you do | Time |
| --- | --- | --- |
| [1](#part-1--get-the-files-out-of-this-chat) | Download and unzip the project | 5 min |
| [2](#part-2--install-git-one-program) | Install Git | 5 min |
| [3](#part-3--create-a-github-account) | Create a GitHub account | 5 min |
| [4](#part-4--create-an-empty-repository) | Create an empty repository | 3 min |
| [5](#part-5--put-your-folder-onto-github) | Put your folder onto GitHub | 10 min |
| [6](#part-6--check-that-it-actually-uploaded) | Check that it uploaded | 2 min |
| [7](#part-7--turn-it-into-a-website) | Turn it into a website (Vercel) | 15 min |
| [8](#part-8--when-something-goes-wrong) | When something goes wrong | — |

**What is GitHub, and why do I need it?** It is a website that stores your project files online. The
hosting service we use (Vercel) can read from GitHub and rebuild your site every time you upload a
change. Think of GitHub as the shelf, Vercel as the shop window. You cannot skip the shelf.

---

# Part 1 — Get the files out of this chat

The project is in the file `clubhub-source.zip` (about 525 KB, a little over 200 files).

## 1.1 Download it

In this chat, open the workspace file list and click **`clubhub-source.zip`**, then choose
**Download**. It lands in your **Downloads** folder.

> The zip is a **compressed folder**. "Compressed" means the files were squeezed into one file to make
> the download small. You must unzip it before anything can use it — you cannot hand a zip to Git.

## 1.2 Unzip it

**Windows**

1. Open **File Explorer** and go to **Downloads**.
2. Right-click `clubhub-source.zip` → **Extract All…**
3. A window appears with a path like `C:\Users\You\Downloads\clubhub-source`. **Change it** to
   `C:\Users\You\Desktop` so the project is somewhere you can find.
4. Click **Extract**.
5. Open the new folder. You will see **one folder named `clubhub`** inside. Open it.

**macOS**

1. Open **Finder** → **Downloads**.
2. Double-click `clubhub-source.zip`. A folder called `clubhub-source` appears.
3. Drag the `clubhub` folder inside it onto your **Desktop**.

**Linux**

```bash
cd ~/Downloads && unzip clubhub-source.zip -d ~/Desktop
```

## 1.3 Check you are in the right folder

This is the single most common beginner mistake, so check it now.

Open the folder and look for a file called **`package.json`** — alongside `src`, `prisma`, `docs`,
`public`. **If you can see `package.json` directly, you are in the right place.**

```
clubhub/                 ← ✅ correct: package.json is right here
├── package.json
├── src/
├── prisma/
└── docs/

clubhub-source/          ← ❌ wrong: you are one level too high
└── clubhub/             ← the real project is in here
    └── package.json
```

If you unzipped twice and now have `clubhub/clubhub/`, that still works — just remember the **inner**
folder is the project, and every `cd` in this guide points there.

> ### What is NOT in the zip, and why
>
> | Missing | Why | When you get it |
> | --- | --- | --- |
> | `node_modules/` | thousands of library files, ~500 MB. `npm install` recreates it exactly from `package-lock.json`. | only if you run the app on your own computer |
> | `.env` | it holds **passwords**. Anything in the zip goes to GitHub, and GitHub is public. | you create it yourself, on the server, in Part 7 |
> | `.next/` | the compiled output. Rebuilt on every deploy. | never — it is generated |
>
> `.env.example` **is** included: it is a safe template showing which settings exist, with fake values.

---

# Part 2 — Install Git (one program)

**Git** is the program that uploads your folder to GitHub. GitHub is the website; Git is the thing on
your computer that talks to it. You need both.

## Windows

1. Go to **git-scm.com/download/win** — the download starts automatically.
2. Run the `.exe`. Click **Next** on every screen (the defaults are correct — there are about ten
   screens and none of them need changing). Click **Install** at the end.
3. Open the **Start** menu, type `powershell`, and open **Windows PowerShell**.
4. Type this and press Enter:

```powershell
git --version
```

You should see something like `git version 2.47.0`. If you see "not recognized", close PowerShell,
open it again, and try once more — it needs a fresh window to notice a new program.

## macOS

1. Open **Terminal** (press `Cmd + Space`, type `terminal`, press Enter).
2. Type `git --version`.
3. If Git is not installed, a box appears: **"The 'git' command requires the command line developer
   tools."** Click **Install** and wait — this can take 5–10 minutes.
4. Run `git --version` again when it finishes.

## Linux

```bash
sudo apt update && sudo apt install -y git
git --version
```

---

# Part 3 — Create a GitHub account

Skip this if you already have one.

1. Go to **github.com** → **Sign up**.
2. Enter your email, a password, and a **username**.
   - The username is **public** and appears in your project's address. Pick something you are happy
     to show: `aarav-shah`, not `coolboy2007x`.
3. Solve the puzzle, then check your email for a **verification code** and enter it.
4. On the "How many team members" / "What do you want to do" questions, you can skip everything —
   look for **Skip personalization** at the bottom or just click through.

You should land on a page that says something like *"Welcome to GitHub"*. You now have an account.

> **Free plan is enough.** Do not enter payment details. Private repositories are free.

---

# Part 4 — Create an empty repository

A "repository" (people say "repo") is simply **one project on GitHub**. Yours will be called
`clubhub`.

1. Top-right corner: click the **`+`** button → **New repository**.
   *(Or go straight to github.com/new.)*
2. Fill in:
   - **Repository name:** `clubhub`
   - **Description:** optional — "College club and event management" is fine
   - **Public / Private:** choose **Private**. It is free and keeps your pilot quiet. Vercel can still
     read it.
3. **Do not tick anything else.** Leave *Add a README file*, *Add .gitignore*, and *Choose a license*
   **unticked**.

   > This matters. If GitHub puts a README in your new repository and your folder also has files, the
   > two histories clash and you get an error like `failed to push some refs`. An empty repo avoids
   > that entirely.

4. Click **Create repository**.
5. You land on a page titled *"Quick setup"* showing commands. **Leave this page open** — you will
   need the address that looks like:

```
https://github.com/YOURUSERNAME/clubhub.git
```

That address is where your folder is going. Copy it somewhere.

---

# Part 5 — Put your folder onto GitHub

Two ways. **Path A needs no typing at all** — use it if you can.

## Path A — GitHub Desktop (recommended, no terminal)

**A1. Install it.** Go to **desktop.github.com**, download, install, and open it. Click
**Sign in to GitHub.com** and log in with the account from Part 3.

**A2. Tell it about your folder.**

1. Menu bar → **File** → **Add Local Repository…**
2. Click **Choose…** and pick your `clubhub` folder (the one containing `package.json`).
3. It will say *"This directory does not appear to be a Git repository. Would you like to create a
   repository here instead?"* — click the **create a repository** link.
4. A dialog opens with **Name: `clubhub`** and **Local path:** already pointing at the right place.
   **Do not change them.** Click **Create Repository**.

**A3. Make the first commit.** The left panel now lists about 215 changed files. That is all your
project. In the bottom-left box:

- **Summary:** type `Initial commit`
- Click **Commit to main**.

**A4. Publish it.** A button appears at the top: **Publish repository**. Click it, keep **Name:
clubhub**, tick **Keep this code private**, and click **Publish repository**.

**A5. Done.** Click **Repository → View on GitHub** in the menu. Your project is on the internet.

---

## Path B — the terminal (5 commands)

Open PowerShell (Windows) or Terminal (macOS/Linux). **Navigate into your project folder first** —
this is the step people skip:

```bash
cd ~/Desktop/clubhub          # macOS / Linux
```

```powershell
cd $HOME\Desktop\clubhub      # Windows PowerShell
```

Check you are in the right place by listing the files:

```bash
ls        # macOS / Linux  — you should see package.json
dir       # Windows        — you should see package.json
```

If `package.json` is not there, you are in the wrong folder. Fix that before continuing; nothing else
will work.

**B1. Tell Git who you are** (once per computer):

```bash
git config --global user.name "Your Name"
git config --global user.email "the-email-you-used@github.com"
```

**B2. Turn the folder into a repository and commit:**

```bash
git init -b main
git add .
git commit -m "Initial commit"
```

**B3. Connect it to GitHub and upload:**

```bash
git remote add origin https://github.com/YOURUSERNAME/clubhub.git
git push -u origin main
```

### When it asks for a password, that is the trap

GitHub **removed password login** for Git. Your account password will be rejected with:

```
remote: Support for password authentication was removed on August 13, 2021.
fatal: Authentication failed for 'https://github.com/...'
```

You need a **Personal Access Token** instead — a long random string that acts as a password for this
one purpose:

1. On GitHub: click your **profile picture** (top-right) → **Settings**.
2. Scroll the left sidebar all the way down → **Developer settings**.
3. **Personal access tokens** → **Tokens (classic)** → **Generate new token** → **Generate new token
   (classic)**.
4. **Note:** `clubhub laptop`. **Expiration:** 90 days. Under **Select scopes**, tick **`repo`** — the
   whole first block.
5. Scroll down → **Generate token**.
6. Copy the string that starts with `ghp_…`. **You will never see it again** — paste it somewhere safe
   for a minute.

Now run `git push -u origin main` again. When prompted:

- **Username:** your GitHub username
- **Password:** paste the **token**, not your password

> Nothing appears while you type or paste a password in a terminal. That is normal, not a frozen
> screen. Paste and press Enter.
>
> On Windows, a small window may pop up instead of asking in the terminal — paste the token into its
> password box.

**B4. You should see:**

```
To https://github.com/YOURUSERNAME/clubhub.git
 * [new branch]      main -> main
branch 'main' set up to track 'origin/main'.
```

---

# Part 6 — Check that it actually uploaded

Go back to `https://github.com/YOURUSERNAME/clubhub` and refresh.

| Check | What you should see |
| --- | --- |
| File list | folders `src`, `prisma`, `docs`, `public`, `scripts` and files like `package.json` |
| The file `package.json` | visible in the **root** of the repo, not inside a subfolder |
| File count | about 215 files |
| There is **no** `.env` | ✅ correct — secrets must never be here |
| There is **no** `node_modules` | ✅ correct — it is rebuilt during deploy |

**The screenshot-check that catches the mistake:** if you open the repo and see a single folder called
`clubhub` containing everything else, you uploaded one level too high. Every deploy will then fail
with "no package.json found". Fix it by deleting the repo's contents and re-uploading from the inner
folder — or simpler, delete the GitHub repo and start Part 4 again from inside the right folder.

---

# Part 7 — Turn it into a website

Now that the code is on GitHub, the hosting service can pick it up.

1. Go to **vercel.com** → **Sign up** → **Continue with GitHub** → **Authorize**.
2. **Add New…** → **Project**.
3. Your `clubhub` repo appears in the list → **Import**.
4. Before clicking Deploy, open **Environment Variables** and add these seven:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | from Neon (pooled string) |
| `DIRECT_DATABASE_URL` | from Neon (direct string) |
| `AUTH_SECRET` | output of `openssl rand -base64 48` |
| `AUTH_URL` | `https://your-project.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | same as `AUTH_URL` |
| `DEMO_MODE` | `off` |
| `DATABASE_POOL_MAX` | `1` |

5. **Build & Development Settings** → **Build Command**:

```
npx prisma migrate deploy && npm run build
```

6. **Deploy**.

You still need the database — that is Part A2 of [`DEPLOY-BEGINNER.md`](./DEPLOY-BEGINNER.md), which
takes you through creating the Neon database from scratch (5 minutes, free). Come back here when you
have both connection strings.

Then open `https://your-project.vercel.app/api/health`. It must say `"ready": true`.

---

# Part 8 — When something goes wrong

| Message | What it means | Fix |
| --- | --- | --- |
| `not a git repository` | you are not inside the project folder | `cd` into the folder that has `package.json` |
| `Authentication failed` | GitHub no longer accepts passwords | make a token (Part 5, Path B) and use it as the password |
| `remote: Repository not found` | the address is wrong, or it is private and you are not logged in | copy the `https://…git` URL straight from GitHub |
| `remote origin already exists` | you ran the `git remote add` line twice | `git remote set-url origin https://github.com/YOU/clubhub.git` |
| `src refspec main does not match any` | no commit exists yet — you skipped `git commit` | run `git add .` then `git commit -m "Initial commit"`, then push |
| `failed to push some refs` / `fetch first` | you ticked "Add a README" in Part 4 | `git pull --rebase origin main` then push again |
| Vercel: `No package.json found` | the repo contains a folder, not the project | the repo root itself must contain `package.json` |
| It asks for a password every single push | you pasted the token once instead of storing it | let Git save it (`git config --global credential.helper manager` on Windows, `osxkeychain` on macOS) |
| Everything uploaded except `src/generated` | that folder is generated, not source — correct | ignore it; `npm run postinstall` builds it on Vercel |
| `warning: LF will be replaced by CRLF` | Windows vs Unix line endings | a warning, not an error. Ignore it. |

### Still stuck?

Copy the **last few lines** of whatever failed — not the whole screen — and paste them here. That is
usually enough to identify the exact problem.

---

# Part 9 — Optional: run it on your own computer first

Not required. Vercel builds the project for you, so a beginner can skip this entirely.

If you do want it locally, you need two extra things — **Node.js 20+** and **PostgreSQL** — plus a
`.env` file:

```bash
node --version        # must be 20.9 or higher
npm install           # downloads node_modules (a few minutes)
cp .env.example .env  # then edit DATABASE_URL and AUTH_SECRET
npx prisma migrate deploy
npm run dev           # http://localhost:3000
```

PostgreSQL is the hard part on Windows — it is a separate installer with its own service. That is why
[`START-HERE.md`](./START-HERE.md) exists: it walks through getting a local database running.

**My advice:** get the live site working first (Parts 1–7), then come back here if you are curious.
Deploying is the shorter path to something you can show someone.

---

# The whole thing as a checklist

Print this. Tick as you go.

- [ ] `clubhub-source.zip` downloaded and unzipped
- [ ] I can see `package.json` in my folder
- [ ] Git installed (`git --version` prints a version)
- [ ] GitHub account created and email verified
- [ ] Empty repository `clubhub` created — **nothing ticked** on the setup page
- [ ] Folder published (GitHub Desktop) **or** pushed with a token
- [ ] github.com shows `package.json` at the **root**, and no `.env`
- [ ] Neon database created; both connection strings copied
- [ ] Vercel project imported with the 7 environment variables
- [ ] Build command set to `npx prisma migrate deploy && npm run build`
- [ ] `/api/health` says `"ready": true`
- [ ] Signed up, created my college, created a club
- [ ] Signed out and back in again (this proves the cookie settings are right)
