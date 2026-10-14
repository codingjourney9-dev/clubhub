"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

/**
 * Client-side validation gives instant feedback; the credentials provider
 * re-validates the same schema server-side. Client checks are UX only.
 */
export function SignInForm({ callbackUrl = "/dashboard" }: { callbackUrl?: string }) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (!result || result.error) {
      setError("password", { message: "Incorrect email or password." });
      toast.error("Sign-in failed", {
        description: "Check your email and password, then try again.",
      });
      return;
    }

    toast.success("Signed in");
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">College email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@vit.ac.in"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id="email-error" role="alert" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p id="password-error" role="alert" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      <Alert>
        <AlertDescription>
          No account yet?{" "}
          <Link href="/sign-up" className="font-medium underline underline-offset-4">
            Create one
          </Link>{" "}
          — or use a seeded demo account from the landing page.
        </AlertDescription>
      </Alert>
    </form>
  );
}
