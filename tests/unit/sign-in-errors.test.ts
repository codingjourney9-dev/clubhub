import { describe, expect, it } from "vitest";

import { describeSignInFailure } from "@/lib/auth/sign-in-errors";

/**
 * These cases mirror responses captured from the running server, so the UI can
 * never again tell a user with a correct password that their password is wrong.
 */
describe("describeSignInFailure()", () => {
  it("attributes a CSRF failure to cookies, not to the password", () => {
    const failure = describeSignInFailure({ error: "MissingCSRF", cookiesBlocked: true });
    expect(failure.kind).toBe("cookies-blocked");
    expect(failure.highlightPassword).toBe(false);
    expect(failure.message).toMatch(/cookies/i);
  });

  it("treats a CSRF failure as a cookie problem even when the probe did not notice", () => {
    const failure = describeSignInFailure({ error: "MissingCSRF", cookiesBlocked: false });
    expect(failure.kind).toBe("cookies-blocked");
  });

  it("reports genuinely bad credentials as bad credentials", () => {
    const failure = describeSignInFailure({
      error: "CredentialsSignin",
      code: "credentials",
      cookiesBlocked: false,
    });
    expect(failure.kind).toBe("bad-credentials");
    expect(failure.highlightPassword).toBe(true);
  });

  it("never blames the password for an unknown provider error", () => {
    const failure = describeSignInFailure({ error: "Configuration", cookiesBlocked: false });
    expect(failure.kind).toBe("unknown");
    expect(failure.highlightPassword).toBe(false);
  });

  it("treats a silent failure with blocked cookies as a cookie problem", () => {
    // Auth.js returns no error at all when the session simply cannot persist.
    const failure = describeSignInFailure({ cookiesBlocked: true });
    expect(failure.kind).toBe("cookies-blocked");
  });

  it("falls back to a generic message when nothing is known", () => {
    const failure = describeSignInFailure({ cookiesBlocked: false });
    expect(failure.kind).toBe("unknown");
  });

  it("prefers the explicit credential error when both signals are present", () => {
    // Cookies work (so CSRF passed) AND the server rejected the password.
    const failure = describeSignInFailure({
      error: "CredentialsSignin",
      code: "credentials",
      cookiesBlocked: true,
    });
    expect(failure.kind).toBe("bad-credentials");
  });
});
