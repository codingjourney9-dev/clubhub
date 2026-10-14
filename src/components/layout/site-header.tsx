import Link from "next/link";
import { CalendarDays, LayoutDashboard, LogOut } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { siteConfig, phaseRoadmap } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Routes that exist but are intentionally not built yet, so the UI never links
 * to a 404 while later phases land.
 */
const upcomingNav = phaseRoadmap
  .filter((phase) => phase.id >= 3 && phase.id <= 6)
  .map((phase) => ({ label: phase.title.split(" ")[0] ?? "Soon", phaseId: phase.id }));

export async function SiteHeader() {
  const user = await getCurrentUser();

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
          <Link
            href="/api/health"
            prefetch={false}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
          >
            API health
          </Link>

          {user ? (
            <>
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
              >
                <LayoutDashboard data-icon="inline-start" />
                Dashboard
              </Link>
              <span className="hidden text-xs text-muted-foreground lg:inline">
                {user.displayName}
              </span>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="sm" title="Sign out">
                  <LogOut data-icon="inline-start" />
                  <span className="sr-only">Sign out</span>
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link href="/sign-up" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                Create account
              </Link>
              <Link href="/sign-in" className={cn(buttonVariants({ size: "sm" }))}>
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
