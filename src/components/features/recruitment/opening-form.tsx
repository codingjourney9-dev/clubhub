"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callApi, fieldErrorsOf, notifyFailure } from "@/lib/api/client";
import { CLUB_ROLE_LABELS } from "@/lib/domain/club-roles";
import {
  DEFAULT_OPENING_QUESTION,
  OPENING_DESCRIPTION_MAX,
  OPENING_MAX_QUESTIONS,
  OPENING_QUESTION_MAX,
  OPENING_REQUIREMENTS_MAX,
  OPENING_TITLE_MAX,
} from "@/lib/domain/openings";
import { zoneAbbreviation } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { createOpeningSchema, updateOpeningSchema } from "@/lib/validation/opening";

type OfferableRole = "MEMBER" | "EVENT_MANAGER";

export interface EditableOpening {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requirements: string | null;
  readonly role: OfferableRole;
  readonly questions: readonly string[];
  /** Wall clock in the college's zone ("2026-10-30T18:00"), or "" for none. */
  readonly closesAt: string;
}

const ROLE_HINTS: Record<OfferableRole, string> = {
  MEMBER: "Joins the club as a Member.",
  EVENT_MANAGER: "Becomes a Lead: runs events, posts announcements, reviews Member applicants.",
};

/**
 * Post a new opening or edit one. The server re-validates everything with the
 * same Zod schema used here — this pass only saves a round-trip.
 */
export function OpeningForm({
  clubId,
  timeZone,
  offerableRoles,
  opening,
  onDone,
}: {
  clubId: string;
  timeZone: string;
  /** Computed on the server from the viewer's role. Ignored when editing. */
  offerableRoles: readonly OfferableRole[];
  opening?: EditableOpening;
  onDone?: () => void;
}) {
  const router = useRouter();
  const editing = opening !== undefined;
  const [title, setTitle] = useState(opening?.title ?? "");
  const [description, setDescription] = useState(opening?.description ?? "");
  const [requirements, setRequirements] = useState(opening?.requirements ?? "");
  const [role, setRole] = useState<OfferableRole>(opening?.role ?? offerableRoles[0] ?? "MEMBER");
  const [questions, setQuestions] = useState<string[]>(() =>
    opening ? [...opening.questions] : [DEFAULT_OPENING_QUESTION],
  );
  const [closesAt, setClosesAt] = useState(opening?.closesAt ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // A closing date is only sent when it changed: re-sending a date that has
    // since passed would be refused as "not in the future".
    const closesAtChanged = !editing || closesAt !== opening.closesAt;
    const body = editing
      ? { title, description, requirements, questions, ...(closesAtChanged ? { closesAt } : {}) }
      : { title, description, requirements, role, questions, closesAt };

    const local = editing ? updateOpeningSchema.safeParse(body) : createOpeningSchema.safeParse(body);
    if (!local.success) {
      const next: Record<string, string> = {};
      for (const issue of local.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const result = await callApi(
        editing ? `/api/clubs/${clubId}/openings/${opening.id}` : `/api/clubs/${clubId}/openings`,
        { method: editing ? "PATCH" : "POST", json: body },
      );
      if (!result.ok) {
        setErrors(fieldErrorsOf(result));
        return notifyFailure(result, editing ? "Changes not saved" : "Opening not posted");
      }
      toast.success(editing ? "Opening updated" : "Opening posted", {
        description: editing ? undefined : "It's on the public recruitment board now.",
      });
      if (!editing) {
        setTitle("");
        setDescription("");
        setRequirements("");
        setQuestions([DEFAULT_OPENING_QUESTION]);
        setClosesAt("");
      }
      onDone?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) =>
    errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="opening-title">Title</Label>
        <Input
          id="opening-title"
          value={title}
          maxLength={OPENING_TITLE_MAX}
          placeholder="e.g. Electronics team member"
          onChange={(event) => setTitle(event.target.value)}
        />
        {fieldError("title")}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Role it offers</legend>
        {editing ? (
          <p className="text-sm text-muted-foreground">
            {CLUB_ROLE_LABELS[role]} — fixed once posted. To offer a different role, post a new opening.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {offerableRoles.map((option) => (
              <label
                key={option}
                className={cn(
                  "flex max-w-xs cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-sm transition-colors",
                  role === option ? "border-foreground bg-muted" : "border-border hover:border-foreground/50",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="opening-role"
                    value={option}
                    checked={role === option}
                    onChange={() => setRole(option)}
                    className="accent-primary"
                  />
                  {CLUB_ROLE_LABELS[option]}
                </span>
                <span className="text-xs text-muted-foreground">{ROLE_HINTS[option]}</span>
              </label>
            ))}
          </div>
        )}
        {!editing && offerableRoles.length === 1 && offerableRoles[0] === "MEMBER" ? (
          <p className="text-xs text-muted-foreground">Only the President can post a Lead opening.</p>
        ) : null}
        {fieldError("role")}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="opening-description">What the role involves</Label>
        <Textarea
          id="opening-description"
          rows={4}
          value={description}
          maxLength={OPENING_DESCRIPTION_MAX}
          onChange={(event) => setDescription(event.target.value)}
        />
        {fieldError("description")}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="opening-requirements">
          Requirements <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="opening-requirements"
          rows={3}
          value={requirements}
          maxLength={OPENING_REQUIREMENTS_MAX}
          placeholder="e.g. Basic soldering. Free on Saturday afternoons."
          onChange={(event) => setRequirements(event.target.value)}
        />
        {fieldError("requirements")}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          Questions for applicants{" "}
          <span className="font-normal text-muted-foreground">
            (1–{OPENING_MAX_QUESTIONS}; every one must be answered)
          </span>
        </legend>
        {questions.map((question, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`Question ${index + 1}`}
              value={question}
              maxLength={OPENING_QUESTION_MAX}
              onChange={(event) =>
                setQuestions((current) => current.map((value, i) => (i === index ? event.target.value : value)))
              }
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={questions.length === 1}
              title="Remove this question"
              onClick={() => setQuestions((current) => current.filter((_, i) => i !== index))}
            >
              <X />
              <span className="sr-only">Remove question {index + 1}</span>
            </Button>
          </div>
        ))}
        {questions.length < OPENING_MAX_QUESTIONS ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => setQuestions((current) => [...current, ""])}
          >
            <Plus />
            Add a question
          </Button>
        ) : null}
        {fieldError("questions")}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="opening-closes">
          Closing date <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="opening-closes"
            type="datetime-local"
            className="w-auto"
            value={closesAt}
            onChange={(event) => setClosesAt(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">{zoneAbbreviation(new Date(), timeZone)} (college time)</span>
          {closesAt ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setClosesAt("")}>
              Clear
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          It stops taking applications at this time by itself. Leave empty to close it by hand.
        </p>
        {fieldError("closesAt")}
      </div>

      {fieldError("form")}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Post opening"}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
