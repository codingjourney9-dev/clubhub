import { cn } from "@/lib/utils";

/**
 * One heading pattern for every inner page: a mono eyebrow, a display-face
 * title, an optional line of context and an optional action cluster that sits
 * to the right on wide screens and drops below on phones.
 */
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-5 md:flex-row md:items-end md:justify-between", className)}>
      <div className="flex max-w-2xl min-w-0 flex-col gap-2">
        {eyebrow ? <span className="eyebrow text-primary">{eyebrow}</span> : null}
        <h1 className="text-3xl leading-[1.08] font-bold sm:text-4xl">{title}</h1>
        {description ? <p className="text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
