import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/features/auth/sign-up-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="eyebrow text-primary">Takes a minute</span>
        <h1 className="text-3xl font-bold sm:text-4xl">Create your account</h1>
        <p className="text-muted-foreground">
          You will be able to join or create clubs in the next step.
        </p>
      </div>
      <SignUpForm />
    </div>
  );
}
