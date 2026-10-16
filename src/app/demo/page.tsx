import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Info } from "lucide-react";

import { MemberOverviewView } from "@/components/features/dashboard/member-overview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/lib/db/client";
import { isDemoModeEnabled } from "@/lib/demo/mode";
import { loadMemberOverview } from "@/lib/services/dashboard-service";
import { cn } from "@/lib/utils";
import { DEMO_ACCOUNTS, findDemoAccount } from "@/config/demo";

export const metadata: Metadata = { title: "Demo preview" };
export const dynamic = "force-dynamic";

/**
 * Read-only preview of the member dashboard that requires NO cookies.
 *
 * Why it exists: when the app is viewed inside an embedded preview frame, the
 * browser refuses to store cookies (third-party context), so a real sign-in
 * cannot complete — the server rejects the request with `MissingCSRF` before the
 * password is even checked. This page renders the same data, from the same
 * service, for a chosen seeded user, so the app can be reviewed without
 * authentication.
 *
 * It is disabled in production unless DEMO_MODE=on (see src/lib/demo/mode.ts).
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  if (!isDemoModeEnabled()) notFound();

  const { as } = await searchParams;
  const account = findDemoAccount(as);

  const user = await db.user.findFirst({
    where: { email: account.email, deletedAt: null },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <Alert>
          <Info />
          <AlertTitle>The demo data has not been seeded yet</AlertTitle>
          <AlertDescription>
            Run <code className="font-mono text-xs">npm run db:seed</code> to create the demo college,
            clubs and users, then reload this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const overview = await loadMemberOverview(user.id);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <Alert className="border-amber-500/40 bg-amber-500/10">
        <Info className="text-amber-600" />
        <AlertTitle>Demo preview — read-only, no sign-in required</AlertTitle>
        <AlertDescription>
          An embedded preview frame is not allowed to store cookies, so a real sign-in cannot complete
          there. This page renders the same data a signed-in user would see, fetched by the same code
          ({`loadMemberOverview`}) from the seeded database. Switch users below to compare what each
          role can see.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Hello, {account.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.email}</span> ·{" "}
          {account.highlight}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">View as:</span>
        {DEMO_ACCOUNTS.map((candidate) => {
          const active = candidate.key === account.key;
          return (
            <Link
              key={candidate.key}
              href={`/demo?as=${candidate.key}`}
              className={cn(
                buttonVariants({ size: "sm", variant: active ? "default" : "outline" }),
                active ? "" : "text-muted-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              {candidate.displayName}
              {active ? <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">viewing</Badge> : null}
            </Link>
          );
        })}
      </div>

      <MemberOverviewView overview={overview} />

      <Alert>
        <AlertDescription className="flex flex-col gap-1">
          <span className="font-medium text-foreground">
            Why there is no &ldquo;edit&rdquo; button here
          </span>
          <span>
            This preview is deliberately read-only. Creating clubs, events and invites is Phase 3 and 4
            work, and those actions require a real session. The signed-in dashboard at{" "}
            <Link href="/sign-in" className="font-medium underline underline-offset-4">
              /sign-in
            </Link>{" "}
            shows the same data once cookies are available (for example when you run the app locally
            with <code className="font-mono text-xs">npm run dev</code>).
          </span>
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-3">
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to the project overview
          <ArrowRight data-icon="inline-end" />
        </Link>
        <Link href="/api/health" prefetch={false} className={cn(buttonVariants({ variant: "ghost" }))}>
          API health
        </Link>
      </div>
    </div>
  );
}
