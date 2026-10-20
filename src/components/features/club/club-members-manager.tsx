"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { callApi, notifyFailure } from "@/lib/api/client";
import { CLUB_ROLE_LABELS, PROMOTABLE_CLUB_ROLES } from "@/lib/domain/club-roles";

/**
 * Members table with tiered controls (Phase 10).
 *
 * What each row allows — `canRemove`, `canChangeRole` — is worked out on the
 * SERVER from the RBAC rules and the target's role, then passed in. The client
 * never decides; the API re-checks every write regardless.
 */

export interface ClubMemberRow {
  readonly membershipId: string;
  readonly role: "PRESIDENT" | "EVENT_MANAGER" | "MEMBER";
  readonly joinedAt: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
  };
  /** Viewer may remove this person (Leads: Members only; President: Leads too). */
  readonly canRemove: boolean;
  /** Viewer may move this person between Member and Lead (President only). */
  readonly canChangeRole: boolean;
  readonly isViewer: boolean;
}

interface RemoveResult {
  readonly cancelledTickets: number;
  readonly promotedFromWaitlist: number;
}

export function ClubMembersManager({
  clubId,
  members,
}: {
  clubId: string;
  members: readonly ClubMemberRow[];
}) {
  const router = useRouter();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ClubMemberRow | null>(null);

  const showActions = members.some((member) => member.canRemove);

  async function changeRole(member: ClubMemberRow, role: string) {
    setBusyUserId(member.user.id);
    try {
      const result = await callApi(`/api/clubs/${clubId}/members/${member.user.id}`, {
        method: "PATCH",
        json: { role },
      });
      if (!result.ok) {
        notifyFailure(result, "Could not change the role");
        return;
      }
      toast.success(
        `${member.user.displayName} is now a ${CLUB_ROLE_LABELS[role as keyof typeof CLUB_ROLE_LABELS]}`,
      );
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeMember(member: ClubMemberRow) {
    setBusyUserId(member.user.id);
    try {
      const result = await callApi<RemoveResult>(
        `/api/clubs/${clubId}/members/${member.user.id}`,
        { method: "DELETE" },
      );
      if (!result.ok) {
        notifyFailure(result, "Could not remove them");
        return;
      }
      const { cancelledTickets, promotedFromWaitlist } = result.data;
      toast.success(`${member.user.displayName} removed from the club`, {
        description:
          cancelledTickets > 0
            ? `${cancelledTickets} members-only seat${cancelledTickets === 1 ? "" : "s"} given back` +
              (promotedFromWaitlist > 0
                ? `; ${promotedFromWaitlist} ${promotedFromWaitlist === 1 ? "person" : "people"} moved off the waitlist.`
                : ".")
            : undefined,
      });
      setConfirming(null);
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="hidden sm:table-cell">Joined</TableHead>
            {showActions ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.membershipId}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {member.user.displayName}
                    {member.isViewer ? <span className="text-muted-foreground"> (you)</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{member.user.email}</span>
                </div>
              </TableCell>
              <TableCell>
                {member.canChangeRole ? (
                  <select
                    aria-label={`Role for ${member.user.displayName}`}
                    className="h-8 rounded-md border bg-transparent px-2 text-sm"
                    value={member.role}
                    disabled={busyUserId === member.user.id}
                    onChange={(event) => changeRole(member, event.target.value)}
                  >
                    {PROMOTABLE_CLUB_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {CLUB_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge variant={member.role === "MEMBER" ? "outline" : "default"}>
                    {CLUB_ROLE_LABELS[member.role]}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {new Date(member.joinedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
              </TableCell>
              {showActions ? (
                <TableCell className="text-right">
                  {member.canRemove ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyUserId === member.user.id}
                      onClick={() => setConfirming(member)}
                      aria-label={`Remove ${member.user.displayName}`}
                    >
                      Remove
                    </Button>
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* A real dialog, not window.confirm(): browsers silently skip confirm()
          inside embedded previews, which would make Remove do nothing. */}
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirming?.user.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this club&apos;s members-only events and announcements. Any seats they
              hold at upcoming <strong>members-only</strong> events are given back, and the next person
              waiting gets in. Seats at public events are kept. They can rejoin later with an invite link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirming === null || busyUserId === confirming.user.id}
              onClick={() => confirming && removeMember(confirming)}
            >
              {confirming && busyUserId === confirming.user.id ? "Removing…" : "Remove from club"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
