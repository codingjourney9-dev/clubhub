import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import {
  ArrowLeft,
  CalendarDays,
  DoorOpen as DoorIcon,
  Info,
  ListOrdered,
  MapPin,
  Ticket,
  Users,
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
import { DEMO_ACCOUNTS, findDemoAccount } from "@/config/demo";
import { canClub, type Actor } from "@/lib/auth/rbac";
import { db } from "@/lib/db/client";
import { isDemoModeEnabled } from "@/lib/demo/mode";
import { doorCodeFromSecret } from "@/lib/domain/check-in";
import { decideSeat, queueRank, registrationClosedReason } from "@/lib/domain/ticket-rules";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import { encodeTicketQr } from "@/lib/tickets/qr";
import { whatsappLinkFor } from "@/lib/services/event-service";
import { cn } from "@/lib/utils";
import { EventLinks, EventPoster, TagChips } from "@/components/features/event/event-extras";

export const metadata: Metadata = { title: "Event preview" };
export const dynamic = "force-dynamic";

/**
 * Read-only event page for the cookie-free demo.
 *
 * It exists for the same reason `/demo/clubs/[clubId]` does: the preview frame
 * cannot keep a cookie, so a signed-in page cannot be reviewed inside the chat.
 * Every fact here is real data; the only thing missing is the buttons.
 *
 * The viewer switcher is the interesting control: switch to Kabir and the page
 * shows what a person in the queue sees; switch to Aarav and the organiser's
 * guest list appears.
 */
export default async function DemoEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  if (!isDemoModeEnabled()) notFound();

  const [{ eventId }, { as }] = await Promise.all([params, searchParams]);
  const account = findDemoAccount(as);

  const event = await db.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      clubId: true,
      title: true,
      description: true,
      location: true,
      startTime: true,
      endTime: true,
      capacity: true,
      waitlistEnabled: true,
      status: true,
      isPublic: true,
      posterUrl: true,
      tags: true,
      instagramUrl: true,
      club: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
          tenant: { select: { name: true, timezone: true, deletedAt: true } },
        },
      },
    },
  });

  if (!event || event.club.deletedAt || event.club.tenant.deletedAt) notFound();

  const viewer = await db.user.findFirst({
    where: { email: account.email, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!viewer) notFound();

  const [tenantMembership, clubMembership] = await Promise.all([
    db.tenantMember.findFirst({
      where: { tenantId: event.tenantId, userId: viewer.id, deletedAt: null },
      select: { role: true },
    }),
    db.clubMember.findFirst({
      where: { clubId: event.clubId, userId: viewer.id, deletedAt: null },
      select: { role: true },
    }),
  ]);

  const actor: Actor = {
    tenantRole: tenantMembership?.role ?? null,
    clubRole: clubMembership?.role ?? null,
  };

  // Same visibility rule as the real page: no tenant membership at all means the
  // event does not exist for this person.
  if (!tenantMembership) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
        <Card>
          <CardHeader>
            <CardTitle>Nothing to see here — and that is the point</CardTitle>
            <CardDescription>
              {account.displayName} does not belong to {event.club.tenant.name}, so this event is a
              404 for them.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const seesPrivate = event.isPublic || canClub(actor, "event:view_private");
  if (!seesPrivate) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
        <Card>
          <CardHeader>
            <CardTitle>Members only — and {account.displayName} is not a member</CardTitle>
            <CardDescription>
              The real app answers 404 here, not 403, so a non-member cannot even confirm that a
              members-only event exists. Switch to a Robotics Club member to see it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/demo/events/${event.id}?as=aarav`}
              className={cn(buttonVariants({ variant: "outline" }), "self-start")}
            >
              View as Aarav (club President)
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [registeredCount, waitlisted, myTicket] = await Promise.all([
    db.ticket.count({ where: { eventId: event.id, status: "REGISTERED" } }),
    db.ticket.findMany({
      where: { eventId: event.id, status: "WAITLISTED", waitlistPosition: { not: null } },
      orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        waitlistPosition: true,
        createdAt: true,
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
    db.ticket.findFirst({
      where: { eventId: event.id, userId: viewer.id, deletedAt: null, status: { not: "CANCELLED" } },
      select: { id: true, status: true, qrCodeUuid: true, waitlistPosition: true },
    }),
  ]);

  const waitlistPositions = waitlisted.map((row) => row.waitlistPosition as number);
  const myQueuePosition =
    myTicket?.status === "WAITLISTED" ? queueRank(waitlistPositions, myTicket.waitlistPosition) : null;

  const registered = await db.ticket.findMany({
    where: { eventId: event.id, status: "REGISTERED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      user: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  const isOrganizer = canClub(actor, "event:update");
  const timeZone = event.club.tenant.timezone;
  // Same rule as the real event page: the group link only for organisers and seat holders.
  const whatsapp = await whatsappLinkFor(event.id, event.tenantId, { userId: viewer.id, isOrganizer });

  const closed = registrationClosedReason({
    status: event.status,
    startTime: event.startTime,
    now: new Date(),
  });

  const seat = decideSeat({
    capacity: event.capacity,
    registeredCount,
    waitlistEnabled: event.waitlistEnabled,
  });

  const fillPercent =
    event.capacity === null ? 0 : Math.min(100, Math.round((registeredCount / event.capacity) * 100));

  const qrDataUrl =
    myTicket?.status === "REGISTERED"
      ? await QRCode.toDataURL(encodeTicketQr(myTicket.qrCodeUuid), {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 380,
          color: { dark: "#0b0b0c", light: "#ffffff" },
        })
      : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
      <Alert className="border-dashed border-primary/45 bg-primary/[0.06]">
        <Info className="text-primary" />
        <AlertTitle>Demo preview — read-only, no sign-in required</AlertTitle>
        <AlertDescription>
          Real data, no buttons. Sign in on your own machine (<code className="font-mono text-xs">password123</code>)
          to actually claim a seat.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">View as:</span>
        {DEMO_ACCOUNTS.map((candidate) => {
          const active = candidate.key === account.key;
          return (
            <Link
              key={candidate.key}
              href={`/demo/events/${event.id}?as=${candidate.key}`}
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

      <Link
        href={`/demo/clubs/${event.club.id}?as=${account.key}`}
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        Back to {event.club.name}
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl leading-[1.08] font-bold sm:text-4xl">{event.title}</h1>
          <Badge variant={event.status === "CANCELLED" ? "destructive" : "default"}>
            {event.status.charAt(0) + event.status.slice(1).toLowerCase()}
          </Badge>
          <Badge variant={event.isPublic ? "secondary" : "outline"}>
            {event.isPublic ? "Open to everyone" : "Members only"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {event.club.name} · {event.club.tenant.name}
          {event.location ? (
            <>
              {" · "}
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {event.location}
              </span>
            </>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          Stored as one instant in UTC, shown in {timeZone}.
        </p>
        <TagChips tags={event.tags} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" />
              {formatDateTimeInZone(event.startTime, timeZone)}
              {" → "}
              {formatDateTimeInZone(event.endTime, timeZone)}
              <span className="text-xs text-muted-foreground">
                ({zoneAbbreviation(event.startTime, timeZone)})
              </span>
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4" />
              {registeredCount}
              {event.capacity === null ? " registered" : ` / ${event.capacity}`}
              {waitlisted.length > 0 ? ` · ${waitlisted.length} waiting` : ""}
            </span>
          </div>

          {event.capacity !== null ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${fillPercent}%` }} />
            </div>
          ) : null}

          {event.description ? (
            <p className="text-sm text-muted-foreground">{event.description}</p>
          ) : null}

          {event.posterUrl ? (
            <EventPoster src={event.posterUrl} title={event.title} variant="hero" className="max-w-xs" />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What {account.displayName} sees</CardTitle>
          <CardDescription>
            This is the same decision the server would make for this person right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {myTicket?.status === "REGISTERED" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>You are registered</Badge>
                <span className="text-xs text-muted-foreground">
                  A signed-in student would see this QR code, and a &ldquo;Cancel my spot&rdquo;
                  button next to it.
                </span>
              </div>
              {qrDataUrl ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a data URI, not a remote asset */}
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${account.displayName}'s ticket`}
                    width={200}
                    height={200}
                    className="h-[200px] w-[200px]"
                  />
                  <p className="text-center text-[11px] text-slate-600">
                    This code encodes the ticket&apos;s secret, not its id — Phase 6 scans exactly
                    this.
                  </p>
                  {myTicket ? (
                    <p className="text-center text-[11px] text-slate-600">
                      Door code:{" "}
                      <span className="font-mono text-xs font-semibold tracking-widest text-slate-900">
                        {doorCodeFromSecret(myTicket.qrCodeUuid).slice(0, 4)}{" "}
                        {doorCodeFromSecret(myTicket.qrCodeUuid).slice(4)}
                      </span>
                      <br />
                      printed on the ticket, for when the camera cannot help.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : myTicket?.status === "WAITLISTED" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <ListOrdered data-icon="inline-start" />
                On the waitlist — number {myQueuePosition ?? "?"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                No QR code yet: a queue place is not a seat. If one of the three holders gives theirs
                back, this person moves in automatically.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                <Ticket data-icon="inline-start" />
                {closed
                  ? "Not taking registrations"
                  : seat === "FULL"
                    ? "Cannot register — full"
                    : seat === "WAITLISTED"
                      ? "Would join the waitlist"
                      : "Could claim a seat"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {closed === "STARTED"
                  ? "Registration closes when the event starts."
                  : closed === "CANCELLED"
                    ? "The event was cancelled."
                    : "Signed in, this person would see a Register button here."}
              </span>
            </div>
          )}

          <EventLinks instagramUrl={event.instagramUrl} whatsapp={whatsapp} className="max-w-md" />
        </CardContent>
      </Card>

      {isOrganizer ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Guest list ({registered.length})
            </CardTitle>
            <CardDescription>
              Only Presidents and Event Managers see this. Roster rows carry no ticket secrets — a
              door list is not a wallet of keys.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {[row.user.firstName, row.user.lastName].filter(Boolean).join(" ") ||
                        row.user.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.user.email}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDateTimeInZone(row.createdAt, timeZone)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Waitlist ({waitlisted.length})</span>
              {waitlisted.length === 0 ? (
                <p className="text-sm text-muted-foreground">The queue is empty.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Place</TableHead>
                      <TableHead>Person</TableHead>
                      <TableHead className="text-right">Joined the queue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {waitlisted.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="tabular-nums">
                          {queueRank(waitlistPositions, row.waitlistPosition)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {[row.user.firstName, row.user.lastName].filter(Boolean).join(" ") ||
                            row.user.email}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatDateTimeInZone(row.createdAt, timeZone)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <Info />
          <AlertDescription>
            {account.displayName} does not see the guest list — only the club&apos;s President and
            Event Manager do. Switch to <strong>Aarav Shah</strong> or <strong>Meera Patel</strong>{" "}
            above to reveal it.
          </AlertDescription>
        </Alert>
      )}

      {canClub(actor, "attendance:scan") ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DoorIcon className="size-4 text-muted-foreground" />
              The door
            </CardTitle>
            <CardDescription>
              On the day, a volunteer opens the scanner on their phone and points it at the QR code.
              It keeps working when the basement has no signal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/demo/events/${event.id}/door?as=${account.key}`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Open the door preview
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/demo/clubs/${event.club.id}?as=${account.key}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to the club
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "ghost" }))}>
          Back to the project overview
        </Link>
      </div>
    </div>
  );
}
