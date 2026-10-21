import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The shape of a page, drawn before the data arrives.
 *
 * A skeleton is not decoration. On a slow connection this is the difference
 * between "the app is thinking" and "the app is broken": the layout appears
 * immediately and then fills in, so nothing jumps and nobody taps a button that
 * was about to move. Next.js renders these automatically as `loading.tsx` while
 * the server component above it is still waiting.
 *
 * The shapes mirror the real pages closely enough to be a promise: same header,
 * same number of cards, same column widths.
 */

function Header() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-7 w-64 max-w-full" />
      <Skeleton className="h-3 w-80 max-w-full" />
    </div>
  );
}

function Card({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border p-5", className)}>
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

export function PageSkeleton({
  variant = "list",
  rows = 3,
}: {
  variant?: "list" | "dashboard" | "detail" | "table";
  rows?: number;
}) {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <Header />

      {variant === "dashboard" ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} lines={2} />
            ))}
          </div>
          <Card lines={5} />
        </>
      ) : null}

      {variant === "list" ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="flex w-full flex-col gap-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0" />
            </div>
          ))}
        </div>
      ) : null}

      {variant === "detail" ? (
        <>
          <Card lines={4} />
          <Card lines={3} />
          <Card lines={2} />
        </>
      ) : null}

      {variant === "table" ? (
        <div className="flex flex-col gap-2 rounded-xl border p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-8 w-full" />
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
