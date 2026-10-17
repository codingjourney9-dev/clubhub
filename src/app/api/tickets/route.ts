import { handleRouteError, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { listMyTickets } from "@/lib/services/ticket-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tickets — my tickets, across every college and club I belong to.
 *
 * Scoped to the session user only; there is no `?userId=` to tamper with. Each
 * row carries the college's timezone so the client can render the same instant
 * correctly for each college (a student can belong to two).
 */
export async function GET() {
  try {
    const user = await requireUser();
    const tickets = await listMyTickets(user.id);

    return ok({ tickets });
  } catch (error) {
    return handleRouteError(error);
  }
}
