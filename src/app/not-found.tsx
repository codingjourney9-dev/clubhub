import Link from "next/link";

import { Wordmark } from "@/components/layout/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The 404 page.
 *
 * This app answers "not found" for two very different reasons: the address is
 * wrong, or the thing exists but is not yours to see (a draft, another college's
 * event, a members-only club). Both get the same page on purpose — a 404 that says
 * "you are not allowed" would confirm the resource exists, which is exactly what
 * the guards avoid.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="ClubHub home">
          <Wordmark />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
          {/* A ticket torn in half: the stub that doesn't get you in. */}
          <div aria-hidden="true" className="flex items-stretch">
            <div className="flex -rotate-6 flex-col items-center justify-center rounded-l-lg border border-r-0 border-foreground/80 bg-card px-6 py-5 shadow-print-sm dark:border-foreground/30">
              <span className="eyebrow text-primary">Admit</span>
              <span className="font-heading text-5xl leading-none font-extrabold">4</span>
            </div>
            <div className="w-3" />
            <div className="flex translate-y-2 rotate-[5deg] flex-col items-center justify-center rounded-r-lg border border-l-0 border-dashed border-foreground/60 bg-card px-6 py-5 shadow-print-sm dark:border-foreground/30">
              <span className="eyebrow">nobody</span>
              <span className="font-heading text-5xl leading-none font-extrabold">04</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="eyebrow">Error 404</span>
            <h1 className="text-3xl font-bold sm:text-4xl">There is nothing at this address</h1>
            <p className="text-muted-foreground">
              It may never have existed, it may have been deleted, or it may belong to another
              college. For private things, ClubHub deliberately does not say which.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className={cn(buttonVariants())}>
              Back to the dashboard
            </Link>
            <Link href="/events" className={cn(buttonVariants({ variant: "outline" }))}>
              Browse events
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
