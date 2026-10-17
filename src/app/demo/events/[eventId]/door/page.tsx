import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  CloudOff,
  Fingerprint,
  Info,
  Keyboard,
  ScanLine,
  ShieldCheck,
  WifiOff,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OfflineDrill, type DrillTicket } from "@/components/features/door/offline-drill";
import { DEMO_ACCOUNTS, findDemoAccount } from "@/config/demo";
import { canClub, type Actor } from "@/lib/auth/rbac";
import { db } from "@/lib/db/client";
import { isDemoModeEnabled } from "@/lib/demo/mode";
import {
  checkInWindow,
  checkInWindowState,
  decideCheckIn,
  type CheckInOutcome,
} from "@/lib/domain/check-in";
import { formatDateTimeInZone } from "@/lib/format/date";
import { getAttendanceReport } from "@/lib/services/check-in-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Door preview" };
export const dynamic = "force-dynamic";

/**
 * The door, for a frame that cannot hold a cookie.
 *
 * A camera needs a real signed-in session, so this page does the next best thing
 * honestly: it shows the scanner screen, the offline reference data the phone
 * would hold, and — for every ticket on the guest list — **what the scanner would
 * decide**, computed by the same `decideCheckIn` the API uses.
 *
 * Nothing here writes. That matters: a preview that mutated the database would be
 * a preview nobody could trust.
 */

const OUTCOME_STYLE: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  CHECKED_IN: { label: "Would be checked in", tone: "ok" },
  ALREADY_CHECKED_IN: { label: "Already inside", tone: "warn" },
  WAITLISTED: { label: "On the waitlist", tone: "bad" },
  CANCELLED_TICKET: { label: "Ticket cancelled", tone: "bad" },
  EVENT_CANCELLED: { label: "Event cancelled", tone: "bad" },
  TOO_EARLY: { label: "Not the day yet", tone: "bad" },
  CLOSED: { label: "Door closed", tone: "bad" },
};

export default async function DemoDoorPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  if (!isDemoModeEnabled()) notFound();

  const [{ eventId }, { as }] = await Promise.all([params, searchParams]);
  const account = findDemoAccount(as);

  const event = await db.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      clubId: true,
      title: true,
      status: true,
      startTime: true,
      endTime: true,
      capacity: true,
      club: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
          tenant: { select: { name: true, timezone: true, deletedAt: true } },
        },
      },
    },
  });

  if (!event || event.club.deletedAt || event.club.tenant.deletedAt) notFound();

  const viewer = await db.user.findFirst({
    where: { email: account.email, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!viewer) notFound();

  const [tenantMembership, clubMembership] = await Promise.all([
    db.tenantMember.findFirst({
      where: { tenantId: event.tenantId, userId: viewer.id, deletedAt: null },
      select: { role: true },
    }),
    db.clubMember.findFirst({
      where: { clubId: event.clubId, userId: viewer.id, deletedAt: null },
      select: { role: true },
    }),
  ]);

  if (!tenantMembership) notFound();

  const actor: Actor = {
    tenantRole: tenantMembership.role,
    clubRole: clubMembership?.role ?? null,
  };

  const timeZone = event.club.tenant.timezone;
  const now = new Date();
  const window = checkInWindow(event, timeZone);
  const windowState = checkInWindowState(event, timeZone, now);

  const canScan = canClub(actor, "attendance:scan");
  const report = canScan ? await getAttendanceReport(event.id, event.tenantId) : null;

  const viewerSwitcher = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">View as:</span>
      {DEMO_ACCOUNTS.map((candidate) => {
        const active = candidate.key === account.key;
        return (
          <Link
            key={candidate.key}
            href={`/demo/events/${event.id}/door?as=${candidate.key}`}
            className={cn(
              buttonVariants({ size: "sm", variant: active ? "default" : "outline" }),
              active ? "" : "text-muted-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {candidate.displayName}
          </Link>
        );
      })}
    </div>
  );

  // ── Not an organiser: show what the real app does ──────────────────────────
  if (!report) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        {viewerSwitcher}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              The door is not yours to work
            </CardTitle>
            <CardDescription>
              {account.displayName} is a {clubMembership ? clubMembership.role.toLowerCase() : "non-member"}{" "}
              of {event.club.name}. Checking people in belongs to the President and the Event Manager —
              the real page answers 403, and the scanner never loads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/demo/events/${event.id}/door?as=aarav`}
              className={cn(buttonVariants({ variant: "outline" }), "self-start")}
            >
              View as Aarav (club President)
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // What the scanner would say, for every ticket on the list.
  const verdicts = report.rows
    .filter((row) => row.status !== "CANCELLED")
    .map((row) => {
      const outcome: CheckInOutcome =
        windowState !== "OPEN"
          ? windowState
          : decideCheckIn({
              eventStatus: event.status,
              ticketStatus: row.status as "REGISTERED" | "WAITLISTED",
              alreadyCheckedIn: row.checkInTime !== null,
            });

      return { row, outcome };
    });

  const unscanned = verdicts.filter((verdict) => verdict.outcome === "CHECKED_IN");

  // Three people still outside and one already inside: enough to show the queue
  // filling, draining, and the familiar "already in" answer.
  const toTicket = (row: (typeof report.rows)[number], alreadyIn: boolean): DrillTicket => ({
    ticketId: row.ticketId,
    holder: row.holder,
    doorCode: row.doorCode,
    alreadyIn,
  });

  const drillTickets: DrillTicket[] = [
    ...report.rows
      .filter((row) => row.status === "REGISTERED" && row.checkInTime === null)
      .slice(0, 3)
      .map((row) => toTicket(row, false)),
    ...report.rows
      .filter((row) => row.checkInTime !== null)
      .slice(0, 1)
      .map((row) => toTicket(row, true)),
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Alert className="border-amber-500/40 bg-amber-500/10">
        <Info className="text-amber-600" />
        <AlertTitle>Door preview — read-only</AlertTitle>
        <AlertDescription>
          No camera and no writes in a preview frame. What is real: the guest list, the check-in
          records, the open/closed window, and the verdict the scanner would reach for each ticket.
        </AlertDescription>
      </Alert>

      {viewerSwitcher}

      <Link
        href={`/demo/events/${event.id}?as=${account.key}`}
        className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-3" />
        Back to the event
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight">
          <ScanLine className="size-5 text-muted-foreground" />
          Door — {event.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {event.club.name} · {formatDateTimeInZone(event.startTime, timeZone)} →{" "}
          {formatDateTimeInZone(event.endTime, timeZone)} · {timeZone}
        </p>
      </div>

      {/* ── Is the door open? ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Open or closed?</CardTitle>
          <CardDescription>
            Scans are refused outside the day of the event. The rule uses the college&apos;s timezone,
            not the volunteer&apos;s phone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {windowState === "OPEN" ? (
              <Badge>
                <CheckCircle2 data-icon="inline-start" />
                Open right now
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle data-icon="inline-start" />
                {windowState === "TOO_EARLY" ? "Not the day of the event" : "Closed"}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Window: {formatDateTimeInZone(window.opensAt, timeZone)} →{" "}
              {formatDateTimeInZone(window.closesAt, timeZone)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            The window opens at midnight local time on the day the event starts and closes at the end
            of that day — or three hours after the event ends, whichever is later, so an 11 pm gig is
            not cut off at midnight.
          </p>
        </CardContent>
      </Card>

      {/* ── The scanner screen ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What the volunteer holds</CardTitle>
          <CardDescription>
            Camera on top, typed code underneath — always both, because a cracked lens or a denied
            permission must not stop the queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border bg-black/90 text-white/70 sm:aspect-video">
            <Camera className="size-8" />
            <span className="text-xs">Camera preview (needs a signed-in session)</span>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Keyboard className="size-4 text-muted-foreground" />
              Type the door code
            </span>
            <div className="flex gap-2">
              <div className="flex h-9 flex-1 items-center rounded-md border px-3 font-mono text-sm tracking-[0.2em] text-muted-foreground">
                A1B2C3D4
              </div>
              <span className={cn(buttonVariants({ size: "default" }), "opacity-50")}>Check in</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── What would happen ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            What the scanner would say ({verdicts.length} tickets)
          </CardTitle>
          <CardDescription>
            Computed with the same rule the API uses. Try the other viewer buttons: a plain member
            cannot open this page at all.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Door code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">On scan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {verdicts.map(({ row, outcome }) => {
                const style = OUTCOME_STYLE[outcome] ?? {
                  label: outcome,
                  tone: "warn" as const,
                };

                return (
                  <TableRow key={row.ticketId}>
                    <TableCell className="font-medium">{row.holder}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.doorCode}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "REGISTERED" ? "secondary" : "outline"}>
                        {row.status === "REGISTERED" ? "Registered" : "Waitlisted"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          style.tone === "ok"
                            ? "default"
                            : style.tone === "warn"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {style.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Offline ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WifiOff className="size-4 text-muted-foreground" />
            In the basement
          </CardTitle>
          <CardDescription>
            Before the door opens, the phone downloads a fingerprint of every ticket — never the
            secret itself. Below is the rehearsal: cut the signal, scan three people, reconnect.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <OfflineDrill tickets={drillTickets} />

          <div className="rounded-lg border bg-muted/40 p-3">
            <span className="flex items-center gap-2 text-xs font-medium">
              <Fingerprint className="size-3.5" />
              One row of the offline guest list
            </span>
            <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed text-muted-foreground">
{`{
  "holder": "Aarav Shah",
  "status": "REGISTERED",
  "fingerprint": "9f2c…a41d",   // sha256(secret) — verifies, cannot forge
  "doorCode": "…A1B2C3D4",      // printed on the ticket
  "checkedInAt": null
}`}
            </pre>
          </div>

          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex gap-2">
              <CloudOff className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>
                A scan with no signal is verified <strong>against the hashes on the phone</strong>, then
                written to the phone with the time it actually happened.
              </span>
            </li>
            <li className="flex gap-2">
              <CloudOff className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>
                It is shown as <strong>“accepted offline”</strong> — never “checked in”, because the
                records do not have it yet.
              </span>
            </li>
            <li className="flex gap-2">
              <CloudOff className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>
                When the signal returns the queue uploads itself. Each scan carries its own id, so
                uploading twice creates one row, not two.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* ── The result sheet ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance so far</CardTitle>
          <CardDescription>
            {report.counts.checkedIn} of {report.counts.registered} registered people are in (
            {report.counts.attendanceRate}%). {unscanned.length} ticket
            {unscanned.length === 1 ? "" : "s"} still to scan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Checked in</TableHead>
                <TableHead className="text-right">How</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.ticketId}>
                  <TableCell className="font-medium">{row.holder}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.checkInTime
                      ? formatDateTimeInZone(new Date(row.checkInTime), timeZone)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.source ? (
                      <Badge variant="secondary">
                        {row.source === "MANUAL" ? "typed code" : "scanner"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">not yet</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/demo/events/${event.id}?as=${account.key}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to the event
        </Link>
        <Link
          href={`/demo/clubs/${event.club.id}?as=${account.key}`}
          className={cn(buttonVariants({ variant: "ghost" }))}
        >
          Back to the club
        </Link>
      </div>
    </div>
  );
}
