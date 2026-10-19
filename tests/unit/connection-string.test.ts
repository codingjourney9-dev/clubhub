import { parse } from "pg-connection-string";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeSslMode } from "@/lib/db/connection-string";

const NEON =
  "postgresql://neondb_owner:p%40ss%2Fw0rd@ep-cool-name-a1b2c3-pooler.ap-southeast-1.aws.neon.tech/neondb";

describe("normalizeSslMode", () => {
  it("rewrites the Neon default (sslmode=require + channel_binding) to verify-full", () => {
    expect(normalizeSslMode(`${NEON}?sslmode=require&channel_binding=require`)).toBe(
      `${NEON}?sslmode=verify-full&channel_binding=require`,
    );
  });

  it.each(["prefer", "require", "verify-ca", "REQUIRE"])("rewrites sslmode=%s", (mode) => {
    expect(normalizeSslMode(`${NEON}?sslmode=${mode}`)).toBe(`${NEON}?sslmode=verify-full`);
  });

  it("finds sslmode when it is not the first parameter", () => {
    expect(normalizeSslMode(`${NEON}?connect_timeout=10&sslmode=require`)).toBe(
      `${NEON}?connect_timeout=10&sslmode=verify-full`,
    );
  });

  it("leaves the password's percent-encoding untouched", () => {
    expect(normalizeSslMode(`${NEON}?sslmode=require`)).toContain("p%40ss%2Fw0rd@");
  });

  it.each([
    ["local Postgres, no sslmode", "postgresql://clubhub:clubhub@localhost:5432/clubhub"],
    ["already verify-full", `${NEON}?sslmode=verify-full`],
    ["SSL switched off", `${NEON}?sslmode=disable`],
    ["explicit no-verify", `${NEON}?sslmode=no-verify`],
    ["libpq compat opted in", `${NEON}?uselibpqcompat=true&sslmode=require`],
    ["a lookalike parameter", `${NEON}?xsslmode=require`],
  ])("leaves it alone: %s", (_label, url) => {
    expect(normalizeSslMode(url)).toBe(url);
  });

  describe("against the real pg parser", () => {
    afterEach(() => vi.restoreAllMocks());

    it("pg warns on the raw Neon address but not on the normalised one, with the same TLS settings", () => {
      const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
      const raw = `${NEON}?sslmode=require`;

      // pg only warns once per process, so check the normalised address first.
      const fixed = parse(normalizeSslMode(raw));
      expect(warn).not.toHaveBeenCalled();

      const original = parse(raw);
      expect(warn).toHaveBeenCalledTimes(1);

      // Same security as before: certificate and host name both verified.
      expect(fixed.ssl).toEqual(original.ssl);
    });
  });
});
