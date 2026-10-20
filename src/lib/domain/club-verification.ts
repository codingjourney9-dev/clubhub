import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Phase 12 rules for "a professor vouches for a new club".
 *
 * Plain functions with no database access, so the unit tests can pin down every
 * edge (subdomains, look-alike domains, code format) without a server.
 */

/** A code is good for 15 minutes after it is sent. */
export const CODE_TTL_MINUTES = 15;
export const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;

/** Five wrong tries and that code is dead — a new one must be sent. */
export const MAX_CODE_ATTEMPTS = 5;

/** A student may have at most this many clubs waiting for a professor at once. */
export const MAX_PENDING_REQUESTS = 2;

/** "Aarav@CSE.VIT.ac.in" → "cse.vit.ac.in". Null when there is no usable domain. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "") || null;
}

/**
 * Finds the college whose domain owns this email address.
 *
 * Matches the domain exactly or as a parent ("cse.vit.ac.in" belongs to
 * "vit.ac.in"), but never a mere suffix ("notvit.ac.in" does NOT). When two
 * colleges could claim it, the more specific domain wins.
 */
export function matchCollegeByEmail<T extends { domain: string | null }>(
  email: string,
  colleges: readonly T[],
): T | null {
  const domain = emailDomain(email);
  if (!domain) return null;

  let best: T | null = null;
  let bestLength = -1;
  for (const college of colleges) {
    const own = college.domain?.trim().toLowerCase();
    if (!own) continue;
    const matches = domain === own || domain.endsWith(`.${own}`);
    if (matches && own.length > bestLength) {
      best = college;
      bestLength = own.length;
    }
  }
  return best;
}

/** A fresh 6-digit code, "000000"–"999999", from the OS's secure random source. */
export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * The value stored instead of the code. Keyed with the server secret and bound
 * to the club, so a leaked table row can't be reversed with a lookup table and
 * one club's hash is useless for another.
 */
export function hashVerificationCode(secret: string, clubId: string, code: string): string {
  return createHmac("sha256", secret).update(`${clubId}:${code}`).digest("hex");
}

/** Constant-time comparison, so response timing leaks nothing about the code. */
export function verificationHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
