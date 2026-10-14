import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/auth.config";

/**
 * Edge middleware. It imports the database-free half of the auth config, so the
 * Prisma client never ends up in the edge bundle.
 *
 * `authorized` (in auth.config.ts) decides access; NextAuth redirects
 * unauthenticated users to /sign-in with a callbackUrl.
 */
export const { auth: middleware } = NextAuth(authConfig);

/** Must stay in sync with PROTECTED_PREFIXES in src/lib/auth/auth.config.ts. */
export const config = {
  matcher: ["/dashboard/:path*", "/scanner/:path*", "/onboarding/:path*"],
};
