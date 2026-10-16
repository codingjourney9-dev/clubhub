"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

/**
 * Client-side validation gives instant feedback; the credentials provider
 * re-validates the same schema server-side. Client checks are UX only.
 *
 * Every network call below is bounded by a timeout. Auth.js's client `signIn`
 * makes three sequential requests (providers → csrf → callback) and none of them
 * have a timeout of their own, so a server that is down *mid-request* used to
 * leave the button spinning forever with no explanation. A hung request is now
 * reported as a specific, actionable error instead.
 */

const PREFLIGHT_TIMEOUT_MS = 4_000;
const SIGN_IN_TIMEOUT_MS = 12_000;

class TimeoutError extends Error {
  constructor(readonly label: string) {
    super(`Timed out: ${label}`);
    this.name = "TimeoutError";
  }
}

function rejectionAfter(ms: number, label: string): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label)), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

/** fetch() with an AbortController-backed deadline. */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

export function SignInForm({ callbackUrl = "/dashboard" }: { callbackUrl?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

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
    setFormError(null);

    // ── Preflight ────────────────────────────────────────────────────────────
    // A 4-second health check turns "the server is not running" into a precise
    // message instead of an indefinite spinner.
    try {
      const health = await fetchWithTimeout("/api/health", PREFLIGHT_TIMEOUT_MS);
      if (!health.ok) throw new Error(`health responded ${health.status}`);
    } catch {
      setFormError(
        "The app server isn't responding. In this sandbox it stops when the session restarts — " +
          "start it with `npm run app:up`, then try again.",
      );
      toast.error("Server not reachable", { description: "Nothing was submitted." });
      return;
    }

    // ── Sign-in ──────────────────────────────────────────────────────────────
    const guard = rejectionAfter(SIGN_IN_TIMEOUT_MS, "signIn");

    try {
      const result = await Promise.race([
        signIn("credentials", {
          email: values.email,
          password: values.password,
          redirect: false,
        }),
        guard.promise,
      ]);

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
    } catch (error) {
      if (error instanceof TimeoutError) {
        setFormError(
          "The server accepted the request but never replied. It may have restarted mid-flight — " +
            "wait a moment and press Sign in again.",
        );
      } else {
        setFormError(
          "Couldn't complete sign-in because the network request failed. If you are viewing this " +
            "inside the chat preview, open the preview URL in a separate browser tab and try there.",
        );
      }
      toast.error("Sign-in could not complete");
      console.error("[sign-in]", error);
    } finally {
      guard.cancel();
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Sign-in did not complete</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

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
          — or use a seeded demo account: <code className="font-mono text-xs">aarav.president@vit.ac.in</code> /{" "}
          <code className="font-mono text-xs">password123</code>
        </AlertDescription>
      </Alert>
    </form>
  );
}
