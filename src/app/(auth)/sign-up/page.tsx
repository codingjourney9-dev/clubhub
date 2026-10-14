import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/features/auth/sign-up-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          You will be able to join or create clubs in the next step.
        </p>
      </div>
      <SignUpForm />
    </div>
  );
}
