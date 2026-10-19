import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, CalendarDays, ListOrdered, MapPin, ShieldCheck } from "lucide-react";

import { DateBlock } from "@/components/common/date-block";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api/response";
import { requireUuidParam } from "@/lib/api/params";
import { getCurrentUser, getSessionUserId } from "@/lib/auth/session";
import { doorCodeFromSecret } from "@/lib/domain/check-in";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import { getTicketForOwner, findTicketForUser } from "@/lib/services/ticket-service";
import { encodeTicketQr } from "@/lib/tickets/qr";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your ticket" };
export const dynamic = "force-dynamic";

/**
 * One ticket, with its QR code.
 *
 * The QR is generated **on the server** and handed to the browser as a data URI.
 * That keeps the secret out of any third-party image service, and it means the
 * picture is identical whether it is printed, screenshotted, or shown dimly on a
 * phone at the door.
 *
 * A waitlisted person deliberately gets no QR code: they do not have a seat yet,
 * and a scannable image would imply otherwise.
 */
export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId: rawTicketId } = await params;

  const signInHref = `/sign-in?callbackUrl=${encodeURIComponent(`/tickets/${rawTicketId}`)}`;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect(signInHref);

  const ticketId = requireUuidParam(rawTicketId, "ticket");

  // The user row and the ticket are fetched together (one round trip, not two).
  // The ticket query is scoped to the session's user id, so it can never return
  // somebody else's ticket even before the user row arrives.
  const [user, lookup] = await Promise.all([
    getCurrentUser(),
    getTicketForOwner(ticketId, sessionUserId).then(
      (found) => ({ ok: true as const, ticket: found }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  ]);
  if (!user) redirect(signInHref);

  if (!lookup.ok) {
    if (lookup.error instanceof ApiError && lookup.error.status === 404) notFound();
    throw lookup.error;
  }
  const { ticket } = lookup;

  const { event } = ticket;
  const timeZone = event.club.tenant.timezone;

  const queuePosition =
    ticket.status === "WAITLISTED"
      ? ((await findTicketForUser(event.id, user.id))?.queuePosition ?? null)
      : null;

  const showQr = ticket.status === "REGISTERED" && event.status !== "CANCELLED";

  const qrDataUrl = showQr
    ? await QRCode.toDataURL(encodeTicketQr(ticket.qrCodeUuid), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 520,
        color: { dark: "#0b0b0c", light: "#ffffff" },
      })
    : null;

  const statusLabel =
    ticket.status === "REGISTERED" ? "Registered" : ticket.status === "WAITLISTED" ? "Waitlist" : "Cancelled";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 sm:px-6 lg:py-14">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        All your tickets
      </Link>

      <article
        className="relative rounded-xl border border-foreground/80 bg-card shadow-print-lg dark:border-foreground/25"
        aria-label={`Ticket for ${event.title}`}
      >
        <header className="flex items-start justify-between gap-4 p-6 pb-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="eyebrow text-primary">
              {event.club.name} · Admit one
            </span>
            <h1 className="text-2xl leading-tight font-bold sm:text-3xl">{event.title}</h1>
            <span className="text-sm text-muted-foreground">{event.club.tenant.name}</span>
          </div>
          <DateBlock date={event.startTime} timeZone={timeZone} size="lg" />
        </header>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 px-6 pb-6 text-sm sm:grid-cols-3">
          <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-2">
            <dt className="eyebrow">When</dt>
            <dd className="font-medium">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                {formatDateTimeInZone(event.startTime, timeZone)}
              </span>
              <span className="block text-muted-foreground">
                until {formatDateTimeInZone(event.endTime, timeZone)}{" "}
                <span className="text-xs">({zoneAbbreviation(event.startTime, timeZone)})</span>
              </span>
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="eyebrow">Status</dt>
            <dd>
              {ticket.status === "REGISTERED" ? (
                <Badge>{statusLabel}</Badge>
              ) : ticket.status === "WAITLISTED" ? (
                <Badge variant="secondary">{statusLabel}</Badge>
              ) : (
                <Badge variant="outline">{statusLabel}</Badge>
              )}
            </dd>
          </div>
          {event.location ? (
            <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-3">
              <dt className="eyebrow">Where</dt>
              <dd className="inline-flex items-center gap-1.5 font-medium">
                <MapPin className="size-3.5 text-muted-foreground" />
                {event.location}
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Tear line with punched notches. */}
        <div className="relative flex items-center" aria-hidden="true">
          <span className="absolute -left-px size-6 -translate-x-1/2 rounded-full border-r border-foreground/80 bg-background dark:border-foreground/25" />
          <div className="perforation mx-6 flex-1" />
          <span className="absolute -right-px size-6 translate-x-1/2 rounded-full border-l border-foreground/80 bg-background dark:border-foreground/25" />
        </div>

        <div className="flex flex-col gap-5 p-6">
          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-4">
              {/* Always black-on-white, even in dark mode: scanners need the contrast. */}
              <div className="rounded-lg bg-white p-3 ring-1 ring-black/10">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URI, not a remote asset */}
                <img
                  src={qrDataUrl}
                  alt={`QR code for your ticket to ${event.title}`}
                  width={260}
                  height={260}
                  className="h-[240px] w-[240px] sm:h-[260px] sm:w-[260px]"
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="eyebrow">Door code</span>
                <span className="font-mono text-2xl font-semibold tracking-[0.3em]">
                  {doorCodeFromSecret(ticket.qrCodeUuid)}
                </span>
              </div>
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                Show this at the door. It is yours alone — a screenshot is enough, but a forwarded one
                lets somebody else in first.
              </p>
              <p className="max-w-xs text-center text-xs text-muted-foreground">
                If the QR will not scan, read the door code out. It only works on the day of the event,
                and only a club organiser can enter it.
              </p>
            </div>
          ) : null}

          {ticket.status === "WAITLISTED" ? (
            <Alert>
              <ListOrdered />
              <AlertTitle>You are on the waitlist — number {queuePosition ?? "?"}</AlertTitle>
              <AlertDescription>
                There is no QR code yet because there is no seat yet. If somebody gives theirs back,
                you move up automatically and this page grows a QR code on its own.
              </AlertDescription>
            </Alert>
          ) : null}

          {ticket.status === "CANCELLED" ? (
            <Alert>
              <ShieldCheck />
              <AlertTitle>This ticket was cancelled</AlertTitle>
              <AlertDescription>
                It is kept on your account as history, and it is not valid at the door. You can
                register again from the event page while there is room.
              </AlertDescription>
            </Alert>
          ) : null}

          {event.status === "CANCELLED" ? (
            <Alert>
              <ShieldCheck />
              <AlertTitle>The event itself was cancelled</AlertTitle>
              <AlertDescription>
                The club called this event off, so no ticket is valid at the door — including this
                one. Watch the club page for a new date.
              </AlertDescription>
            </Alert>
          ) : null}

          <span className="text-center font-mono text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
            No. {ticket.id.slice(-8)}
          </span>
        </div>
      </article>

      <div className="flex flex-wrap justify-center gap-2">
        <Link href={`/events/${event.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Event page
        </Link>
        <Link href="/tickets" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          All tickets
        </Link>
      </div>
    </div>
  );
}
