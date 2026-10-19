import { cn } from "@/lib/utils";

/**
 * The ClubHub mark: an admission ticket seen end-on — a rounded stub with the
 * two punched notches every paper ticket has, and a tear line. Drawn in
 * currentColor so it inherits whatever ink it sits in.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
      fill="none"
    >
      <path
        d="M6 5h20a2 2 0 0 1 2 2v6a3 3 0 0 0 0 6v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a3 3 0 0 0 0-6V7a2 2 0 0 1 2-2Z"
        className="fill-primary"
      />
      <path d="M20 8v2.5M20 14.75v2.5M20 21.5V24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-primary-foreground" />
      <path d="M9 12.5h6M9 16h6M9 19.5h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-primary-foreground" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark />
      <span className="font-heading text-[1.0625rem] font-bold tracking-tight">
        Club<span className="text-primary">Hub</span>
      </span>
    </span>
  );
}
