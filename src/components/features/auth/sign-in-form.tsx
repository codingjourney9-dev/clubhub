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
import { describeSignInFailure, type SignInFailure } from "@/lib/auth/sign-in-errors";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

/**
 * Client-side validation gives instant feedback; the credentials provider
 * re-validates the same schema server-side. Client checks are UX only.
 *
 * Three failure modes used to look identical to the person clicking the button.
 * They are now separated by `describeSignInFailure()`:
 *
 *  1. Server not running → 4s health preflight names the cause.
 *  2. Cookies blocked (sandboxed preview) → Auth.js returns `MissingCSRF`, and no
 *     cookie can be stored, so sign-in genuinely cannot complete here. The page
 *     detects this up front and offers a way out instead of blaming the password.
 *  3. Wrong password → explicit message plus a show-password toggle, so a
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

export function SignInForm({ callbackUrl = "/dashboard" }: { callbackUrl?: string }) {
  const router = useRouter();
  const cookiesBlocked = useCookiesBlocked();
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    // Full href, not origin+pathname: the preview URL carries an access token in
    // its query string, so trimming it produces a link that returns 403.
    setAppUrl(window.location.href);
  }, []);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function openInNewTab() {
    const opened = window.open(appUrl, "_blank", "noopener");
    // Sandboxed frames often block popups — if that happened, tell the user how
    // to get there manually rather than leaving a button that appears broken.
    if (!opened) {
      toast.info("Pop-up blocked", {
        description: "Copy the address shown below into a new browser tab.",
      });
    }
  }

  async function onSubmit(values: LoginInput) {
    setFailure(null);

    try {
      const health = await fetchWithTimeout("/api/health", PREFLIGHT_TIMEOUT_MS);
      if (!health.ok) throw new Error(`health responded ${health.status}`);
    } catch {
      setFailure({
        kind: "unknown",
        title: "The app server isn't responding",
        message:
          "In this sandbox the server stops when the session restarts. Start it with " +
          "`npm run app:up`, then try again.",
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
        });

        setFailure(described);
        // Show the field contents: if autofill put something unexpected there,
        // it should be visible rather than hidden behind dots.
        if (described.highlightPassword) setShowPassword(true);
        if (described.highlightPassword) {
          setError("password", { message: "Incorrect email or password." });
          toast.error("Sign-in failed", { description: "Check your email and password." });
        } else {
          toast.error(described.title, { description: described.message });
        }
        return;
      }

      toast.success("Signed in");
      router.push(callbackUrl);
      router.refresh();
    } catch (error) {
      if (error instanceof TimeoutError) {
        setFailure({
          kind: "unknown",
          title: "The server never replied",
          message:
            "It may have restarted mid-request. Wait a moment and press Sign in again.",
          highlightPassword: false,
        });
      } else {
        setFailure({
          kind: "unknown",
          title: "Sign-in could not complete",
          message: "The network request failed. Check the app is running with `npm run doctor`.",
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
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <TriangleAlert className="text-amber-600" />
          <AlertTitle>This view blocks cookies — sign in from a browser tab</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              Cookies are how the app remembers that you are logged in. This embedded preview is not
              allowed to store them, so sign-in cannot complete here no matter what you type.
            </span>
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={openInNewTab}>
              <ExternalLink data-icon="inline-start" />
              Open in a new tab
            </Button>
            {appUrl ? (
              <code className="text-[11px] break-all rounded bg-background/60 px-1.5 py-1">{appUrl}</code>
            ) : null}
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
          <span>Demo account — type these by hand if your browser autofills the fields:</span>
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
