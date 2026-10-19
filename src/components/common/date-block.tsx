import { cn } from "@/lib/utils";

function part(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, ...options }).format(date);
}

/**
 * The tear-off calendar leaf used on event rows and tickets: month in the
 * accent colour, a big day number, and the weekday — all computed in the
 * event's own timezone so a 23:30 IST event never shows tomorrow's date.
 */
export function DateBlock({
  date,
  timeZone,
  size = "md",
  className,
}: {
  date: Date;
  timeZone: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const month = part(date, timeZone, { month: "short" }).toUpperCase();
  const day = part(date, timeZone, { day: "numeric" });
  const weekday = part(date, timeZone, { weekday: "short" }).toUpperCase();

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-md border border-foreground/70 bg-card text-center dark:border-foreground/25",
        size === "sm" && "w-11 py-1",
        size === "md" && "w-14 py-1.5",
        size === "lg" && "w-18 py-2",
        className,
      )}
    >
      <span className="font-mono text-[0.625rem] leading-none font-semibold tracking-widest text-primary">{month}</span>
      <span
        className={cn(
          "font-heading leading-none font-bold tracking-tight",
          size === "sm" && "my-0.5 text-lg",
          size === "md" && "my-1 text-2xl",
          size === "lg" && "my-1 text-3xl",
        )}
      >
        {day}
      </span>
      <span className="font-mono text-[0.5625rem] leading-none tracking-wider text-muted-foreground">{weekday}</span>
    </div>
  );
}
