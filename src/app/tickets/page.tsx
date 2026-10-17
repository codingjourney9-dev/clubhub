import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Ticket as TicketIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
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
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?callbackUrl=/tickets");

  const tickets = await listMyTickets(user.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-3" />
        Back to dashboard
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          <span className="inline-flex items-center gap-2">
            <TicketIcon className="size-5 text-muted-foreground" />
            Your tickets
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Every seat you hold, every queue you are in, and everything you have given back.
        </p>
      </div>

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
        <ul className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <li
              key={ticket.id}
              className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{ticket.event.title}</span>
                  {ticket.status === "REGISTERED" ? (
                    <Badge>Registered</Badge>
                  ) : ticket.status === "WAITLISTED" ? (
                    <Badge variant="secondary">
                      Waitlist — number {ticket.queuePosition ?? "?"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Cancelled</Badge>
                  )}
                  {ticket.event.status === "CANCELLED" ? (
                    <Badge variant="destructive">Event cancelled</Badge>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {formatDateTimeInZone(
                      ticket.event.startTime,
                      ticket.event.club.tenant.timezone,
                    )}
                  </span>
                  <span>
                    {ticket.event.club.name} · {ticket.event.club.tenant.name}
                  </span>
                </span>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/tickets/${ticket.id}`}
                  className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
