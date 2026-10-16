"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ApiFailure, ApiSuccess } from "@/types/api";

/**
 * Redeems an invite token.
 *
 * The granted role is whatever the invite records — the client sends nothing but
 * the token, so a tampered request cannot ask for a bigger role.
 */
export function AcceptInviteButton({
  token,
  targetName,
  alreadyMember,
}: {
  token: string;
  targetName: string;
  alreadyMember: boolean;
}) {
  const router = useRouter();
  const [isAccepting, setIsAccepting] = useState(false);

  async function accept() {
    setIsAccepting(true);
    try {
      const response = await fetch(`/api/invites/${token}`, { method: "POST" });
      const payload = (await response.json()) as
        | ApiSuccess<{ membership: { targetName: string; alreadyMember: boolean } }>
        | ApiFailure;

      if (!payload.ok) {
        toast.error("Could not join", { description: payload.error.message });
        return;
      }

      if (payload.data.membership.alreadyMember) {
        toast.info(`You are already a member of ${targetName}`);
      } else {
        toast.success(`Joined ${targetName}`);
      }
      router.push("/onboarding");
      router.refresh();
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <Button onClick={accept} disabled={isAccepting} size="lg">
      {isAccepting ? "Joining…" : alreadyMember ? "Open my clubs" : `Join ${targetName}`}
    </Button>
  );
}
