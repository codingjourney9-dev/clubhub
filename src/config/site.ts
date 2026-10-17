/**
 * Static, client-safe application configuration.
 * Nothing in this file may read server-only env vars (see `src/lib/env.ts`).
 */

export const siteConfig = {
  name: "ClubHub",
  /** Shown by /api/health so a screenshot of the probe identifies the build. */
  version: "0.1.0",
  tagline: "Multi-tenant event operations for college clubs",
  description:
    "ClubHub gives every college one tenant, every club one workspace, and every event one pipeline: " +
    "Zod-validated event management, capacity-safe RSVPs, QR ticketing and offline-capable check-ins.",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  /** Fallback tenant timezone. Each Tenant row stores its own IANA zone (see docs/architecture.md). */
  fallbackTimezone: "Asia/Kolkata",
} as const;

export type PhaseStatus = "complete" | "in_progress" | "planned";

export interface PhaseRoadmapItem {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly status: PhaseStatus;
}

/**
 * Single source of truth for build progress. Rendered on the landing page so the
 * current state of the build is always visible in the UI itself.
 */
export const phaseRoadmap: readonly PhaseRoadmapItem[] = [
  {
    id: 1,
    title: "Initialization & Boilerplate",
    summary:
      "Next.js 15 App Router, Tailwind v4, shadcn/ui, strict TypeScript, request/response contracts, module skeleton.",
    status: "complete",
  },
  {
    id: 2,
    title: "Database & Auth",
    summary:
      "Prisma 7 schema with composite tenant FKs, migrations, idempotent seed, Auth.js v5 sessions, 51 automated tests.",
    status: "complete",
  },
  {
    id: 3,
    title: "Tenant & Club Scaffolding",
    summary:
      "Create tenants and clubs, invite members, and enforce the RBAC matrix in every route handler.",
    status: "complete",
  },
  {
    id: 4,
    title: "Event Management CRUD",
    summary:
      "Admin dashboard metrics, Zod-validated event forms, public vs member-only listings.",
    status: "complete",
  },
  {
    id: 5,
    title: "Ticketing & Concurrency",
    summary:
      "RSVP transactions with SELECT … FOR UPDATE capacity locking, waitlist promotion, QR ticket generation.",
    status: "complete",
  },
  {
    id: 6,
    title: "Scanner & Edge Cases",
    summary:
      "Mobile-first QR scanner, local offline queue for poor-network venues, automatic sync and conflict reporting.",
    status: "complete",
  },
  {
    id: 7,
    title: "Polish & Observability",
    summary:
      "Skeletons, toasts, empty/error states, structured logging and a responsive design pass.",
    status: "in_progress",
  },
] as const;
