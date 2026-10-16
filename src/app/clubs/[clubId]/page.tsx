import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Info, Lock, Ticket, Users } from "lucide-react";

import { ClubMembersManager, type ClubMemberRow } from "@/components/features/club/club-members-manager";
import { InviteManager, type ClubInviteRow } from "@/components/features/club/invite-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api/response";
import { requireClubAccess, type ClubContext } from "@/lib/auth/guards";
import { assignableClubRoles, canClub, type Actor } from "@/lib/auth/rbac";
import { db } from "@/lib/db/client";
import { listClubMembers } from "@/lib/services/club-service";
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
 * Runs the guard and turns its two failure modes into page-level outcomes.
 *
 * A guard throws (it is shared with the API routes, which need real status
 * codes), but a thrown error in a page renders as a 500 crash. Someone opening a
 * club they cannot see deserves a proper 404 page, and a member of the college
 * who has not joined the club yet deserves an explanation — not a stack trace.
 */
async function loadClubPage(
  clubId: string,
): Promise<{ kind: "ok"; context: ClubContext } | { kind: "not-found" } | { kind: "forbidden" }> {
  try {
    return { kind: "ok", context: await requireClubAccess(clubId, "club:read") };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { kind: "not-found" };
    if (error instanceof ApiError && error.status === 403) return { kind: "forbidden" };
    throw error;
  }
}

export default async function ClubPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;

  const result = await loadClubPage(clubId);
  if (result.kind === "not-found") notFound();

  if (result.kind === "forbidden") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" />
              You are not in this club yet
            </CardTitle>
            <CardDescription>
              You belong to this college, but club pages are for members. Ask the club for an invite
              link and it will open right up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/onboarding" className={cn(buttonVariants({ variant: "outline" }))}>
              Back to your colleges and clubs
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const context = result.context;
  const actor: Actor = { tenantRole: context.tenantRole, clubRole: context.clubRole };

  const canManageMembers = canClub(actor, "club:manage_members");
  const canInvite = canClub(actor, "club:invite");
  const canCreateEvent = canClub(actor, "event:create");

  const [members, invites, upcomingEvents] = await Promise.all([
    listClubMembers(clubId, context.club.tenantId),
    canInvite ? listClubInvites(clubId, context.club.tenantId) : Promise.resolve([]),
    db.event.findMany({
      where: { clubId, deletedAt: null, status: "PUBLISHED", endTime: { gte: new Date() } },
      orderBy: { startTime: "asc" },
      take: 5,
      select: { id: true, title: true, startTime: true, capacity: true, isPublic: true },
    }),
  ]);

  const memberRows: ClubMemberRow[] = members.map((member) => ({
    membershipId: member.membershipId,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    user: {
      id: member.user.id,
      email: member.user.email,
      displayName: member.user.displayName,
    },
  }));

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <Link
        href="/onboarding"
        className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-3" />
        All colleges and clubs
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{context.club.name}</h1>
          {context.clubRole ? (
            <Badge>
              {context.clubRole === "EVENT_MANAGER"
                ? "Event Manager"
                : context.clubRole.charAt(0) + context.clubRole.slice(1).toLowerCase()}
            </Badge>
          ) : context.tenantRole ? (
            <Badge variant="secondary">College {context.tenantRole.toLowerCase()}</Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Club address: <code className="font-mono">/{context.club.slug}</code> · scheduling timezone{" "}
          {context.club.timezone}
        </p>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            Members
          </CardTitle>
          <CardDescription>
            {canManageMembers
              ? "Change a role from the dropdown. The club's only President cannot be demoted or removed."
              : "Only the club President can change roles."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClubMembersManager
            clubId={clubId}
            members={memberRows}
            canManage={canManageMembers}
            assignableRoles={assignableClubRoles(actor)}
          />
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            Upcoming events
          </CardTitle>
          <CardDescription>
            {canCreateEvent
              ? "Event creation arrives in Phase 4."
              : "Only Presidents and Event Managers can create events."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled right now.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <span className="text-sm font-medium">{event.title}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Ticket className="size-3" />
                    {event.capacity ? `capacity ${event.capacity}` : "unlimited"}
                    <Badge variant={event.isPublic ? "secondary" : "outline"}>
                      {event.isPublic ? "Public" : "Members only"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
