import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, CalendarDays, ListOrdered, MapPin, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api/response";
import { requireUuidParam } from "@/lib/api/params";
import { getCurrentUser } from "@/lib/auth/session";
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

  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/tickets/${rawTicketId}`)}`);

  const ticketId = requireUuidParam(rawTicketId, "ticket");

  let ticket;
  try {
    ticket = await getTicketForOwner(ticketId, user.id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <Link
        href="/tickets"
        className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-3" />
        All your tickets
      </Link>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-xl">{event.title}</CardTitle>
            {ticket.status === "REGISTERED" ? (
              <Badge>Registered</Badge>
            ) : ticket.status === "WAITLISTED" ? (
              <Badge variant="secondary">Waitlist</Badge>
            ) : (
              <Badge variant="outline">Cancelled</Badge>
            )}
          </div>
          <CardDescription>
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
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="size-4 text-muted-foreground" />
            {formatDateTimeInZone(event.startTime, timeZone)}
            {" → "}
            {formatDateTimeInZone(event.endTime, timeZone)}
            <span className="text-xs text-muted-foreground">
              ({zoneAbbreviation(event.startTime, timeZone)})
            </span>
          </div>

          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URI, not a remote asset */}
              <img
                src={qrDataUrl}
                alt={`QR code for your ticket to ${event.title}`}
                width={260}
                height={260}
                className="h-[260px] w-[260px]"
              />
              <p className="text-center text-xs text-slate-600">
                Show this at the door. It is yours alone — a screenshot is enough, but a forwarded
                one lets somebody else in first.
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

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/events/${event.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Event page
            </Link>
            <Link href="/tickets" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              All tickets
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
