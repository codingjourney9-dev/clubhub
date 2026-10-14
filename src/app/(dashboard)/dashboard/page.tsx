import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, KeyRound, ShieldCheck, Users } from "lucide-react";

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
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const CLUB_ROLE_LABELS = {
  PRESIDENT: "President",
  EVENT_MANAGER: "Event Manager",
  MEMBER: "Member",
} as const;

const TENANT_ROLE_LABELS = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
} as const;

/**
 * Phase 2 dashboard: proves the whole spine end to end — session → database →
 * tenant-scoped queries → timezone-correct rendering. Phase 3 adds club
 * creation/invites and Phase 4 the real metrics.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?callbackUrl=/dashboard");

  const [tenantMemberships, clubMemberships] = await Promise.all([
    db.tenantMember.findMany({
      where: { userId: user.id, deletedAt: null },
      select: {
        role: true,
        tenant: { select: { id: true, name: true, slug: true, timezone: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    db.clubMember.findMany({
      where: { userId: user.id, deletedAt: null },
      select: {
        role: true,
        club: { select: { id: true, name: true, category: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  const clubIds = clubMemberships.map((membership) => membership.club.id);

  // Tenant-scoped read: only events belonging to clubs this user is in.
  const upcomingEvents = clubIds.length
    ? await db.event.findMany({
        where: {
          clubId: { in: clubIds },
          status: "PUBLISHED",
          deletedAt: null,
          endTime: { gte: new Date() },
        },
        orderBy: { startTime: "asc" },
        take: 5,
        select: {
          id: true,
          title: true,
          startTime: true,
          capacity: true,
          isPublic: true,
          club: { select: { name: true, tenant: { select: { timezone: true } } } },
          _count: { select: { tickets: { where: { status: "REGISTERED" } } } },
        },
      })
    : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Hello, {user.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Tenant roles
            </CardTitle>
            <CardDescription>
              Roles are per tenant. Club-level roles live in the next card.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {tenantMemberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You are not a member of any tenant yet.
              </p>
            ) : (
              tenantMemberships.map((membership) => (
                <div
                  key={membership.tenant.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{membership.tenant.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Scheduling timezone: {membership.tenant.timezone}
                    </span>
                  </div>
                  <Badge variant="secondary">{TENANT_ROLE_LABELS[membership.role]}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Club roles
            </CardTitle>
            <CardDescription>
              The same person can hold different roles in different clubs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {clubMemberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have not joined a club yet.</p>
            ) : (
              clubMemberships.map((membership) => (
                <div
                  key={membership.club.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{membership.club.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {membership.club.category ?? "Uncategorised"}
                    </span>
                  </div>
                  <Badge>{CLUB_ROLE_LABELS[membership.role]}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            Upcoming events in your clubs
          </CardTitle>
          <CardDescription>
            Times are stored in UTC and rendered in the club&apos;s tenant timezone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No published events coming up. Event creation arrives in Phase 4.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Club</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingEvents.map((event) => {
                  const timeZone = event.club.tenant.timezone;
                  return (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.title}</TableCell>
                      <TableCell className="text-muted-foreground">{event.club.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTimeInZone(event.startTime, timeZone)}{" "}
                        <span className="text-xs">({zoneAbbreviation(event.startTime, timeZone)})</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.isPublic ? "secondary" : "outline"}>
                          {event.isPublic ? "Public" : "Members only"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {event._count.tickets}
                        {event.capacity ? (
                          <span className="text-muted-foreground"> / {event.capacity}</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Alert>
        <KeyRound />
        <AlertTitle>Phase 2 of 7 is complete</AlertTitle>
        <AlertDescription>
          Auth, the database schema and tenant-scoped reads are live. Next: creating clubs and
          inviting members with the RBAC matrix (Phase 3), then the event engine (Phase 4).
        </AlertDescription>
      </Alert>

      <div>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to project overview
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>
    </div>
  );
}
