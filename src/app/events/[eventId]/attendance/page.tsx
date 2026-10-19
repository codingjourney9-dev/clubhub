import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, ScanLine, UserX } from "lucide-react";

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
import { ApiError } from "@/lib/api/response";
import { requireEventAccess } from "@/lib/auth/guards";
import { formatDateTimeInZone } from "@/lib/format/date";
import { getAttendanceReport } from "@/lib/services/check-in-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

async function loadReport(eventId: string) {
  try {
    const context = await requireEventAccess(eventId, "attendance:report");
    const report = await getAttendanceReport(eventId, context.event.tenantId);
    return { kind: "ok" as const, report };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/events/${eventId}/attendance`)}`);
    }
    if (error instanceof ApiError && error.status === 404) return { kind: "not-found" as const };
    if (error instanceof ApiError && error.status === 403) return { kind: "forbidden" as const };
    throw error;
  }
}

/**
 * The number the club actually wants: how many of the people who said they were
 * coming actually turned up.
 *
 * Both directions are shown deliberately — a no-show list is as useful as an
 * attendance list, because it tells the club which reminder worked and which did
 * not.
 */
export default async function AttendancePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const result = await loadReport(eventId);
  if (result.kind === "not-found") notFound();

  if (result.kind === "forbidden") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Attendance is for the club</CardTitle>
            <CardDescription>
              Only this club&apos;s President and Event Manager can see who turned up.
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

  const { report } = result;
  const checkedIn = report.rows.filter((row) => row.checkInTime !== null);
  const noShows = report.rows.filter((row) => row.checkInTime === null && row.status === "REGISTERED");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <Link
        href={`/events/${eventId}`}
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        Back to the event
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl leading-[1.08] font-bold sm:text-4xl">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          {report.event.title} ·{" "}
          {formatDateTimeInZone(new Date(report.event.startTime), report.event.timezone)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Registered</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{report.counts.registered}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {report.counts.waitlisted} on the waitlist
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Turned up</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{report.counts.checkedIn}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {report.counts.attendanceRate}% of the people who registered
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Did not show</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{noShows.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Still registered — a ticket for a seat nobody used
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" />
            Checked in ({checkedIn.length})
          </CardTitle>
          <CardDescription>
            The time shown is when the scan happened — for an offline scan that is the time on the
            volunteer&apos;s phone, not the moment it finally uploaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checkedIn.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has been checked in yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>At</TableHead>
                  <TableHead>How</TableHead>
                  <TableHead className="text-right">By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkedIn.map((row) => (
                  <TableRow key={row.ticketId}>
                    <TableCell className="font-medium">{row.holder}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.checkInTime
                        ? formatDateTimeInZone(new Date(row.checkInTime), report.event.timezone)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {row.source === "MANUAL" ? "typed code" : "scanner"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.checkedInBy ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="size-4 text-muted-foreground" />
            Registered but not seen ({noShows.length})
          </CardTitle>
          <CardDescription>
            Useful the morning after: these people wanted to come and did not.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {noShows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everybody who registered turned up.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {noShows.map((row) => (
                <li
                  key={row.ticketId}
                  className="rounded-md border px-2 py-1 text-xs text-muted-foreground"
                >
                  {row.holder}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/events/${eventId}/door`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ScanLine data-icon="inline-start" />
          Open the scanner
        </Link>
      </div>
    </div>
  );
}
