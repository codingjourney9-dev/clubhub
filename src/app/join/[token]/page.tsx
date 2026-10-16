import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX2, Info, Mail } from "lucide-react";

import { AcceptInviteButton } from "@/components/features/invite/accept-invite-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { previewInvite } from "@/lib/services/invite-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Join" };
export const dynamic = "force-dynamic";

/**
 * Invite landing page (the URL a President pastes into a group chat).
 *
 * Shows a safe preview to anyone holding the link, but only a signed-in user can
 * actually redeem it — membership is always tied to a real identity.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const preview = /^[A-Za-z0-9_-]+$/.test(token) ? await previewInvite(token) : null;

  if (!preview) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarX2 className="size-4 text-destructive" />
              This invite link is not valid
            </CardTitle>
            <CardDescription>
              It may have been mistyped or deleted. Ask whoever shared it for a fresh link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Back to the home page
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const user = await getCurrentUser();
  const roleLabel =
    preview.role === "EVENT_MANAGER"
      ? "Event Manager"
      : preview.role.charAt(0) + preview.role.slice(1).toLowerCase();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {preview.valid
              ? `You have been invited to ${preview.targetName}`
              : `This invite cannot be used`}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{preview.kind === "club" ? "Club" : "College"}</Badge>
            <Badge>{roleLabel}</Badge>
            <span>
              {preview.usesRemaining} use{preview.usesRemaining === 1 ? "" : "s"} remaining · expires{" "}
              {preview.expiresAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!preview.valid ? (
            <Alert variant="destructive">
              <AlertTitle>Link unusable</AlertTitle>
              <AlertDescription>{preview.reason}</AlertDescription>
            </Alert>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Joining adds you as a <span className="font-medium text-foreground">{roleLabel}</span> of{" "}
                <span className="font-medium text-foreground">{preview.targetName}</span>. You can leave
                later at any time.
              </p>

              {preview.emailRestricted ? (
                <Alert>
                  <Mail />
                  <AlertDescription>
                    This link only works for the email address it was issued to.
                  </AlertDescription>
                </Alert>
              ) : null}

              {user ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">
                    You are signed in as <span className="font-medium text-foreground">{user.email}</span>
                  </p>
                  <AcceptInviteButton
                    token={token}
                    targetName={preview.targetName}
                    alreadyMember={false}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Alert>
                    <Info />
                    <AlertTitle>Sign in to accept</AlertTitle>
                    <AlertDescription>
                      Membership is tied to your account, so you need to sign in first.
                    </AlertDescription>
                  </Alert>
                  <Link
                    href={`/sign-in?callbackUrl=${encodeURIComponent(`/join/${token}`)}`}
                    className={cn(buttonVariants({ size: "lg" }), "self-start")}
                  >
                    Sign in and join
                  </Link>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
