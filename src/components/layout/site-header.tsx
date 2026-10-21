import Link from "next/link";
import { LogOut } from "lucide-react";

import { Wordmark } from "@/components/layout/brand-mark";
import { MobileNav, PrimaryNav } from "@/components/layout/nav-links";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const memberNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/events", label: "Events" },
  { href: "/openings", label: "Openings" },
  { href: "/tickets", label: "My tickets" },
  { href: "/applications", label: "My applications" },
] as const;

const guestNav = [
  { href: "/dashboard", label: "Explore events" },
  { href: "/openings", label: "Openings" },
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="ClubHub home">
          <Wordmark />
        </Link>

        {user ? (
          <PrimaryNav items={memberNav} className="hidden lg:flex" />
        ) : (
          <PrimaryNav items={guestNav} className="hidden sm:flex" />
        )}

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          {user ? (
            <>
              <span
                className="hidden items-center gap-2 rounded-md border border-foreground/15 bg-card py-1 pr-3 pl-1 xl:inline-flex"
                title={user.displayName}
              >
                <span className="flex size-7 items-center justify-center rounded-sm bg-foreground font-mono text-[0.6875rem] font-semibold text-background">
                  {initials(user.displayName)}
                </span>
                <span className="max-w-40 truncate text-sm font-medium">{user.displayName}</span>
              </span>
              <form action={signOutAction} className="hidden lg:block">
                <Button type="submit" variant="ghost" size="icon" title="Sign out">
                  <LogOut />
                  <span className="sr-only">Sign out</span>
                </Button>
              </form>
              <MobileNav
                items={memberNav}
                user={{ displayName: user.displayName, email: user.email }}
                className="lg:hidden"
              />
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
              >
                Sign in
              </Link>
              <Link href="/sign-up" className={cn(buttonVariants({ size: "sm" }))}>
                Create account
              </Link>
              <MobileNav items={guestNav} user={null} className="sm:hidden" />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
