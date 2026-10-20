/**
 * One sentence telling a guest *why* they were sent to sign in, based on where
 * they were trying to go. Without it, clicking "Start a new club" and landing on
 * a bare sign-in form feels like being thrown out.
 */
export function signInReason(returnTo: string): string | null {
  if (returnTo === "/onboarding" || returnTo.startsWith("/onboarding?")) {
    return "Starting a club needs an account, so we know who its President is.";
  }
  if (/^\/events\/[^/?#]+(?:[?#]|$)/.test(returnTo)) {
    return "Sign in to get your ticket — you'll come straight back to the event.";
  }
  return null;
}
