import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { buttonVariants } from "@/components/ui/button";
import { isDemoModeEnabled } from "@/lib/demo/mode";
import { cn } from "@/lib/utils";

/** Kept in sync with prisma/seed.ts — the roles exist to show RBAC working. */
const demoAccounts = [
  { email: "aarav.president@vit.ac.in", name: "Aarav", roles: "Tenant Owner · President, Robotics · Member, Debate" },
  { email: "meera.manager@vit.ac.in", name: "Meera", roles: "Event Manager, Robotics · Member, Debate" },
  { email: "kabir.member@vit.ac.in", name: "Kabir", roles: "Member of both clubs — the restricted view" },
  { email: "dean.admin@vit.ac.in", name: "Nisha", roles: "Tenant Admin · no club role, sees across clubs" },
] as const;

const steps = [
  {
    n: "01",
    title: "Put it on the board",
    body: "Create the event once: room, capacity, who can see it. Times are stored properly and shown in each person's own timezone.",
  },
  {
    n: "02",
    title: "Fill the room, not past it",
    body: "Students RSVP from their phone and get a QR ticket. When the hall is full, the next person goes on a waitlist — in order, automatically.",
  },
  {
    n: "03",
    title: "Open the doors",
    body: "Volunteers scan tickets with any phone camera. No signal in the basement? Scans queue up and sync the moment Wi-Fi comes back.",
  },
] as const;

const guarantees = [
  {
    title: "The 101st person doesn't get seat 100.",
    body: "Every RSVP takes a database lock before it counts, so two people tapping at the same instant can never overbook the room.",
  },
  {
    title: "Wi-Fi dies at the door. Check-ins don't.",
    body: "The scanner keeps working offline and replays its queue later — a scan can be sent twice and still counts once.",
  },
  {
    title: "Your college's data stays your college's.",
    body: "Each college is its own space. Every query is scoped to it, so one campus can never see another's members or events.",
  },
  {
    title: "Presidents, managers, members.",
    body: "Roles are per club: the same student can run Robotics and just attend Debate. Each sees exactly what they should.",
  },
] as const;

/**
 * A deterministic, QR-looking grid for the hero ticket. Purely decorative — the
 * real tickets render a scannable code from the `qrcode` library.
 */
function DecorativeQr({ className }: { className?: string }) {
  const size = 21;
  const cells: Array<[number, number]> = [];
  let seed = 7;
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (!finder(x, y) && seed % 100 < 46) cells.push([x, y]);
    }
  }

  const eye = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" rx="1.2" className="fill-current" />
      <rect x={x + 1} y={y + 1} width="5" height="5" rx="0.8" className="fill-card" />
      <rect x={x + 2} y={y + 2} width="3" height="3" rx="0.5" className="fill-current" />
    </g>
  );

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden="true" shapeRendering="crispEdges">
      {cells.map(([x, y]) => (
        <rect key={`${x}:${y}`} x={x} y={y} width="1" height="1" className="fill-current" />
      ))}
      {eye(0, 0)}
      {eye(size - 7, 0)}
      {eye(0, size - 7)}
    </svg>
  );
}

function HeroTicket() {
  return (
    <div className="relative mx-auto w-full max-w-[25rem] lg:mr-0">
      {/* A second ticket peeking out behind, slightly rotated: a stack, not a mockup. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-6 -top-4 bottom-6 rotate-[4deg] rounded-xl border border-foreground/15 bg-secondary"
      />

      <figure
        className="relative rotate-[-1.5deg] rounded-xl border border-foreground/80 bg-card shadow-print-lg transition-transform duration-500 hover:rotate-0 dark:border-foreground/30"
        aria-label="Example ticket for RoboWars 2026 qualifiers"
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-4">
          <div className="flex flex-col gap-1">
            <span className="eyebrow text-primary">Robotics Club · Admit one</span>
            <span className="font-heading text-2xl leading-tight font-bold tracking-tight">
              RoboWars 2026
              <br />
              Qualifiers
            </span>
          </div>
          <div className="flex shrink-0 flex-col items-center rounded-md border border-foreground/80 px-2.5 py-1.5 text-center dark:border-foreground/30">
            <span className="font-mono text-[0.625rem] font-semibold tracking-widest text-primary uppercase">Oct</span>
            <span className="font-heading text-2xl leading-none font-bold">29</span>
            <span className="font-mono text-[0.625rem] text-muted-foreground">THU</span>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-3 px-5 pb-5 text-sm">
          <div>
            <dt className="eyebrow">Time</dt>
            <dd className="font-medium">9:00 am</dd>
          </div>
          <div>
            <dt className="eyebrow">Venue</dt>
            <dd className="font-medium">Main Hall</dd>
          </div>
          <div>
            <dt className="eyebrow">Seat</dt>
            <dd className="font-medium">47 / 120</dd>
          </div>
        </dl>

        {/* Tear line with the two punched notches. */}
        <div className="relative flex items-center">
          <span className="absolute -left-px size-5 -translate-x-1/2 rounded-full border-r border-foreground/80 bg-background dark:border-foreground/30" />
          <div className="perforation mx-5 flex-1" />
          <span className="absolute -right-px size-5 translate-x-1/2 rounded-full border-l border-foreground/80 bg-background dark:border-foreground/30" />
        </div>

        <div className="flex items-center gap-4 p-5">
          <div className="rounded-md bg-card p-1.5 ring-1 ring-foreground/10">
            <DecorativeQr className="size-[5.5rem] text-foreground" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="eyebrow">Ticket holder</span>
            <span className="truncate font-medium">Kabir Rao</span>
            <span className="truncate font-mono text-xs text-muted-foreground">#RW26-0047</span>
          </div>
        </div>

        {/* The "checked in" rubber stamp. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-4 bottom-6 rotate-[-12deg] rounded-md border-2 border-success px-2.5 py-1 font-mono text-xs font-bold tracking-[0.2em] text-success uppercase opacity-90"
        >
          <span className="flex items-center gap-1">
            <Check className="size-3.5" strokeWidth={3} />
            Checked in
          </span>
        </div>
      </figure>
    </div>
  );
}

export default function Home() {
  // Production deployments run with demo mode off: /demo answers 404 and the
  // seeded accounts do not exist, so the review shortcuts must not be offered.
  const demo = isDemoModeEnabled();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border/80">
          <div aria-hidden="true" className="bg-dots absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:pt-20 lg:pb-24">
            <div className="flex flex-col items-start gap-6">
              <span className="eyebrow inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-card px-3 py-1">
                <span className="size-1.5 rounded-full bg-primary" />
                For college clubs &amp; societies
              </span>

              <h1 className="font-heading text-[2.6rem] leading-[1.02] font-extrabold tracking-[-0.035em] sm:text-6xl lg:text-[4.25rem]">
                Run the event.
                <br />
                <span className="marker">Skip</span> the spreadsheet.
              </h1>

              <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
                ClubHub gives every college its own space and every club a proper
                front desk — RSVPs that never overbook, QR tickets on every phone,
                and a door scanner that keeps working when the Wi-Fi doesn&apos;t.
              </p>

              {/* Centre stage: look around first, no account. Everything else is secondary. */}
              <div className="flex flex-col items-start gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base")}>
                    Explore events as a guest
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                  {demo ? (
                    <Link href="/demo" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 px-5")}>
                      Demo dashboard (no sign-in)
                    </Link>
                  ) : (
                    <Link href="/sign-up" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 px-5")}>
                      Create an account
                    </Link>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  No account needed to browse.{" "}
                  <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">
                    {demo ? "Sign in as a demo user" : "Already a member? Sign in"}
                  </Link>
                </span>
              </div>

              <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-2 text-sm text-muted-foreground">
                {["Free for student clubs", "Works on any phone", "No app to install"].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check className="size-4 text-success" strokeWidth={2.5} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <HeroTicket />
          </div>
        </section>

        {/* ── Ink band ──────────────────────────────────────────────────────── */}
        <section aria-label="At a glance" className="bg-foreground text-background">
          <ul className="mx-auto grid w-full max-w-6xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
            {[
              ["0", "double bookings, by design"],
              ["1 tap", "to RSVP from a phone"],
              ["Offline", "scanning at the door"],
              ["Per club", "roles and permissions"],
            ].map(([big, small], index) => (
              <li
                key={small}
                className={cn(
                  "flex flex-col gap-1 py-7 pr-4",
                  index % 2 === 1 && "pl-5 md:pl-6",
                  index >= 2 && "border-t border-background/15 md:border-t-0",
                  index > 0 && "md:border-l md:border-background/15 md:pl-6",
                  index === 1 && "border-l border-background/15",
                  index === 3 && "border-l border-background/15",
                )}
              >
                <span className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{big}</span>
                <span className="text-sm text-background/65">{small}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Demo access (only where the seeded accounts and /demo exist) ─── */}
        {demo ? (
          <section aria-labelledby="demo-heading" className="border-b border-border/80">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex max-w-2xl flex-col gap-2">
                  <span className="eyebrow text-primary">Demo mode is on</span>
                  <h2 id="demo-heading" className="text-3xl font-bold sm:text-4xl">
                    Review it with seeded data
                  </h2>
                  <p className="text-muted-foreground">
                    One tenant (Vadodara Institute of Technology), two clubs and four accounts that hold
                    deliberately different roles. Password for all of them:{" "}
                    <code className="rounded-sm border border-foreground/15 bg-card px-1.5 py-0.5 font-mono text-sm text-foreground">
                      password123
                    </code>
                  </p>
                </div>
                <Link href="/demo" className={cn(buttonVariants({ variant: "outline" }), "self-start md:self-auto")}>
                  See this dashboard without signing in
                  <ArrowUpRight data-icon="inline-end" />
                </Link>
              </div>

              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {demoAccounts.map((account, index) => (
                  <li
                    key={account.email}
                    className="ticket-notch flex flex-col gap-3 rounded-lg border border-border bg-card p-5 [--notch-y:62%]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-heading text-lg font-bold">{account.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                    </div>
                    <span className="text-sm leading-snug text-muted-foreground">{account.roles}</span>
                    <div className="perforation my-1" />
                    <span className="font-mono text-xs break-all text-foreground/80">{account.email}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3">
                <Link href="/sign-in" className={cn(buttonVariants())}>
                  Sign in as a demo user
                  <ArrowRight data-icon="inline-end" />
                </Link>
                <span className="text-sm text-muted-foreground">
                  Inside a chat preview, use the no-sign-in dashboard — previews can&apos;t keep cookies.
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {/* ── How it works ──────────────────────────────────────────────────── */}
        <section aria-labelledby="how-heading" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex max-w-2xl flex-col gap-3">
            <span className="eyebrow">How a club night runs</span>
            <h2 id="how-heading" className="text-3xl font-bold sm:text-[2.75rem] sm:leading-[1.08]">
              From the poster to the door, in three steps.
            </h2>
          </div>

          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
            {steps.map((step) => (
              <li key={step.n} className="group flex flex-col gap-4 bg-card p-7">
                <span className="font-mono text-sm font-semibold text-primary">{step.n}</span>
                <h3 className="text-xl font-bold">{step.title}</h3>
                <p className="leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Guarantees ────────────────────────────────────────────────────── */}
        <section aria-labelledby="edges-heading" className="border-y border-border/80 bg-secondary/50">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
              <span className="eyebrow">Built for the bits that go wrong</span>
              <h2 id="edges-heading" className="text-3xl font-bold sm:text-[2.75rem] sm:leading-[1.08]">
                Event day is chaos. The software shouldn&apos;t be.
              </h2>
              <p className="max-w-md text-muted-foreground">
                The hard parts of running a door — rushes, dead zones, double taps — are
                handled underneath, so the people at the table can just say hello.
              </p>
            </div>

            <ul className="flex flex-col">
              {guarantees.map((item, index) => (
                <li key={item.title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-t border-foreground/15 py-7 first:border-t-0 first:pt-0">
                  <span className="font-mono text-sm text-muted-foreground">0{index + 1}</span>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xl font-bold">{item.title}</h3>
                    <p className="leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Closing call to action ───────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl border border-foreground/80 bg-primary px-6 py-14 text-primary-foreground shadow-print-lg sm:px-12 dark:border-foreground/20">
            <div aria-hidden="true" className="bg-dots absolute inset-0 opacity-25" />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="flex max-w-xl flex-col gap-3">
                <span className="font-mono text-xs font-semibold tracking-[0.18em] uppercase opacity-80">
                  Your club, sorted
                </span>
                <h2 className="text-3xl font-extrabold sm:text-5xl sm:leading-[1.02]">
                  Your next event deserves a proper door.
                </h2>
              </div>
              <Link
                href={demo ? "/demo" : "/sign-up"}
                className="inline-flex h-12 shrink-0 items-center gap-2 self-start rounded-md border border-foreground/80 bg-background px-6 font-semibold text-foreground shadow-print transition-transform hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none md:self-auto dark:border-transparent"
              >
                {demo ? "Open the demo" : "Start for free"}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
