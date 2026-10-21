/**
 * Demo accounts for the cookie-free preview at `/demo`.
 *
 * These are the same users created by `prisma/seed.ts`; the keys are used in the
 * URL (`/demo?as=kabir`) so the preview can switch between roles without any
 * sign-in. Client-safe: no secrets, no database access.
 */

export interface DemoAccount {
  readonly key: string;
  readonly email: string;
  readonly displayName: string;
  /** What makes this viewer interesting to look at. */
  readonly highlight: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    key: "aarav",
    email: "aarav.president@vit.ac.in",
    displayName: "Aarav Shah",
    highlight: "College Owner · President of Robotics · only a Member of Debate",
  },
  {
    key: "meera",
    email: "meera.manager@vit.ac.in",
    displayName: "Meera Patel",
    highlight: "Lead of Robotics — runs events, removes Members, posts announcements; cannot remove Leads",
  },
  {
    key: "kabir",
    email: "kabir.member@vit.ac.in",
    displayName: "Kabir Rao",
    highlight: "Plain Member of both clubs — the restricted view",
  },
  {
    key: "dean",
    email: "dean.admin@vit.ac.in",
    displayName: "Nisha Verma",
    highlight: "College Admin — authority across the college, but no club role",
  },
] as const;

export const DEFAULT_DEMO_KEY = "aarav";

/**
 * One deliberately public invite link, created by `prisma/seed.ts`.
 *
 * Every other invite URL is a secret that only a signed-in creator sees, so the
 * read-only preview would otherwise have no way to show the joining page. This
 * one is fixed, grants only `MEMBER` of a seeded development club, and is the
 * single link the preview is allowed to render.
 */
export const DEMO_INVITE_TOKEN = "demo-invite-robotics-club-000000000001";

export function findDemoAccount(key: string | undefined): DemoAccount {
  return (
    DEMO_ACCOUNTS.find((account) => account.key === key) ??
    DEMO_ACCOUNTS.find((account) => account.key === DEFAULT_DEMO_KEY) ??
    DEMO_ACCOUNTS[0]!
  );
}
