"use client";

import { canonicalSecret } from "@/lib/tickets/qr";

/**
 * The browser half of the fingerprint.
 *
 * It must produce exactly the same hex string as `fingerprintSecret` on the
 * server, or offline verification would reject every genuine ticket. The shared
 * `canonicalSecret` is what guarantees that; this only swaps the hash engine
 * (`node:crypto` → `crypto.subtle`).
 *
 * `crypto.subtle` requires a secure context. The app is served over HTTPS (and
 * over `http://localhost` during development), so it is available in both; if it
 * is somehow not, the scanner falls back to online mode instead of pretending to
 * verify anything.
 */
export function isOfflineVerificationAvailable(): boolean {
  return typeof globalThis.crypto?.subtle?.digest === "function";
}

export async function fingerprintSecretInBrowser(secret: string): Promise<string | null> {
  if (!isOfflineVerificationAvailable()) return null;

  const bytes = new TextEncoder().encode(canonicalSecret(secret));
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
