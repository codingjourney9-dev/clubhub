import Link from "next/link";
import { ArrowUpRight, CalendarClock, Megaphone } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { CLUB_ROLE_LABELS } from "@/lib/domain/club-roles";
import type { OpeningState } from "@/lib/domain/openings";
import { formatDateTimeInZone } from "@/lib/format/date";
import type { PublicOpening } from "@/lib/services/recruitment-service";
import { cn } from "@/lib/utils";

/** The little Member / Lead stamp, and Closed when it no longer takes applications. */
export function OpeningRoleStamp({ role, state }: { role: "MEMBER" | "EVENT_MANAGER"; state?: OpeningState }) {
  const closed = state !== undefined && state !== "open";
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium tracking-wide uppercase",
        closed
          ? "border-foreground/70 bg-foreground text-background"
          : role === "EVENT_MANAGER"
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-foreground/20 text-muted-foreground",
      )}
    >
      {closed ? "Closed" : `${CLUB_ROLE_LABELS[role]} role`}
    </span>
  );
}

/** "Closes 30 Oct 2026, 6:00 pm" in the club's college time, or nothing. */
export function ClosesLine({ opening }: { opening: Pick<PublicOpening, "closesAt" | "state" | "club"> }) {
  if (opening.state === "closed") return <span>Not taking applications</span>;
  if (!opening.closesAt) return <span>Open until the club closes it</span>;
  return (
    <span>
      {opening.state === "date_passed" ? "Closed on " : "Closes "}
      {formatDateTimeInZone(opening.closesAt, opening.club.timeZone)}
    </span>
  );
}

/** One opening on the public board. Presentational only. */
export function OpeningCard({ opening }: { opening: PublicOpening }) {
  return (
    <Link
      href={`/openings/${opening.id}`}
      className="group flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-foreground/50 hover:shadow-print-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="eyebrow truncate" title={opening.club.collegeName}>
            {opening.club.collegeName}
          </span>
          <h3 className="font-heading text-lg leading-snug font-bold tracking-tight text-balance group-hover:underline group-hover:decoration-primary group-hover:decoration-2 group-hover:underline-offset-4">
            {opening.title}
          </h3>
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{opening.description}</p>
      <p className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
        <ClosesLine opening={opening} />
      </p>
      <div className="perforation" aria-hidden="true" />
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium">
          {opening.club.name}
          {opening.club.category ? (
            <span className="font-normal text-muted-foreground"> · {opening.club.category}</span>
          ) : null}
        </span>
        <OpeningRoleStamp role={opening.role} state={opening.state} />
      </div>
    </Link>
  );
}

export function OpeningGrid({ openings, emptyHint }: { openings: readonly PublicOpening[]; emptyHint?: string }) {
  if (openings.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No open roles right now"
        description={emptyHint ?? "When a club starts recruiting, its openings appear here."}
      />
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {openings.map((opening) => (
        <li key={opening.id}>
          <OpeningCard opening={opening} />
        </li>
      ))}
    </ul>
  );
}
