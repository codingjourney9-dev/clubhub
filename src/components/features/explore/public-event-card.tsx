import Link from "next/link";
import { ArrowUpRight, Clock, MapPin } from "lucide-react";

import { DateBlock } from "@/components/common/date-block";
import { seatsLabel } from "@/lib/domain/seats";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import type { PublicEvent } from "@/lib/services/public-event-service";
import { cn } from "@/lib/utils";

/**
 * One event in the public feed. A ticket stub, not a generic card: date leaf on
 * the left, the college as the masthead, a perforated tear line above the stub.
 * Presentational only — the caller decides which events a viewer may see.
 */
export function PublicEventCard({ event }: { event: PublicEvent }) {
  const timeZone = event.club.tenant.timezone;
  const registered = event._count.tickets;
  // Already under way: registration is closed, so "seats left" would be a false promise.
  const live = event.startTime <= new Date();
  const seats = live
    ? ({ text: "Happening now", tone: "live" } as const)
    : seatsLabel(event.capacity, registered, event.waitlistEnabled);

  return (
    <Link
      href={`/events/${event.id}`}
      className="group ticket-notch flex h-full flex-col rounded-lg border border-border bg-card transition-all [--notch-y:68%] hover:-translate-y-0.5 hover:border-foreground/50 hover:shadow-print-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-4">
          <DateBlock date={event.startTime} timeZone={timeZone} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="eyebrow truncate" title={event.club.tenant.name}>
              {event.club.tenant.name}
            </span>
            <h3 className="font-heading text-lg leading-snug font-bold tracking-tight text-balance group-hover:underline group-hover:decoration-primary group-hover:decoration-2 group-hover:underline-offset-4">
              {event.title}
            </h3>
          </div>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <Clock className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {formatDateTimeInZone(event.startTime, timeZone)}{" "}
              <span className="text-xs">({zoneAbbreviation(event.startTime, timeZone)})</span>
            </span>
          </li>
          {event.location ? (
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <span className="line-clamp-1">{event.location}</span>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="perforation mx-5" aria-hidden="true" />

      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <span className="min-w-0 truncate text-sm font-medium">
          {event.club.name}
          {event.club.category ? (
            <span className="font-normal text-muted-foreground"> · {event.club.category}</span>
          ) : null}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium tracking-wide uppercase",
            seats.tone === "open" && "border-foreground/20 text-muted-foreground",
            seats.tone === "low" && "border-primary/50 bg-primary/10 text-primary",
            seats.tone === "full" && "border-foreground/70 bg-foreground text-background",
            seats.tone === "live" && "border-success/60 bg-success/10 text-success",
          )}
        >
          {seats.text}
        </span>
      </div>
    </Link>
  );
}

/** The grid plus its empty state, shared by the guest and member dashboards. */
export function PublicEventGrid({ events }: { events: readonly PublicEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-foreground/25 bg-card/60 p-8">
        <p className="font-heading text-lg font-bold">Nothing on the board yet.</p>
        <p className="max-w-lg text-sm text-muted-foreground">
          When a club publishes an event that&apos;s open to everyone, it shows up here — from every
          college on ClubHub.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <li key={event.id}>
          <PublicEventCard event={event} />
        </li>
      ))}
    </ul>
  );
}
