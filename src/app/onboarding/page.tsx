import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Boxes, Info, Users } from "lucide-react";

import { CreateClubForm } from "@/components/features/club/create-club-form";
import { CreateTenantForm } from "@/components/features/tenant/create-tenant-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canTenant } from "@/lib/auth/rbac";
import { getCurrentUser } from "@/lib/auth/session";
import { listClubs } from "@/lib/services/club-service";
import { listTenantsForUser } from "@/lib/services/tenant-service";
import { cn } from "@/lib/utils";
import { clubRoleLabel } from "@/lib/domain/club-roles";
import { START_CLUB_PATH } from "@/lib/domain/club-paths";

export const metadata: Metadata = { title: "Get started" };

/**
 * Onboarding: create a college, then create clubs inside it.
 *
 * Server-rendered so every permission decision (`canTenant`) is made once, on the
 * server, from the caller's real membership rows — never from client state.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?callbackUrl=/onboarding");

  const tenants = await listTenantsForUser(user.id);

  // ── No college yet: the only sensible next step is creating one ──
  if (tenants.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-[1.08] font-bold sm:text-4xl">Create your college</h1>
          <p className="text-sm text-muted-foreground">
            Everything in ClubHub lives inside a college. You will be its Owner, which means you can
            create clubs and manage admins.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="size-4 text-muted-foreground" />
              College details
            </CardTitle>
            <CardDescription>A web address for your college is generated automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateTenantForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Has at least one college: show clubs and offer to create more ──
  const withClubs = await Promise.all(
    tenants.map(async (tenant) => ({
      tenant,
      clubs: await listClubs(tenant.id, user.id),
    })),
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl leading-[1.08] font-bold sm:text-4xl">Your colleges and clubs</h1>
        <p className="text-sm text-muted-foreground">
          Clubs belong to a college. You can be a President of one club and a plain member of another.
        </p>
      </div>

      {withClubs.map(({ tenant, clubs }) => {
        const mayCreateClub = canTenant(tenant.role, "club:create");

        return (
          <Card key={tenant.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="size-4 text-muted-foreground" />
                {tenant.name}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Your role: {tenant.role.toLowerCase()}</Badge>
                <span>
                  {tenant._count.clubs} club{tenant._count.clubs === 1 ? "" : "s"} · {tenant.timezone}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {clubs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No clubs yet. {mayCreateClub ? "Create the first one below." : "Start the first one — a professor confirms it."}
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {clubs.map((club) => (
                    <li key={club.id} className="flex flex-col gap-2 rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/clubs/${club.id}`}
                          className="text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {club.name}
                        </Link>
                        <Badge variant={club.viewerRole ? "default" : "outline"}>
                          {club.viewerRole ? clubRoleLabel(club.viewerRole) : "Not a member"}
                        </Badge>
                      </div>
                      {club.description ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{club.description}</p>
                      ) : null}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3" />
                        {club.memberCount} member{club.memberCount === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {mayCreateClub ? (
                <div className="rounded-lg border border-dashed p-4">
                  <CreateClubForm tenantId={tenant.id} tenantName={tenant.name} />
                </div>
              ) : (
                <Alert>
                  <Info />
                  <AlertDescription>
                    Want your own club? Any student can{" "}
                    <Link href={START_CLUB_PATH} className="font-medium underline underline-offset-4">
                      start one
                    </Link>
                    . It goes live once a professor confirms it with a 6-digit code.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          Go to the dashboard
          <ArrowRight data-icon="inline-end" />
        </Link>
        <Link href="/demo" className={cn(buttonVariants({ variant: "ghost" }))}>
          Compare roles in the demo
        </Link>
      </div>
    </div>
  );
}
