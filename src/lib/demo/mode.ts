import "server-only";

/**
 * Gates the read-only `/demo` preview.
 *
 * That page renders real tenant data without authentication (it exists so the
 * app can be reviewed inside a preview frame that cannot store cookies). Fine
 * for development; NOT fine for a production deployment, so it is off unless
 * explicitly enabled.
 *
 *   development / test → on unless DEMO_MODE=off
 *   production         → off unless DEMO_MODE=on
 */
export function isDemoModeEnabled(): boolean {
  const flag = process.env.DEMO_MODE?.toLowerCase();

  if (process.env.NODE_ENV === "production") {
    return flag === "on" || flag === "true";
  }

  return flag !== "off" && flag !== "false";
}
