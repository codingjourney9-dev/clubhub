"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callApi, fieldErrorsOf, notifyFailure } from "@/lib/api/client";
import { ANSWER_MAX } from "@/lib/domain/openings";

/** The application form: one box per question the club asked. */
export function ApplyForm({ openingId, questions }: { openingId: string; questions: readonly string[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await callApi(`/api/openings/${openingId}/apply`, {
        method: "POST",
        json: { answers },
      });
      if (!result.ok) {
        setError(Object.values(fieldErrorsOf(result))[0] ?? null);
        return notifyFailure(result, "Your application wasn't sent");
      }
      toast.success("Application sent", { description: "You'll see the club's decision under My applications." });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {questions.map((question, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Label htmlFor={`answer-${index}`} className="leading-snug">
            {index + 1}. {question}
          </Label>
          <Textarea
            id={`answer-${index}`}
            rows={4}
            maxLength={ANSWER_MAX}
            value={answers[index] ?? ""}
            onChange={(event) =>
              setAnswers((current) => current.map((value, i) => (i === index ? event.target.value : value)))
            }
          />
          <span className="self-end text-xs text-muted-foreground tabular-nums">
            {(answers[index] ?? "").length} / {ANSWER_MAX}
          </span>
        </div>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={busy || answers.some((answer) => !answer.trim())} className="self-start">
        <Send />
        {busy ? "Sending…" : "Send application"}
      </Button>
    </form>
  );
}

export function WithdrawButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function withdraw() {
    setBusy(true);
    try {
      const result = await callApi(`/api/applications/${applicationId}/withdraw`, { method: "POST", json: {} });
      if (!result.ok) return notifyFailure(result, "Could not withdraw it");
      toast.success("Application withdrawn", { description: "You can apply again while the opening is open." });
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  // Two clicks instead of a dialog: small, inline, and it works in embedded previews.
  return confirming ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm">Withdraw it?</span>
      <Button size="sm" variant="destructive" disabled={busy} onClick={withdraw}>
        {busy ? "Withdrawing…" : "Yes, withdraw"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Keep it
      </Button>
    </span>
  ) : (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
      Withdraw application
    </Button>
  );
}
