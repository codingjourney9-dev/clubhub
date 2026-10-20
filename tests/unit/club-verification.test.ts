import { describe, expect, it } from "vitest";

import {
  emailDomain,
  generateVerificationCode,
  hashVerificationCode,
  matchCollegeByEmail,
  verificationHashesMatch,
} from "../../src/lib/domain/club-verification";
import { START_CLUB_PATH } from "../../src/lib/domain/club-paths";
import { requestClubSchema, verifyClubCodeSchema } from "../../src/lib/validation/club-request";

/** Phase 12: the rules behind "a professor's code makes a student club live". */

const colleges = [
  { id: "vit", domain: "vit.ac.in" },
  { id: "vit-cse", domain: "cse.vit.ac.in" },
  { id: "iit", domain: "IITB.ac.in" },
  { id: "none", domain: null },
];

describe("emailDomain", () => {
  it("lower-cases and trims the part after the last @", () => {
    expect(emailDomain("Aarav@CSE.VIT.ac.in")).toBe("cse.vit.ac.in");
    expect(emailDomain("odd@name@vit.ac.in")).toBe("vit.ac.in");
    expect(emailDomain("trailing@vit.ac.in.")).toBe("vit.ac.in");
  });

  it("returns null when there is no usable domain", () => {
    expect(emailDomain("no-at-sign")).toBeNull();
    expect(emailDomain("@vit.ac.in")).toBeNull();
    expect(emailDomain("someone@")).toBeNull();
  });
});

describe("matchCollegeByEmail", () => {
  it("matches the exact domain", () => {
    expect(matchCollegeByEmail("a@vit.ac.in", colleges)?.id).toBe("vit");
  });

  it("matches a department subdomain to its college", () => {
    expect(matchCollegeByEmail("a@mech.vit.ac.in", colleges)?.id).toBe("vit");
  });

  it("prefers the more specific college when two could claim it", () => {
    expect(matchCollegeByEmail("a@cse.vit.ac.in", colleges)?.id).toBe("vit-cse");
    expect(matchCollegeByEmail("a@lab.cse.vit.ac.in", colleges)?.id).toBe("vit-cse");
  });

  it("never matches a look-alike that merely ends the same way", () => {
    expect(matchCollegeByEmail("a@notvit.ac.in", colleges)).toBeNull();
    expect(matchCollegeByEmail("a@vit.ac.in.evil.com", colleges)).toBeNull();
  });

  it("ignores case on both sides and skips colleges without a domain", () => {
    expect(matchCollegeByEmail("A@iitb.AC.IN", colleges)?.id).toBe("iit");
    expect(matchCollegeByEmail("a@gmail.com", colleges)).toBeNull();
  });
});

describe("verification codes", () => {
  it("are always exactly six digits, leading zeros kept", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it("are not all the same", () => {
    const seen = new Set(Array.from({ length: 50 }, generateVerificationCode));
    expect(seen.size).toBeGreaterThan(40);
  });

  it("are stored as a keyed hash bound to the club", () => {
    const hash = hashVerificationCode("secret-a", "club-1", "123456");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("123456");
    expect(hashVerificationCode("secret-a", "club-1", "123456")).toBe(hash);
    expect(hashVerificationCode("secret-a", "club-2", "123456")).not.toBe(hash);
    expect(hashVerificationCode("secret-b", "club-1", "123456")).not.toBe(hash);
  });

  it("compare equal only when they really are equal", () => {
    const hash = hashVerificationCode("s", "c", "000001");
    expect(verificationHashesMatch(hash, hashVerificationCode("s", "c", "000001"))).toBe(true);
    expect(verificationHashesMatch(hash, hashVerificationCode("s", "c", "000002"))).toBe(false);
    expect(verificationHashesMatch(hash, "")).toBe(false);
    expect(verificationHashesMatch("", "")).toBe(false);
  });
});

describe("requestClubSchema", () => {
  it("trims and lower-cases the professor's email", () => {
    const parsed = requestClubSchema.parse({ name: "Chess", facultyEmail: "  Priya.Sharma@VIT.ac.in " });
    expect(parsed.facultyEmail).toBe("priya.sharma@vit.ac.in");
  });

  it("allows leaving the professor out (admins don't need one; the service decides)", () => {
    expect(requestClubSchema.safeParse({ name: "Chess" }).success).toBe(true);
  });

  it("rejects a malformed email, a bad college id and unknown keys", () => {
    expect(requestClubSchema.safeParse({ name: "Chess", facultyEmail: "priya" }).success).toBe(false);
    expect(requestClubSchema.safeParse({ name: "Chess", tenantId: "vit" }).success).toBe(false);
    expect(requestClubSchema.safeParse({ name: "Chess", status: "ACTIVE" }).success).toBe(false);
  });

  it("requires a real name", () => {
    expect(requestClubSchema.safeParse({ name: " x " }).success).toBe(false);
  });
});

describe("verifyClubCodeSchema", () => {
  it("accepts exactly six digits (spaces around are trimmed)", () => {
    expect(verifyClubCodeSchema.parse({ code: " 012345 " }).code).toBe("012345");
  });

  it.each(["12345", "1234567", "12a456", "", "12 345"])("rejects %j", (code) => {
    expect(verifyClubCodeSchema.safeParse({ code }).success).toBe(false);
  });
});

it("Start a new club leads to the Phase 12 page", () => {
  expect(START_CLUB_PATH).toBe("/clubs/new");
});
