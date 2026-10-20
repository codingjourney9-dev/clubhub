import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, Lock, MapPin, Users } from "lucide-react";

import { DateBlock } from "@/components/common/date-block";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { authHref } from "@/lib/auth/callback-url";
import { seatsLabel } from "@/lib/domain/seats";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import type { PublicEvent } from "@/lib/services/public-event-service";
import { cn } from "@/lib/utils";

/**
 * A public event as seen by someone who can't get a ticket here yet:
 *
 *  • "guest"    — not signed in. Offered sign-in / sign-up, then brought back.
 *  • "outsider" — signed in, but not a member of the event's college. Tickets
 *                 are per college (tenancy), so they're told who to ask.
 *
 * Nothing on this page is private: it renders only what
 * `public-event-service` selected for the open internet.
 */
export function PublicEventView({
  event,
  viewer,
}: {
  event: PublicEvent;
  viewer: "guest" | "outsider";
}) {
  const timeZone = event.club.tenant.timezone;
  const registered = event._count.tickets;
  const seats = seatsLabel(event.capacity, registered, event.waitlistEnabled);
  const now = new Date();
  const cancelled = event.status === "CANCELLED";
  const ended = event.endTime <= now;
  const started = event.startTime <= now;
  const fillPercent =
    event.capacity === null ? 0 : Math.min(100, Math.round((registered / event.capacity) * 100));
  const returnTo = `/events/${event.id}`;

  let boxOffice: React.ReactNode;
  if (cancelled) {
    boxOffice = <p className="text-sm text-muted-foreground">This event was cancelled by the club.</p>;
  } else if (ended || started) {
    boxOffice = (
      <p className="text-sm text-muted-foreground">
        {ended ? "This event has ended." : "Registration closed when the event started."}
      </p>
    );
  } else if (viewer === "guest") {
    boxOffice = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Tickets are free and live on your phone as a QR code. You&apos;ll need an account so the
          door knows the ticket is yours.
        </p>
        <Link href={authHref("/sign-in", returnTo)} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          Sign in to get a ticket
        </Link>
        <Link
          href={authHref("/sign-up", returnTo)}
          className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
        >
          Create an account
        </Link>
      </div>
    );
  } else {
    boxOffice = (
      <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" />
        <p>
          Tickets for this event are for students of{" "}
          <span className="font-medium text-foreground">{event.club.tenant.name}</span>. If that&apos;s
          you, ask {event.club.name} for an invite link.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        All upcoming events
      </Link>

      <header className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-start">
        <DateBlock date={event.startTime} timeZone={timeZone} size="lg" className="shadow-print-sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <span className="eyebrow text-primary">
            {event.club.name} · {event.club.tenant.name}
          </span>
          <h1 className="text-3xl leading-[1.05] font-extrabold text-balance sm:text-5xl">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {cancelled ? <Badge variant="destructive">Cancelled</Badge> : null}
            {!cancelled && ended ? <Badge variant="outline">Ended</Badge> : null}
            {event.club.category ? <Badge variant="secondary">{event.club.category}</Badge> : null}
            <Badge variant="outline">Open to everyone</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" />
              {formatDateTimeInZone(event.startTime, timeZone)}
              {" → "}
              {formatDateTimeInZone(event.endTime, timeZone)}
              <span className="text-xs">({zoneAbbreviation(event.startTime, timeZone)})</span>
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
        <aside className="flex flex-col gap-5 rounded-lg border border-foreground/80 bg-card p-5 shadow-print lg:sticky lg:top-24 lg:order-last dark:border-foreground/25">
          <div className="flex items-baseline justify-between gap-2">
            <span className="eyebrow">Seats</span>
            <span className="inline-flex items-center gap-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">
              <Users className="size-3.5" />
              {seats.text}
            </span>
          </div>
          {event.capacity !== null ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full", fillPercent >= 100 ? "bg-primary" : "bg-foreground/75")}
                style={{ width: `${Math.max(fillPercent, 2)}%` }}
              />
            </div>
          ) : null}
          <div className="perforation" aria-hidden="true" />
          {boxOffice}
        </aside>

        <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            <CalendarDays className="size-4 text-primary" />
            About this event
          </h2>
          {event.description ? (
            <p className="leading-relaxed whitespace-pre-line text-foreground/85">{event.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">The organisers haven&apos;t added a description yet.</p>
          )}
          <p className="pt-2 text-xs text-muted-foreground">
            Times are shown in {event.club.tenant.name}&apos;s local time ({timeZone}).
          </p>
        </section>
      </div>
    </div>
  );
}
