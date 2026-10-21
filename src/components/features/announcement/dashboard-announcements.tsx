import Link from "next/link";
import { ArrowUpRight, Megaphone } from "lucide-react";

import { AnnouncementBody } from "@/components/features/announcement/announcement-body";
import type { DashboardAnnouncement } from "@/lib/services/announcement-service";

/**
 * "From your clubs": the latest members-only announcements across every club
 * the person belongs to. Shared by `/dashboard` and the `/demo` preview.
 * Renders nothing for someone in no club — there is nothing they could see.
 */
export function DashboardAnnouncements({
  announcements,
  inAnyClub,
  clubHref = (clubId) => `/clubs/${clubId}`,
}: {
  announcements: readonly DashboardAnnouncement[];
  inAnyClub: boolean;
  clubHref?: (clubId: string) => string;
}) {
  if (!inAnyClub) return null;

  return (
    <section aria-labelledby="announcements-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="eyebrow">From your clubs</span>
        <h2 id="announcements-heading" className="flex items-center gap-2 text-2xl font-bold">
          <Megaphone className="size-5 text-primary" aria-hidden="true" />
          Announcements
        </h2>
      </div>

      {announcements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-foreground/25 bg-card/60 p-6 text-sm text-muted-foreground">
          Nothing new. When a Lead or President posts in one of your clubs, it shows up here.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {announcements.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
              <AnnouncementBody
                title={item.title}
                body={item.body}
                pinned={item.pinned}
                createdAt={item.createdAt}
                editedAt={item.editedAt}
                authorName={item.author.displayName}
                timeZone={item.timeZone}
                clubName={item.clubName}
                clamp
              />
              <Link
                href={clubHref(item.clubId)}
                className="inline-flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline"
              >
                Open {item.clubName}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
