import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";

import { PageHeading } from "@/components/common/page-heading";
import { StartClubForm } from "@/components/features/club-request/start-club-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authHref } from "@/lib/auth/callback-url";
import { getCurrentUser } from "@/lib/auth/session";
import { START_CLUB_PATH } from "@/lib/domain/club-paths";
import { CODE_TTL_MINUTES, MAX_CODE_ATTEMPTS } from "@/lib/domain/club-verification";
import { loadStartClubContext } from "@/lib/services/club-request-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Start a club" };

/**
 * Start a new club (Phase 12). Any signed-in student.
 *
 * Signed-out visitors are sent to sign in and brought straight back here. The
 * college is worked out from the student's email address; when it matches no
 * college, they pick one from the list.
 */
export default async function StartClubPage() {
  const user = await getCurrentUser();
  if (!user) redirect(authHref("/sign-in", START_CLUB_PATH));

  const context = await loadStartClubContext(user);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}>
        <ArrowLeft data-icon="inline-start" />
        Dashboard
      </Link>

      <PageHeading
        eyebrow="New club"
        title="Start a club"
        description="You become its President. A professor confirms it with a code, then it goes live for everyone."
      />

      {context.colleges.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4">
            <p className="text-muted-foreground">
              There are no colleges on ClubHub yet. Create yours first — you will be its Owner.
            </p>
            <Link href="/onboarding" className={cn(buttonVariants())}>
              Create your college
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {context.matchedCollege ? (
              <span>
                Your email <span className="font-medium">{user.email}</span> belongs to{" "}
                <span className="font-semibold">{context.matchedCollege.name}</span>, so your club will be part of it.
              </span>
            ) : (
              <span>
                Your email <span className="font-medium">{user.email}</span> doesn&apos;t match a college, so pick
                yours below. Not listed?{" "}
                <Link href="/onboarding" className="font-medium underline underline-offset-4">
                  Create your college
                </Link>
                .
              </span>
            )}
          </p>

          <Card>
            <CardContent>
              <StartClubForm
                colleges={context.colleges.map(({ id, name }) => ({ id, name }))}
                matchedCollegeId={context.matchedCollege?.id ?? null}
                adminCollegeIds={context.adminCollegeIds}
                pendingCount={context.pendingCount}
                maxPending={context.maxPending}
              />
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            The code works for {CODE_TTL_MINUTES} minutes and allows {MAX_CODE_ATTEMPTS} tries. You can ask for a new
            one at any time.
          </p>
        </>
      )}
    </div>
  );
}
