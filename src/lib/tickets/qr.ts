/**
 * The text that lives inside a ticket's QR code.
 *
 * Deliberately boring and explicit rather than a URL: a QR that encodes
 * `https://…/tickets/<id>` invites a scanner to "just open the link", and the
 * ticket id is not a secret worth printing. What the door actually needs is the
 * ticket's **secret** — `qrCodeUuid` — which is unique, random, and separate from
 * the row id so a leaked id cannot be turned into a check-in.
 *
 * The prefix also lets a scanner reject foreign QR codes (the back of a bus
 * ticket, a WiFi code) before touching the database.
 *
 * Encoding and decoding live together so Phase 5 (printing) and Phase 6
 * (scanning) cannot disagree about the format.
 */
export const TICKET_QR_PREFIX = "clubhub:ticket:";

export function encodeTicketQr(qrCodeUuid: string): string {
  return `${TICKET_QR_PREFIX}${qrCodeUuid}`;
}

/**
 * Returns the ticket secret from a scanned payload, or `null` if this is not one
 * of our QR codes.
 *
 * The UUID shape is checked here as well as in the database: a scanner in a
 * basement should be able to say "not a ClubHub ticket" instantly, without a
 * round trip and without trusting whatever the camera saw.
 */
export function decodeTicketQr(payload: string): string | null {
  const trimmed = payload.trim();

  if (!trimmed.startsWith(TICKET_QR_PREFIX)) return null;

  const secret = trimmed.slice(TICKET_QR_PREFIX.length);

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)
    ? secret.toLowerCase()
    : null;
}
