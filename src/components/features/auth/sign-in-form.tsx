"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Eye, EyeOff, ExternalLink, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

/**
 * Client-side validation gives instant feedback; the credentials provider
 * re-validates the same schema server-side. Client checks are UX only.
 *
 * THREE failure modes are handled explicitly, because all three used to look
 * identical to the person clicking the button:
 *
 *  1. Server not running → 4s health preflight, named cause + how to start it.
 *  2. Cookies blocked (sandboxed preview frame) → Auth.js reports NO error at all
 *     and you simply land back on this page. A cookie probe warns first.
 *  3. Wrong password (often browser autofill) → explicit message plus a
 *     show-password toggle so the field's real contents are visible.
 *
 * Auth.js's client `signIn()` makes three sequential requests and none have a
 * timeout, so it is also raced against a deadline here.
 */

const PREFLIGHT_TIMEOUT_MS = 4_000;
const SIGN_IN_TIMEOUT_MS = 12_000;
const COOKIE_PROBE = "clubhub_cookie_probe";

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

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function useCookiesBlocked(): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    try {
      document.cookie = `${COOKIE_PROBE}=1; path=/; SameSite=Lax`;
      const stored = document.cookie.includes(`${COOKIE_PROBE}=`);
      // Clean up so the probe never lingers.
      document.cookie = `${COOKIE_PROBE}=; path=/; Max-Age=0; SameSite=Lax`;
      setBlocked(!stored);
    } catch {
      // Accessing document.cookie can throw outright in a sandboxed frame.
      setBlocked(true);
    }
  }, []);

  return blocked;
}

export function SignInForm({ callbackUrl = "/dashboard" }: { callbackUrl?: string }) {
  const router = useRouter();
  const cookiesBlocked = useCookiesBlocked();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
    // Autofilled values are exactly what we want to inspect on failure.
    setShowPassword(true);

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
        // The server explicitly rejected these credentials.
        setError("password", { message: "Incorrect email or password." });
        setFormError(
          "The server rejected that email/password combination. If your browser filled the password " +
            "automatically, clear the field and type it yourself — autofill is the most common cause. " +
            "The demo password is password123.",
        );
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
      {cookiesBlocked ? (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <TriangleAlert className="text-amber-600" />
          <AlertTitle>This view blocks cookies — sign-in cannot work here</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              Cookies are how a site remembers you are logged in. This embedded preview blocks them, so
              you would land back on this page with no error message. Open the page in its own browser
              tab instead:
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => window.open(window.location.href, "_blank", "noopener")}
            >
              <ExternalLink data-icon="inline-start" />
              Open in a new tab
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

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
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          {/* Reveals what is actually in the field — the fastest way to spot autofill. */}
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            {showPassword ? "Hide" : "Show"} password
          </button>
        </div>
        <Input
          id="password"
          type={showPassword ? "text" : "password"}
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
        <AlertDescription className="flex flex-col gap-1">
          <span>
            Demo account — click the fields and type these by hand if your browser autofills them:
          </span>
          <span className="font-mono text-xs">
            aarav.president@vit.ac.in&nbsp;&nbsp;/&nbsp;&nbsp;password123
          </span>
          <span className="text-xs text-muted-foreground">
            No account of your own yet?{" "}
            <Link href="/sign-up" className="font-medium underline underline-offset-4">
              Create one
            </Link>
          </span>
        </AlertDescription>
      </Alert>
    </form>
  );
}
