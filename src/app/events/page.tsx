import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";

import { DateBlock } from "@/components/common/date-block";
import { EventPoster, TagChips } from "@/components/features/event/event-extras";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeading } from "@/components/common/page-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { decideSeat } from "@/lib/domain/ticket-rules";
import { formatDateTimeInZone } from "@/lib/format/date";
import { listUpcomingEventsForUser } from "@/lib/services/event-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Upcoming events" };
export const dynamic = "force-dynamic";

/**
 * "What is on" across every college the signed-in person belongs to.
 *
 * Only published, not-yet-finished events appear, and members-only events are
 * filtered in SQL by the service — not hidden with CSS after the fact.
 */
export default async function UpcomingEventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?callbackUrl=/events");

  const events = await listUpcomingEventsForUser(user.id);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:py-14">
      <PageHeading
        eyebrow="What's on"
        title="Upcoming events"
        description={
          <>
            Everything published in your colleges. Members-only events only appear for the club&apos;s
            own members.
          </>
        }
      />

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing on the calendar yet"
          description={
            <>
              When a club you belong to publishes an event it appears here, with every time shown in
              your college&apos;s timezone. If you run a club, publish something from its page.
            </>
          }
          action={
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Go to your dashboard
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {events.map((event) => {
            const seat = decideSeat({
              capacity: event.capacity,
              registeredCount: event.registeredCount,
              waitlistEnabled: event.waitlistEnabled,
            });
            const timeZone = event.club.tenant.timezone;
            const percent =
              event.capacity === null ? null : Math.min(100, Math.round((event.registeredCount / event.capacity) * 100));

            return (
              <li key={event.id}>
                <Link
                  href={`/events/${event.id}`}
                  className="group flex h-full flex-col rounded-lg border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-foreground/45 hover:shadow-print"
                >
                  {event.posterUrl ? (
                    <div className="overflow-hidden rounded-t-lg">
                      <EventPoster src={event.posterUrl} title={event.title} variant="card" />
                    </div>
                  ) : null}
                  <div className="flex items-start gap-4 p-5">
                    <DateBlock date={event.startTime} timeZone={timeZone} size="lg" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="eyebrow text-primary">{event.club.name}</span>
                      <span className="font-heading text-xl leading-tight font-bold tracking-tight group-hover:underline group-hover:decoration-primary group-hover:decoration-2 group-hover:underline-offset-4">
                        {event.title}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" />
                          {formatDateTimeInZone(event.startTime, timeZone)}
                        </span>
                        {event.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" />
                            {event.location}
                          </span>
                        ) : null}
                      </span>
                      <TagChips tags={event.tags} className="pt-1" />
                    </div>
                  </div>

                  <div className="perforation mx-5" />

                  <div className="mt-auto flex items-center gap-4 px-5 py-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                        <Users className="size-3.5" />
                        <span className="font-semibold text-foreground tabular-nums">{event.registeredCount}</span>
                        {event.capacity === null ? " going" : ` / ${event.capacity}`}
                        {event.waitlistedCount > 0 ? ` · ${event.waitlistedCount} waiting` : ""}
                      </span>
                      {percent !== null ? (
                        <span className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-secondary">
                          <span
                            className={cn("block h-full rounded-full", percent >= 100 ? "bg-primary" : "bg-foreground/70")}
                            style={{ width: `${Math.max(percent, 3)}%` }}
                          />
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <Badge variant={event.isPublic ? "secondary" : "outline"}>
                        {event.isPublic ? "Open to everyone" : "Members only"}
                      </Badge>
                      {seat === "FULL" ? (
                        <Badge variant="destructive">Full</Badge>
                      ) : seat === "WAITLISTED" ? (
                        <Badge variant="outline">Waitlist open</Badge>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
