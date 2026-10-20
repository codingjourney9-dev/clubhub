import { APPLICATION_STATUS_LABELS } from "@/lib/domain/openings";
import { cn } from "@/lib/utils";

const STYLES = {
  PENDING: "border-primary/50 bg-primary/10 text-primary",
  ACCEPTED: "border-success/60 bg-success/10 text-success",
  REJECTED: "border-foreground/30 bg-muted text-muted-foreground",
  WITHDRAWN: "border-border text-muted-foreground",
} as const;

export function ApplicationStatusBadge({ status }: { status: keyof typeof APPLICATION_STATUS_LABELS }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium tracking-wide uppercase",
        STYLES[status],
      )}
    >
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}
