import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, DoorOpen, Info, Users } from "lucide-react";

import { MemberOverviewView } from "@/components/features/dashboard/member-overview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { checkInWindowState } from "@/lib/domain/check-in";
import { isDemoModeEnabled } from "@/lib/demo/mode";
import { loadMemberOverview } from "@/lib/services/dashboard-service";
import { cn } from "@/lib/utils";
import { DEMO_ACCOUNTS, findDemoAccount } from "@/config/demo";
import { DashboardAnnouncements } from "@/components/features/announcement/dashboard-announcements";
import { listAnnouncementsForMember } from "@/lib/services/announcement-service";

export const metadata: Metadata = { title: "Demo preview" };
export const dynamic = "force-dynamic";

/**
 * Read-only preview of the member dashboard that requires NO cookies.
 *
 * Why it exists: when the app is viewed inside an embedded preview frame, the
 * browser refuses to store cookies (third-party context), so a real sign-in
 * cannot complete — the server rejects the request with `MissingCSRF` before the
 * password is even checked. This page renders the same data, from the same
 * service, for a chosen seeded user, so the app can be reviewed without
 * authentication.
 *
 * It is disabled in production unless DEMO_MODE=on (see src/lib/demo/mode.ts).
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  if (!isDemoModeEnabled()) notFound();

  const { as } = await searchParams;
  const account = findDemoAccount(as);

  const user = await db.user.findFirst({
    where: { email: account.email, deletedAt: null },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        <Alert>
          <Info />
          <AlertTitle>The demo data has not been seeded yet</AlertTitle>
          <AlertDescription>
            Run <code className="font-mono text-xs">npm run db:seed</code> to create the demo college,
            clubs and users, then reload this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // The overview, the college's clubs and today's door event do not depend on
  // each other, so they are fetched together (one round trip, not three).
  const now = new Date();
  const [overview, clubs, doorEvent, announcements, pendingClubs] = await Promise.all([
    loadMemberOverview(user.id),
    // Every club in the colleges this viewer belongs to — including clubs they
    // have not joined, which is exactly how a college admin sees the place.
    // Each one links to the read-only club preview below.
    db.club.findMany({
      where: {
        tenant: { deletedAt: null, members: { some: { userId: user.id, deletedAt: null } } },
        deletedAt: null,
        status: "ACTIVE",
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        category: true,
        _count: { select: { members: { where: { deletedAt: null } } } },
      },
    }),
    // The event whose door is open right now: that is the one the scanner demo
    // uses. If the seed is old and nothing is live today, the card simply does
    // not appear.
    db.event.findFirst({
      where: {
        deletedAt: null,
        status: "PUBLISHED",
        club: { deletedAt: null, tenant: { deletedAt: null } },
        startTime: { lte: now },
        endTime: { gte: now },
      },
      orderBy: { startTime: "desc" },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        club: { select: { name: true, tenant: { select: { timezone: true } } } },
      },
    }),
    listAnnouncementsForMember(user.id, 4),
    // Phase 12: clubs waiting for a professor's code, for the two people who
    // may see one — the student who asked, and the college's Owners/Admins.
    db.club.findMany({
      where: {
        status: "PENDING",
        deletedAt: null,
        tenant: { deletedAt: null },
        OR: [
          { members: { some: { userId: user.id, role: "PRESIDENT", deletedAt: null } } },
          {
            tenant: {
              members: { some: { userId: user.id, deletedAt: null, role: { in: ["OWNER", "ADMIN"] } } },
            },
          },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const doorIsOpen =
    doorEvent !== null &&
    checkInWindowState(doorEvent, doorEvent.club.tenant.timezone, new Date()) === "OPEN";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
      <Alert className="border-dashed border-primary/45 bg-primary/[0.06]">
        <Info className="text-primary" />
        <AlertTitle>Demo preview — read-only, no sign-in required</AlertTitle>
        <AlertDescription>
          An embedded preview frame is not allowed to store cookies, so a real sign-in cannot complete
          there. This page renders the same data a signed-in user would see, fetched by the same code
          ({`loadMemberOverview`}) from the seeded database. Switch users below to compare what each
          role can see.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-2">
        <span className="eyebrow text-primary">Demo dashboard</span>
        <h1 className="text-3xl leading-[1.08] font-bold sm:text-4xl">
          Hello, {account.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.email}</span> ·{" "}
          {account.highlight}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
        <span className="eyebrow px-2">View as</span>
        {DEMO_ACCOUNTS.map((candidate) => {
          const active = candidate.key === account.key;
          return (
            <Link
              key={candidate.key}
              href={`/demo?as=${candidate.key}`}
              className={cn(
                buttonVariants({ size: "sm", variant: active ? "default" : "outline" }),
                active ? "" : "text-muted-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              {candidate.displayName}
              {active ? <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">viewing</Badge> : null}
            </Link>
          );
        })}
      </div>

      {doorEvent && doorIsOpen ? (
        <Card className="border-success/30 bg-success/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DoorOpen className="size-4 text-success" />
              Phase 6 — the door is open right now
            </CardTitle>
            <CardDescription>
              {doorEvent.club.name} is running &ldquo;{doorEvent.title}&rdquo; today. This is the
              scanner a volunteer holds at the entrance: cut the signal, scan three people, reconnect
              and watch the queue sync without duplicates.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link
              href={`/demo/events/${doorEvent.id}/door?as=${account.key}#offline-test`}
              className={cn(buttonVariants({ variant: "default" }), "gap-2")}
            >
              Open the door preview
              <ArrowRight data-icon="inline-end" />
            </Link>
            <span className="self-center text-xs text-muted-foreground">
              Aarav and Meera can work this door. Kabir and the Dean get the refusal page — which is
              the point.
            </span>
          </CardContent>
        </Card>
      ) : null}

      <DashboardAnnouncements
        announcements={announcements}
        inAnyClub={overview.clubRoles.length > 0}
        clubHref={(clubId) => `/demo/clubs/${clubId}?as=${account.key}`}
      />

      <MemberOverviewView overview={overview} />

      {clubs.length > 0 || pendingClubs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Open a club as {account.displayName}
            </CardTitle>
            <CardDescription>
              The club page shows the member list, what this person is allowed to do there, and the
              invite links they can see. It is the same page a signed-in member gets, minus the buttons.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {clubs.map((club) => (
                <Link
                  key={club.id}
                  href={`/demo/clubs/${club.id}?as=${account.key}`}
                  className={cn(buttonVariants({ variant: "secondary" }), "gap-2")}
                >
                  {club.name}
                  <span className="text-xs text-muted-foreground">
                    {club._count.members} member{club._count.members === 1 ? "" : "s"}
                  </span>
                </Link>
              ))}
              {pendingClubs.map((club) => (
                <Link
                  key={club.id}
                  href={`/demo/clubs/${club.id}?as=${account.key}`}
                  className={cn(buttonVariants({ variant: "outline" }), "gap-2 border-dashed")}
                >
                  {club.name}
                  <span className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
                    Pending
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Alert>
        <AlertDescription className="flex flex-col gap-1">
          <span className="font-medium text-foreground">
            Why there is no &ldquo;edit&rdquo; button here
          </span>
          <span>
            This preview is deliberately read-only. Creating colleges, clubs and invite links, and
            changing someone&apos;s role, all need a real session — and an embedded preview frame is not
            allowed to store the cookie that session lives in. Everything else you see is the real
            thing: the same data, from the same code, rendered by the same components. Run the app on
            your own machine (§4 of <code className="font-mono text-xs">docs/START-HERE.md</code>) or
            sign in at{" "}
            <Link href="/sign-in" className="font-medium underline underline-offset-4">
              /sign-in
            </Link>{" "}
            from a normal browser tab to use the working version.
          </span>
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-3">
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to the project overview
          <ArrowRight data-icon="inline-end" />
        </Link>
        <Link href="/api/health" prefetch={false} className={cn(buttonVariants({ variant: "ghost" }))}>
          API health
        </Link>
      </div>
    </div>
  );
}
