import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/features/auth/sign-up-form";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { getCurrentUser } from "@/lib/auth/session";
import { signInReason } from "@/lib/auth/sign-in-reason";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const [user, { callbackUrl }] = await Promise.all([getCurrentUser(), searchParams]);
  const returnTo = safeCallbackUrl(callbackUrl);
  if (user) redirect(returnTo);
  const reason = signInReason(returnTo);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="eyebrow text-primary">Takes a minute</span>
        <h1 className="text-3xl font-bold sm:text-4xl">Create your account</h1>
        <p className="text-muted-foreground">
          {reason ?? "You will be able to join or create clubs in the next step."}
        </p>
      </div>
      <SignUpForm callbackUrl={returnTo} />
    </div>
  );
}
