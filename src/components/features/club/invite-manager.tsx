"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Link2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi, notifyFailure } from "@/lib/api/client";
import { CLUB_ROLE_LABELS, clubRoleLabel } from "@/lib/domain/club-roles";

/**
 * Invite-link creation and management.
 *
 * Links are the invitation mechanism on purpose: students often have no account
 * yet, and there is no email provider wired up. A President pastes the link into
 * a class group chat.
 *
 * Roles offered here are limited to what the VIEWER may hand out (computed on the
 * server): Member or Lead only — presidency is handed over, never invited — and the API
 * rejects it anyway if someone tries to forge the request.
 */

export interface ClubInviteRow {
  readonly id: string;
  readonly url: string;
  readonly role: string;
  readonly email: string | null;
  readonly expiresAt: string;
  readonly maxUses: number;
  readonly uses: number;
  readonly status: "active" | "expired" | "used_up" | "revoked";
}

const STATUS_STYLES: Record<ClubInviteRow["status"], string> = {
  active: "border-success/40 bg-success/10 text-success",
  expired: "border-border bg-muted text-muted-foreground",
  used_up: "border-border bg-muted text-muted-foreground",
  revoked: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<ClubInviteRow["status"], string> = {
  active: "Active",
  expired: "Expired",
  used_up: "Used up",
  revoked: "Revoked",
};

export function InviteManager({
  clubId,
  invites,
  assignableRoles,
}: {
  clubId: string;
  invites: readonly ClubInviteRow[];
  assignableRoles: readonly string[];
}) {
  const router = useRouter();
  const [role, setRole] = useState(assignableRoles[0] ?? "MEMBER");
  const [expiresInHours, setExpiresInHours] = useState("168");
  const [maxUses, setMaxUses] = useState("1");
  const [email, setEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyLink(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success("Link copied", { description: "Paste it into your class group." });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Could not copy automatically", { description: "Select the text and copy manually." });
    }
  }

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    try {
      const result = await callApi<{ invite: { url: string } }>(`/api/clubs/${clubId}/invites`, {
        method: "POST",
        json: {
          role,
          expiresInHours: Number(expiresInHours),
          maxUses: Number(maxUses),
          ...(email.trim() ? { email: email.trim() } : {}),
        },
      });

      if (!result.ok) {
        notifyFailure(result, "Could not create the invite link");
        return;
      }

      toast.success("Invite link created", { description: "Copy it from the list below." });
      setEmail("");
      router.refresh();
    } finally {
      setIsCreating(false);
    }
  }

  async function revoke(inviteId: string) {
    const result = await callApi(`/api/clubs/${clubId}/invites/${inviteId}/revoke`, {
      method: "POST",
    });

    if (!result.ok) {
      notifyFailure(result, "Could not revoke the link");
      return;
    }
    toast.success("Invite link revoked");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={createInvite} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role">Role granted</Label>
            <select
              id="invite-role"
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {assignableRoles.map((option) => (
                <option key={option} value={option}>
                  {clubRoleLabel(option as keyof typeof CLUB_ROLE_LABELS)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-expiry">Expires in (hours)</Label>
            <Input
              id="invite-expiry"
              type="number"
              min={1}
              max={720}
              value={expiresInHours}
              onChange={(event) => setExpiresInHours(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-uses">How many people may use it</Label>
            <Input
              id="invite-uses"
              type="number"
              min={1}
              max={500}
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-email">Restrict to one email (optional)</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="Leave empty to let anyone with the link join"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={isCreating} className="self-start">
          <Link2 data-icon="inline-start" />
          {isCreating ? "Creating…" : "Create invite link"}
        </Button>
      </form>

      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No invite links yet. Create one above and share it in your club&apos;s group.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={STATUS_STYLES[invite.status]}>{STATUS_LABELS[invite.status]}</Badge>
                <Badge variant="outline">{invite.role}</Badge>
                <span className="text-xs text-muted-foreground">
                  {invite.uses} of {invite.maxUses} used · expires{" "}
                  {new Date(invite.expiresAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  {invite.email ? ` · only ${invite.email}` : ""}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                  {invite.url}
                </code>
                <Button size="sm" variant="outline" onClick={() => copyLink(invite.id, invite.url)}>
                  {copiedId === invite.id ? (
                    <Check data-icon="inline-start" />
                  ) : (
                    <Copy data-icon="inline-start" />
                  )}
                  {copiedId === invite.id ? "Copied" : "Copy"}
                </Button>
                {invite.status === "active" ? (
                  <Button size="sm" variant="ghost" onClick={() => revoke(invite.id)}>
                    <Trash2 data-icon="inline-start" />
                    Revoke
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
