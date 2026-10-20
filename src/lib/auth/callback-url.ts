/**
 * Where to send someone after they sign in or create an account.
 *
 * The value arrives in the address bar (`/sign-in?callbackUrl=/onboarding`), so
 * anyone can craft a link with any value in it. Following it blindly is the
 * classic "open redirect": a phishing mail links to *our* sign-in page, the
 * student signs in for real, and is then bounced to `https://evil.example`
 * that looks like ClubHub and asks for the password "again".
 *
 * Rule: only paths on this site are accepted — a single leading `/`, never
 * `//host` or `/\host` (both of which browsers treat as "another website"),
 * and no control characters. Everything else falls back to the dashboard.
 */
export const DEFAULT_AFTER_SIGN_IN = "/dashboard";

const MAX_LENGTH = 512;

export function safeCallbackUrl(raw: unknown, fallback: string = DEFAULT_AFTER_SIGN_IN): string {
  if (typeof raw !== "string") return fallback;

  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_LENGTH) return fallback;
  if (!value.startsWith("/")) return fallback;
  // "//evil.example" and "/\evil.example" are protocol-relative URLs.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Tabs and newlines are stripped by browsers, so "/\t/evil.example" becomes "//evil.example".
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  // Never loop back into the auth pages themselves.
  if (/^\/(sign-in|sign-up)(?:[/?#]|$)/.test(value)) return fallback;

  return value;
}

/** `/sign-in?callbackUrl=…` (or `/sign-up`) carrying a safe return path. */
export function authHref(page: "/sign-in" | "/sign-up", returnTo: string | null | undefined): string {
  const target = safeCallbackUrl(returnTo, "");
  return target ? `${page}?callbackUrl=${encodeURIComponent(target)}` : page;
}
