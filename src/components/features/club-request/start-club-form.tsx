"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callApi, fieldErrorsOf, notifyFailure } from "@/lib/api/client";
import { requestClubSchema } from "@/lib/validation/club-request";

export interface CollegeOption {
  readonly id: string;
  readonly name: string;
}

type Field = "name" | "category" | "description" | "tenantId" | "facultyName" | "facultyEmail";

type CreatedClub = { status: "ACTIVE" | "PENDING"; clubId: string; name: string };

/**
 * "Start a new club" (Phase 12).
 *
 * The form checks itself with the SAME Zod schema the API uses, so a student
 * sees mistakes instantly — but the server checks everything again, including
 * the rules a form can't know (is this person really an admin of that college,
 * how many clubs are already waiting for them).
 */
export function StartClubForm({
  colleges,
  matchedCollegeId,
  adminCollegeIds,
  pendingCount,
  maxPending,
}: {
  colleges: readonly CollegeOption[];
  matchedCollegeId: string | null;
  adminCollegeIds: readonly string[];
  pendingCount: number;
  maxPending: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<Field, string>>({
    name: "",
    category: "",
    description: "",
    tenantId: matchedCollegeId ?? (colleges.length === 1 ? colleges[0]!.id : ""),
    facultyName: "",
    facultyEmail: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const isAdminHere = values.tenantId !== "" && adminCollegeIds.includes(values.tenantId);
  const atLimit = !isAdminHere && pendingCount >= maxPending;
  const showCollegePicker = matchedCollegeId === null || colleges.length > 1;

  const set = (field: Field) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    // Empty optional boxes are left out rather than sent as "".
    const payload = Object.fromEntries(
      Object.entries({
        ...values,
        facultyName: isAdminHere ? "" : values.facultyName,
        facultyEmail: isAdminHere ? "" : values.facultyEmail,
      }).filter(([, value]) => value.trim() !== ""),
    );

    const nextErrors: Partial<Record<Field, string>> = {};
    if (!payload.tenantId) nextErrors.tenantId = "Choose your college.";
    if (!isAdminHere && !payload.facultyEmail) nextErrors.facultyEmail = "Enter your professor's email address.";
    const parsed = requestClubSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field | undefined;
        if (field && !nextErrors[field]) nextErrors[field] = issue.message;
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const result = await callApi<{ club: CreatedClub }>("/api/club-requests", { method: "POST", json: payload });
    if (!result.ok) {
      setSubmitting(false);
      const fieldErrors = fieldErrorsOf(result);
      setErrors(
        Object.fromEntries(Object.entries(fieldErrors).filter(([field]) => field in values)) as Partial<
          Record<Field, string>
        >,
      );
      notifyFailure(result, "Could not start the club");
      return;
    }

    const club = result.data.club;
    if (club.status === "ACTIVE") {
      toast.success("Club created", { description: `${club.name} is live — you are its President.` });
    } else {
      toast.success("Code sent to your professor", {
        description: `${club.name} is waiting for the 6-digit code.`,
      });
    }
    router.push(`/clubs/${club.clubId}`);
    router.refresh();
  }

  const fieldError = (field: Field) =>
    errors[field] ? (
      <p role="alert" className="text-xs text-destructive">
        {errors[field]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 font-heading text-lg font-bold">1 · The club</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="club-name">Club name</Label>
            <Input id="club-name" placeholder="Astronomy Club" value={values.name} onChange={set("name")} />
            {fieldError("name")}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="club-category">Category (optional)</Label>
            <Input id="club-category" placeholder="Science" value={values.category} onChange={set("category")} />
            {fieldError("category")}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="club-description">What will the club do? (optional)</Label>
          <Textarea
            id="club-description"
            rows={3}
            placeholder="Night-sky watches, a telescope workshop and a trip to an observatory."
            value={values.description}
            onChange={set("description")}
          />
          {fieldError("description")}
        </div>

        {showCollegePicker ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="club-college">College</Label>
            <select
              id="club-college"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={values.tenantId}
              onChange={set("tenantId")}
            >
              <option value="" disabled>
                Choose your college…
              </option>
              {colleges.map((college) => (
                <option key={college.id} value={college.id}>
                  {college.name}
                </option>
              ))}
            </select>
            {fieldError("tenantId")}
          </div>
        ) : null}
      </fieldset>

      {isAdminHere ? (
        <Alert>
          <AlertTitle>No professor needed</AlertTitle>
          <AlertDescription>
            You are an Owner or Admin of this college, so the club goes live as soon as you create it.
          </AlertDescription>
        </Alert>
      ) : (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 font-heading text-lg font-bold">2 · Your professor</legend>
          <p className="text-sm text-muted-foreground">
            A professor confirms every new club. We send them a 6-digit code; you type it in on the next page
            and the club goes live. Until then, only you can see it.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="faculty-name">Professor&apos;s name (optional)</Label>
              <Input
                id="faculty-name"
                placeholder="Dr. Priya Sharma"
                value={values.facultyName}
                onChange={set("facultyName")}
              />
              {fieldError("facultyName")}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="faculty-email">Professor&apos;s email</Label>
              <Input
                id="faculty-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="priya.sharma@college.edu"
                value={values.facultyEmail}
                onChange={set("facultyEmail")}
              />
              {fieldError("facultyEmail")}
            </div>
          </div>
        </fieldset>
      )}

      {atLimit ? (
        <Alert variant="destructive">
          <AlertTitle>Two clubs are already waiting</AlertTitle>
          <AlertDescription>
            You can have {maxPending} clubs waiting for a professor at once. Finish or cancel one from your
            dashboard first.
          </AlertDescription>
        </Alert>
      ) : null}

      <div>
        <Button type="submit" size="lg" disabled={submitting || atLimit}>
          {submitting ? "Starting…" : isAdminHere ? "Create club" : "Send code to professor"}
        </Button>
      </div>
    </form>
  );
}
