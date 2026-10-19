/**
 * Make the database address say what `pg` already does, so it stops warning.
 *
 * Hosted Postgres providers (Neon, Supabase, Render…) hand out addresses ending
 * in `?sslmode=require`. `pg` 8 silently treats `prefer`, `require` and
 * `verify-ca` as `verify-full` — certificate checked, host name checked — and
 * prints a "SECURITY WARNING" on every cold start saying so, because pg 9 will
 * switch those words to libpq's weaker meaning. In `next dev` that warning is
 * forwarded to the browser and shows up as a red "Console Error".
 *
 * Rewriting the mode to `verify-full` keeps today's behaviour exactly (the
 * strict one) and makes it survive the pg 9 upgrade instead of quietly
 * weakening. Two cases are left alone on purpose:
 *  - `uselibpqcompat=true`: the owner explicitly opted into libpq semantics.
 *  - `disable`, `no-verify`, `verify-full`, or no sslmode (local Postgres):
 *    nothing to warn about.
 *
 * Only the `sslmode` parameter is touched, by text replacement — the address is
 * deliberately not run through `new URL()`, which can re-encode passwords.
 */
const ALIASED_MODE = /([?&])sslmode=(prefer|require|verify-ca)(?=&|#|$)/i;
const LIBPQ_COMPAT = /[?&]uselibpqcompat=true(?=&|#|$)/i;

export function normalizeSslMode(connectionString: string): string {
  if (LIBPQ_COMPAT.test(connectionString)) return connectionString;
  return connectionString.replace(ALIASED_MODE, "$1sslmode=verify-full");
}
