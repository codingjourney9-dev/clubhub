import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CalendarDays, Plus, ScanLine, Ticket as TicketIcon } from "lucide-react";

import { PageHeading } from "@/components/common/page-heading";
import { MemberOverviewView } from "@/components/features/dashboard/member-overview";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser, getSessionUserId } from "@/lib/auth/session";
import { isDemoModeEnabled } from "@/lib/demo/mode";
import { loadMemberOverview } from "@/lib/services/dashboard-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const CLUB_ROLE_LABELS = {
  PRESIDENT: "President",
  EVENT_MANAGER: "Event Manager",
  MEMBER: "Member",
} as const;

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The signed-in member dashboard. Data comes from `loadMemberOverview`, the same
 * service the cookie-free /demo preview uses, so the two cannot drift apart.
 */
export default async function DashboardPage() {
  // Start the overview from the session id while the user row loads — the two
  // are independent, so they share one round trip instead of taking two.
  const sessionUserId = await getSessionUserId();
  const [user, overview] = await Promise.all([
    getCurrentUser(),
    sessionUserId ? loadMemberOverview(sessionUserId) : null,
  ]);
  if (!user || !overview) redirect("/sign-in?callbackUrl=/dashboard");
  const runsSomething = overview.clubRoles.some((membership) => membership.role !== "MEMBER");

  const quickActions = [
    { href: "/events", label: "Browse upcoming events", hint: "What's on across your colleges", icon: CalendarDays },
    { href: "/tickets", label: "Your tickets", hint: "QR codes for the door", icon: TicketIcon },
    { href: "/onboarding", label: "Create or browse clubs", hint: "Start a college or a club", icon: Plus },
    ...(runsSomething
      ? [{ href: "/events", label: "Run the door", hint: "Open an event, then its scanner", icon: ScanLine }]
      : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:py-14">
      <PageHeading
        eyebrow={greeting()}
        title={<>Hello, {user.displayName}</>}
        description={
          <>
            Signed in as <span className="font-medium text-foreground">{user.email}</span>
          </>
        }
        actions={
          isDemoModeEnabled() ? (
            <Link href="/demo" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Compare what each role sees
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          ) : null
        }
      />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {quickActions.map((action) => (
          <li key={action.label}>
            <Link
              href={action.href}
              className="group flex h-full items-start gap-4 rounded-lg border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-print-sm"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <action.icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">{action.label}</span>
                <span className="text-sm text-muted-foreground">{action.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="clubs-heading" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Your clubs</span>
            <h2 id="clubs-heading" className="text-2xl font-bold">
              Where you belong
            </h2>
          </div>
          <Link href="/onboarding" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <Plus data-icon="inline-start" />
            New club
          </Link>
        </div>

        {overview.clubRoles.length === 0 ? (
          <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-foreground/25 bg-card/60 p-8">
            <p className="max-w-lg text-muted-foreground">
              You are not part of a club yet. Create a college and a club to get started — or ask a club
              president for an invite link.
            </p>
            <Link href="/onboarding" className={cn(buttonVariants())}>
              Create your first club
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overview.clubRoles.map((membership) => (
              <li key={membership.club.id}>
                <Link
                  href={`/clubs/${membership.club.id}`}
                  className="group relative flex h-full flex-col gap-6 overflow-hidden rounded-lg border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-print-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-11 items-center justify-center rounded-md bg-foreground font-heading text-lg font-bold text-background">
                      {membership.club.name.charAt(0)}
                    </span>
                    <span
                      className={cn(
                        "rounded-sm border px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium tracking-wide uppercase",
                        membership.role === "MEMBER"
                          ? "border-foreground/20 text-muted-foreground"
                          : "border-primary/50 bg-primary/10 text-primary",
                      )}
                    >
                      {CLUB_ROLE_LABELS[membership.role]}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-heading text-xl font-bold tracking-tight group-hover:underline group-hover:decoration-primary group-hover:decoration-2 group-hover:underline-offset-4">
                      {membership.club.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {membership.club.category ?? "Uncategorised"}
                    </span>
                  </div>
                  <ArrowUpRight className="absolute right-4 bottom-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MemberOverviewView overview={overview} />
    </div>
  );
}
