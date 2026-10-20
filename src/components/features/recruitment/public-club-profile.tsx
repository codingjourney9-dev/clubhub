import Link from "next/link";
import { ArrowLeft, CalendarDays, Crown, Eye, Megaphone, Users } from "lucide-react";

import { PublicEventGrid } from "@/components/features/explore/public-event-card";
import { OpeningGrid } from "@/components/features/recruitment/opening-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import type { PublicClubProfile } from "@/lib/services/club-profile-service";
import { cn } from "@/lib/utils";

/**
 * A club's public profile. Who sees it: guests, students from other colleges,
 * college members who haven't joined — and members previewing it.
 */
export function PublicClubProfileView({
  profile,
  workspaceHref,
  backHref = "/dashboard",
}: {
  profile: PublicClubProfile;
  /** Set when the viewer is a member previewing: a way back to the workspace. */
  workspaceHref?: string;
  backHref?: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 lg:py-14">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        Back to the dashboard
      </Link>

      {workspaceHref ? (
        <Alert>
          <Eye />
          <AlertTitle>You&apos;re seeing the public profile</AlertTitle>
          <AlertDescription>
            This is what people outside the club see.{" "}
            <Link href={workspaceHref} className="font-medium text-foreground underline underline-offset-4">
              Back to the club workspace
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <header className="flex items-start gap-5">
        <span
          aria-hidden="true"
          className="hidden size-16 shrink-0 items-center justify-center rounded-lg bg-foreground font-heading text-3xl font-extrabold text-background shadow-print-sm sm:flex"
        >
          {profile.name.charAt(0)}
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="eyebrow text-primary">
            {profile.collegeName}
            {profile.category ? ` · ${profile.category}` : ""}
          </span>
          <h1 className="text-3xl leading-[1.08] font-bold sm:text-4xl">{profile.name}</h1>
          {profile.description ? (
            <p className="max-w-2xl text-pretty text-muted-foreground">{profile.description}</p>
          ) : null}
        </div>
      </header>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
          <dt className="eyebrow flex items-center gap-1.5">
            <Crown className="size-3.5" aria-hidden="true" /> President
          </dt>
          <dd className="font-medium">{profile.president ?? "Not chosen yet"}</dd>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
          <dt className="eyebrow">Leads</dt>
          <dd className="font-medium">{profile.leads.length ? profile.leads.join(", ") : "None yet"}</dd>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
          <dt className="eyebrow flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden="true" /> Members
          </dt>
          <dd className="font-heading text-2xl font-bold tabular-nums">{profile.memberCount}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-4" aria-labelledby="club-openings">
        <h2 id="club-openings" className="flex items-center gap-2 text-xl font-bold">
          <Megaphone className="size-5 text-primary" aria-hidden="true" /> Open roles
        </h2>
        <OpeningGrid
          openings={profile.openings}
          emptyHint={`${profile.name} isn't recruiting right now. Check back later.`}
        />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="club-events">
        <h2 id="club-events" className="flex items-center gap-2 text-xl font-bold">
          <CalendarDays className="size-5 text-primary" aria-hidden="true" /> Upcoming events
        </h2>
        {profile.events.length ? (
          <PublicEventGrid events={profile.events} />
        ) : (
          <p className="rounded-lg border border-dashed border-foreground/25 bg-card/60 p-6 text-sm text-muted-foreground">
            No events open to everyone coming up. Members-only events aren&apos;t shown here.
          </p>
        )}
      </section>

      <div>
        <Link href="/openings" className={cn(buttonVariants({ variant: "outline" }))}>
          See every club that&apos;s recruiting
        </Link>
      </div>
    </div>
  );
}
