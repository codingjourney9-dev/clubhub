import "server-only";

import { cache } from "react";

import { ApiError } from "@/lib/api/response";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";

/**
 * Request-scoped identity helpers.
 *
 * `cache()` dedupes the work inside a single render pass, so a page and three
 * components can all ask "who is this?" for the price of one query. Phase 3
 * builds tenant/club guards on top of `requireUser()`.
 */

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly avatarUrl: string | null;
  readonly timezone: string | null;
  readonly displayName: string;
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      timezone: true,
    },
  });

  if (!user) return null;

  return {
    ...user,
    displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
  };
});

/** Same as `getCurrentUser()`, but fails the request instead of returning null. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw ApiError.unauthorized();
  return user;
}
