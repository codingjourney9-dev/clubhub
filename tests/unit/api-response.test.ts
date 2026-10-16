import { describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";

import {
  ApiError,
  fail,
  handleRouteError,
  ok,
  toFieldErrors,
  validationFailed,
} from "@/lib/api/response";

async function body(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("ok()", () => {
  it("wraps data in the success envelope", async () => {
    const response = ok({ id: "abc" });
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true, data: { id: "abc" } });
  });

  it("honours an explicit status for creations", () => {
    expect(ok({}, { status: 201 }).status).toBe(201);
  });
});

describe("fail()", () => {
  it("maps each error code to its canonical HTTP status", async () => {
    const cases = [
      ["BAD_REQUEST", 400],
      ["UNAUTHORIZED", 401],
      ["FORBIDDEN", 403],
      ["NOT_FOUND", 404],
      ["CONFLICT", 409],
      ["VALIDATION_ERROR", 422],
      ["RATE_LIMITED", 429],
      ["INTERNAL_ERROR", 500],
    ] as const;

    for (const [code, status] of cases) {
      expect(fail(code, "msg").status).toBe(status);
    }
  });

  it("omits details entirely when there are none (no stray undefined keys)", async () => {
    const payload = await body(fail("NOT_FOUND", "Missing."));
    expect(payload).toEqual({ ok: false, error: { code: "NOT_FOUND", message: "Missing." } });
    expect("details" in (payload.error as object)).toBe(false);
  });

  it("passes headers through (used for Retry-After on 429)", () => {
    const response = fail("RATE_LIMITED", "Slow down.", { headers: { "Retry-After": "42" } });
    expect(response.headers.get("Retry-After")).toBe("42");
  });
});

describe("toFieldErrors()", () => {
  it("flattens Zod issues into dotted field paths", () => {
    const schema = z.object({
      email: z.email(),
      profile: z.object({ name: z.string().min(1) }),
      tags: z.array(z.string().min(2)).min(1),
    });

    const result = schema.safeParse({ email: "nope", profile: { name: "" }, tags: ["a"] });
    expect(result.success).toBe(false);

    const fieldErrors = toFieldErrors(result.error as ZodError);
    expect(Object.keys(fieldErrors)).toEqual(
      expect.arrayContaining(["email", "profile.name", "tags.0"]),
    );
  });

  it("collects multiple messages for the same field", () => {
    const schema = z.string().min(5).regex(/^\d+$/);
    const result = schema.safeParse("abc");
    if (result.success) throw new Error("expected failure");
    expect(toFieldErrors(result.error)._root?.length).toBeGreaterThan(1);
  });
});

describe("validationFailed()", () => {
  it("returns 422 with field details, never the raw Zod error shape", async () => {
    const result = z.object({ a: z.string() }).safeParse({});
    if (result.success) throw new Error("expected failure");

    const response = validationFailed(result.error);
    expect(response.status).toBe(422);

    const payload = await body(response);
    expect(payload.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect((payload.error as { details: Record<string, string[]> }).details).toHaveProperty("a");
  });
});

describe("handleRouteError()", () => {
  it("maps an ApiError to its own code and status", async () => {
    const payload = await body(handleRouteError(ApiError.forbidden("Nope.")));
    expect(payload.error).toMatchObject({ code: "FORBIDDEN", message: "Nope." });
  });

  it("maps a thrown ZodError to a 422 with field errors", () => {
    const result = z.object({ a: z.string() }).safeParse({});
    if (result.success) throw new Error("expected failure");
    expect(handleRouteError(result.error).status).toBe(422);
  });

  it("never leaks internals for unexpected throwables", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const payload = await body(handleRouteError(new Error("postgres://user:pw@host blew up")));

    expect(payload.error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
    });
    expect(JSON.stringify(payload)).not.toContain("postgres://");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
