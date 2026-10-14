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
import type { ApiFailure, ApiSuccess, FieldErrors } from "@/types/api";

interface RegisteredUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export function SignUpForm() {
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
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const payload = (await response.json()) as ApiSuccess<{ user: RegisteredUser }> | ApiFailure;

    if (!payload.ok) {
      // Server-side field errors win over client-side ones: the server is the authority.
      const details = payload.error.details as FieldErrors | undefined;
      if (details) {
        for (const [field, messages] of Object.entries(details)) {
          const message = messages[0];
          if (message && field in values) {
            setError(field as keyof RegisterInput, { message });
          }
        }
      }
      toast.error("Could not create your account", { description: payload.error.message });
      return;
    }

    // Account created — sign the user straight in with the same credentials.
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (!result || result.error) {
      toast.success("Account created", { description: "Please sign in to continue." });
      router.push("/sign-in");
      return;
    }

    toast.success("Account created", { description: "Welcome to ClubHub." });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
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

      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <Alert>
        <AlertDescription>
          Already registered?{" "}
          <Link href="/sign-in" className="font-medium underline underline-offset-4">
            Sign in
          </Link>
        </AlertDescription>
      </Alert>
    </form>
  );
}
