import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, Info, MapPin, Users } from "lucide-react";

import {
  RegisterPanel,
  type SeatAvailability,
} from "@/components/features/ticket/register-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api/response";
import { requireEventAccess, type EventContext } from "@/lib/auth/guards";
import { decideSeat, registrationClosedReason } from "@/lib/domain/ticket-rules";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import { findTicketForUser, listEventRoster } from "@/lib/services/ticket-service";
import { ticketCountsByEvent } from "@/lib/services/event-service";

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
): Promise<{ kind: "ok"; context: EventContext } | { kind: "not-found" }> {
  try {
    return { kind: "ok", context: await requireEventAccess(eventId, "ticket:rsvp") };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/events/${eventId}`)}`);
    }
    if (error instanceof ApiError && error.status === 404) return { kind: "not-found" };
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

  const { context } = result;
  const { event, club } = context;

  const [counts, myTicket, roster] = await Promise.all([
    ticketCountsByEvent([eventId]),
    findTicketForUser(eventId, context.user.id),
    context.isOrganizer ? listEventRoster(eventId, event.tenantId) : Promise.resolve(null),
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <Link
        href="/events"
        className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-3" />
        All upcoming events
      </Link>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{event.title}</h1>
          <Badge variant={event.status === "CANCELLED" ? "destructive" : "default"}>
            {event.status.charAt(0) + event.status.slice(1).toLowerCase()}
          </Badge>
          <Badge variant={event.isPublic ? "secondary" : "outline"}>
            {event.isPublic ? "Whole college" : "Members only"}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          <Link
            href={`/clubs/${club.id}`}
            className="underline-offset-4 hover:underline"
          >
            {club.name}
          </Link>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            When and where
          </CardTitle>
          <CardDescription>
            Stored as one instant in UTC, shown in {club.timezone} — the college&apos;s timezone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              {formatDateTimeInZone(event.startTime, club.timezone)}
              {" → "}
              {formatDateTimeInZone(event.endTime, club.timezone)}
              <span className="text-xs text-muted-foreground">
                ({zoneAbbreviation(event.startTime, club.timezone)})
              </span>
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4" />
              {registered} registered
              {event.capacity === null ? " · unlimited seats" : ` of ${event.capacity}`}
              {waitlisted > 0 ? ` · ${waitlisted} waiting` : ""}
            </span>
          </div>

          {event.capacity !== null ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          ) : null}

          {event.description ? (
            <p className="text-sm text-muted-foreground">{event.description}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your seat</CardTitle>
          <CardDescription>
            One ticket per person. Cancelling returns the seat to the first person in the queue,
            automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

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
            Event Manager account to see the roster.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
