import { Pin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { clubRoleLabel } from "@/lib/domain/club-roles";
import { formatDateTimeInZone } from "@/lib/format/date";
import type { ClubRole } from "@/generated/prisma/enums";

/**
 * How one announcement reads, everywhere it appears (club page, dashboard,
 * demo). Pure markup with no hooks, so server and client components can share it.
 *
 * The body is rendered as TEXT — React escapes it — with line breaks kept by
 * CSS. Nobody can smuggle HTML or scripts into a club through an announcement.
 */
export function AnnouncementBody({
  title,
  body,
  pinned,
  createdAt,
  editedAt,
  authorName,
  authorRole,
  timeZone,
  clubName,
  clamp = false,
}: {
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  editedAt: string | null;
  authorName: string;
  authorRole?: ClubRole | null;
  timeZone: string;
  /** Shown on the dashboard, where posts from several clubs are mixed. */
  clubName?: string;
  /** Dashboard: cut long messages to a few lines. */
  clamp?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {pinned ? (
          <Badge variant="secondary" className="gap-1">
            <Pin className="size-3" aria-hidden="true" />
            Pinned
          </Badge>
        ) : null}
        {clubName ? <span className="eyebrow text-primary">{clubName}</span> : null}
      </div>
      <h3 className="font-heading text-lg leading-snug font-bold break-words">{title}</h3>
      <p
        className={
          "text-sm leading-relaxed break-words whitespace-pre-line text-foreground/90" +
          (clamp ? " line-clamp-3" : "")
        }
      >
        {body}
      </p>
      <p className="text-xs text-muted-foreground">
        {authorName}
        {authorRole ? ` · ${clubRoleLabel(authorRole)}` : ""} ·{" "}
        <time dateTime={createdAt}>{formatDateTimeInZone(new Date(createdAt), timeZone)}</time>
        {editedAt ? " · edited" : ""}
      </p>
    </div>
  );
}
