import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, KeyRound, LayoutGrid, Plus } from "lucide-react";

import { MemberOverviewView } from "@/components/features/dashboard/member-overview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="size-4 text-muted-foreground" />
            Your clubs
          </CardTitle>
          <CardDescription>
            Open a club to see its members, manage roles and share invite links.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {overview.clubRoles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You are not part of a club yet. Create a college and a club to get started.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {overview.clubRoles.map((membership) => (
                <li key={membership.club.id} className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/clubs/${membership.club.id}`}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {membership.club.name}
                    </Link>
                    <Badge variant={membership.role === "MEMBER" ? "outline" : "default"}>
                      {membership.role === "EVENT_MANAGER"
                        ? "Event Manager"
                        : membership.role.charAt(0) + membership.role.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {membership.club.category ?? "Uncategorised"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Link href="/onboarding" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
              <Plus data-icon="inline-start" />
              Create or browse clubs
            </Link>
            <Link href="/demo" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Compare what each role sees
            </Link>
          </div>
        </CardContent>
      </Card>

      <MemberOverviewView overview={overview} />

      <Alert>
        <KeyRound />
        <AlertTitle>Phase 3 of 7 is complete</AlertTitle>
        <AlertDescription>
          Colleges, clubs, member roles and invite links are live, with the RBAC matrix enforced on
          every route. Next: creating and publishing events (Phase 4), then capacity-safe RSVPs and QR
          tickets (Phase 5).
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
