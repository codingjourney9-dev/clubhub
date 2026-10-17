"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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

/**
 * Members table with role controls.
 *
 * `canManage` is computed on the SERVER from the RBAC matrix and passed in — the
 * client never decides what it is allowed to do. The API re-checks regardless, so
 * hiding a button is convenience, not security.
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
}

const ROLE_LABELS = {
  PRESIDENT: "President",
  EVENT_MANAGER: "Event Manager",
  MEMBER: "Member",
} as const;

export function ClubMembersManager({
  clubId,
  members,
  canManage,
  assignableRoles,
}: {
  clubId: string;
  members: readonly ClubMemberRow[];
  canManage: boolean;
  assignableRoles: readonly string[];
}) {
  const router = useRouter();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function changeRole(userId: string, role: string) {
    setBusyUserId(userId);
    try {
      const result = await callApi(`/api/clubs/${clubId}/members/${userId}`, {
        method: "PATCH",
        json: { role },
      });

      if (!result.ok) {
        notifyFailure(result, "Could not change the role");
        return;
      }
      toast.success("Role updated");
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeMember(userId: string, displayName: string) {
    setBusyUserId(userId);
    try {
      const result = await callApi(`/api/clubs/${clubId}/members/${userId}`, { method: "DELETE" });

      if (!result.ok) {
        notifyFailure(result, "Could not remove that member");
        return;
      }
      toast.success(`${displayName} removed from the club`);
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Joined</TableHead>
          {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.membershipId}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{member.user.displayName}</span>
                <span className="text-xs text-muted-foreground">{member.user.email}</span>
              </div>
            </TableCell>
            <TableCell>
              {canManage ? (
                <select
                  aria-label={`Role for ${member.user.displayName}`}
                  className="h-8 rounded-md border bg-transparent px-2 text-sm"
                  value={member.role}
                  disabled={busyUserId === member.user.id}
                  onChange={(event) => changeRole(member.user.id, event.target.value)}
                >
                  {/* The member's current role is always listed so the select shows
                      the truth even when the viewer cannot grant that role. */}
                  {[member.role, ...assignableRoles.filter((role) => role !== member.role)]
                    .filter((role, index, all) => all.indexOf(role) === index)
                    .map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
                      </option>
                    ))}
                </select>
              ) : (
                <Badge variant={member.role === "MEMBER" ? "outline" : "default"}>
                  {ROLE_LABELS[member.role]}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(member.joinedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
            </TableCell>
            {canManage ? (
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyUserId === member.user.id}
                  onClick={() => removeMember(member.user.id, member.user.displayName)}
                >
                  Remove
                </Button>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
