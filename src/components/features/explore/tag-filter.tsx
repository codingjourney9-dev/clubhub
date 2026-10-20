import Link from "next/link";

import type { EventTag } from "@/generated/prisma/enums";
import { EVENT_TAG_LABELS, EVENT_TAGS, tagToParam } from "@/lib/domain/event-details";
import { cn } from "@/lib/utils";

/**
 * Tag filter for the public board: plain links (`/dashboard?tag=workshop`),
 * so it works without JavaScript, can be shared, and the back button behaves.
 */
export function TagFilter({ active }: { active: EventTag | null }) {
  const base =
    "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors";
  const idle = "border-foreground/20 bg-card text-foreground/80 hover:border-foreground/50 hover:text-foreground";
  const on = "border-foreground bg-foreground text-background";

  return (
    <nav aria-label="Filter by tag" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-2 pb-1 sm:flex-wrap">
        <li>
          <Link href="/dashboard#feed" aria-current={active === null ? "page" : undefined} className={cn(base, active === null ? on : idle)}>
            All
          </Link>
        </li>
        {EVENT_TAGS.map((tag) => (
          <li key={tag}>
            <Link
              href={`/dashboard?tag=${tagToParam(tag)}#feed`}
              aria-current={active === tag ? "page" : undefined}
              className={cn(base, active === tag ? on : idle)}
            >
              {EVENT_TAG_LABELS[tag]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
