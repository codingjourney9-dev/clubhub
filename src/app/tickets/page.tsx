import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Ticket as TicketIcon } from "lucide-react";

import { DateBlock } from "@/components/common/date-block";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeading } from "@/components/common/page-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser, getSessionUserId } from "@/lib/auth/session";
import { formatDateTimeInZone } from "@/lib/format/date";
import { listMyTickets } from "@/lib/services/ticket-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My tickets" };
export const dynamic = "force-dynamic";

/**
 * Every ticket this person holds, across every college they belong to.
 *
 * Each row renders its own event's time in **that college's** timezone, which is
 * why the timezone travels with the ticket rather than being assumed once for the
 * page: a student can be a member of two colleges in different zones.
 */
export default async function MyTicketsPage() {
  // The user row and the ticket list are independent: one round trip, not two.
  const sessionUserId = await getSessionUserId();
  const [user, tickets] = await Promise.all([
    getCurrentUser(),
    sessionUserId ? listMyTickets(sessionUserId) : null,
  ]);
  if (!user || !tickets) redirect("/sign-in?callbackUrl=/tickets");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10 sm:px-6 lg:py-14">
      <PageHeading
        eyebrow="Your wallet"
        title="Your tickets"
        description="Every seat you hold, every queue you are in, and everything you have given back."
      />

      {tickets.length === 0 ? (
        <EmptyState
          icon={TicketIcon}
          title="No tickets yet"
          description="Claim a seat at an event and your QR ticket appears here — with the door code printed underneath it, for the day the camera will not cooperate."
          action={
            <Link href="/events" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Browse upcoming events
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {tickets.map((ticket) => {
            const timeZone = ticket.event.club.tenant.timezone;
            const inactive = ticket.status === "CANCELLED" || ticket.event.status === "CANCELLED";

            return (
              <li
                key={ticket.id}
                className={cn(
                  "ticket-notch grid grid-cols-1 rounded-lg border border-border bg-card [--notch-y:50%] sm:grid-cols-[1fr_auto_13rem]",
                  inactive && "opacity-70",
                )}
              >
                <div className="flex items-start gap-4 p-5">
                  <DateBlock date={ticket.event.startTime} timeZone={timeZone} size="lg" />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="eyebrow text-primary">
                      {ticket.event.club.name} · {ticket.event.club.tenant.name}
                    </span>
                    <span
                      className={cn(
                        "font-heading text-xl leading-tight font-bold tracking-tight",
                        inactive && "line-through decoration-2",
                      )}
                    >
                      {ticket.event.title}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      {formatDateTimeInZone(ticket.event.startTime, timeZone)}
                    </span>
                  </div>
                </div>

                <div aria-hidden="true" className="perforation mx-5 sm:hidden" />
                <div aria-hidden="true" className="perforation-y my-4 hidden sm:block" />

                <div className="flex flex-row flex-wrap items-center justify-between gap-3 p-5 sm:flex-col sm:flex-nowrap sm:items-stretch sm:justify-center">
                  <div className="flex flex-wrap gap-1.5 sm:justify-center">
                    {ticket.status === "REGISTERED" ? (
                      <Badge>Registered</Badge>
                    ) : ticket.status === "WAITLISTED" ? (
                      <Badge variant="secondary">Waitlist — number {ticket.queuePosition ?? "?"}</Badge>
                    ) : (
                      <Badge variant="outline">Cancelled</Badge>
                    )}
                    {ticket.event.status === "CANCELLED" ? <Badge variant="destructive">Event cancelled</Badge> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:flex-col">
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className={cn(buttonVariants({ size: "sm", variant: inactive ? "outline" : "default" }))}
                    >
                      Open ticket
                    </Link>
                    <Link
                      href={`/events/${ticket.event.id}`}
                      className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
                    >
                      Event page
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
