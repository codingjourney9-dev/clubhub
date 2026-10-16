/**
 * Maps a failed Auth.js sign-in to a message that names the ACTUAL cause.
 *
 * Why this exists: `signIn()` reports several very different problems through
 * the same `{ error }` shape. Treating them all as "wrong password" tells a user
 * with a correct password to keep retyping it — a dead end. The failure modes
 * were captured from the real server and are covered by
 * `tests/unit/sign-in-errors.test.ts`:
 *
 *   correct password + cookies  →  { url: ".../dashboard" }            (success)
 *   wrong password              →  ?error=CredentialsSignin&code=credentials
 *   correct password, no cookies→  ?error=MissingCSRF
 *
 * The last one is what a sandboxed preview frame produces, because it cannot
 * store the CSRF cookie at all.
 */

export type SignInFailureKind = "cookies-blocked" | "bad-credentials" | "unknown";

export interface SignInFailure {
  readonly kind: SignInFailureKind;
  readonly title: string;
  readonly message: string;
  /** Whether to point the inline field error at the password box. */
  readonly highlightPassword: boolean;
}

export interface SignInOutcome {
  /** `error` from the Auth.js response URL, e.g. "CredentialsSignin", "MissingCSRF". */
  readonly error?: string | undefined;
  /** `code` from the Auth.js response URL, e.g. "credentials". */
  readonly code?: string | undefined;
  /** Result of the browser-side cookie probe. */
  readonly cookiesBlocked: boolean;
}

const COOKIE_BLOCKED: Omit<SignInFailure, "kind"> = {
  title: "This view blocks cookies",
  message:
    "Signing in needs cookies to remember your session, and this embedded preview is not allowed " +
    "to store them — so the sign-in request is rejected before your password is even checked. " +
    "Open the app in its own browser tab and sign in there.",
  highlightPassword: false,
};

const BAD_CREDENTIALS: Omit<SignInFailure, "kind"> = {
  title: "Sign-in did not complete",
  message:
    "The server rejected that email and password. If your browser filled the password field " +
    "automatically, clear it and type it yourself — autofill is the most common cause. " +
    "The demo password is password123.",
  highlightPassword: true,
};

const UNKNOWN: Omit<SignInFailure, "kind"> = {
  title: "Sign-in did not complete",
  message:
    "The sign-in request failed for an unexpected reason. Please try again, and if it keeps " +
    "failing run `npm run doctor` for a full diagnosis.",
  highlightPassword: false,
};

export function describeSignInFailure(outcome: SignInOutcome): SignInFailure {
  const { error, code, cookiesBlocked } = outcome;

  // Most specific first: the CSRF check failing is a cookie problem, never a
  // password problem.
  if (error === "MissingCSRF" || code === "csrf" || error === "CSRF") {
    return { kind: "cookies-blocked", ...COOKIE_BLOCKED };
  }

  // The server explicitly checked the credentials and rejected them.
  if (error === "CredentialsSignin" || code === "credentials") {
    return { kind: "bad-credentials", ...BAD_CREDENTIALS };
  }

  // Any other named error is a real failure, but not one we can attribute to the
  // password — say so instead of blaming the user.
  if (error) {
    return { kind: "unknown", ...UNKNOWN };
  }

  // No error code came back, yet we know cookies cannot be stored: the session
  // was established but could not persist, which looks like "nothing happened".
  if (cookiesBlocked) {
    return { kind: "cookies-blocked", ...COOKIE_BLOCKED };
  }

  return { kind: "unknown", ...UNKNOWN };
}
