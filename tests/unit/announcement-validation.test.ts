import { describe, expect, it } from "vitest";

import {
  createAnnouncementSchema,
  pinAnnouncementSchema,
  updateAnnouncementSchema,
} from "../../src/lib/validation/announcement";
import { transferPresidencySchema, updateClubMemberRoleSchema } from "../../src/lib/validation/club";
import { CLUB_ROLE_LABELS, clubRoleLabel } from "../../src/lib/domain/club-roles";

describe("announcement validation", () => {
  it("trims, and turns Windows line endings into plain newlines", () => {
    const parsed = createAnnouncementSchema.parse({ title: "  Hi  ", body: " line 1\r\nline 2 " });
    expect(parsed).toEqual({ title: "Hi", body: "line 1\nline 2" });
  });

  it("rejects blank or over-long text with plain-English messages", () => {
    const blank = createAnnouncementSchema.safeParse({ title: "   ", body: "   " });
    expect(blank.success).toBe(false);
    expect(blank.error?.issues.map((issue) => issue.message)).toEqual([
      "Give the announcement a title.",
      "Write a message.",
    ]);
    expect(createAnnouncementSchema.safeParse({ title: "x".repeat(121), body: "ok" }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({ title: "ok", body: "x".repeat(4001) }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({ title: "ok", body: "x".repeat(4000) }).success).toBe(true);
  });

  it("refuses unknown fields, so nobody can set an author or a date", () => {
    expect(
      createAnnouncementSchema.safeParse({ title: "a", body: "b", authorId: "someone-else" }).success,
    ).toBe(false);
  });

  it("needs something to change on edit, and a real boolean to pin", () => {
    expect(updateAnnouncementSchema.safeParse({}).success).toBe(false);
    expect(updateAnnouncementSchema.safeParse({ body: "new" }).success).toBe(true);
    expect(pinAnnouncementSchema.safeParse({ pinned: "yes" }).success).toBe(false);
  });
});

describe("role validation (Phase 10)", () => {
  it("only moves people between Member and Lead — President is refused with a pointer", () => {
    expect(updateClubMemberRoleSchema.safeParse({ role: "EVENT_MANAGER" }).success).toBe(true);
    const president = updateClubMemberRoleSchema.safeParse({ role: "PRESIDENT" });
    expect(president.success).toBe(false);
    expect(president.error?.issues[0]?.message).toContain("Hand over presidency");
  });

  it("hand-over needs a person, a choice for the outgoing President, and the typed club name", () => {
    const valid = {
      newPresidentUserId: "33333333-3333-4333-8333-000000000003",
      formerPresidentBecomes: "MEMBER",
      confirmClubName: "Robotics Club",
    };
    expect(transferPresidencySchema.safeParse(valid).success).toBe(true);
    expect(transferPresidencySchema.safeParse({ ...valid, formerPresidentBecomes: "PRESIDENT" }).success).toBe(false);
    expect(transferPresidencySchema.safeParse({ ...valid, confirmClubName: "  " }).success).toBe(false);
    expect(transferPresidencySchema.safeParse({ ...valid, newPresidentUserId: "nope" }).success).toBe(false);
  });

  it("shows EVENT_MANAGER to people as 'Lead'", () => {
    expect(CLUB_ROLE_LABELS.EVENT_MANAGER).toBe("Lead");
    expect(clubRoleLabel("PRESIDENT")).toBe("President");
    expect(clubRoleLabel(null)).toBe("");
  });
});
