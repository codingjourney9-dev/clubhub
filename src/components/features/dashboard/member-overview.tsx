import { CalendarDays, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import type { MemberOverview } from "@/lib/services/dashboard-service";

/**
 * Presentational only — no data fetching, no auth. Rendered by both the real
 * dashboard and the cookie-free `/demo` preview so they stay identical.
 */

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

export function MemberOverviewView({ overview }: { overview: MemberOverview }) {
  const { tenantRoles, clubRoles, upcomingEvents } = overview;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Tenant roles
            </CardTitle>
            <CardDescription>Roles are per tenant. Club-level roles live in the next card.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {tenantRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not a member of any tenant yet.</p>
            ) : (
              tenantRoles.map((membership) => (
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
            <CardDescription>The same person can hold different roles in different clubs.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {clubRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not part of a club yet.</p>
            ) : (
              clubRoles.map((membership) => (
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
    </div>
  );
}
