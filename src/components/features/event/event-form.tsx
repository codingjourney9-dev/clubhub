"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { utcToWallClock, zoneAbbreviation } from "@/lib/format/date";
import { createEventSchema } from "@/lib/validation/event";
import { callApi, fieldErrorsOf, notifyFailure } from "@/lib/api/client";

/**
 * Create/edit form for an event.
 *
 * The date fields are plain `<input type="datetime-local">`: they produce a wall
 * clock ("2026-11-01T09:00") with no timezone, which is exactly what a person
 * means by "9 in the morning". The college's timezone is shown beside them and
 * applied by the server, so what reaches the database is an unambiguous UTC
 * instant.
 *
 * Validation runs the **same Zod schema the API uses** — no second, drifting copy
 * of the rules. Client-side checking is only there to answer instantly; the
 * server validates again and is the authority.
 */

export interface EventFormValues {
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  capacity: string;
  isPublic: boolean;
  waitlistEnabled: boolean;
}

export interface EditableEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  /** ISO instants from the database. */
  startTime: string;
  endTime: string;
  capacity: number | null;
  isPublic: boolean;
  waitlistEnabled: boolean;
}

interface EventFormProps {
  clubId: string;
  timeZone: string;
  event?: EditableEvent;
  onDone?: () => void;
}

/** A sensible default: tomorrow, on the hour, for two hours, in the college's zone. */
function defaultWallClocks(timeZone: string): { start: string; end: string } {
  const start = new Date(Date.now() + 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3_600_000);

  return {
    start: utcToWallClock(start, timeZone),
    end: utcToWallClock(end, timeZone),
  };
}

export function EventForm({ clubId, timeZone, event, onDone }: EventFormProps) {
  const router = useRouter();
  const isEdit = Boolean(event);
  const defaults = useMemo(() => defaultWallClocks(timeZone), [timeZone]);
  const schema = useMemo(() => createEventSchema(timeZone), [timeZone]);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    defaultValues: {
      title: event?.title ?? "",
      description: event?.description ?? "",
      location: event?.location ?? "",
      start: event ? utcToWallClock(new Date(event.startTime), timeZone) : defaults.start,
      end: event ? utcToWallClock(new Date(event.endTime), timeZone) : defaults.end,
      capacity: event?.capacity ? String(event.capacity) : "",
      isPublic: event?.isPublic ?? true,
      waitlistEnabled: event?.waitlistEnabled ?? false,
    },
  });

  const isPublic = watch("isPublic");
  const waitlistEnabled = watch("waitlistEnabled");
  const capacityValue = watch("capacity");

  async function onSubmit(values: EventFormValues) {
    setFormError(null);

    // Exactly the payload the API expects: empty text becomes null, empty
    // capacity becomes null (unlimited).
    const payload = {
      title: values.title,
      description: values.description.trim() === "" ? null : values.description,
      location: values.location.trim() === "" ? null : values.location,
      start: values.start,
      end: values.end,
      capacity: values.capacity.trim() === "" ? null : Number(values.capacity),
      isPublic: values.isPublic,
      waitlistEnabled: values.waitlistEnabled,
    };

    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field in values) {
          setError(field as keyof EventFormValues, { message: issue.message });
        } else {
          setFormError(issue.message);
        }
      }
      return;
    }

    const result = await callApi<{ event: { title: string } }>(
      isEdit ? `/api/clubs/${clubId}/events/${event?.id}` : `/api/clubs/${clubId}/events`,
      { method: isEdit ? "PATCH" : "POST", json: parsed.data },
    );

    if (!result.ok) {
      // Field-level messages land on the field; everything else above the form.
      for (const [field, message] of Object.entries(fieldErrorsOf(result))) {
        if (message && field in values) {
          setError(field as keyof EventFormValues, { message });
        }
      }
      setFormError(result.message);
      notifyFailure(result, isEdit ? "Could not save the event" : "Could not create the event");
      return;
    }

    toast.success(isEdit ? "Event saved" : "Draft event created", {
      description: isEdit
        ? result.data.event.title
        : `${result.data.event.title} is a draft — publish it when you are ready to announce it.`,
    });

    if (isEdit) {
      onDone?.();
    } else {
      setValue("title", "");
      setValue("description", "");
      setValue("location", "");
      setValue("capacity", "");
      setValue("waitlistEnabled", false);
      const fresh = defaultWallClocks(timeZone);
      setValue("start", fresh.start);
      setValue("end", fresh.end);
    }

    router.refresh();
  }

  const shownOffset = zoneAbbreviation(new Date(), timeZone);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="event-title">Event name</Label>
        <Input id="event-title" placeholder="RoboWars 2026 — Qualifiers" {...register("title")} />
        {errors.title ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.title.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-description">What is it?</Label>
        <Textarea
          id="event-description"
          rows={3}
          placeholder="Two rounds of bot-vs-bot eliminations. Teams of four."
          {...register("description")}
        />
        {errors.description ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.description.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="event-start">Starts</Label>
          <Input id="event-start" type="datetime-local" {...register("start")} />
          {errors.start ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.start.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="event-end">Ends</Label>
          <Input id="event-end" type="datetime-local" {...register("end")} />
          {errors.end ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.end.message}
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Times are read in the college&apos;s timezone ({timeZone}, currently {shownOffset}) and stored
        in UTC.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="event-location">Venue</Label>
          <Input id="event-location" placeholder="Open Air Theatre" {...register("location")} />
          {errors.location ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.location.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="event-capacity">Capacity</Label>
          <Input
            id="event-capacity"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Leave empty for unlimited"
            {...register("capacity")}
          />
          {errors.capacity ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.capacity.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <label className="flex items-start justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-sm font-medium">Open to everyone</span>
            <span className="text-xs text-muted-foreground">
              Shown on the public board once published — even to people without an account. Off
              means only club members can see it.
            </span>
          </span>
          <Switch
            checked={isPublic}
            onCheckedChange={(checked) => setValue("isPublic", checked)}
            aria-label="Open to everyone"
          />
        </label>

        <label className="flex items-start justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-sm font-medium">Start a waitlist when full</span>
            <span className="text-xs text-muted-foreground">
              {capacityValue
                ? "Once capacity is reached, people join a queue instead of being refused."
                : "Set a capacity above first — a waitlist needs a full room to wait for."}
            </span>
          </span>
          <Switch
            checked={waitlistEnabled}
            disabled={!capacityValue}
            onCheckedChange={(checked) => setValue("waitlistEnabled", checked)}
            aria-label="Start a waitlist when full"
          />
        </label>
        {errors.waitlistEnabled ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.waitlistEnabled.message}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-xs text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create draft"}
        </Button>
        {isEdit && onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
