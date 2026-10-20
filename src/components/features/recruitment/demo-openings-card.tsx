import Link from "next/link";
import { Megaphone } from "lucide-react";

import { ApplicationReview } from "@/components/features/recruitment/application-review";
import { OpeningRoleStamp } from "@/components/features/recruitment/opening-card";
import { toManageRows, toReviewRows } from "@/components/features/recruitment/review-rows";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Actor } from "@/lib/auth/rbac";
import { offerableOpeningRoles } from "@/lib/auth/rbac";
import { clubRoleLabel } from "@/lib/domain/club-roles";
import { listClubOpenings, listOpeningApplications } from "@/lib/services/recruitment-service";

/**
 * The cookie-free demo's Openings card: the same data and the same permission
 * rules as the real workspace, without buttons. Applications are shown only to
 * a viewer who could decide them when signed in.
 */
export async function DemoOpeningsCard({
  club,
  actor,
  viewerName,
}: {
  club: { id: string; tenantId: string; timeZone: string };
  actor: Actor;
  viewerName: string;
}) {
  const openings = await listClubOpenings(club.id, club.tenantId, actor);
  const rows = toManageRows(openings, club.timeZone);
  const reviews = await Promise.all(
    openings
      .filter((opening) => opening.canManage)
      .map((opening) =>
        listOpeningApplications({ clubId: club.id, tenantId: club.tenantId, actor, openingId: opening.id }),
      ),
  );
  const offerable = offerableOpeningRoles(actor);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-4 text-muted-foreground" />
          Openings ({rows.length})
        </CardTitle>
        <CardDescription>
          Roles this club is recruiting for. They appear on the public recruitment board, and anyone signed in
          can apply.{" "}
          {offerable.length === 2
            ? "Signed in, the President gets a “New opening” button (Member or Lead), plus Edit, Close/Reopen and Accept/Reject."
            : offerable.length === 1
              ? "Signed in, a Lead gets a “New opening” button (Member openings only) and can accept or reject Member applicants. Lead applicants are the President’s call."
              : `${viewerName} can see the openings but not post or review them.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No openings yet.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Openings">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`/openings/${row.id}`} className="text-sm font-medium underline-offset-4 hover:underline">
                    {row.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {row.closesLabel}
                    {row.canManage ? ` · ${row.pendingCount} pending of ${row.totalCount}` : ""}
                  </span>
                </div>
                <OpeningRoleStamp role={row.role} state={row.state} />
              </li>
            ))}
          </ul>
        )}

        {reviews
          .filter((review) => review.applications.length > 0)
          .map((review) => (
            <div key={review.opening.id} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Applications · {review.opening.title}</h3>
              <ApplicationReview
                clubId={club.id}
                roleLabel={clubRoleLabel(review.opening.role)}
                applications={toReviewRows(review.applications, club.timeZone)}
                readOnly
              />
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
