"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authHref, safeCallbackUrl } from "@/lib/auth/callback-url";
import { describeSignInFailure, type SignInFailure } from "@/lib/auth/sign-in-errors";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

/**
 * Client-side validation gives instant feedback; the credentials provider
 * re-validates the same schema server-side. Client checks are UX only.
 *
 * Three failure modes used to look identical to the person clicking the button.
 * `describeSignInFailure()` now separates them:
 *
 *  1. Server not running        → 4s health preflight names the cause.
 *  2. Cookies blocked (embedded preview) → Auth.js returns `MissingCSRF`; sign-in
 *     genuinely cannot complete in a frame that cannot store cookies, so the form
 *     says so and points at the cookie-free /demo preview instead of blaming the
 *     password. (Opening the preview URL in a separate tab does not work either —
 *     that host only serves inside the chat.)
 *  3. Wrong password            → explicit message + a show-password toggle, so a
 *     browser-autofilled value is visible rather than mysterious.
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
      document.cookie = `${COOKIE_PROBE}=; path=/; Max-Age=0; SameSite=Lax`;
      setBlocked(!stored);
    } catch {
      // Reading document.cookie can throw outright inside a sandboxed frame.
      setBlocked(true);
    }
  }, []);

  return blocked;
}

export function SignInForm({
  callbackUrl = "/dashboard",
  demoMode = false,
}: {
  callbackUrl?: string;
  /**
   * Practice accounts, the `/demo` preview and developer hints exist only in
   * demo mode. The live site must not advertise a password that does not work
   * there, or link to a page that answers 404.
   */
  demoMode?: boolean;
}) {
  const router = useRouter();
  const cookiesBlocked = useCookiesBlocked();
  const [failure, setFailure] = useState<SignInFailure | null>(null);
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
    setFailure(null);

    try {
      const health = await fetchWithTimeout("/api/health", PREFLIGHT_TIMEOUT_MS);
      if (!health.ok) throw new Error(`health responded ${health.status}`);
    } catch {
      setFailure({
        kind: "unknown",
        title: "The app server isn't responding",
        message: demoMode
          ? "In this sandbox the server stops when the session restarts. Start it with " +
            "`npm run app:up`, then try again."
          : "ClubHub could not be reached. Check your internet connection and try again in a moment.",
        highlightPassword: false,
      });
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
        const described = describeSignInFailure({
          error: result?.error ?? undefined,
          code: result?.code ?? undefined,
          cookiesBlocked,
          demoMode,
        });

        setFailure(described);
        if (described.highlightPassword) {
          // Reveal the field: if autofill inserted something unexpected, it should
          // be visible rather than hidden behind dots.
          setShowPassword(true);
          setError("password", { message: "Incorrect email or password." });
          toast.error("Sign-in failed", { description: "Check your email and password." });
        } else {
          toast.error(described.title, { description: described.message });
        }
        return;
      }

      toast.success("Signed in");
      router.push(safeCallbackUrl(callbackUrl));
      router.refresh();
    } catch (error) {
      if (error instanceof TimeoutError) {
        setFailure({
          kind: "unknown",
          title: "The server never replied",
          message: "It may have restarted mid-request. Wait a moment and press Sign in again.",
          highlightPassword: false,
        });
      } else {
        setFailure({
          kind: "unknown",
          title: "Sign-in could not complete",
          message: demoMode
            ? "The network request failed. Check the app is running with `npm run doctor`."
            : "The network request failed. Check your internet connection and try again.",
          highlightPassword: false,
        });
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
        <Alert className="border-dashed border-primary/45 bg-primary/[0.06]">
          <TriangleAlert className="text-primary" />
          <AlertTitle>
            {demoMode ? "This view blocks cookies — use the demo instead" : "This view blocks cookies"}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              Cookies are how the app remembers that you are logged in. This embedded preview is not
              allowed to store them, so sign-in cannot complete here no matter what you type — the
              request is refused before your password is checked.
            </span>
            {demoMode ? (
              <>
                <span>
                  You do not need to sign in to review the app: the read-only demo renders the same
                  dashboard data from the same database, with no cookies required.
                </span>
                <Link href="/demo" className={cn(buttonVariants({ size: "sm" }), "self-start")}>
                  Open the demo dashboard
                  <ArrowRight data-icon="inline-end" />
                </Link>
                <span className="text-xs text-muted-foreground">
                  Running the app on your own machine (
                  <code className="font-mono">npm run dev</code>)? Sign-in works normally there.
                </span>
              </>
            ) : (
              <span>
                Open ClubHub in its own browser tab (or allow cookies for this site) and sign in
                there.
              </span>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {failure ? (
        <Alert variant={failure.kind === "cookies-blocked" ? "default" : "destructive"}>
          <AlertTitle>{failure.title}</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
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
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
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

      <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2 w-full">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      {demoMode ? (
      <Alert>
        <AlertDescription className="flex flex-col gap-1">
          <span>Demo account — type these by hand if your browser autofills the fields:</span>
          <span className="font-mono text-xs">
            aarav.president@vit.ac.in&nbsp;&nbsp;/&nbsp;&nbsp;password123
          </span>
          <span className="text-xs text-muted-foreground">
            Prefer not to sign in at all?{" "}
            <Link href="/demo" className="font-medium underline underline-offset-4">
              Open the read-only demo dashboard
            </Link>
          </span>
        </AlertDescription>
      </Alert>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          New to ClubHub?{" "}
          <Link href={authHref("/sign-up", callbackUrl)} className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      )}
    </form>
  );
}
