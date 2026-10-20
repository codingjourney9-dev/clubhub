"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { AnnouncementBody } from "@/components/features/announcement/announcement-body";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callApi, fieldErrorsOf, notifyFailure } from "@/lib/api/client";
import type { AnnouncementView } from "@/lib/services/announcement-service";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
} from "@/lib/validation/announcement";

/**
 * The club page's Announcements card (Phase 10).
 *
 * Who-can-do-what arrives from the server (`canPost`, `canModerate`); each
 * button is a convenience and every endpoint re-checks.
 */
export function ClubAnnouncements({
  clubId,
  timeZone,
  announcements,
  viewerId,
  canPost,
  canModerate,
}: {
  clubId: string;
  timeZone: string;
  announcements: readonly AnnouncementView[];
  viewerId: string;
  canPost: boolean;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AnnouncementView | null>(null);

  async function togglePin(item: AnnouncementView) {
    setBusyId(item.id);
    try {
      const result = await callApi(`/api/clubs/${clubId}/announcements/${item.id}/pin`, {
        method: "POST",
        json: { pinned: !item.pinned },
      });
      if (!result.ok) return notifyFailure(result, "Could not change the pin");
      toast.success(item.pinned ? "Unpinned" : "Pinned to the top");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: AnnouncementView) {
    setBusyId(item.id);
    try {
      const result = await callApi(`/api/clubs/${clubId}/announcements/${item.id}`, {
        method: "DELETE",
      });
      if (!result.ok) return notifyFailure(result, "Could not delete it");
      toast.success("Announcement deleted");
      setDeleting(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-4 text-muted-foreground" />
          Announcements
        </CardTitle>
        <CardDescription>
          {canPost
            ? "Only club members see these. Pin one to keep it at the top."
            : "News from the club's Leads and President. Only members can see these."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {canPost ? <Composer clubId={clubId} /> : null}

        {announcements.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No announcements yet"
            description={
              canPost ? "Post the first one above." : "When the club posts something, it shows up here."
            }
          />
        ) : (
          <ul className="flex flex-col divide-y" aria-label="Announcements">
            {announcements.map((item) => {
              const isAuthor = item.author.id === viewerId;
              const canEdit = canPost && isAuthor;
              const canDelete = canPost && (isAuthor || canModerate);

              return (
                <li key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  {editingId === item.id ? (
                    <EditForm
                      clubId={clubId}
                      item={item}
                      onDone={() => {
                        setEditingId(null);
                        router.refresh();
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <AnnouncementBody
                        title={item.title}
                        body={item.body}
                        pinned={item.pinned}
                        createdAt={item.createdAt}
                        editedAt={item.editedAt}
                        authorName={item.author.displayName}
                        authorRole={item.author.role}
                        timeZone={timeZone}
                      />
                      {canPost ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === item.id}
                            onClick={() => togglePin(item)}
                          >
                            {item.pinned ? <PinOff /> : <Pin />}
                            {item.pinned ? "Unpin" : "Pin to top"}
                          </Button>
                          {canEdit ? (
                            <Button size="sm" variant="outline" onClick={() => setEditingId(item.id)}>
                              <Pencil />
                              Edit
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={busyId === item.id}
                              onClick={() => setDeleting(item)}
                            >
                              <Trash2 />
                              Delete
                            </Button>
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
      </CardContent>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleting?.title}&rdquo; disappears for every member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting === null || busyId === deleting.id}
              onClick={() => deleting && remove(deleting)}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Composer({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const result = await callApi(`/api/clubs/${clubId}/announcements`, {
        method: "POST",
        json: { title, body, pinned },
      });
      if (!result.ok) {
        setErrors(fieldErrorsOf(result));
        return notifyFailure(result, "Could not post it");
      }
      toast.success("Announcement posted");
      setTitle("");
      setBody("");
      setPinned(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announcement-title">Title</Label>
        <Input
          id="announcement-title"
          value={title}
          maxLength={ANNOUNCEMENT_TITLE_MAX}
          placeholder="e.g. Practice moved to Lab 2 this week"
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={errors.title ? true : undefined}
        />
        {errors.title ? <p className="text-sm text-destructive">{errors.title}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announcement-body">Message</Label>
        <Textarea
          id="announcement-body"
          value={body}
          rows={4}
          maxLength={ANNOUNCEMENT_BODY_MAX}
          placeholder="What do members need to know?"
          onChange={(event) => setBody(event.target.value)}
          aria-invalid={errors.body ? true : undefined}
        />
        {errors.body ? <p className="text-sm text-destructive">{errors.body}</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
          Pin to the top (replaces the current pin)
        </label>
        <Button type="submit" disabled={busy || !title.trim() || !body.trim()}>
          <Megaphone />
          {busy ? "Posting…" : "Post to members"}
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  clubId,
  item,
  onDone,
  onCancel,
}: {
  clubId: string;
  item: AnnouncementView;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const result = await callApi(`/api/clubs/${clubId}/announcements/${item.id}`, {
        method: "PATCH",
        json: { title, body },
      });
      if (!result.ok) {
        setErrors(fieldErrorsOf(result));
        return notifyFailure(result, "Could not save your changes");
      }
      toast.success("Announcement updated");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Edit announcement">
      <Input
        aria-label="Title"
        value={title}
        maxLength={ANNOUNCEMENT_TITLE_MAX}
        onChange={(event) => setTitle(event.target.value)}
      />
      {errors.title ? <p className="text-sm text-destructive">{errors.title}</p> : null}
      <Textarea
        aria-label="Message"
        value={body}
        rows={4}
        maxLength={ANNOUNCEMENT_BODY_MAX}
        onChange={(event) => setBody(event.target.value)}
      />
      {errors.body ? <p className="text-sm text-destructive">{errors.body}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !title.trim() || !body.trim()}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
