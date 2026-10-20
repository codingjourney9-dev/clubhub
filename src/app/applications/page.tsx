import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeading } from "@/components/common/page-heading";
import { WithdrawButton } from "@/components/features/recruitment/apply-panel";
import { ApplicationStatusBadge } from "@/components/features/recruitment/application-status";
import { buttonVariants } from "@/components/ui/button";
import { authHref } from "@/lib/auth/callback-url";
import { getSessionUserId } from "@/lib/auth/session";
import { CLUB_ROLE_LABELS } from "@/lib/domain/club-roles";
import { formatDateTimeInZone } from "@/lib/format/date";
import { listMyApplications } from "@/lib/services/recruitment-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My applications" };
export const dynamic = "force-dynamic";

/** Everything the signed-in student has applied for, and what happened. */
export default async function MyApplicationsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect(authHref("/sign-in", "/applications"));
  const applications = await listMyApplications(userId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <PageHeading
        eyebrow="Recruitment"
        title="My applications"
        description="Roles you've applied for and where each one stands. You can withdraw an application while it's still waiting."
        actions={
          <Link href="/openings" className={cn(buttonVariants({ variant: "outline" }))}>
            Browse openings
          </Link>
        }
      />

      {applications.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No applications yet"
          description="Find a club that's recruiting on the board and apply — it takes a minute."
          action={
            <Link href="/openings" className={cn(buttonVariants())}>
              See open roles
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {applications.map((application) => (
            <li
              key={application.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="eyebrow truncate">
                  {application.opening.clubName} · {application.opening.collegeName}
                </span>
                {application.opening.removed ? (
                  <span className="font-medium">{application.opening.title} (removed by the club)</span>
                ) : (
                  <Link
                    href={`/openings/${application.opening.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {application.opening.title}
                  </Link>
                )}
                <span className="text-xs text-muted-foreground">
                  {CLUB_ROLE_LABELS[application.opening.role]} role · applied{" "}
                  {formatDateTimeInZone(application.createdAt, application.opening.timeZone)}
                  {application.decidedAt
                    ? ` · decided ${formatDateTimeInZone(application.decidedAt, application.opening.timeZone)}`
                    : ""}
                </span>
                {application.status === "ACCEPTED" ? (
                  <Link
                    href={`/clubs/${application.opening.clubId}`}
                    className="text-sm font-medium underline underline-offset-4"
                  >
                    Open the club
                  </Link>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <ApplicationStatusBadge status={application.status} />
                {application.status === "PENDING" ? <WithdrawButton applicationId={application.id} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
