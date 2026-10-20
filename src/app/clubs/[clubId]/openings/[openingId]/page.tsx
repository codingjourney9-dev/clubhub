import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { z } from "zod";

import { PageHeading } from "@/components/common/page-heading";
import { ApplicationReview } from "@/components/features/recruitment/application-review";
import { toReviewRows } from "@/components/features/recruitment/review-rows";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api/response";
import { authHref } from "@/lib/auth/callback-url";
import { requireClubAccess } from "@/lib/auth/guards";
import { clubRoleLabel } from "@/lib/domain/club-roles";
import { listOpeningApplications } from "@/lib/services/recruitment-service";

export const metadata: Metadata = { title: "Review applications" };
export const dynamic = "force-dynamic";

/**
 * Reviewing one opening. The guard lets in Leads and up; the service then
 * applies the opening's tier (a Lead opening is the President's call).
 */
async function load(clubId: string, openingId: string) {
  try {
    const context = await requireClubAccess(clubId, "opening:manage_member");
    const data = await listOpeningApplications({
      clubId,
      tenantId: context.club.tenantId,
      actor: { tenantRole: context.tenantRole, clubRole: context.clubRole },
      openingId,
    });
    return { kind: "ok" as const, context, data };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(authHref("/sign-in", `/clubs/${clubId}/openings/${openingId}`));
    }
    if (error instanceof ApiError && error.status === 403) return { kind: "forbidden" as const, message: error.message };
    if (error instanceof ApiError && error.status === 404) return { kind: "not-found" as const };
    throw error;
  }
}

export default async function ReviewApplicationsPage({
  params,
}: {
  params: Promise<{ clubId: string; openingId: string }>;
}) {
  const { clubId, openingId } = await params;
  if (!z.uuid().safeParse(clubId).success || !z.uuid().safeParse(openingId).success) notFound();

  const result = await load(clubId, openingId);
  if (result.kind === "not-found") notFound();

  const back = (
    <Link
      href={`/clubs/${clubId}`}
      className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ArrowLeft className="size-4" />
      Back to the club
    </Link>
  );

  if (result.kind === "forbidden") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-16">
        {back}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" />
              Not yours to review
            </CardTitle>
            <CardDescription>{result.message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { context, data } = result;
  const pending = data.applications.filter((application) => application.status === "PENDING").length;
  const roleLabel = clubRoleLabel(data.opening.role);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      {back}
      <PageHeading
        eyebrow={`${context.club.name} · ${roleLabel} opening`}
        title={data.opening.title}
        description={
          pending
            ? `${pending} waiting for a decision. Accepting makes them a ${roleLabel} straight away.`
            : "Nothing waiting right now."
        }
        actions={
          <Link
            href={`/openings/${data.opening.id}`}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            See the public page
          </Link>
        }
      />
      <ApplicationReview
        clubId={clubId}
        roleLabel={roleLabel}
        applications={toReviewRows(data.applications, context.club.timezone)}
      />
    </div>
  );
}
