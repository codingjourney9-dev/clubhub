import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, KeyRound } from "lucide-react";

import { MemberOverviewView } from "@/components/features/dashboard/member-overview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { loadMemberOverview } from "@/lib/services/dashboard-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The signed-in member dashboard. Data comes from `loadMemberOverview`, the same
 * service the cookie-free /demo preview uses, so the two cannot drift apart.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?callbackUrl=/dashboard");

  const overview = await loadMemberOverview(user.id);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Hello, {user.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>
        </p>
      </div>

      <MemberOverviewView overview={overview} />

      <Alert>
        <KeyRound />
        <AlertTitle>Phase 2 of 7 is complete</AlertTitle>
        <AlertDescription>
          Auth, the database schema and tenant-scoped reads are live. Next: creating clubs and
          inviting members with the RBAC matrix (Phase 3), then the event engine (Phase 4).
        </AlertDescription>
      </Alert>

      <div>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to project overview
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>
    </div>
  );
}
