import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the auth configuration.
 *
 * `src/middleware.ts` runs on the edge runtime, where the Prisma client cannot
 * load. This file therefore contains no database imports — only session policy,
 * redirect rules and the `authorized` gate. The credentials provider (which
 * needs bcrypt + Postgres) is added in `src/lib/auth/index.ts` for the Node
 * runtime.
 */

/** Route prefixes that require a signed-in user. Kept in sync with `config.matcher` in middleware.ts. */
/**
 * `/dashboard` is deliberately NOT here: guests browse it too (public events
 * from every college). The page itself decides what a guest sees.
 */
export const PROTECTED_PREFIXES = ["/scanner", "/onboarding", "/door"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const authConfig = {
  // The app is served behind a reverse proxy (including the sandbox preview),
  // so the forwarded host must be trusted when building callback URLs.
  trustHost: true,
  session: {
    // Stateless sessions: identity only. Roles are re-read from the database on
    // every request (src/lib/auth/session.ts) so revocation is immediate.
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
  },
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  providers: [],
  callbacks: {
    /** Middleware gate: unauthenticated hits on protected paths redirect to sign-in. */
    authorized({ auth, request }) {
      if (!isProtectedPath(request.nextUrl.pathname)) return true;
      return Boolean(auth?.user);
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
