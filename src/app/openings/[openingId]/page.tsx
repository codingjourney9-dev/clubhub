import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Info, LogIn, UserRound } from "lucide-react";
import { z } from "zod";

import { ApplyForm, WithdrawButton } from "@/components/features/recruitment/apply-panel";
import { ApplicationStatusBadge } from "@/components/features/recruitment/application-status";
import { ClosesLine, OpeningRoleStamp } from "@/components/features/recruitment/opening-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authHref } from "@/lib/auth/callback-url";
import { getSessionUserId } from "@/lib/auth/session";
import { CLUB_ROLE_LABELS } from "@/lib/domain/club-roles";
import { formatDateTimeInZone } from "@/lib/format/date";
import { getApplicantView, getPublicOpening, type PublicOpening } from "@/lib/services/recruitment-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Opening" };
export const dynamic = "force-dynamic";

/** The right-hand panel: apply, sign in, your application, or why not. */
async function ApplyPanel({ opening, userId }: { opening: PublicOpening; userId: string | null }) {
  const path = `/openings/${opening.id}`;
  const isOpen = opening.state === "open";

  if (!userId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Want this role?</CardTitle>
          <CardDescription>
            {isOpen
              ? "Sign in (or create a free account) to apply. You'll come straight back here."
              : "This opening isn't taking applications any more."}
          </CardDescription>
        </CardHeader>
        {isOpen ? (
          <CardContent className="flex flex-wrap gap-2">
            <Link href={authHref("/sign-in", path)} className={cn(buttonVariants())}>
              <LogIn data-icon="inline-start" />
              Sign in to apply
            </Link>
            <Link href={authHref("/sign-up", path)} className={cn(buttonVariants({ variant: "outline" }))}>
              Create an account
            </Link>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  const view = await getApplicantView(opening.id, userId);
  const application = view?.application ?? null;

  if (application && application.status !== "WITHDRAWN") {
    return (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Your application</CardTitle>
            <CardDescription>Sent {formatDateTimeInZone(application.createdAt, opening.club.timeZone)}</CardDescription>
          </div>
          <ApplicationStatusBadge status={application.status} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {application.status === "ACCEPTED" ? (
            <p className="text-sm">
              You&apos;re in — you&apos;re now a {CLUB_ROLE_LABELS[opening.role]} of {opening.club.name}.{" "}
              <Link href={`/clubs/${opening.club.id}`} className="font-medium underline underline-offset-4">
                Open the club
              </Link>
            </p>
          ) : application.status === "REJECTED" ? (
            <p className="text-sm text-muted-foreground">
              The club chose other applicants this time. Keep an eye on the board for other openings.
            </p>
          ) : null}
          <dl className="flex flex-col gap-3">
            {application.answers.map((item, index) => (
              <div key={index} className="flex flex-col gap-1">
                <dt className="text-sm font-medium">{item.question}</dt>
                <dd className="text-sm whitespace-pre-line text-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
          {application.status === "PENDING" ? (
            <div>
              <WithdrawButton applicationId={application.id} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (!isOpen) {
    return (
      <Alert>
        <Info />
        <AlertTitle>Applications are closed</AlertTitle>
        <AlertDescription>This opening isn&apos;t taking applications any more.</AlertDescription>
      </Alert>
    );
  }

  if (view?.blockedReason) {
    return (
      <Alert>
        <Info />
        <AlertTitle>You can&apos;t apply to this one</AlertTitle>
        <AlertDescription>
          {view.blockedReason} This opening offers a role you already have (or a lower one).
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply</CardTitle>
        <CardDescription>
          {application?.status === "WITHDRAWN"
            ? "You withdrew earlier — you can apply again. "
            : ""}
          Answer every question. The club&apos;s Leads{opening.role === "EVENT_MANAGER" ? " and President" : ""} will see your
          name, email and answers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ApplyForm openingId={opening.id} questions={opening.questions} />
      </CardContent>
    </Card>
  );
}

export default async function OpeningPage({ params }: { params: Promise<{ openingId: string }> }) {
  const { openingId } = await params;
  if (!z.uuid().safeParse(openingId).success) notFound();
  const [opening, userId] = await Promise.all([getPublicOpening(openingId), getSessionUserId()]);
  if (!opening) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <Link
        href="/openings"
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        All openings
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <article className="flex flex-col gap-6">
          <header className="flex flex-col gap-3">
            <span className="eyebrow text-primary">
              <Link href={`/clubs/${opening.club.id}`} className="underline-offset-4 hover:underline">
                {opening.club.name}
              </Link>{" "}
              · {opening.club.collegeName}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl leading-[1.08] font-bold sm:text-4xl">{opening.title}</h1>
              <OpeningRoleStamp role={opening.role} state={opening.state} />
            </div>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
                <ClosesLine opening={opening} />
              </li>
              <li className="flex items-center gap-2">
                <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                Posted by {opening.postedBy} · {formatDateTimeInZone(opening.createdAt, opening.club.timeZone)}
              </li>
            </ul>
          </header>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">What the role involves</h2>
            <p className="whitespace-pre-line text-pretty">{opening.description}</p>
          </section>

          {opening.requirements ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">Requirements</h2>
              <p className="whitespace-pre-line text-pretty">{opening.requirements}</p>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">The club asks</h2>
            <ol className="list-decimal pl-5 text-sm text-muted-foreground">
              {opening.questions.map((question, index) => (
                <li key={index}>{question}</li>
              ))}
            </ol>
          </section>
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <ApplyPanel opening={opening} userId={userId} />
          <Link
            href={`/clubs/${opening.club.id}`}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            About {opening.club.name}
          </Link>
        </aside>
      </div>
    </div>
  );
}
