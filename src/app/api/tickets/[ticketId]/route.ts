import { requireUuidParam } from "@/lib/api/params";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireEventAccess } from "@/lib/auth/guards";
import { canClub, type Actor } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enforceRateLimit } from "@/lib/rate-limit/budgets";
import { cancelTicket } from "@/lib/services/ticket-service";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/tickets/:ticketId — give a seat back.
 *
 * A `DELETE` that does not delete anything: the row is marked CANCELLED and kept
 * forever, because "who was registered and then dropped out" is exactly the kind
 * of history an attendance report needs. This is also why the ticket keeps its id.
 *
 * Organisers may cancel anyone's ticket (`ticket:manage`); a student may cancel
 * only their own, and somebody else's ticket answers 404 rather than 403 so ids
 * cannot be probed.
 */
async function handleDELETE(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId: rawTicketId } = await params;
    const ticketId = requireUuidParam(rawTicketId, "ticket");

    const user = await requireUser();

    const ticket = await db.ticket.findFirst({
      where: { id: ticketId, deletedAt: null },
      select: { id: true, eventId: true },
    });

    if (!ticket) {
      return ok({ ticket: { id: ticketId, status: "CANCELLED" }, changed: false, promoted: [] });
    }

    // Resolve the event through the guard: it proves the caller belongs to that
    // college and may see that event at all.
    const context = await requireEventAccess(ticket.eventId, "ticket:rsvp");
    const actor: Actor = { tenantRole: context.tenantRole, clubRole: context.clubRole };

    enforceRateLimit("cancel", user.id);

    const result = await cancelTicket({
      ticketId,
      tenantId: context.event.tenantId,
      actorId: user.id,
      canManageOthers: canClub(actor, "ticket:manage"),
    });

    return ok({
      ticket: { id: result.ticketId, status: "CANCELLED" },
      changed: result.changed,
      promoted: result.promoted,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const DELETE = withApiRoute("DELETE /api/tickets/[ticketId]", handleDELETE);
