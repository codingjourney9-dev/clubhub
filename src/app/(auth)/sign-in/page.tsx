import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/features/auth/sign-in-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // Already signed in (or arriving via a middleware redirect) — no need to show the form.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const { callbackUrl } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Sign in to ClubHub</h1>
        <p className="text-sm text-muted-foreground">
          Use the college email your club registered with.
        </p>
      </div>
      <SignInForm callbackUrl={callbackUrl ?? "/dashboard"} />
    </div>
  );
}
