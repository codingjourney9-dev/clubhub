import { afterEach, describe, expect, it, vi } from "vitest";

import { callApi, fieldErrorsOf, failureTitle } from "@/lib/api/client";

/**
 * The client bridge, tested against a fake `fetch`.
 *
 * These cases are the ones that used to end in a silent dead button: the network
 * rejects, the server answers with HTML, or the request never comes back. None of
 * them may throw — every one must produce a failure a human can read.
 */

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("callApi", () => {
  it("returns the payload of a successful envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, data: { id: "abc" } }, 200, { "x-request-id": "req-1" })),
    );

    const result = await callApi<{ id: string }>("/api/thing");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe("abc");
      expect(result.requestId).toBe("req-1");
    }
  });

  it("sends JSON and the content-type header when given a body", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: null }));
    vi.stubGlobal("fetch", fetchMock);

    await callApi("/api/thing", { method: "POST", json: { a: 1 } });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const init = call[1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("turns a dead network into a readable failure instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const result = await callApi("/api/thing");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NETWORK_ERROR");
      expect(result.message).toMatch(/offline/i);
      expect(result.status).toBeNull();
    }
  });

  it("survives a response that is not JSON at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502 Bad Gateway</html>", { status: 502 })),
    );

    const result = await callApi("/api/thing");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INTERNAL_ERROR");
      expect(result.status).toBe(502);
      expect(result.message).toMatch(/unexpected reply/i);
    }
  });

  it("keeps the server's error code, message and request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { ok: false, error: { code: "CONFLICT", message: "This event is full." } },
          409,
          { "x-request-id": "req-9" },
        ),
      ),
    );

    const result = await callApi("/api/events/x/register", { method: "POST", json: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CONFLICT");
      expect(result.message).toBe("This event is full.");
      expect(result.requestId).toBe("req-9");
      expect(result.status).toBe(409);
    }
  });

  it("lifts field errors out of a 422 so a form can show them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Request validation failed.",
              details: { capacity: ["Capacity must be a whole number."] },
            },
          },
          422,
        ),
      ),
    );

    const result = await callApi("/api/clubs/x/events", { method: "POST", json: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(fieldErrorsOf(result)).toEqual({ capacity: "Capacity must be a whole number." });
    }
  });

  it("ignores details that are not field errors, instead of showing [object Object]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { ok: false, error: { code: "CONFLICT", message: "Nope.", details: { weird: 42 } } },
          409,
        ),
      ),
    );

    const result = await callApi("/api/thing");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors).toBeNull();
  });

  it("abandons a request that never answers", async () => {
    vi.useFakeTimers();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      ),
    );

    const pending = callApi("/api/thing", { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TIMEOUT");
      expect(result.message).toMatch(/took too long/i);
    }
  });
});

describe("failureTitle", () => {
  it("turns codes into something a person would say", () => {
    const base = {
      ok: false as const,
      message: "",
      fieldErrors: null,
      status: 429,
      requestId: null,
    };

    expect(failureTitle({ ...base, code: "RATE_LIMITED" })).toBe("Slow down a moment");
    expect(failureTitle({ ...base, code: "FORBIDDEN" })).toBe("That is not yours to do");
    expect(failureTitle({ ...base, code: "BAD_REQUEST" })).toBe("That did not work");
  });
});
