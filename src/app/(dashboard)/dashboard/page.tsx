import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CalendarDays, Plus, ScanLine, Ticket as TicketIcon } from "lucide-react";

import { PageHeading } from "@/components/common/page-heading";
import { MemberOverviewView } from "@/components/features/dashboard/member-overview";
import { PublicEventGrid } from "@/components/features/explore/public-event-card";
import { StartClubButton } from "@/components/features/explore/start-club-button";
import { TagFilter } from "@/components/features/explore/tag-filter";
import type { EventTag } from "@/generated/prisma/enums";
import { EVENT_TAG_LABELS, tagFromParam } from "@/lib/domain/event-details";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser, getSessionUserId } from "@/lib/auth/session";
import { isDemoModeEnabled } from "@/lib/demo/mode";
import { loadMemberOverview } from "@/lib/services/dashboard-service";
import { listPublicUpcomingEvents, PUBLIC_FEED_LIMIT, type PublicEvent } from "@/lib/services/public-event-service";
import { cn } from "@/lib/utils";
import { CLUB_ROLE_LABELS } from "@/lib/domain/club-roles";
import { DashboardAnnouncements } from "@/components/features/announcement/dashboard-announcements";
import { listAnnouncementsForMember } from "@/lib/services/announcement-service";
import { RecruitmentBoard } from "@/components/features/recruitment/recruitment-board";
import { listOpenOpenings } from "@/lib/services/recruitment-service";

/** How many openings the dashboard shows before "All openings". */
const BOARD_SIZE = 6;

export const metadata: Metadata = { title: "Dashboard" };


function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Headline for the public feed, used by both versions of the page. */
function FeedHeading({ events, title }: { events: readonly PublicEvent[]; title: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow">
        {events.length === 0
          ? "Open to everyone"
          : events.length >= PUBLIC_FEED_LIMIT
            ? `The next ${events.length} · open to everyone`
            : `${events.length} coming up · open to everyone`}
      </span>
      <h2 id="feed-heading" className="text-2xl font-bold">
        {title}
      </h2>
    </div>
  );
}

/**
 * What someone without an account sees: upcoming public events from every
 * college, and a way to start a club that asks them to sign in first.
 */
async function GuestDashboard({ tag }: { tag: EventTag | null }) {
  const [events, openings] = await Promise.all([
    listPublicUpcomingEvents(undefined, { tag }),
    listOpenOpenings({ limit: BOARD_SIZE }),
  ]);
  const demo = isDemoModeEnabled();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-10 pb-28 sm:px-6 lg:pt-14">
      <PageHeading
        eyebrow="Browsing as a guest"
        title={<>What&apos;s on across campuses</>}
        description="Public events from every college on ClubHub. Look around as much as you like — you only need an account to get a ticket or start a club."
        actions={
          demo ? (
            <Link href="/demo" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              See a member&apos;s dashboard
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          ) : null
        }
      />

      <section id="feed" aria-labelledby="feed-heading" className="flex scroll-mt-24 flex-col gap-4">
        <FeedHeading events={events} title={tag ? `Upcoming · ${EVENT_TAG_LABELS[tag]}` : "Upcoming events"} />
        <TagFilter active={tag} />
        <PublicEventGrid events={events} filteredBy={tag ? EVENT_TAG_LABELS[tag] : null} />
      </section>

      <RecruitmentBoard openings={openings} />

      <section className="flex flex-col items-start gap-4 rounded-xl border border-foreground/80 bg-secondary/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8 dark:border-foreground/20">
        <div className="flex max-w-xl flex-col gap-1">
          <span className="eyebrow text-primary">Run a club?</span>
          <p className="font-heading text-xl font-bold sm:text-2xl">
            Put your club on the board. You&apos;ll be its President.
          </p>
        </div>
        <StartClubButton signedIn={false} className="shrink-0" />
      </section>

      <StartClubButton signedIn={false} placement="floating" />
    </div>
  );
}

/**
 * The dashboard. Guests get the public feed; signed-in members get their own
 * overview (from `loadMemberOverview`, the same service the cookie-free /demo
 * preview uses, so the two cannot drift apart) with the public feed below it.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[] }>;
}) {
  // `?tag=` comes from the address bar: anything that isn't a known tag is
  // simply ignored (shows everything), never an error.
  const [sessionUserId, params] = await Promise.all([getSessionUserId(), searchParams]);
  const tag = tagFromParam(params.tag);
  if (!sessionUserId) return <GuestDashboard tag={tag} />;

  // The overview, the user row and the public feed are independent, so they
  // share one round trip instead of taking three.
  const [user, overview, publicEvents, announcements, openings] = await Promise.all([
    getCurrentUser(),
    loadMemberOverview(sessionUserId),
    listPublicUpcomingEvents(6, { tag }),
    listAnnouncementsForMember(sessionUserId, 4),
    listOpenOpenings({ limit: BOARD_SIZE }),
  ]);
  // A session for an account that no longer exists: send them to sign in again.
  if (!user) redirect("/sign-in");
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-10 pb-28 sm:px-6 lg:pt-14">
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

      <DashboardAnnouncements
        announcements={announcements}
        inAnyClub={overview.clubRoles.length > 0}
      />

      <MemberOverviewView overview={overview} />

      <section id="feed" aria-labelledby="feed-heading" className="flex scroll-mt-24 flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <FeedHeading
            events={publicEvents}
            title={tag ? `Happening across campuses · ${EVENT_TAG_LABELS[tag]}` : "Happening across campuses"}
          />
          <Link href="/events" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Your colleges&apos; events
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </div>
        <TagFilter active={tag} />
        <PublicEventGrid events={publicEvents} filteredBy={tag ? EVENT_TAG_LABELS[tag] : null} />
      </section>

      <RecruitmentBoard openings={openings} />

      <StartClubButton signedIn placement="floating" />
    </div>
  );
}
