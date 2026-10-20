import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BookOpen, ScanLine } from "lucide-react";

import { ScannerPanel } from "@/components/features/door/scanner-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api/response";
import { requireEventAccess, type EventContext } from "@/lib/auth/guards";
import { checkInWindow, checkInWindowState } from "@/lib/domain/check-in";
import { formatDateTimeInZone } from "@/lib/format/date";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Door scanner" };
export const dynamic = "force-dynamic";

async function loadDoor(
  eventId: string,
): Promise<{ kind: "ok"; context: EventContext } | { kind: "not-found" } | { kind: "forbidden" }> {
  try {
    return { kind: "ok", context: await requireEventAccess(eventId, "attendance:scan") };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/events/${eventId}/door`)}`);
    }
    if (error instanceof ApiError && error.status === 404) return { kind: "not-found" };
    if (error instanceof ApiError && error.status === 403) return { kind: "forbidden" };
    throw error;
  }
}

/**
 * The scanner. Deliberately a full page of its own rather than a dialog on the
 * event page: this is what a volunteer holds in one hand while a queue forms, so
 * it gets the whole screen and no navigation chrome to fat-finger.
 */
export default async function DoorPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const result = await loadDoor(eventId);
  if (result.kind === "not-found") notFound();

  if (result.kind === "forbidden") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Only the club can run this door</CardTitle>
            <CardDescription>
              Checking people in belongs to the club&apos;s President and Leads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/events/${eventId}`} className={cn(buttonVariants({ variant: "outline" }))}>
              Back to the event
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { event, club } = result.context;
  const window = checkInWindow(event, club.timezone);
  const state = checkInWindowState(event, club.timezone, new Date());

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
      <Link
        href={`/events/${eventId}`}
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        Back to the event
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl leading-tight font-bold sm:text-3xl">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><ScanLine className="size-5" /></span>
          Door
        </h1>
        <p className="text-sm">
          {event.title} · {club.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDateTimeInZone(event.startTime, club.timezone)} →{" "}
          {formatDateTimeInZone(event.endTime, club.timezone)}
        </p>
      </div>

      {state !== "OPEN" ? (
        <Alert>
          <BookOpen />
          <AlertTitle>
            {state === "TOO_EARLY" ? "Not the day of the event yet" : "Check-in has closed"}
          </AlertTitle>
          <AlertDescription>
            Scans are accepted from {formatDateTimeInZone(window.opensAt, club.timezone)} until{" "}
            {formatDateTimeInZone(window.closesAt, club.timezone)}. Outside that window the scanner
            still works, but the server refuses every scan — this screen will tell you which.
          </AlertDescription>
        </Alert>
      ) : (
        <Badge variant="secondary" className="self-start">
          Check-in open until {formatDateTimeInZone(window.closesAt, club.timezone)}
        </Badge>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Scan a ticket</CardTitle>
          <CardDescription>
            The camera reads the QR code. If it will not focus, type the eight-character code printed
            under it. Both work without internet — scans are held on this phone and uploaded when the
            connection returns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScannerPanel
            eventId={eventId}
            eventTitle={event.title}
            startTime={event.startTime.toISOString()}
            endTime={event.endTime.toISOString()}
            timeZone={club.timezone}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/events/${eventId}/attendance`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Attendance report
        </Link>
        <Link href="/door" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          All doors
        </Link>
      </div>
    </div>
  );
}
