import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ScanLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { checkInWindowState } from "@/lib/domain/check-in";
import { formatDateTimeInZone } from "@/lib/format/date";
import { listScannableEvents } from "@/lib/services/check-in-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Door scanners" };
export const dynamic = "force-dynamic";

/**
 * Every door this person is allowed to work.
 *
 * The list is events, not clubs, because that is what a volunteer is holding when
 * they open the page: "which event am I at tonight?". Events whose check-in window
 * has closed stay visible for a day so nobody is confused about where last night's
 * scans went.
 */
export default async function DoorIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?callbackUrl=/door");

  const events = await listScannableEvents(user.id);
  const now = new Date();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        Back to dashboard
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-3xl leading-[1.08] font-bold sm:text-4xl">
          <ScanLine className="size-5 text-muted-foreground" />
          Doors
        </h1>
        <p className="text-sm text-muted-foreground">
          Events you can check people in to. Open one on your phone at the venue — it works without
          internet once the guest list has loaded.
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No doors to run</CardTitle>
            <CardDescription>
              Checking people in is a President or Lead job. You are neither, in any club —
              so there is nothing here for you, and that is on purpose.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => {
            const state = checkInWindowState(event, event.club.tenant.timezone, now);

            return (
              <li
                key={event.id}
                className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{event.title}</span>
                    {state === "OPEN" ? (
                      <Badge>Door open</Badge>
                    ) : state === "TOO_EARLY" ? (
                      <Badge variant="outline">Not today</Badge>
                    ) : (
                      <Badge variant="secondary">Closed</Badge>
                    )}
                    {event.status === "DRAFT" ? <Badge variant="outline">Draft</Badge> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {event.club.name} ·{" "}
                    {formatDateTimeInZone(event.startTime, event.club.tenant.timezone)} ·{" "}
                    {event._count.attendance} checked in
                  </span>
                </div>

                <Link
                  href={`/events/${event.id}/door`}
                  className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                >
                  Open scanner
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
