import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Info, Users } from "lucide-react";

import { MemberOverviewView } from "@/components/features/dashboard/member-overview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Every club in the colleges this viewer belongs to — including clubs they have
  // not joined, which is exactly how a college admin sees the place. Each one
  // links to the read-only club preview below.
  const clubs = await db.club.findMany({
    where: {
      tenantId: { in: overview.tenantRoles.map((membership) => membership.tenant.id) },
      deletedAt: null,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      _count: { select: { members: { where: { deletedAt: null } } } },
    },
  });

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

      {clubs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Open a club as {account.displayName}
            </CardTitle>
            <CardDescription>
              The club page shows the member list, what this person is allowed to do there, and the
              invite links they can see. It is the same page a signed-in member gets, minus the buttons.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {clubs.map((club) => (
                <Link
                  key={club.id}
                  href={`/demo/clubs/${club.id}?as=${account.key}`}
                  className={cn(buttonVariants({ variant: "secondary" }), "gap-2")}
                >
                  {club.name}
                  <span className="text-xs text-muted-foreground">
                    {club._count.members} member{club._count.members === 1 ? "" : "s"}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Alert>
        <AlertDescription className="flex flex-col gap-1">
          <span className="font-medium text-foreground">
            Why there is no &ldquo;edit&rdquo; button here
          </span>
          <span>
            This preview is deliberately read-only. Creating colleges, clubs and invite links, and
            changing someone&apos;s role, all need a real session — and an embedded preview frame is not
            allowed to store the cookie that session lives in. Everything else you see is the real
            thing: the same data, from the same code, rendered by the same components. Run the app on
            your own machine (§4 of <code className="font-mono text-xs">docs/START-HERE.md</code>) or
            sign in at{" "}
            <Link href="/sign-in" className="font-medium underline underline-offset-4">
              /sign-in
            </Link>{" "}
            from a normal browser tab to use the working version.
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
