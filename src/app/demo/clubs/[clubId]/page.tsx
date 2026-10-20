import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  DoorOpen,
  Info,
  Link2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEMO_ACCOUNTS, DEMO_INVITE_TOKEN, findDemoAccount } from "@/config/demo";
import { db } from "@/lib/db/client";
import { isDemoModeEnabled } from "@/lib/demo/mode";
import { canClub, type Actor, type ClubAction } from "@/lib/auth/rbac";
import { checkInWindowState } from "@/lib/domain/check-in";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import { listClubInvites } from "@/lib/services/invite-service";
import { cn } from "@/lib/utils";
import { TagChips } from "@/components/features/event/event-extras";

export const metadata: Metadata = { title: "Club preview" };
export const dynamic = "force-dynamic";

/**
 * Read-only club page for the cookie-free demo (see src/app/demo/page.tsx).
 *
 * Its whole reason to exist: the real `/clubs/[clubId]` page needs a session, and
 * an embedded preview frame cannot store cookies — so this renders the same club,
 * the same member list and the same permission decisions for a chosen seeded
 * user, without authentication.
 *
 * It is deliberately read-only, and it never renders an invite's token or URL:
 * the shareable link is a secret that only a signed-in President may see. What it
 * does show is the *shape* of the feature — which links exist, what role they
 * grant, and whether they are still usable.
 */

const CLUB_ROLE_LABELS = {
  PRESIDENT: "President",
  EVENT_MANAGER: "Event Manager",
  MEMBER: "Member",
} as const;

const TENANT_ROLE_LABELS = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
} as const;

/** The password in every demo account, shown here so reviewers can try the real thing. */
const DEMO_PASSWORD = "password123";

interface Capability {
  readonly action: ClubAction;
  readonly label: string;
  /** Why a role does NOT get this, in plain words. */
  readonly deniedBecause: string;
}

const CAPABILITIES: readonly Capability[] = [
  {
    action: "club:read",
    label: "Open this club's page",
    deniedBecause: "you are not a member of this college",
  },
  {
    action: "club:update",
    label: "Edit the club's name and description",
    deniedBecause: "only the club's President (or a college admin) can edit it",
  },
  {
    action: "club:manage_members",
    label: "Change someone's role, or remove them",
    deniedBecause: "only the club's President (or a college admin) can manage members",
  },
  {
    action: "club:invite",
    label: "Create invite links",
    deniedBecause: "only the club's President (or a college admin) can invite people",
  },
  {
    action: "event:publish",
    label: "Create and publish events",
    deniedBecause: "Presidents and Event Managers look after events",
  },
  {
    action: "attendance:scan",
    label: "Scan people in at the door",
    deniedBecause: "Presidents and Event Managers run the door",
  },
  {
    action: "club:delete",
    label: "Delete this club",
    deniedBecause: "only the college Owner or Admin may delete a club",
  },
];

export default async function DemoClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  if (!isDemoModeEnabled()) notFound();

  const [{ clubId }, { as }] = await Promise.all([params, searchParams]);
  const account = findDemoAccount(as);

  const viewer = await db.user.findFirst({
    where: { email: account.email, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });

  const club = await db.club.findFirst({
    where: { id: clubId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      category: true,
      tenantId: true,
      tenant: { select: { name: true, timezone: true, deletedAt: true } },
      _count: { select: { members: { where: { deletedAt: null } } } },
    },
  });

  if (!viewer || !club || club.tenant.deletedAt) notFound();

  // Exactly what the real guards do, in the same order: college first, then club.
  const [tenantMembership, clubMembership] = await Promise.all([
    db.tenantMember.findFirst({
      where: { tenantId: club.tenantId, userId: viewer.id, deletedAt: null },
      select: { role: true },
    }),
    db.clubMember.findFirst({
      where: { clubId: club.id, userId: viewer.id, deletedAt: null },
      select: { role: true },
    }),
  ]);

  const viewerSwitcher = (currentClubId: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">View as:</span>
      {DEMO_ACCOUNTS.map((candidate) => {
        const active = candidate.key === account.key;
        return (
          <Link
            key={candidate.key}
            href={`/demo/clubs/${currentClubId}?as=${candidate.key}`}
            className={cn(
              buttonVariants({ size: "sm", variant: active ? "default" : "outline" }),
              active ? "" : "text-muted-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {candidate.displayName}
          </Link>
        );
      })}
    </div>
  );

  // ── The viewer cannot see this college at all: show what the real app shows ──
  if (!tenantMembership) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
        {viewerSwitcher(club.id)}
        <Card>
          <CardHeader>
            <CardTitle>Nothing to see here — and that is the point</CardTitle>
            <CardDescription>
              {account.displayName} is not a member of {club.tenant.name}, so this club does not appear
              to exist for them.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              The real app answers with a plain 404 page, never a &ldquo;permission denied&rdquo; message,
              so somebody from another college cannot even confirm that a club exists by guessing its
              web address. Switch back to a member of {club.tenant.name} to see the club itself.
            </p>
            <Link
              href={`/demo/clubs/${club.id}?as=aarav`}
              className={cn(buttonVariants({ variant: "outline" }), "self-start")}
            >
              View as Aarav (a member of this college)
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const actor: Actor = {
    tenantRole: tenantMembership.role,
    clubRole: clubMembership?.role ?? null,
  };

  const now = new Date();
  const canRunDoor = canClub(actor, "attendance:scan");

  const events = await db.event.findMany({
    where: { clubId: club.id, deletedAt: null },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      startTime: true,
      endTime: true,
      capacity: true,
      status: true,
      isPublic: true,
      waitlistEnabled: true,
      tags: true,
      _count: {
        select: {
          tickets: { where: { status: "REGISTERED" } },
        },
      },
    },
  });

  // Queue lengths for these events in one query, so a full room can say how many
  // people are waiting behind it.
  const waitlistCounts = await db.ticket.groupBy({
    by: ["eventId"],
    where: {
      eventId: { in: events.map((event) => event.id) },
      status: "WAITLISTED",
    },
    _count: { _all: true },
  });

  const waitlistByEvent = new Map(
    waitlistCounts.map((row) => [row.eventId, row._count._all] as const),
  );

  const members = await db.clubMember.findMany({
    where: { clubId: club.id, deletedAt: null },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    select: {
      id: true,
      role: true,
      joinedAt: true,
      user: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  // Only a President or college admin would see this section when signed in, so
  // only show it here for those viewers — the point is fidelity to the real page.
  const seesInvites = canClub(actor, "club:invite");
  const invites = seesInvites ? await listClubInvites(club.id, club.tenantId) : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
      <Alert className="border-dashed border-primary/45 bg-primary/[0.06]">
        <Info className="text-primary" />
        <AlertTitle>Demo preview — read-only, no sign-in required</AlertTitle>
        <AlertDescription>
          This is the same club page a signed-in member sees at{" "}
          <code className="font-mono text-xs">/clubs/{club.id.slice(0, 8)}…</code>, rendered without
          cookies. Buttons that would change data are left out; everything else is real data from the
          database. Sign in on your own machine ({DEMO_PASSWORD} for any demo account below) to use the
          working version.
        </AlertDescription>
      </Alert>

      <Link
        href={`/demo?as=${account.key}`}
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        Back to {account.displayName}&apos;s dashboard
      </Link>

      <div className="flex items-start gap-5">
        <span
          aria-hidden="true"
          className="hidden size-16 shrink-0 items-center justify-center rounded-lg bg-foreground font-heading text-3xl font-extrabold text-background shadow-print-sm sm:flex"
        >
          {club.name.charAt(0)}
        </span>
        <div className="flex min-w-0 flex-col gap-2">
        <span className="eyebrow text-primary">Club</span>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl leading-[1.08] font-bold sm:text-4xl">{club.name}</h1>
          {clubMembership ? (
            <Badge>
              {CLUB_ROLE_LABELS[clubMembership.role]}
            </Badge>
          ) : (
            <Badge variant="secondary">College {TENANT_ROLE_LABELS[tenantMembership.role]}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {club.description ?? "No description yet."}
        </p>
        <p className="text-xs text-muted-foreground">
          {club.tenant.name} · {club.category ?? "Uncategorised"} ·{" "}
          <code className="font-mono">/{club.slug}</code> · scheduling timezone {club.tenant.timezone}
        </p>
      </div>
        </div>

      {viewerSwitcher(club.id)}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            What {account.displayName} can do here
          </CardTitle>
          <CardDescription>
            Every line is decided by the permission table in{" "}
            <code className="font-mono text-xs">src/lib/auth/rbac.ts</code> — one file, checked on the
            server for every request. Switch viewers above and watch the answers change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {CAPABILITIES.map((capability) => {
              const allowed = canClub(actor, capability.action);
              return (
                <li
                  key={capability.action}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{capability.label}</span>
                    {!allowed ? (
                      <span className="text-xs text-muted-foreground">
                        Not allowed — {capability.deniedBecause}.
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Allowed by their role
                        {clubMembership
                          ? ` (${CLUB_ROLE_LABELS[clubMembership.role]})`
                          : ` (college ${TENANT_ROLE_LABELS[tenantMembership.role].toLowerCase()} — college admins run every club)`}
                        .
                      </span>
                    )}
                  </span>
                  {allowed ? (
                    <Badge className="shrink-0 gap-1 bg-success/90 text-white dark:bg-success">
                      <Check className="size-3" />
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
                      <X className="size-3" />
                      No
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            Events ({events.length})
          </CardTitle>
          <CardDescription>
            Times are stored in UTC and shown here in the college&apos;s timezone (
            {club.tenant.timezone}). A Draft is visible only to the people who run the club;
            publishing announces it; a cancelled event stays visible so nobody turns up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  // Drafts belong to organisers only — the real page never sends them
                  // to a plain member at all; this mirrors that decision.
                  if (event.status === "DRAFT" && !canClub(actor, "event:update")) return null;

                  return (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <Link
                            href={`/demo/events/${event.id}?as=${account.key}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {event.title}
                          </Link>
                          {event.location ? (
                            <span className="text-xs text-muted-foreground">{event.location}</span>
                          ) : null}
                          <TagChips tags={event.tags} className="pt-1" />
                          {canRunDoor && checkInWindowState(event, club.tenant.timezone, now) === "OPEN" ? (
                            <Link
                              href={`/demo/events/${event.id}/door?as=${account.key}`}
                              className="mt-1 inline-flex w-fit items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success hover:bg-success/20"
                            >
                              <DoorOpen className="size-3" />
                              Door is open — try the scanner
                            </Link>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTimeInZone(event.startTime, club.tenant.timezone)}
                        <span className="block text-xs">
                          {formatDateTimeInZone(event.endTime, club.tenant.timezone)} ·{" "}
                          {zoneAbbreviation(event.startTime, club.tenant.timezone)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            event.status === "PUBLISHED"
                              ? "default"
                              : event.status === "CANCELLED"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {event.status.charAt(0) + event.status.slice(1).toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.isPublic ? "secondary" : "outline"}>
                          {event.isPublic ? "Open to everyone" : "Members only"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {event._count.tickets}
                        {event.capacity ? (
                          <span className="text-muted-foreground"> / {event.capacity}</span>
                        ) : null}
                        {(waitlistByEvent.get(event.id) ?? 0) > 0 ? (
                          <span className="block text-xs text-amber-600">
                            {waitlistByEvent.get(event.id)} waiting
                          </span>
                        ) : event.waitlistEnabled ? (
                          <span className="block text-xs text-muted-foreground">waitlist on</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            {canClub(actor, "event:create")
              ? "As President or Event Manager you would also get a \u201cNew event\u201d button here, plus Publish, Edit and Cancel on each row."
              : "Creating and publishing events is reserved for the club\u2019s President and Event Manager."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            Members ({club._count.members})
          </CardTitle>
          <CardDescription>
            In the signed-in version a President can change a role from a dropdown here. The club&apos;s
            only President can never be demoted or removed — the server refuses it with an explanation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {[member.user.firstName, member.user.lastName].filter(Boolean).join(" ") ||
                      member.user.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.user.email}</TableCell>
                  <TableCell>
                    <Badge variant={member.role === "MEMBER" ? "outline" : "default"}>
                      {CLUB_ROLE_LABELS[member.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {member.joinedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {seesInvites ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="size-4 text-muted-foreground" />
              Invite links
            </CardTitle>
            <CardDescription>
              A President creates a link, chooses the role it grants, and pastes it into the class group.
              Whoever opens it joins — with exactly that role and nothing more.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No links have been created for this club yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grants</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Used</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Created by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={invite.role === "MEMBER" ? "outline" : "default"}>
                            {CLUB_ROLE_LABELS[invite.role]}
                          </Badge>
                          {invite.token === DEMO_INVITE_TOKEN ? (
                            <Link
                              href={`/join/${invite.token}`}
                              prefetch={false}
                              className="text-xs font-medium underline underline-offset-4"
                            >
                              open the joining page →
                            </Link>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            invite.status === "active"
                              ? "secondary"
                              : invite.status === "revoked"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {invite.status === "used_up"
                            ? "used up"
                            : invite.status === "expired"
                              ? "expired"
                              : invite.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {invite.uses} / {invite.maxUses}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {invite.expiresAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {[invite.createdBy.firstName, invite.createdBy.lastName]
                          .filter(Boolean)
                          .join(" ") || invite.createdBy.email}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <Alert>
              <Info />
              <AlertDescription className="flex flex-col gap-1">
                <span className="font-medium text-foreground">
                  Why you cannot see the links themselves
                </span>
                <span>
                  The shareable part of a link is a secret. It is shown once, to the signed-in President
                  who created it — never in this cookie-free preview. The shape of it is 43 unguessable
                  characters such as
                  <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">6Jm2…Vq4</code>
                  appended to the site address, after{" "}
                  <code className="font-mono text-xs">join/</code>.
                </span>
                <span>
                  The one exception is the row marked{" "}
                  <span className="font-medium text-foreground">open the joining page</span>: that link
                  is planted by the sample data on purpose (it grants nothing but ordinary membership of
                  a demo club) so you can see what a visitor gets when they click an invite. Every other
                  row deliberately hides its secret.
                </span>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <Info />
          <AlertDescription>
            {account.displayName} does not see this club&apos;s invite links — creating and revoking them
            belongs to the President. Switch to <strong>Aarav Shah</strong> above to reveal the section.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/demo?as=${account.key}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to the dashboard preview
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "ghost" }))}>
          Back to the project overview
        </Link>
      </div>
    </div>
  );
}
