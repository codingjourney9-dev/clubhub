import { CalendarDays, Lock, ShieldCheck, Users } from "lucide-react";

import { DateBlock } from "@/components/common/date-block";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import type { MemberOverview } from "@/lib/services/dashboard-service";
import { cn } from "@/lib/utils";
import { CLUB_ROLE_LABELS } from "@/lib/domain/club-roles";

/**
 * Presentational only — no data fetching, no auth. Rendered by both the real
 * dashboard and the cookie-free `/demo` preview so they stay identical.
 */


const TENANT_ROLE_LABELS = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
} as const;

function RoleTag({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium tracking-wide uppercase",
        strong ? "border-primary/50 bg-primary/10 text-primary" : "border-foreground/20 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Panel({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-lg border border-border bg-card", className)}>
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex flex-col gap-0.5">
          <h2 className="font-heading text-lg leading-tight font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

/** The next published events in the clubs you belong to, with how full each one is. */
export function UpcomingClubEvents({ events: upcomingEvents }: { events: MemberOverview["upcomingEvents"] }) {
  return (
      <Panel
        icon={CalendarDays}
        title="Upcoming events in your clubs"
        description="Times are shown in each college's local time."
      >
        {upcomingEvents.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            No published events coming up. When one of your clubs publishes an event, it lands here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {upcomingEvents.map((event) => {
              const timeZone = event.club.tenant.timezone;
              const taken = event._count.tickets;
              const percent = event.capacity ? Math.min(100, Math.round((taken / event.capacity) * 100)) : null;
              const full = event.capacity !== null && taken >= event.capacity;

              return (
                <li key={event.id} className="flex items-center gap-4 px-5 py-4">
                  <DateBlock date={event.startTime} timeZone={timeZone} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{event.title}</span>
                      {!event.isPublic ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
                          <Lock className="size-3" />
                          Members only
                        </span>
                      ) : null}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {event.club.name} · {formatDateTimeInZone(event.startTime, timeZone)}{" "}
                      <span className="text-xs">({zoneAbbreviation(event.startTime, timeZone)})</span>
                    </span>
                  </div>
                  <div className="hidden w-36 shrink-0 flex-col items-end gap-1.5 sm:flex">
                    <span className="font-mono text-sm tabular-nums">
                      <span className="font-semibold">{taken}</span>
                      {event.capacity ? <span className="text-muted-foreground"> / {event.capacity}</span> : null}
                    </span>
                    {percent !== null ? (
                      <span className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <span
                          className={cn("block h-full rounded-full", full ? "bg-primary" : "bg-foreground/70")}
                          style={{ width: `${Math.max(percent, 3)}%` }}
                        />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No limit</span>
                    )}
                  </div>
                  <span className="font-mono text-sm tabular-nums sm:hidden">
                    {taken}
                    {event.capacity ? <span className="text-muted-foreground">/{event.capacity}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
  );
}

/**
 * Everything this person is, in one place: college roles and club roles. Only
 * the /demo preview shows this — comparing roles is its whole point. The real
 * dashboard already shows club roles on the club cards and the college role
 * under the greeting.
 */
export function MemberOverviewView({ overview }: { overview: MemberOverview }) {
  const { tenantRoles, clubRoles, upcomingEvents } = overview;

  return (
    <div className="flex flex-col gap-6">
      <UpcomingClubEvents events={upcomingEvents} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Panel icon={ShieldCheck} title="College roles" description="What this person may do across a whole college.">
          {tenantRoles.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Not a member of any college yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {tenantRoles.map((membership) => (
                <li key={membership.tenant.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{membership.tenant.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Event times shown in {membership.tenant.timezone.replace("_", " ")} time
                    </span>
                  </div>
                  <RoleTag strong={membership.role !== "MEMBER"}>{TENANT_ROLE_LABELS[membership.role]}</RoleTag>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={Users} title="Club roles" description="One person can be a Lead in one club and a Member in another.">
          {clubRoles.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Not part of a club yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {clubRoles.map((membership) => (
                <li key={membership.club.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{membership.club.name}</span>
                    <span className="text-xs text-muted-foreground">{membership.club.category ?? "Uncategorised"}</span>
                  </div>
                  <RoleTag strong={membership.role !== "MEMBER" && membership.club.status === "ACTIVE"}>
                    {membership.club.status === "PENDING" ? "Pending" : CLUB_ROLE_LABELS[membership.role]}
                  </RoleTag>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
