"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, RotateCw, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi, notifyFailure } from "@/lib/api/client";
import { verifyClubCodeSchema } from "@/lib/validation/club-request";

/**
 * The requesting student's controls on a pending club: type the code, ask for a
 * new one, or give up. Every rule (expiry, five tries, 30-second resend gap)
 * lives on the server; this only shows what it says.
 */
export function VerifyCodeForm({ clubId, clubName, canVerify }: { clubId: string; clubName: string; canVerify: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    const parsed = verifyClubCodeSchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter the 6-digit code.");
      return;
    }

    setBusy("verify");
    const result = await callApi(`/api/club-requests/${clubId}/verify`, { method: "POST", json: parsed.data });
    setBusy(null);
    if (!result.ok) {
      // A wrong code is an expected outcome, so it's shown under the box rather
      // than as a scary toast.
      if (result.status === 422) setError(result.message);
      else notifyFailure(result, "Code not checked");
      router.refresh();
      return;
    }

    toast.success(`${clubName} is live`, { description: "Your professor confirmed it. Welcome, President." });
    router.refresh();
  }

  async function resend() {
    setBusy("resend");
    const result = await callApi(`/api/club-requests/${clubId}/resend`, { method: "POST" });
    setBusy(null);
    if (!result.ok) return notifyFailure(result, "No new code yet");
    setError(null);
    setCode("");
    toast.success("New code sent", { description: "The old code no longer works." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={verify} noValidate className="flex flex-col gap-2">
        <Label htmlFor="professor-code">Professor&apos;s code</Label>
        <div className="flex flex-wrap items-start gap-2">
          <Input
            id="professor-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              setError(null);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "professor-code-error" : undefined}
            className="h-11 w-40 text-center font-mono text-xl tracking-[0.3em]"
            disabled={!canVerify}
          />
          <Button type="submit" size="lg" disabled={!canVerify || busy !== null}>
            <BadgeCheck data-icon="inline-start" />
            {busy === "verify" ? "Checking…" : "Confirm club"}
          </Button>
        </div>
        {error ? (
          <p id="professor-code-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>

      <div>
        <Button type="button" variant="outline" size="sm" onClick={resend} disabled={busy !== null}>
          <RotateCw data-icon="inline-start" />
          {busy === "resend" ? "Sending…" : "Send a new code"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Cancel (the student) or Remove (a college admin). Asks first, with a controlled
 * dialog — `window.confirm` is blocked inside embedded previews.
 */
export function CancelRequestButton({
  clubId,
  clubName,
  viewer,
}: {
  clubId: string;
  clubName: string;
  viewer: "requester" | "admin";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const verb = viewer === "requester" ? "Cancel" : "Remove";

  async function cancel() {
    setBusy(true);
    const result = await callApi(`/api/club-requests/${clubId}`, { method: "DELETE" });
    setBusy(false);
    if (!result.ok) return notifyFailure(result, `Could not ${verb.toLowerCase()} the request`);
    setOpen(false);
    toast.success(viewer === "requester" ? "Request cancelled" : "Request removed", { description: clubName });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <div>
        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
          <Trash2 data-icon="inline-start" />
          {`${verb} this request`}
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {verb} “{clubName}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {viewer === "requester"
                ? "The club disappears and its code stops working. You can start it again later."
                : "The student's club request disappears and its code stops working. They can ask again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={cancel}>
              {busy ? "Working…" : `${verb} request`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
