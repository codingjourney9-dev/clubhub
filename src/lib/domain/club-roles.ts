import type { ClubRole } from "@/generated/prisma/enums";

/**
 * How club roles are NAMED to people.
 *
 * The database keeps `EVENT_MANAGER` (renaming an enum value would touch every
 * deployed database for no behavioural gain); everyone sees "Lead". Every
 * screen goes through this map, so the wording lives in one place.
 */
export const CLUB_ROLE_LABELS: Record<ClubRole, string> = {
  PRESIDENT: "President",
  EVENT_MANAGER: "Lead",
  MEMBER: "Member",
};

/** One line on what each role can do — used in role pickers and the demo. */
export const CLUB_ROLE_SUMMARIES: Record<ClubRole, string> = {
  PRESIDENT: "Runs the club: everything a Lead can do, plus promoting, removing Leads and handing over.",
  EVENT_MANAGER: "Creates and runs events, works the door, removes Members, posts announcements.",
  MEMBER: "Gets members-only events and announcements.",
};

export function clubRoleLabel(role: ClubRole | null | undefined): string {
  return role ? CLUB_ROLE_LABELS[role] : "";
}

/** Roles a President can move people between. Presidency itself only changes by handing over. */
export const PROMOTABLE_CLUB_ROLES = ["MEMBER", "EVENT_MANAGER"] as const satisfies readonly ClubRole[];
export type PromotableClubRole = (typeof PROMOTABLE_CLUB_ROLES)[number];
