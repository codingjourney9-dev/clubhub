"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, LogOut, Menu, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

export type NavItem = { readonly href: string; readonly label: string };

/** A link counts as "here" on its own page and on pages underneath it (/events/123 → Events). */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The row of links in the top bar on wide screens. Marks the page you are on. */
export function PrimaryNav({ items, className }: { items: readonly NavItem[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className={cn("ml-4 items-center gap-1", className)}>
      {items.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
              current ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The ☰ button for phones and small tablets: opens a panel from the right with
 * every link, who you are, and Sign out (or Sign in / Create account for guests).
 * Closes itself when you pick a page.
 */
export function MobileNav({
  items,
  user,
  className,
}: {
  items: readonly NavItem[];
  user: { displayName: string; email: string } | null;
  className?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Picking a link changes the page; the panel should not stay over it.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="icon" className={className} aria-label="Open menu">
            <Menu />
          </Button>
        }
      />
      <SheetContent side="right" className="w-[85vw] max-w-xs gap-0 p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="truncate">
            {user ? `Signed in as ${user.displayName}` : "Browsing as a guest"}
          </SheetDescription>
        </SheetHeader>

        <nav aria-label="Menu" className="flex flex-col gap-1 p-3">
          {items.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-3 text-base font-medium transition-colors hover:bg-muted",
                  current ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
          {user ? (
            <>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              <form action={signOutAction}>
                <Button type="submit" variant="outline" className="w-full justify-center">
                  <LogOut data-icon="inline-start" />
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className={cn(buttonVariants({ variant: "outline" }), "w-full justify-center")}
              >
                <LogIn data-icon="inline-start" />
                Sign in
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setOpen(false)}
                className={cn(buttonVariants(), "w-full justify-center")}
              >
                <UserPlus data-icon="inline-start" />
                Create account
              </Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
