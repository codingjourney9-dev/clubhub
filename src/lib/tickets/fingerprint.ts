import { createHash } from "node:crypto";

import { canonicalSecret } from "@/lib/tickets/qr";

export { canonicalSecret };

/**
 * A one-way fingerprint of a ticket secret.
 *
 * Why not just hand the scanner the secrets? Because an offline scanner has to
 * keep its reference data **on the phone**, and a phone in a volunteer's pocket
 * is not a safe place for a wallet of live ticket secrets. A SHA-256 fingerprint
 * is enough to *verify* a scanned code and useless for *forging* one:
 *
 *   • scanning `clubhub:ticket:<secret>` → hash it → look the hash up locally
 *   • the phone never holds anything that could be turned back into a ticket
 *
 * The secret is a random UUID (122 bits), so the hash cannot be reversed by
 * guessing either.
 *
 * The client computes the same value with the Web Crypto API; both sides must
 * agree byte for byte, so the canonical form (lower-case, no dashes) is defined
 * here and mirrored in `src/lib/tickets/fingerprint.browser.ts`.
 */

/** `sha256(canonical secret)` as a hex string. Server side (node:crypto). */
export function fingerprintSecret(secret: string): string {
  return createHash("sha256").update(canonicalSecret(secret), "utf8").digest("hex");
}
