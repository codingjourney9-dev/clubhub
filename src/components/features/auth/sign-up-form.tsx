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
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";
import { callApi, fieldErrorsOf, notifyFailure } from "@/lib/api/client";
import { authHref, safeCallbackUrl } from "@/lib/auth/callback-url";

interface RegisteredUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export function SignUpForm({ callbackUrl }: { callbackUrl?: string } = {}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });

  async function onSubmit(values: RegisterInput) {
    const result = await callApi<{ user: RegisteredUser }>("/api/auth/register", {
      method: "POST",
      json: values,
    });

    if (!result.ok) {
      // Server-side field errors win over client-side ones: the server is the authority.
      for (const [field, message] of Object.entries(fieldErrorsOf(result))) {
        if (message && field in values) {
          setError(field as keyof RegisterInput, { message });
        }
      }
      notifyFailure(result, "Could not create your account");
      return;
    }

    // Account created — sign the user straight in with the same credentials.
    const signInResult = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (!signInResult || signInResult.error) {
      toast.success("Account created", { description: "Please sign in to continue." });
      router.push(authHref("/sign-in", callbackUrl));
      return;
    }

    toast.success("Account created", { description: "Welcome to ClubHub." });
    router.push(safeCallbackUrl(callbackUrl));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            autoComplete="given-name"
            aria-invalid={Boolean(errors.firstName)}
            {...register("firstName")}
          />
          {errors.firstName ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.firstName.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            autoComplete="family-name"
            aria-invalid={Boolean(errors.lastName)}
            {...register("lastName")}
          />
          {errors.lastName ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.lastName.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">College email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@vit.ac.in"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        {errors.email ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby="password-hint"
          {...register("password")}
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least 8 characters.
        </p>
        {errors.password ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2 w-full">
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <Alert>
        <AlertDescription>
          Already registered?{" "}
          <Link href={authHref("/sign-in", callbackUrl)} className="font-medium underline underline-offset-4">
            Sign in
          </Link>
        </AlertDescription>
      </Alert>
    </form>
  );
}
