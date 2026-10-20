"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Clock, MapPin, Ticket, Users } from "lucide-react";
import { toast } from "sonner";

import { EventForm, type EditableEvent } from "@/components/features/event/event-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { callApi, notifyFailure } from "@/lib/api/client";
import { formatDateTimeInZone, zoneAbbreviation } from "@/lib/format/date";
import {
  applyPatch,
  projectRows,
  rollbackPatch,
  settlePatches,
  type PatchMap,
} from "@/lib/ui/optimistic";

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  /** ISO strings — Dates do not survive the server/client boundary cleanly. */
  startTime: string;
  endTime: string;
  capacity: number | null;
  waitlistEnabled: boolean;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  isPublic: boolean;
  registeredCount: number;
}

interface EventListProps {
  clubId: string;
  timeZone: string;
  events: EventRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const STATUS_STYLES = {
  DRAFT: "outline",
  PUBLISHED: "default",
  CANCELLED: "destructive",
} as const;

/**
 * The club's events, with the actions this viewer is allowed to take.
 *
 * `canCreate` / `canEdit` / `canDelete` come from the server's RBAC decision — the
 * component only hides buttons. Every action re-checks permission on the API, so
 * hiding is for tidiness, never for safety.
 */
export function EventList({
  clubId,
  timeZone,
  events,
  canCreate,
  canEdit,
  canDelete,
}: EventListProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /**
   * Optimistic patches, applied on top of the server's list.
   *
   * Pressing "Publish" flips the badge *immediately* — a volunteer on a bad
   * connection should not stare at a spinner to learn something we are about to
   * do anyway. If the request fails, the patch is removed and the row snaps back
   * to the truth, which is the "rollback" half of the trick.
   */
  const [patches, setPatches] = useState<PatchMap>({});

  // Once the refreshed server data agrees, the claim has done its job.
  useEffect(() => {
    setPatches((current) => settlePatches(current, events));
  }, [events]);

  const rollback = (eventId: string) => {
    setPatches((current) => rollbackPatch(current, eventId));
  };

  const rows = projectRows(patches, events);

  async function changeStatus(eventId: string, status: "PUBLISHED" | "CANCELLED") {
    setBusyId(eventId);
    setPatches((current) => applyPatch(current, eventId, { status }));

    try {
      const result = await callApi(`/api/clubs/${clubId}/events/${eventId}/status`, {
        method: "POST",
        json: { status },
      });

      if (!result.ok) {
        rollback(eventId);
        notifyFailure(result, status === "PUBLISHED" ? "Could not publish" : "Could not cancel");
        return;
      }

      toast.success(status === "PUBLISHED" ? "Event published" : "Event cancelled", {
        description:
          status === "PUBLISHED"
            ? "Students can see it now."
            : "It stays visible so nobody turns up, and every ticket is kept for reporting.",
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function removeEvent(eventId: string, title: string) {
    setBusyId(eventId);
    setPatches((current) => applyPatch(current, eventId, { removed: true }));

    try {
      const result = await callApi(`/api/clubs/${clubId}/events/${eventId}`, { method: "DELETE" });

      if (!result.ok) {
        rollback(eventId);
        notifyFailure(result, "Could not delete");
        return;
      }

      toast.success("Event deleted", { description: title });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          Events
        </CardTitle>
        <CardDescription>
          A draft is only visible to the people who run this club. Publishing announces it; cancelling
          keeps it visible so nobody turns up by mistake.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canCreate
              ? "No events yet. Create the first one below."
              : "No published events yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((event) => {
              const isEditing = editingId === event.id;
              const start = new Date(event.startTime);
              const end = new Date(event.endTime);

              return (
                <li key={event.id} className="flex flex-col gap-3 rounded-lg border p-4">
                  {isEditing ? (
                    <EventForm
                      clubId={clubId}
                      timeZone={timeZone}
                      event={toEditable(event)}
                      onDone={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/events/${event.id}`}
                              className="text-sm font-medium underline-offset-4 hover:underline"
                            >
                              {event.title}
                            </Link>
                            <Badge variant={STATUS_STYLES[event.status]}>
                              {event.status.charAt(0) + event.status.slice(1).toLowerCase()}
                            </Badge>
                            <Badge variant={event.isPublic ? "secondary" : "outline"}>
                              {event.isPublic ? "Open to everyone" : "Members only"}
                            </Badge>
                          </span>
                          {event.description ? (
                            <span className="text-xs text-muted-foreground">{event.description}</span>
                          ) : null}
                        </div>

                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Ticket className="size-3" />
                          {event.registeredCount}
                          {event.capacity ? ` / ${event.capacity}` : " registered"}
                          {event.waitlistEnabled ? " · waitlist on" : ""}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatDateTimeInZone(start, timeZone)} →{" "}
                          {formatDateTimeInZone(end, timeZone).split(", ").pop()}
                          <span className="text-[10px]">
                            ({zoneAbbreviation(start, timeZone)})
                          </span>
                        </span>
                        {event.location ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            {event.location}
                          </span>
                        ) : null}
                      </div>

                      {canEdit || canDelete ? (
                        <div className="flex flex-wrap gap-2">
                          {event.status === "DRAFT" && canEdit ? (
                            <Button
                              size="sm"
                              disabled={busyId === event.id}
                              onClick={() => changeStatus(event.id, "PUBLISHED")}
                            >
                              Publish
                            </Button>
                          ) : null}

                          {canEdit ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(event.id)}
                            >
                              Edit
                            </Button>
                          ) : null}

                          {event.status !== "CANCELLED" && canEdit ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === event.id}
                              onClick={() => changeStatus(event.id, "CANCELLED")}
                            >
                              Cancel event
                            </Button>
                          ) : null}

                          {event.status !== "PUBLISHED" && canDelete ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === event.id}
                              onClick={() => removeEvent(event.id, event.title)}
                            >
                              Delete
                            </Button>
                          ) : null}

                          {event.status === "PUBLISHED" ? (
                            <span className="self-center text-[11px] text-muted-foreground">
                              Published events are cancelled before they can be deleted.
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canCreate ? (
          <div className="rounded-lg border border-dashed p-4">
            {showCreate ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">New event</span>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                    Close
                  </Button>
                </div>
                <EventForm clubId={clubId} timeZone={timeZone} />
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Users className="size-4 text-muted-foreground" />
                  Create an event
                </span>
                <span className="text-xs text-muted-foreground">
                  It starts as a draft, so nothing is announced until you publish it.
                </span>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  New event
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Converts a list row into the shape the edit form expects. */
function toEditable(event: EventRow): EditableEvent {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startTime: event.startTime,
    endTime: event.endTime,
    capacity: event.capacity,
    isPublic: event.isPublic,
    waitlistEnabled: event.waitlistEnabled,
  };
}
