import type { DefaultSession } from "next-auth";

/**
 * Session shape after augmentation. The JWT carries identity only; tenant and
 * club roles are loaded per request in `src/lib/auth/session.ts`.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
