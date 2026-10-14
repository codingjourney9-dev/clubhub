import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { siteConfig } from "@/config/site";

/** Shared shell for /sign-in and /sign-up. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4">
          <Link href="/" className="flex items-center gap-2 font-heading text-sm font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <CalendarDays className="size-4" />
            </span>
            {siteConfig.name}
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
