import Link from "next/link";
import { LogOut } from "lucide-react";

import { Wordmark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const memberNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/events", label: "Events" },
  { href: "/tickets", label: "My tickets" },
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
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
            {memberNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : (
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 sm:flex">
            <Link
              href="/dashboard"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Explore events
            </Link>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          {user ? (
            <>
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "md:hidden")}
              >
                Dashboard
              </Link>
              <span
                className="hidden items-center gap-2 rounded-md border border-foreground/15 bg-card py-1 pr-3 pl-1 lg:inline-flex"
                title={user.displayName}
              >
                <span className="flex size-7 items-center justify-center rounded-sm bg-foreground font-mono text-[0.6875rem] font-semibold text-background">
                  {initials(user.displayName)}
                </span>
                <span className="max-w-40 truncate text-sm font-medium">{user.displayName}</span>
              </span>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="icon" title="Sign out">
                  <LogOut />
                  <span className="sr-only">Sign out</span>
                </Button>
              </form>
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
            </>
          )}
        </div>
      </div>
    </header>
  );
}
