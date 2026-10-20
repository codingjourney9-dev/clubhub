"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
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
import { callApi, notifyFailure } from "@/lib/api/client";
import { ApplicationStatusBadge } from "@/components/features/recruitment/application-status";

export interface ReviewRow {
  readonly id: string;
  readonly status: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  /** Pre-formatted on the server in the college's timezone. */
  readonly appliedLabel: string;
  readonly decidedLabel: string | null;
  readonly answers: readonly { question: string; answer: string }[];
  readonly applicant: {
    readonly displayName: string;
    readonly email: string;
    readonly colleges: readonly string[];
    readonly currentRoleLabel: string | null;
  };
}

type Pending = { row: ReviewRow; decision: "ACCEPT" | "REJECT" };

/**
 * One opening's applications with Accept / Reject. Both ask first (a controlled
 * dialog — `window.confirm` is blocked in embedded previews). The server
 * re-checks the reviewer's tier and that the application is still pending.
 */
export function ApplicationReview({
  clubId,
  roleLabel,
  applications,
  readOnly = false,
}: {
  clubId: string;
  roleLabel: string;
  applications: readonly ReviewRow[];
  /** The demo view: shown, but no buttons. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide({ row, decision }: Pending) {
    setBusy(true);
    try {
      const result = await callApi(`/api/clubs/${clubId}/applications/${row.id}/decision`, {
        method: "POST",
        json: { decision },
      });
      if (!result.ok) return notifyFailure(result, "Decision not saved");
      toast.success(decision === "ACCEPT" ? `${row.applicant.displayName} is in` : "Application rejected", {
        description:
          decision === "ACCEPT" ? `They're now a ${roleLabel} of the club.` : "They'll see it under My applications.",
      });
      setConfirming(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (applications.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-foreground/25 bg-card/60 p-6 text-sm text-muted-foreground">
        No applications yet. Share the opening&apos;s link — anyone signed in can apply.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-4">
        {applications.map((row) => (
          <li key={row.id} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{row.applicant.displayName}</span>
                <span className="text-sm break-all text-muted-foreground">{row.applicant.email}</span>
                <span className="text-xs text-muted-foreground">
                  {row.applicant.colleges.length ? row.applicant.colleges.join(", ") : "Not in a college yet"}
                  {row.applicant.currentRoleLabel ? ` · already a ${row.applicant.currentRoleLabel} here` : ""}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ApplicationStatusBadge status={row.status} />
                <span className="text-xs text-muted-foreground">Applied {row.appliedLabel}</span>
                {row.decidedLabel ? <span className="text-xs text-muted-foreground">{row.decidedLabel}</span> : null}
              </div>
            </div>

            <dl className="flex flex-col gap-3">
              {row.answers.map((item, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <dt className="text-sm font-medium">{item.question}</dt>
                  <dd className="text-sm whitespace-pre-line text-muted-foreground">{item.answer}</dd>
                </div>
              ))}
            </dl>

            {row.status === "PENDING" && !readOnly ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setConfirming({ row, decision: "ACCEPT" })}>
                  <Check />
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirming({ row, decision: "REJECT" })}>
                  <X />
                  Reject
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && !busy && setConfirming(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.decision === "ACCEPT"
                ? `Accept ${confirming.row.applicant.displayName}?`
                : `Reject ${confirming?.row.applicant.displayName ?? "this application"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.decision === "ACCEPT"
                ? `They become a ${roleLabel} of the club straight away (and join its college if they weren't in it). You can change their role later from Members.`
                : "They'll see “Not this time” under My applications. They can't apply to this opening again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Not yet</AlertDialogCancel>
            <Button
              variant={confirming?.decision === "REJECT" ? "destructive" : "default"}
              disabled={busy || confirming === null}
              onClick={() => confirming && decide(confirming)}
            >
              {busy ? "Saving…" : confirming?.decision === "ACCEPT" ? `Accept as ${roleLabel}` : "Reject"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
