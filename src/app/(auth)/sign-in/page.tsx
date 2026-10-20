import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/features/auth/sign-in-form";
import { getCurrentUser } from "@/lib/auth/session";
import { isDemoModeEnabled } from "@/lib/demo/mode";

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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="eyebrow text-primary">Welcome back</span>
        <h1 className="text-3xl font-bold sm:text-4xl">Sign in to ClubHub</h1>
        <p className="text-muted-foreground">
          Use the college email your club registered with.
        </p>
      </div>
      <SignInForm callbackUrl={callbackUrl ?? "/dashboard"} demoMode={isDemoModeEnabled()} />
    </div>
  );
}
