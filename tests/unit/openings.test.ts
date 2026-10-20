import { describe, expect, it } from "vitest";

import { canDecideApplication, canManageOpening, offerableOpeningRoles } from "../../src/lib/auth/rbac";
import {
  ANSWER_MAX,
  applyBlockedReason,
  isOpeningOpen,
  OPENING_MAX_QUESTIONS,
  openingState,
} from "../../src/lib/domain/openings";
import {
  applySchema,
  createOpeningSchema,
  decideApplicationSchema,
  updateOpeningSchema,
} from "../../src/lib/validation/opening";

/** Phase 11 — the recruitment board's pure rules. */

const now = new Date("2026-10-20T10:00:00Z");
const later = new Date("2026-10-21T10:00:00Z");
const earlier = new Date("2026-10-19T10:00:00Z");

describe("openingState", () => {
  it("is open with no date or a future date", () => {
    expect(openingState({ status: "OPEN", closesAt: null }, now)).toBe("open");
    expect(openingState({ status: "OPEN", closesAt: later }, now)).toBe("open");
  });
  it("closes by itself when the date passes — exactly at the minute, too", () => {
    expect(openingState({ status: "OPEN", closesAt: earlier }, now)).toBe("date_passed");
    expect(openingState({ status: "OPEN", closesAt: now }, now)).toBe("date_passed");
  });
  it("a hand-closed opening stays closed whatever the date says", () => {
    expect(openingState({ status: "CLOSED", closesAt: later }, now)).toBe("closed");
    expect(isOpeningOpen({ status: "CLOSED", closesAt: null }, now)).toBe(false);
  });
});

describe("applyBlockedReason", () => {
  it("lets outsiders apply to anything", () => {
    expect(applyBlockedReason(null, "MEMBER")).toBeNull();
    expect(applyBlockedReason(null, "EVENT_MANAGER")).toBeNull();
  });
  it("lets a Member apply only for Lead", () => {
    expect(applyBlockedReason("MEMBER", "MEMBER")).not.toBeNull();
    expect(applyBlockedReason("MEMBER", "EVENT_MANAGER")).toBeNull();
  });
  it("Leads and the President can't apply to their own club", () => {
    for (const offered of ["MEMBER", "EVENT_MANAGER"] as const) {
      expect(applyBlockedReason("EVENT_MANAGER", offered)).not.toBeNull();
      expect(applyBlockedReason("PRESIDENT", offered)).not.toBeNull();
    }
  });
});

describe("who manages which opening", () => {
  const president = { tenantRole: "MEMBER", clubRole: "PRESIDENT" } as const;
  const lead = { tenantRole: "MEMBER", clubRole: "EVENT_MANAGER" } as const;
  const member = { tenantRole: "MEMBER", clubRole: "MEMBER" } as const;
  const collegeAdmin = { tenantRole: "ADMIN", clubRole: null } as const;
  const stranger = { tenantRole: null, clubRole: null } as const;

  it("Leads post and decide Member openings only", () => {
    expect(canManageOpening(lead, "MEMBER")).toBe(true);
    expect(canManageOpening(lead, "EVENT_MANAGER")).toBe(false);
    expect(canDecideApplication(lead, "EVENT_MANAGER")).toBe(false);
    expect(offerableOpeningRoles(lead)).toEqual(["MEMBER"]);
  });
  it("the President and college admins handle both", () => {
    expect(offerableOpeningRoles(president)).toEqual(["MEMBER", "EVENT_MANAGER"]);
    expect(offerableOpeningRoles(collegeAdmin)).toEqual(["MEMBER", "EVENT_MANAGER"]);
  });
  it("Members and strangers handle none", () => {
    expect(offerableOpeningRoles(member)).toEqual([]);
    expect(offerableOpeningRoles(stranger)).toEqual([]);
  });
  it("nobody ever offers the presidency", () => {
    expect(canManageOpening(president, "PRESIDENT")).toBe(false);
    expect(canManageOpening(collegeAdmin, "PRESIDENT")).toBe(false);
  });
});

describe("createOpeningSchema", () => {
  const valid = {
    title: "  Electronics team member ",
    description: "Wire things.\r\nSolder things.",
    role: "MEMBER",
    questions: ["Why do you want this role?"],
  };

  it("accepts a minimal opening and tidies it", () => {
    const parsed = createOpeningSchema.parse({ ...valid, requirements: "  ", closesAt: "" });
    expect(parsed.title).toBe("Electronics team member");
    expect(parsed.description).toBe("Wire things.\nSolder things.");
    expect(parsed.requirements).toBeNull();
    expect(parsed.closesAt).toBeNull();
  });
  it("refuses a Presidency opening, zero or four questions, and blank questions", () => {
    expect(createOpeningSchema.safeParse({ ...valid, role: "PRESIDENT" }).success).toBe(false);
    expect(createOpeningSchema.safeParse({ ...valid, questions: [] }).success).toBe(false);
    expect(
      createOpeningSchema.safeParse({ ...valid, questions: Array(OPENING_MAX_QUESTIONS + 1).fill("Why?") }).success,
    ).toBe(false);
    expect(createOpeningSchema.safeParse({ ...valid, questions: ["   "] }).success).toBe(false);
  });
  it("only takes a wall-clock closing date", () => {
    expect(createOpeningSchema.safeParse({ ...valid, closesAt: "2026-10-30T18:00" }).success).toBe(true);
    expect(createOpeningSchema.safeParse({ ...valid, closesAt: "next friday" }).success).toBe(false);
  });
  it("refuses unknown fields (a smuggled tenantId or status)", () => {
    expect(createOpeningSchema.safeParse({ ...valid, tenantId: "x" }).success).toBe(false);
    expect(createOpeningSchema.safeParse({ ...valid, status: "OPEN" }).success).toBe(false);
  });
});

describe("updateOpeningSchema", () => {
  it("needs at least one change and never the role", () => {
    expect(updateOpeningSchema.safeParse({}).success).toBe(false);
    expect(updateOpeningSchema.safeParse({ status: "CLOSED" }).success).toBe(true);
    expect(updateOpeningSchema.safeParse({ role: "EVENT_MANAGER" }).success).toBe(false);
  });
  it("lets the closing date be cleared", () => {
    expect(updateOpeningSchema.parse({ closesAt: null }).closesAt).toBeNull();
  });
});

describe("applySchema / decideApplicationSchema", () => {
  it("wants non-blank answers within the limit", () => {
    expect(applySchema.safeParse({ answers: ["Because."] }).success).toBe(true);
    expect(applySchema.safeParse({ answers: [] }).success).toBe(false);
    expect(applySchema.safeParse({ answers: ["  "] }).success).toBe(false);
    expect(applySchema.safeParse({ answers: ["x".repeat(ANSWER_MAX + 1)] }).success).toBe(false);
  });
  it("decisions are Accept or Reject, nothing else", () => {
    expect(decideApplicationSchema.safeParse({ decision: "ACCEPT" }).success).toBe(true);
    expect(decideApplicationSchema.safeParse({ decision: "PROMOTE" }).success).toBe(false);
  });
});
