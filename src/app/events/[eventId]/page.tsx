import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, Info, MapPin, ScanLine, Users } from "lucide-react";

import {
  RegisterPanel,
  type SeatAvailability,
} from "@/components/features/ticket/register-panel";
import { DateBlock } from "@/components/common/date-block";
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
import { PublicEventView } from "@/components/features/explore/public-event-view";
import { EventLinks, EventPoster, TagChips } from "@/components/features/event/event-extras";
import { ApiError } from "@/lib/api/response";
import { authHref } from "@/lib/auth/callback-url";
import { requireEventAccess, type EventContext } from "@/lib/auth/guards";
import { decideSeat, registrationClosedReason } from "@/lib/domain/ticket-rules";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import { getAttendanceReport } from "@/lib/services/check-in-service";
import { findTicketForUser, listEventRoster } from "@/lib/services/ticket-service";
import { ticketCountsByEvent, whatsappLinkFor } from "@/lib/services/event-service";
import { getPublicEvent, type PublicEvent } from "@/lib/services/public-event-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Event" };
export const dynamic = "force-dynamic";

/**
 * One event, as a student sees it.
 *
 * The page decides nothing about permission — `requireEventAccess` does, and a
 * draft or a members-only event simply 404s here (a thrown guard error would
 * render a 500, so the two failure modes are translated into a page).
 */
async function loadEvent(
  eventId: string,
): Promise<
  | { kind: "ok"; context: EventContext }
  | { kind: "public"; event: PublicEvent; viewer: "guest" | "outsider" }
  | { kind: "not-found" }
> {
  try {
    return { kind: "ok", context: await requireEventAccess(eventId, "ticket:rsvp") };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
      // Not signed in (401), or signed in but not in this college (404): an
      // event marked "open to everyone" is still shown, read-only. Anything
      // else keeps the old answer — sign in, or "not found".
      const isGuest = error.status === 401;
      const publicEvent = await getPublicEvent(eventId);
      if (publicEvent) return { kind: "public", event: publicEvent, viewer: isGuest ? "guest" : "outsider" };
      if (isGuest) redirect(authHref("/sign-in", `/events/${eventId}`));
      return { kind: "not-found" };
    }
    throw error;
  }
}

/** Why the Register button is absent, in the words a student needs. */
function closedMessage(context: EventContext): string | null {
  switch (registrationClosedReason({
    status: context.event.status,
    startTime: context.event.startTime,
    now: new Date(),
  })) {
    case "DRAFT":
      return "This event is still a draft, so it is not taking registrations yet.";
    case "CANCELLED":
      return "This event was cancelled. If you had a ticket, it is no longer valid at the door.";
    case "STARTED":
      return "Registration closed when the event started. Speak to the club if you are already inside.";
    case null:
      return null;
  }
}

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const result = await loadEvent(eventId);
  if (result.kind === "not-found") notFound();
  if (result.kind === "public") return <PublicEventView event={result.event} viewer={result.viewer} />;

  const { context } = result;
  const { event, club } = context;

  const [counts, myTicket, roster, attendance, whatsapp] = await Promise.all([
    ticketCountsByEvent([eventId]),
    findTicketForUser(eventId, context.user.id),
    context.isOrganizer ? listEventRoster(eventId, event.tenantId) : Promise.resolve(null),
    context.isOrganizer ? getAttendanceReport(eventId, event.tenantId) : Promise.resolve(null),
    // The group link is only read out for organisers and people holding a seat.
    whatsappLinkFor(eventId, event.tenantId, { userId: context.user.id, isOrganizer: context.isOrganizer }),
  ]);

  const registered = counts.get(eventId)?.registered ?? 0;
  const waitlisted = counts.get(eventId)?.waitlisted ?? 0;

  const closed = closedMessage(context);

  // The same function the server uses to decide, so the button cannot promise
  // "Register" for a room the API will refuse.
  const seat = decideSeat({
    capacity: event.capacity,
    registeredCount: registered,
    waitlistEnabled: event.waitlistEnabled,
  });

  const availability: SeatAvailability = seat === "FULL" ? "FULL" : seat === "WAITLISTED" ? "WAITLISTED" : "REGISTERED";

  const fillPercent =
    event.capacity === null ? 0 : Math.min(100, Math.round((registered / event.capacity) * 100));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <Link
        href="/events"
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        All upcoming events
      </Link>

      <header className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-start">
        <DateBlock date={event.startTime} timeZone={club.timezone} size="lg" className="shadow-print-sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Link
            href={`/clubs/${club.id}`}
            className="eyebrow self-start text-primary underline-offset-4 hover:underline"
          >
            {club.name}
          </Link>
          <h1 className="text-3xl leading-[1.05] font-extrabold sm:text-5xl">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={event.status === "CANCELLED" ? "destructive" : "default"}>
              {event.status.charAt(0) + event.status.slice(1).toLowerCase()}
            </Badge>
            <Badge variant={event.isPublic ? "secondary" : "outline"}>
              {event.isPublic ? "Open to everyone" : "Members only"}
            </Badge>
          </div>
          <TagChips tags={event.tags} linkTo={event.isPublic ? "board" : undefined} />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" />
              {formatDateTimeInZone(event.startTime, club.timezone)}
              {" → "}
              {formatDateTimeInZone(event.endTime, club.timezone)}
              <span className="text-xs">({zoneAbbreviation(event.startTime, club.timezone)})</span>
            </span>
            {event.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" />
                {event.location}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Box office: on phones it comes first, on desktop it sticks to the right. */}
        <aside className="flex flex-col gap-5 rounded-lg border border-foreground/80 bg-card p-5 shadow-print lg:sticky lg:top-24 lg:order-last dark:border-foreground/25">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Your seat</span>
            <p className="text-sm text-muted-foreground">
              One ticket per person. Cancelling returns the seat to the first person in the queue,
              automatically.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-heading text-3xl font-bold tabular-nums">
                {registered}
                {event.capacity !== null ? (
                  <span className="text-lg font-semibold text-muted-foreground"> / {event.capacity}</span>
                ) : null}
              </span>
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="size-4" />
                {event.capacity === null ? "unlimited seats" : "registered"}
              </span>
            </div>
            {event.capacity !== null ? (
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full transition-all", fillPercent >= 100 ? "bg-primary" : "bg-foreground/75")}
                  style={{ width: `${Math.max(fillPercent, 2)}%` }}
                />
              </div>
            ) : null}
            {waitlisted > 0 ? (
              <span className="font-mono text-xs text-muted-foreground">{waitlisted} waiting in the queue</span>
            ) : null}
          </div>

          <div className="perforation" aria-hidden="true" />

          <RegisterPanel
            eventId={eventId}
            availability={availability}
            closedReason={closed}
            ticket={
              myTicket
                ? {
                    id: myTicket.id,
                    status: myTicket.status === "WAITLISTED" ? "WAITLISTED" : "REGISTERED",
                    queuePosition: myTicket.queuePosition,
                  }
                : null
            }
            waitlistEnabled={event.waitlistEnabled}
          />
          <EventLinks instagramUrl={event.instagramUrl} whatsapp={whatsapp} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
      {event.posterUrl ? (
        <EventPoster src={event.posterUrl} title={event.title} variant="hero" className="max-w-sm" />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" />
            About this event
          </CardTitle>
          <CardDescription>
            Stored as one instant in UTC, shown in {club.timezone} — the college&apos;s timezone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {event.description ? (
            <p className="leading-relaxed whitespace-pre-line text-foreground/85">{event.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">The organisers have not added a description yet.</p>
          )}
        </CardContent>
      </Card>

      {attendance ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="size-4 text-primary" />
              The door
            </CardTitle>
            <CardDescription>
              Check people in on the day. The scanner works with no internet — scans are held on the
              phone and uploaded when the signal returns.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" />
                {attendance.counts.checkedIn} of {attendance.counts.registered} turned up
              </span>
              <span className="text-xs text-muted-foreground">
                {attendance.counts.attendanceRate}% attendance · {attendance.counts.waitlisted} on the
                waitlist
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/events/${eventId}/door`}
                className={cn(buttonVariants({ size: "sm" }))}
              >
                <ScanLine data-icon="inline-start" />
                Open the scanner
              </Link>
              <Link
                href={`/events/${eventId}/attendance`}
                className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
              >
                Attendance report
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {roster ? (
        <Card>
          <CardHeader>
            <CardTitle>Who is coming ({roster.registered.length})</CardTitle>
            <CardDescription>
              Only the people who run this club can see this list. Waitlist order is shown because
              that is the order seats are handed out in.
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
                {roster.registered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground">
                      Nobody has registered yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  roster.registered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.displayName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.user.email}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDateTimeInZone(row.createdAt, club.timezone)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-3">
              <span className="text-sm font-medium">Waitlist ({roster.waitlisted.length})</span>
              {roster.waitlisted.length === 0 ? (
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
                    {roster.waitlisted.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="tabular-nums">{row.queuePosition}</TableCell>
                        <TableCell className="font-medium">{row.displayName}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatDateTimeInZone(row.createdAt, club.timezone)}
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
          <AlertTitle>Only the organisers see the guest list</AlertTitle>
          <AlertDescription>
            You can see how many seats are taken, but not who took them. Switch to a President or
            Lead account to see the roster.
          </AlertDescription>
        </Alert>
      )}
        </div>
      </div>
    </div>
  );
}
