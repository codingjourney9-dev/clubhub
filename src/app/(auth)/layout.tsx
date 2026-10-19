import Link from "next/link";

import { Wordmark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const notices = [
  { club: "Robotics Club", title: "RoboWars Qualifiers", when: "Thu 29 Oct · 9:00", seats: "47 / 120" },
  { club: "Debate Society", title: "Inter-College Parliamentary", when: "Wed 22 Oct · 10:00", seats: "12 / 60" },
  { club: "Music Circle", title: "Open Mic Night", when: "Fri 31 Oct · 18:30", seats: "Full · waitlist" },
] as const;

/**
 * Shared shell for /sign-in and /sign-up: the form on the right, and on wide
 * screens a "noticeboard" panel on the left so the first screen a student sees
 * says what the product is for, not just "enter password".
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden overflow-hidden bg-foreground text-background lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden="true" className="bg-dots absolute inset-0 opacity-30 invert" />

        <Link href="/" className="relative self-start rounded-md" aria-label="ClubHub home">
          <Wordmark className="[&_span]:text-background [&_span_span]:text-primary" />
        </Link>

        <div className="relative flex flex-col gap-8">
          <span className="font-mono text-xs tracking-[0.18em] text-background/60 uppercase">
            This week on the board
          </span>
          <ul className="flex flex-col gap-3">
            {notices.map((notice, index) => (
              <li
                key={notice.title}
                className="flex items-center justify-between gap-6 rounded-lg border border-background/15 bg-background/[0.04] px-5 py-4"
                style={{ transform: `rotate(${[-0.6, 0.4, -0.2][index]}deg)` }}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-primary uppercase">
                    {notice.club}
                  </span>
                  <span className="truncate font-heading text-lg font-bold">{notice.title}</span>
                  <span className="text-sm text-background/60">{notice.when}</span>
                </div>
                <span className="shrink-0 rounded-sm border border-background/25 px-2 py-1 font-mono text-xs text-background/80">
                  {notice.seats}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative max-w-md font-heading text-[1.75rem] leading-tight font-bold tracking-tight">
          Every club event on campus, one door — and nobody stuck holding a clipboard.
        </p>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Link href="/" className="rounded-md lg:invisible" aria-label="ClubHub home">
            <Wordmark />
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-4 pt-4 pb-16 sm:px-8">
          <div className="w-full max-w-[24rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
