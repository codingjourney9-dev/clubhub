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
import { EventPoster } from "@/components/features/event/event-extras";
import type { EventTag } from "@/generated/prisma/enums";
import {
  EVENT_TAG_LABELS,
  EVENT_TAGS,
  MAX_EVENT_TAGS,
  normalizePosterUrl,
} from "@/lib/domain/event-details";
import { utcToWallClock, zoneAbbreviation } from "@/lib/format/date";
import { cn } from "@/lib/utils";
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
  posterUrl: string;
  tags: EventTag[];
  instagramUrl: string;
  whatsappUrl: string;
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
  posterUrl: string | null;
  tags: readonly EventTag[];
  instagramUrl: string | null;
  /** Only ever filled in for organisers — the people allowed to edit it. */
  whatsappUrl: string | null;
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
      posterUrl: event?.posterUrl ?? "",
      tags: event ? [...event.tags] : [],
      instagramUrl: event?.instagramUrl ?? "",
      whatsappUrl: event?.whatsappUrl ?? "",
    },
  });

  const isPublic = watch("isPublic");
  const waitlistEnabled = watch("waitlistEnabled");
  const capacityValue = watch("capacity");
  const tags = watch("tags");
  const posterInput = watch("posterUrl");

  // Live preview of what the poster link will look like — using the same
  // tidy-up the server applies (a Drive "share" link becomes an image link).
  const posterPreview = useMemo(() => {
    const raw = posterInput.trim();
    if (raw === "") return null;
    return normalizePosterUrl(raw);
  }, [posterInput]);

  function toggleTag(tag: EventTag) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    if (next.length > MAX_EVENT_TAGS) return;
    setValue("tags", next, { shouldDirty: true });
  }

  const blank = (value: string) => (value.trim() === "" ? null : value.trim());

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
      posterUrl: blank(values.posterUrl),
      tags: values.tags,
      instagramUrl: blank(values.instagramUrl),
      whatsappUrl: blank(values.whatsappUrl),
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
      setValue("posterUrl", "");
      setValue("tags", []);
      setValue("instagramUrl", "");
      setValue("whatsappUrl", "");
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

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          Tags <span className="font-normal text-muted-foreground">— up to {MAX_EVENT_TAGS}, helps people find it</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {EVENT_TAGS.map((tag) => {
            const on = tags.includes(tag);
            const full = !on && tags.length >= MAX_EVENT_TAGS;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                disabled={full}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors",
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 bg-card text-foreground/80 hover:border-foreground/50",
                  full && "cursor-not-allowed opacity-40 hover:border-foreground/20",
                )}
              >
                {EVENT_TAG_LABELS[tag]}
              </button>
            );
          })}
        </div>
        {errors.tags ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.tags.message}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-poster">Poster link</Label>
        <Input
          id="event-poster"
          inputMode="url"
          autoComplete="off"
          placeholder="https://drive.google.com/file/d/…/view"
          {...register("posterUrl")}
        />
        <p className="text-xs text-muted-foreground">
          Paste a link to an image. From Google Drive: right-click the file → <b>Share</b> → General
          access → <b>Anyone with the link</b> → <b>Copy link</b>. Optional.
        </p>
        {errors.posterUrl ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.posterUrl.message}
          </p>
        ) : posterPreview && !posterPreview.ok ? (
          <p className="text-xs text-destructive">{posterPreview.message}</p>
        ) : null}
        {posterPreview?.ok ? (
          <div className="flex items-start gap-3">
            <EventPoster
              key={posterPreview.url}
              src={posterPreview.url}
              title={watch("title") || "this event"}
              variant="thumb"
              className="size-20"
            />
            <p className="text-xs text-muted-foreground">
              Preview. If it stays blank, the file probably isn&apos;t shared with &ldquo;Anyone with the
              link&rdquo; yet.
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="event-instagram">Instagram</Label>
          <Input
            id="event-instagram"
            inputMode="url"
            autoComplete="off"
            placeholder="@roboticsclub or a post link"
            {...register("instagramUrl")}
          />
          <p className="text-xs text-muted-foreground">Everyone can see this. Optional.</p>
          {errors.instagramUrl ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.instagramUrl.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="event-whatsapp">WhatsApp group</Label>
          <Input
            id="event-whatsapp"
            inputMode="url"
            autoComplete="off"
            placeholder="https://chat.whatsapp.com/…"
            {...register("whatsappUrl")}
          />
          <p className="text-xs text-muted-foreground">
            Only people with a ticket will see this. Optional.
          </p>
          {errors.whatsappUrl ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.whatsappUrl.message}
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
