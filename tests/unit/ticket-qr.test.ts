import { describe, expect, it } from "vitest";

import { decodeTicketQr, encodeTicketQr, TICKET_QR_PREFIX } from "../../src/lib/tickets/qr";

/**
 * The QR payload format.
 *
 * Phase 5 prints these; Phase 6 scans them. The format is tested now so the
 * scanner can never be the first place a mistake is discovered.
 */

const SECRET = "0f1d2c3b-4a59-4e6d-8b7c-500000000001";

describe("ticket QR payload", () => {
  it("round-trips the ticket secret", () => {
    const payload = encodeTicketQr(SECRET);

    expect(payload).toBe(`${TICKET_QR_PREFIX}${SECRET}`);
    expect(decodeTicketQr(payload)).toBe(SECRET);
  });

  it("carries the secret, never the ticket id", () => {
    const payload = encodeTicketQr(SECRET);

    // A ticket id is visible in URLs and logs; the secret is not. Only the
    // secret goes into the image.
    expect(payload).not.toContain("tickets/");
    expect(payload.startsWith("clubhub:ticket:")).toBe(true);
  });

  it("normalises case, because QR scanners and humans disagree about it", () => {
    expect(decodeTicketQr(`${TICKET_QR_PREFIX}${SECRET.toUpperCase()}`)).toBe(SECRET);
    expect(decodeTicketQr(`  ${TICKET_QR_PREFIX}${SECRET}  `)).toBe(SECRET);
  });

  it("rejects anything that is not one of our tickets", () => {
    expect(decodeTicketQr("https://example.com/tickets/1")).toBeNull();
    expect(decodeTicketQr("WIFI:S:CampusNet;T:WPA;P:hunter2;;")).toBeNull();
    expect(decodeTicketQr("")).toBeNull();
  });

  it("rejects our own prefix with a malformed secret", () => {
    expect(decodeTicketQr(`${TICKET_QR_PREFIX}not-a-uuid`)).toBeNull();
    expect(decodeTicketQr(`${TICKET_QR_PREFIX}1234`)).toBeNull();
    // A valid-looking UUID with a trailing character is still wrong.
    expect(decodeTicketQr(`${TICKET_QR_PREFIX}${SECRET}x`)).toBeNull();
  });
});
