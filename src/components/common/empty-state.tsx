import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * What a screen says when there is nothing on it.
 *
 * An empty list is a normal state, not a failure, and it is the state a brand-new
 * club is *always* in — so it gets a sentence that explains what would fill it,
 * and a button when there is an obvious next step. "No results" teaches nobody
 * anything.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-dashed border-foreground/25 bg-card/60 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex size-12 rotate-[-4deg] items-center justify-center rounded-md border border-foreground/70 bg-card shadow-print-sm dark:border-foreground/25">
        <Icon className="size-5 text-primary" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="font-heading text-lg font-bold tracking-tight">{title}</p>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
