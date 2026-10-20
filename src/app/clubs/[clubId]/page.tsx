import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Info, Users } from "lucide-react";
import { z } from "zod";

import { ClubAnnouncements } from "@/components/features/announcement/club-announcements";
import { ClubMembersManager, type ClubMemberRow } from "@/components/features/club/club-members-manager";
import {
  TransferPresidencyDialog,
  type PresidencyCandidate,
} from "@/components/features/club/transfer-presidency-dialog";
import { InviteManager, type ClubInviteRow } from "@/components/features/club/invite-manager";
import { EventList, type EventRow } from "@/components/features/event/event-list";
import { ClubOpeningsManager } from "@/components/features/recruitment/club-openings-manager";
import { PublicClubProfileView } from "@/components/features/recruitment/public-club-profile";
import { PendingClubPanel } from "@/components/features/club-request/pending-club-panel";
import { toManageRows } from "@/components/features/recruitment/review-rows";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api/response";
import { requireClubAccess, type ClubContext } from "@/lib/auth/guards";
import { getSessionUserId } from "@/lib/auth/session";
import { getPendingClubView, type PendingClubView } from "@/lib/services/club-request-service";
import {
  assignableClubRoles,
  canChangeClubRole,
  canClub,
  canRemoveClubMember,
  offerableOpeningRoles,
  type Actor,
} from "@/lib/auth/rbac";
import { clubRoleLabel } from "@/lib/domain/club-roles";
import { listClubAnnouncements } from "@/lib/services/announcement-service";
import { listClubMembers } from "@/lib/services/club-service";
import { getPublicClubProfile, type PublicClubProfile } from "@/lib/services/club-profile-service";
import { listClubEvents } from "@/lib/services/event-service";
import { listClubOpenings } from "@/lib/services/recruitment-service";
import { listClubInvites } from "@/lib/services/invite-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Club" };

/**
 * Club workspace: members, roles and invite links.
 *
 * Every capability below is decided by the RBAC matrix on the server. The client
 * components only *render* those decisions; the API re-checks each write, so
 * tampering with the UI achieves nothing.
 */
/**
 * Runs the guard and turns its failure modes into page-level outcomes.
 *
 * A guard throws (it is shared with the API routes, which need real status
 * codes), but a thrown error in a page renders as a 500 crash. Since Phase 11
 * anyone who may not open the workspace — a guest (401), a student from another
 * college (404) or a college member who hasn't joined (403) — gets the club's
 * PUBLIC profile instead. Only a club that doesn't exist is a 404.
 *
 * Phase 12: the guard never finds a PENDING club (it is locked until the
 * professor's code is entered), so a 404 is checked once more — the student
 * who asked for it, and the college's admins, get the pending page instead.
 * Everyone else still gets a plain 404, as if it didn't exist.
 */
async function loadClubPage(
  clubId: string,
): Promise<
  | { kind: "ok"; context: ClubContext }
  | { kind: "public"; profile: PublicClubProfile }
  | { kind: "pending"; view: PendingClubView }
  | { kind: "not-found" }
> {
  if (!z.uuid().safeParse(clubId).success) return { kind: "not-found" };
  try {
    return { kind: "ok", context: await requireClubAccess(clubId, "club:read") };
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
      const userId = error.status === 404 ? await getSessionUserId() : null;
      const pending = userId ? await getPendingClubView(clubId, userId) : null;
      if (pending) return { kind: "pending", view: pending };
      const profile = await getPublicClubProfile(clubId);
      return profile ? { kind: "public", profile } : { kind: "not-found" };
    }
    throw error;
  }
}

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const [{ clubId }, query] = await Promise.all([params, searchParams]);

  const result = await loadClubPage(clubId);
  if (result.kind === "not-found") notFound();
  if (result.kind === "public") return <PublicClubProfileView profile={result.profile} />;
  if (result.kind === "pending") return <PendingClubPanel view={result.view} />;

  // Members can preview what outsiders see.
  if (query.view === "public") {
    const profile = await getPublicClubProfile(clubId);
    if (!profile) notFound();
    return <PublicClubProfileView profile={profile} workspaceHref={`/clubs/${clubId}`} />;
  }

  const context = result.context;
  const actor: Actor = { tenantRole: context.tenantRole, clubRole: context.clubRole };

  const viewer = { ...actor, userId: context.user.id };
  const canRemoveSomeone = canClub(actor, "club:remove_member");
  const canChangeRoles = canClub(actor, "club:change_roles");
  const canTransfer = canClub(actor, "club:transfer_presidency");
  const canReadAnnouncements = canClub(actor, "announcement:read");
  const canInvite = canClub(actor, "club:invite");
  const canCreateEvent = canClub(actor, "event:create");
  const canEditEvent = canClub(actor, "event:update");
  const canDeleteEvent = canClub(actor, "event:delete");

  const [members, invites, events, announcements, openings] = await Promise.all([
    listClubMembers(clubId, context.club.tenantId),
    canInvite ? listClubInvites(clubId, context.club.tenantId) : Promise.resolve([]),
    // Drafts are included only for people who can edit events; the service applies
    // the same rule as the API, so the page and the endpoint cannot disagree.
    listClubEvents(clubId, context.club.tenantId, {
      includeDrafts: canCreateEvent,
      includeWhatsapp: canEditEvent,
    }),
    canReadAnnouncements
      ? listClubAnnouncements(clubId, context.club.tenantId)
      : Promise.resolve([]),
    listClubOpenings(clubId, context.club.tenantId, actor),
  ]);

  const eventRows: EventRow[] = events
    .filter((event) => event.isPublic || context.clubRole !== null)
    .map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      capacity: event.capacity,
      waitlistEnabled: event.waitlistEnabled,
      status: event.status,
      isPublic: event.isPublic,
      registeredCount: event.registeredCount,
      posterUrl: event.posterUrl,
      tags: event.tags,
      instagramUrl: event.instagramUrl,
      // Only selected for organisers; `undefined` for everyone else, so it never reaches their browser.
      whatsappUrl: "whatsappUrl" in event ? (event.whatsappUrl ?? null) : null,
    }));

  // Each row's powers are decided here, on the server, from the target's role.
  const memberRows: ClubMemberRow[] = members.map((member) => {
    const target = { userId: member.user.id, role: member.role };
    return {
      membershipId: member.membershipId,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      user: {
        id: member.user.id,
        email: member.user.email,
        displayName: member.user.displayName,
      },
      canRemove: canRemoveClubMember(viewer, target),
      canChangeRole: canChangeClubRole(viewer, target, "EVENT_MANAGER"),
      isViewer: member.user.id === context.user.id,
    };
  });

  const president = members.find((member) => member.role === "PRESIDENT") ?? null;
  const presidencyCandidates: PresidencyCandidate[] = members.flatMap((member) =>
    member.role === "PRESIDENT"
      ? []
      : [{ userId: member.user.id, displayName: member.user.displayName, role: member.role }],
  );

  const inviteRows: ClubInviteRow[] = invites.map((invite) => ({
    id: invite.id,
    url: invite.url,
    role: invite.role,
    email: invite.email,
    expiresAt: invite.expiresAt.toISOString(),
    maxUses: invite.maxUses,
    uses: invite.uses,
    status: invite.status,
  }));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        All colleges and clubs
      </Link>

      <div className="flex items-start gap-5">
        <span
          aria-hidden="true"
          className="hidden size-16 shrink-0 items-center justify-center rounded-lg bg-foreground font-heading text-3xl font-extrabold text-background shadow-print-sm sm:flex"
        >
          {context.club.name.charAt(0)}
        </span>
        <div className="flex min-w-0 flex-col gap-2">
        <span className="eyebrow text-primary">Club</span>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl leading-[1.08] font-bold sm:text-4xl">{context.club.name}</h1>
          {context.clubRole ? (
            <Badge>{clubRoleLabel(context.clubRole)}</Badge>
          ) : context.tenantRole ? (
            <Badge variant="secondary">College {context.tenantRole.toLowerCase()}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Club address: <code className="font-mono">/{context.club.slug}</code> · scheduling timezone{" "}
          {context.club.timezone}
        </p>
        <Link
          href={`/clubs/${clubId}?view=public`}
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium underline-offset-4 hover:underline"
        >
          <Eye className="size-4" />
          See the public profile
        </Link>
        </div>
      </div>

      {!context.clubRole ? (
        <Alert>
          <Info />
          <AlertTitle>You can see this club but not manage it</AlertTitle>
          <AlertDescription>
            You are a college {context.tenantRole?.toLowerCase()} but not a club member. Join with an
            invite link to take part in its events.
          </AlertDescription>
        </Alert>
      ) : null}

      {canReadAnnouncements ? (
        <ClubAnnouncements
          clubId={clubId}
          timeZone={context.club.timezone}
          announcements={announcements}
          viewerId={context.user.id}
          canPost={canClub(actor, "announcement:post")}
          canModerate={canClub(actor, "announcement:moderate")}
        />
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Members
            </CardTitle>
            <CardDescription>
              {canChangeRoles
                ? "Promote a Member to Lead (or back) from the dropdown. Remove anyone except the President — to step down, hand over the presidency."
                : canRemoveSomeone
                  ? "As a Lead you can remove Members. Only the President can remove Leads or change roles."
                  : `President: ${president?.user.displayName ?? "none yet"}. Leads run events and post announcements.`}
            </CardDescription>
          </div>
          {canTransfer ? (
            <TransferPresidencyDialog
              clubId={clubId}
              clubName={context.club.name}
              candidates={presidencyCandidates}
              viewerIsPresident={context.clubRole === "PRESIDENT"}
              currentPresidentName={president?.user.displayName ?? null}
            />
          ) : null}
        </CardHeader>
        <CardContent>
          <ClubMembersManager clubId={clubId} members={memberRows} />
        </CardContent>
      </Card>

      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite links</CardTitle>
            <CardDescription>
              Share a link in your class group. The role it grants is fixed by you — nobody can upgrade
              it. Links can be set to expire and to a limited number of uses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteManager
              clubId={clubId}
              invites={inviteRows}
              assignableRoles={assignableClubRoles(actor)}
            />
          </CardContent>
        </Card>
      ) : null}

      <ClubOpeningsManager
        clubId={clubId}
        timeZone={context.club.timezone}
        openings={toManageRows(openings, context.club.timezone)}
        offerableRoles={offerableOpeningRoles(actor)}
      />

      <EventList
        clubId={clubId}
        timeZone={context.club.timezone}
        events={eventRows}
        canCreate={canCreateEvent}
        canEdit={canEditEvent}
        canDelete={canDeleteEvent}
      />

      <div>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
