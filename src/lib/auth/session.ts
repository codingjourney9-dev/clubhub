import "server-only";

import { cache } from "react";

import { ApiError } from "@/lib/api/response";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { annotateRequest } from "@/lib/observability/context";

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

/**
 * The signed-in user's id, straight from the session cookie — no database trip.
 *
 * The guards use it to start their permission lookups *at the same time* as the
 * user lookup instead of after it. Against a remote database that is one whole
 * round trip saved on every page. Trusting the id is safe: the cookie is signed,
 * and the guards still wait for `requireUser()` (which checks the account still
 * exists and is not deleted) before returning anything.
 */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const session = await auth();
  return session?.user?.id ?? null;
});

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const userId = await getSessionUserId();
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

  // Whoever this request turns out to be acting as, every log line from here on
  // can say so. An id, never the email address.
  annotateRequest({ userId: user.id });

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
