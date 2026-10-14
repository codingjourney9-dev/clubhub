import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { siteConfig, phaseRoadmap } from "@/config/site";

/**
 * Routes that exist but are intentionally not built yet. They are rendered as
 * inert labels so the UI never links to a 404 while later phases land.
 */
const upcomingNav = phaseRoadmap
  .filter((phase) => phase.id >= 3 && phase.id <= 6)
  .map((phase) => ({ label: phase.title.split(" ")[0] ?? "Soon", phaseId: phase.id }));

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-heading text-sm font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CalendarDays className="size-4" />
          </span>
          {siteConfig.name}
        </Link>

        <nav aria-label="Primary" className="ml-2 hidden items-center gap-1 md:flex">
          {upcomingNav.map((item) => (
            <span
              key={item.phaseId}
              aria-disabled="true"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "cursor-not-allowed text-muted-foreground/60",
              )}
            >
              {item.label}
              <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] font-normal">
                P{item.phaseId}
              </Badge>
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Phase 1 · Boilerplate
          </Badge>
          <Link
            href="/api/health"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            prefetch={false}
          >
            API health
          </Link>
        </div>
      </div>
    </header>
  );
}
