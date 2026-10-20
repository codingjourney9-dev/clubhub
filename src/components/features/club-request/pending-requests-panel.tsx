import Link from "next/link";
import { ArrowUpRight, Hourglass } from "lucide-react";

import { formatDateTimeInZone } from "@/lib/format/date";
import type { PendingRequestRow } from "@/lib/services/club-request-service";

/**
 * "Club requests in your college" — shown to college Owners/Admins only.
 *
 * Admins can SEE who asked and which professor must confirm, and can remove a
 * request (from its page). They cannot approve one: a student's club only goes
 * live with the professor's code. That is the rule agreed for Phase 12.
 */
export function PendingRequestsPanel({ requests }: { requests: readonly PendingRequestRow[] }) {
  return (
    <section aria-labelledby="club-requests-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="eyebrow">For college admins</span>
        <h2 id="club-requests-heading" className="flex items-center gap-2 text-2xl font-bold">
          <Hourglass className="size-5 text-primary" aria-hidden="true" />
          Club requests waiting for a professor
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Students started these clubs. Each goes live only when the professor&apos;s code is entered — you
          can&apos;t approve them, but you can remove one that shouldn&apos;t exist.
        </p>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {requests.map((request) => (
          <li key={request.id}>
            <Link
              href={`/clubs/${request.id}`}
              className="group flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-secondary/60 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold group-hover:underline">{request.name}</span>
                <span className="text-sm text-muted-foreground">
                  Asked by {request.requesterName} · professor {request.facultyEmail}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                {request.collegeName} · {formatDateTimeInZone(request.createdAt, request.timezone)}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
