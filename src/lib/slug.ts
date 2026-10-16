/**
 * URL slugs for tenants and clubs.
 *
 * Slugs are user-visible and stable-ish, so they are derived from the name and
 * then made unique within their scope: clubs are unique per tenant
 * (`@@unique([tenantId, slug])`), tenants are unique globally (`@unique`).
 */

const MAX_SLUG_LENGTH = 60;

/** "Robotics Club!!" → "robotics-club" */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    // Strip diacritics so "École" becomes "ecole" rather than disappearing.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

  // Names made entirely of symbols (or empty) still need a usable slug.
  return slug || "item";
}

/**
 * Finds a free slug by appending -2, -3, … up to `maxAttempts`.
 *
 * Note this is best-effort by design: the database unique constraint is the real
 * guarantee. Callers still catch P2002 and retry, so two simultaneous requests
 * for the same name cannot both win.
 */
export async function findAvailableSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 25,
): Promise<string> {
  const root = slugify(base);

  if (!(await isTaken(root))) return root;

  for (let suffix = 2; suffix <= maxAttempts; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  // Extremely unlikely; fall back to a random suffix rather than failing the request.
  return `${root}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Opaque token for invite links.
 *
 * 32 random bytes, base64url-encoded. Not a UUID on purpose: UUIDv4 has 122 bits
 * and a recognisable shape, while this is unguessable and URL-safe. The invite
 * token is the only identifier exposed in a shareable link.
 */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
