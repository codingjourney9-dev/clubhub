import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/lib/auth/auth.config";
import { db } from "@/lib/db/client";
import { loginSchema } from "@/lib/validation/auth";

/**
 * Node-runtime auth instance: credentials sign-in backed by Postgres.
 *
 * Session strategy is JWT (see auth.config.ts) and the token carries identity
 * only. Authorisation always re-reads memberships from the database, so a
 * removed club role takes effect on the next request instead of when the
 * session expires.
 */

/**
 * Compared against when no user matches, so a missing account costs the same
 * time as a wrong password (prevents user enumeration by timing).
 */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZKZ0iJcD0B.fXk2G9yQ1uJ0nW9lxCy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await db.user.findFirst({
          where: { email, deletedAt: null },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            passwordHash: true,
          },
        });

        const hash = user?.passwordHash ?? DUMMY_HASH;
        const passwordMatches = await bcrypt.compare(password, hash);

        if (!user || !user.passwordHash || !passwordMatches) return null;

        const displayName =
          [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

        return {
          id: user.id,
          email: user.email,
          name: displayName,
          image: user.avatarUrl ?? undefined,
        };
      },
    }),
  ],
});
