import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-3" />
        Back to dashboard
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Upcoming events</h1>
        <p className="text-sm text-muted-foreground">
          Everything published in your colleges. Members-only events only appear for the club&apos;s
          own members.
        </p>
      </div>

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
        <ul className="flex flex-col gap-3">
          {events.map((event) => {
            const seat = decideSeat({
              capacity: event.capacity,
              registeredCount: event.registeredCount,
              waitlistEnabled: event.waitlistEnabled,
            });

            return (
              <li
                key={event.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/events/${event.id}`}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {event.title}
                    </Link>
                    <Badge variant={event.isPublic ? "secondary" : "outline"}>
                      {event.isPublic ? "Whole college" : "Members only"}
                    </Badge>
                    {seat === "FULL" ? (
                      <Badge variant="outline">Full</Badge>
                    ) : seat === "WAITLISTED" ? (
                      <Badge variant="outline">Waitlist open</Badge>
                    ) : null}
                  </span>

                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      {formatDateTimeInZone(event.startTime, event.club.tenant.timezone)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" />
                      {event.registeredCount}
                      {event.capacity === null ? " going" : ` / ${event.capacity}`}
                      {event.waitlistedCount > 0 ? ` · ${event.waitlistedCount} waiting` : ""}
                    </span>
                    {event.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {event.location}
                      </span>
                    ) : null}
                    <span>{event.club.name}</span>
                  </span>
                </div>

                <Link
                  href={`/events/${event.id}`}
                  className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                >
                  Open
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
