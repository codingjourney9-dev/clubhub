import Link from "next/link";

import { Wordmark } from "@/components/layout/brand-mark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-sm text-sm text-muted-foreground">
            Events, tickets and check-ins for every club on campus. Built for the
            noticeboard generation that lives on its phone.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/sign-in" className="hover:text-foreground">Sign in</Link>
          <Link href="/sign-up" className="hover:text-foreground">Create account</Link>
          <Link href="/api/health" prefetch={false} className="hover:text-foreground">System status</Link>
        </nav>
      </div>
      <div className="border-t border-border/60">
        <p className="eyebrow mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
          ClubHub · Made for college clubs
        </p>
      </div>
    </footer>
  );
}
