import type { ReviewRow } from "@/components/features/recruitment/application-review";
import type { ClubOpeningManageRow } from "@/components/features/recruitment/club-openings-manager";
import { clubRoleLabel } from "@/lib/domain/club-roles";
import { formatDateTimeInZone, utcToWallClock } from "@/lib/format/date";
import type { ClubOpeningRow, ReviewApplication } from "@/lib/services/recruitment-service";

/** Server-side: dates formatted in the college's zone before they reach the browser. */
export function toReviewRows(applications: readonly ReviewApplication[], timeZone: string): ReviewRow[] {
  return applications.map((application) => ({
    id: application.id,
    status: application.status,
    appliedLabel: formatDateTimeInZone(application.createdAt, timeZone),
    decidedLabel:
      application.decidedAt && application.status !== "WITHDRAWN"
        ? `${application.status === "ACCEPTED" ? "Accepted" : "Rejected"}${application.decidedBy ? ` by ${application.decidedBy}` : ""} · ${formatDateTimeInZone(application.decidedAt, timeZone)}`
        : null,
    answers: application.answers,
    applicant: {
      displayName: application.applicant.displayName,
      email: application.applicant.email,
      colleges: application.applicant.colleges,
      currentRoleLabel: application.applicant.currentRole ? clubRoleLabel(application.applicant.currentRole) : null,
    },
  }));
}

export function toManageRows(openings: readonly ClubOpeningRow[], timeZone: string): ClubOpeningManageRow[] {
  const now = Date.now();
  return openings.map((opening) => ({
    id: opening.id,
    title: opening.title,
    description: opening.description,
    requirements: opening.requirements,
    role: opening.role,
    questions: opening.questions,
    closesAt: opening.closesAt ? utcToWallClock(opening.closesAt, timeZone) : "",
    state: opening.state,
    status: opening.state === "closed" ? "CLOSED" : "OPEN",
    datePassed: opening.closesAt !== null && opening.closesAt.getTime() <= now,
    closesLabel:
      opening.state === "closed"
        ? "Closed by the club"
        : opening.closesAt
          ? `${opening.state === "date_passed" ? "Closed on" : "Closes"} ${formatDateTimeInZone(opening.closesAt, timeZone)}`
          : "Open until you close it",
    pendingCount: opening.pendingCount,
    totalCount: opening.totalCount,
    canManage: opening.canManage,
  }));
}
