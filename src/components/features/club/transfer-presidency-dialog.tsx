"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi, fieldErrorsOf, notifyFailure } from "@/lib/api/client";
import { CLUB_ROLE_LABELS } from "@/lib/domain/club-roles";

export interface PresidencyCandidate {
  readonly userId: string;
  readonly displayName: string;
  readonly role: "EVENT_MANAGER" | "MEMBER";
}

/**
 * "Hand over presidency": the only way a club's President changes.
 *
 * Three deliberate choices — who, what the outgoing President becomes, and
 * typing the club's name — because it can't be undone by the person doing it.
 */
export function TransferPresidencyDialog({
  clubId,
  clubName,
  candidates,
  viewerIsPresident,
  currentPresidentName,
}: {
  clubId: string;
  clubName: string;
  candidates: readonly PresidencyCandidate[];
  /** Wording: "you become…" for the President; "{name} becomes…" for a college admin. */
  viewerIsPresident: boolean;
  currentPresidentName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newPresidentUserId, setNewPresidentUserId] = useState("");
  const [formerPresidentBecomes, setFormerPresidentBecomes] = useState<"EVENT_MANAGER" | "MEMBER">(
    "EVENT_MANAGER",
  );
  const [confirmClubName, setConfirmClubName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const chosen = candidates.find((candidate) => candidate.userId === newPresidentUserId);
  const nameMatches =
    confirmClubName.trim().replace(/\s+/g, " ").toLowerCase() === clubName.trim().toLowerCase();

  function reset() {
    setNewPresidentUserId("");
    setFormerPresidentBecomes("EVENT_MANAGER");
    setConfirmClubName("");
    setErrors({});
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const result = await callApi(`/api/clubs/${clubId}/presidency`, {
        method: "POST",
        json: { newPresidentUserId, formerPresidentBecomes, confirmClubName },
      });
      if (!result.ok) {
        setErrors(fieldErrorsOf(result));
        notifyFailure(result, "Could not hand over the presidency");
        return;
      }
      toast.success(`${chosen?.displayName ?? "They"} is now President of ${clubName}`);
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const outgoing = viewerIsPresident ? "you" : (currentPresidentName ?? "the current President");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={candidates.length === 0} />}>
        <Crown />
        Hand over presidency
      </DialogTrigger>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader className="gap-2">
          <DialogTitle className="font-heading text-2xl font-bold">Hand over presidency</DialogTitle>
          <DialogDescription>
            A club has exactly one President. The person you pick takes over straight away
            {viewerIsPresident ? " — and only they could hand it back." : "."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-president">New President</Label>
            <select
              id="new-president"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={newPresidentUserId}
              onChange={(event) => setNewPresidentUserId(event.target.value)}
              required
            >
              <option value="" disabled>
                Choose a member…
              </option>
              {candidates.map((candidate) => (
                <option key={candidate.userId} value={candidate.userId}>
                  {candidate.displayName} ({CLUB_ROLE_LABELS[candidate.role]})
                </option>
              ))}
            </select>
            {errors.newPresidentUserId ? (
              <p className="text-sm text-destructive">{errors.newPresidentUserId}</p>
            ) : null}
          </div>

          {currentPresidentName || viewerIsPresident ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">
                Afterwards, {outgoing} {viewerIsPresident ? "become" : "becomes"}…
              </legend>
              {(["EVENT_MANAGER", "MEMBER"] as const).map((role) => (
                <label
                  key={role}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="former-president-becomes"
                    value={role}
                    checked={formerPresidentBecomes === role}
                    onChange={() => setFormerPresidentBecomes(role)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{CLUB_ROLE_LABELS[role]}</span>
                    <span className="block text-muted-foreground">
                      {role === "EVENT_MANAGER"
                        ? "Keep creating events, working the door and posting announcements."
                        : "Step back to an ordinary member."}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-club-name">
              Type <span className="font-mono">{clubName}</span> to confirm
            </Label>
            <Input
              id="confirm-club-name"
              value={confirmClubName}
              onChange={(event) => setConfirmClubName(event.target.value)}
              autoComplete="off"
              aria-invalid={errors.confirmClubName ? true : undefined}
            />
            {errors.confirmClubName ? (
              <p className="text-sm text-destructive">{errors.confirmClubName}</p>
            ) : null}
          </div>

          <DialogFooter className="-mx-6 -mb-6 p-4">
            <Button type="submit" disabled={busy || !chosen || !nameMatches}>
              {busy
                ? "Handing over…"
                : chosen
                  ? `Make ${chosen.displayName} President`
                  : "Make President"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
