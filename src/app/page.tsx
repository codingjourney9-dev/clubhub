import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CalendarDays,
  CircleCheck,
  Compass,
  Database,
  Gauge,
  KeyRound,
  Layers,
  QrCode,
  Radio,
  Server,
  ShieldCheck,
  Ticket,
  Users,
  WifiOff,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { phaseRoadmap, siteConfig, type PhaseStatus } from "@/config/site";
import { cn } from "@/lib/utils";

const stackGroups = [
  {
    icon: Server,
    title: "Framework",
    items: ["Next.js 15 · App Router", "React 19 · Server Components", "TS strict + noUncheckedIndexedAccess"],
  },
  {
    icon: Database,
    title: "Data layer",
    items: ["PostgreSQL · pool tenancy", "Prisma ORM + migrations", "tenantId on every core table"],
  },
  {
    icon: KeyRound,
    title: "Auth & tenancy",
    items: ["Auth.js v5 sessions", "TenantMember / ClubMember join tables", "Guard at the route-handler boundary"],
  },
  {
    icon: Layers,
    title: "Client state & forms",
    items: ["TanStack Query (server state)", "Zustand (UI state)", "React Hook Form + Zod on both sides"],
  },
] as const;

const guardedEdgeCases = [
  {
    icon: Ticket,
    title: "No overbooking, ever",
    body: "RSVPs run inside a transaction that locks the event row (SELECT … FOR UPDATE) before counting, so the 101st booking against a 100-seat event fails cleanly.",
    phase: 5,
  },
  {
    icon: WifiOff,
    title: "Check-ins survive bad WiFi",
    body: "Scans are queued in browser storage the moment the network drops, then replayed idempotently against the server when signal returns.",
    phase: 6,
  },
  {
    icon: ShieldCheck,
    title: "Tenant isolation by construction",
    body: "Every query takes tenantId as a required argument. Cross-tenant reads are treated as a bug, not a permission setting.",
    phase: 3,
  },
  {
    icon: Gauge,
    title: "Registration rate limits",
    body: "Per-identity token buckets on RSVP and invite endpoints so a script cannot drain an event or spam a club.",
    phase: 5,
  },
  {
    icon: CalendarDays,
    title: "UTC in, local out",
    body: "Timestamps are persisted in UTC and rendered in the viewer's timezone, with the tenant timezone as the scheduling default.",
    phase: 4,
  },
  {
    icon: QrCode,
    title: "Soft deletes keep history",
    body: "Events and clubs carry deleted_at; historical attendance and ticket records stay intact after an event is 'removed'.",
    phase: 4,
  },
] as const;

const statusStyles: Record<PhaseStatus, string> = {
  complete: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  in_progress: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  planned: "border-border bg-muted text-muted-foreground",
};

const statusLabels: Record<PhaseStatus, string> = {
  complete: "Complete",
  in_progress: "In progress",
  planned: "Planned",
};

const statusIcons = {
  complete: CircleCheck,
  in_progress: Radio,
  planned: Compass,
} as const;

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-14 px-4 py-12">
        {/* Hero */}
        <section className="flex flex-col items-start gap-5">
          <Badge variant="outline" className="gap-1.5 py-1">
            <CircleCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            Phase 1 shipped · runnable app, health-checked API
          </Badge>

          <h1 className="max-w-3xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            One platform for every club event on campus.
          </h1>

          <p className="max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
            {siteConfig.description}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {/* Links styled as buttons: `buttonVariants` keeps the markup a real
                <a> instead of a <button>, so prefetching and middle-click work. */}
            <Link
              href="/api/health"
              prefetch={false}
              className={cn(buttonVariants({ size: "lg" }))}
            >
              Open the API health check
              <ArrowRight data-icon="inline-end" />
            </Link>
            <a href="#roadmap" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
              See the build roadmap
            </a>
          </div>
        </section>

        <Separator />

        {/* Stack */}
        <section aria-labelledby="stack-heading" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="stack-heading" className="font-heading text-2xl font-semibold tracking-tight">
              The stack, locked in
            </h2>
            <p className="text-sm text-muted-foreground">
              Phase 1 wires all four layers together at once, so later phases only add features — never plumbing.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stackGroups.map((group) => (
              <Card key={group.title}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <group.icon className="size-4 text-muted-foreground" />
                    {group.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                    {group.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Tenancy model */}
        <section aria-labelledby="tenancy-heading" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="tenancy-heading" className="font-heading text-2xl font-semibold tracking-tight">
              How tenancy is modelled
            </h2>
            <p className="text-sm text-muted-foreground">
              Pool database, one schema, hard tenant scoping. Users are global; their roles are per club.
            </p>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-6 pt-6">
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-1 flex-col gap-1 rounded-lg border bg-muted/40 p-4">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Boxes className="size-4 text-muted-foreground" />
                    Tenant
                  </span>
                  <span className="text-xs text-muted-foreground">
                    A college or university. Owns branding, domain and timezone.
                  </span>
                </div>
                <ArrowRight aria-hidden className="size-4 shrink-0 self-center text-muted-foreground max-sm:rotate-90" />
                <div className="flex flex-1 flex-col gap-1 rounded-lg border bg-muted/40 p-4">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Layers className="size-4 text-muted-foreground" />
                    Club
                  </span>
                  <span className="text-xs text-muted-foreground">
                    A student organisation inside the tenant — robotics, debate, drama.
                  </span>
                </div>
                <ArrowRight aria-hidden className="size-4 shrink-0 self-center text-muted-foreground max-sm:rotate-90" />
                <div className="flex flex-1 flex-col gap-1 rounded-lg border bg-muted/40 p-4">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Users className="size-4 text-muted-foreground" />
                    Member
                  </span>
                  <span className="text-xs text-muted-foreground">
                    A global user joined to clubs with a role: President, Event Manager, Member.
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">The rule: </span>
                one person can be <span className="font-medium text-foreground">President of Club A</span> and a
                plain <span className="font-medium text-foreground">Member of Club B</span> in the same tenant.
                Authorisation is therefore always evaluated as <em>user × club × action</em> — never on a global
                role flag.
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Edge cases */}
        <section aria-labelledby="edges-heading" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="edges-heading" className="font-heading text-2xl font-semibold tracking-tight">
              Edge cases this build is designed around
            </h2>
            <p className="text-sm text-muted-foreground">
              Each one has a phase where it gets implemented and a test that proves it.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {guardedEdgeCases.map((edge) => (
              <Card key={edge.title} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <edge.icon className="size-4 text-muted-foreground" />
                    {edge.title}
                  </CardTitle>
                  <CardAction>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      P{edge.phase}
                    </Badge>
                  </CardAction>
                  <CardDescription>{edge.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* Roadmap */}
        <section aria-labelledby="roadmap-heading" className="flex flex-col gap-5 scroll-mt-20" id="roadmap">
          <div className="flex flex-col gap-1">
            <h2 id="roadmap-heading" className="font-heading text-2xl font-semibold tracking-tight">
              Build roadmap
            </h2>
            <p className="text-sm text-muted-foreground">
              Phase-gated: each phase is reviewed, then linted, type-checked and built before the next one starts.
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <ol className="flex flex-col">
                {phaseRoadmap.map((phase) => {
                  const StatusIcon = statusIcons[phase.status];
                  return (
                    <li
                      key={phase.id}
                      className="flex gap-4 border-b border-border/60 py-4 last:border-0 last:pb-0 first:pt-0"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                        {phase.id}
                      </span>
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{phase.title}</span>
                          <Badge className={statusStyles[phase.status]}>
                            <StatusIcon className="size-3" />
                            {statusLabels[phase.status]}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{phase.summary}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            {siteConfig.name} · multi-tenant club event management · scaffolding in progress
          </span>
          <span>
            Docs live in the repo: <code className="font-mono">docs/architecture.md</code>,{" "}
            <code className="font-mono">docs/PHASES.md</code>
          </span>
        </div>
      </footer>
    </div>
  );
}
