import { describe, expect, it } from "vitest";

import {
  emailSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
} from "@/lib/validation/auth";

describe("emailSchema", () => {
  it("lowercases and trims input so uniqueness is case-insensitive in practice", () => {
    expect(emailSchema.parse("  Aarav.PRESIDENT@VIT.ac.in ")).toBe("aarav.president@vit.ac.in");
  });

  it.each(["not-an-email", "missing@tld", "@nodomain.com", ""])(
    "rejects %j",
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects addresses longer than 254 characters", () => {
    const local = "a".repeat(250);
    expect(emailSchema.safeParse(`${local}@vit.ac.in`).success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts 8 characters and rejects 7", () => {
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(true);
    expect(passwordSchema.safeParse("abcdefg").success).toBe(false);
  });

  it("rejects beyond 72 characters rather than silently truncating (bcrypt limit)", () => {
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = {
    firstName: "Aarav",
    lastName: "Shah",
    email: "aarav@vit.ac.in",
    password: "password123",
  };

  it("accepts a complete payload and normalises the email", () => {
    const parsed = registerSchema.parse({ ...valid, email: "AARAV@VIT.AC.IN" });
    expect(parsed.email).toBe("aarav@vit.ac.in");
    expect(parsed.firstName).toBe("Aarav");
  });

  it("rejects unknown fields instead of ignoring them (mass-assignment guard)", () => {
    const result = registerSchema.safeParse({ ...valid, role: "PRESIDENT", tenantId: "x" });
    expect(result.success).toBe(false);
  });

  it("reports every invalid field at once", () => {
    const result = registerSchema.safeParse({ firstName: "", lastName: "", email: "x", password: "1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((issue) => issue.path.join(".")));
      expect(fields).toEqual(new Set(["firstName", "lastName", "email", "password"]));
    }
  });
});

describe("loginSchema", () => {
  it("requires a password but does not impose the registration length rules", () => {
    // An existing account may predate a policy change; sign-in must not reject it.
    expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});
