"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Clock3, ListOrdered, Ticket as TicketIcon, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ApiFailure, ApiSuccess } from "@/types/api";

export type SeatAvailability = "REGISTERED" | "WAITLISTED" | "FULL";

export interface MyTicketSummary {
  id: string;
  status: "REGISTERED" | "WAITLISTED";
  queuePosition: number | null;
}

interface RegisterPanelProps {
  eventId: string;
  /** Where the *next* person would go, decided on the server by `decideSeat`. */
  availability: SeatAvailability;
  /** Set when registration is not open at all (draft, cancelled, already started). */
  closedReason: string | null;
  ticket: MyTicketSummary | null;
  waitlistEnabled: boolean;
}

interface PromotedPerson {
  displayName: string;
}

/**
 * The one place a student claims or gives back a seat.
 *
 * The button's label comes from a decision the **server** already made, and the
 * request re-checks everything behind a row lock. So the UI can be wrong (a stale
 * tab, a lost response) without ever being dangerous: worst case it offers a
 * button that comes back as "this event is full".
 */
export function RegisterPanel({
  eventId,
  availability,
  closedReason,
  ticket,
  waitlistEnabled,
}: RegisterPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function register() {
    setBusy(true);
    try {
      const response = await fetch(`/api/events/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json()) as
        | ApiSuccess<{ outcome: string; ticket: { status: string; queuePosition: number | null } }>
        | ApiFailure;

      if (!body.ok) {
        toast.error("Could not register", { description: body.error.message });
        return;
      }

      if (body.data.outcome === "waitlisted") {
        toast.success("You are on the waitlist", {
          description: `You are number ${body.data.ticket.queuePosition} in line. We will not email you — check this page.`,
        });
      } else if (body.data.outcome.startsWith("already")) {
        toast.info("You are already on the list", { description: "Nothing changed." });
      } else {
        toast.success("Seat claimed", {
          description: "Your QR ticket is ready. Show it at the door.",
        });
      }

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!ticket) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
      const body = (await response.json()) as
        | ApiSuccess<{ promoted: PromotedPerson[] }>
        | ApiFailure;

      if (!body.ok) {
        toast.error("Could not cancel", { description: body.error.message });
        return;
      }

      const promoted = body.data.promoted?.[0];

      toast.success(ticket.status === "WAITLISTED" ? "You left the waitlist" : "Seat released", {
        description: promoted
          ? `${promoted.displayName} just moved up from the waitlist and took your seat.`
          : "You can register again while there is room.",
      });

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Registration is shut: say why, plainly, instead of showing a dead button.
  if (closedReason) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <Clock3 className="mt-0.5 size-4 shrink-0" />
        <span>{closedReason}</span>
      </div>
    );
  }

  if (ticket?.status === "REGISTERED") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">
            <UserCheck data-icon="inline-start" />
            You are registered
          </Badge>
          <span className="text-xs text-muted-foreground">
            Your QR ticket is ready — show it at the door.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/tickets/${ticket.id}`}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <TicketIcon data-icon="inline-start" />
            Open your ticket
          </Link>
          <Button size="sm" variant="outline" disabled={busy} onClick={cancel}>
            Cancel my spot
          </Button>
        </div>
      </div>
    );
  }

  if (ticket?.status === "WAITLISTED") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-amber-500/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <ListOrdered data-icon="inline-start" />
            On the waitlist — number {ticket.queuePosition ?? "?"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            A seat will be released to you automatically if somebody drops out.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/tickets/${ticket.id}`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            <TicketIcon data-icon="inline-start" />
            Open your ticket
          </Link>
          <Button size="sm" variant="ghost" disabled={busy} onClick={cancel}>
            Leave the waitlist
          </Button>
        </div>
      </div>
    );
  }

  if (availability === "FULL") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <XCircle className="size-4 shrink-0" />
        This event is full, and its organisers did not open a waitlist.
      </div>
    );
  }

  const joiningWaitlist = availability === "WAITLISTED";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-4">
      <Button disabled={busy} onClick={register}>
        <TicketIcon data-icon="inline-start" />
        {joiningWaitlist ? "Join the waitlist" : "Register"}
      </Button>
      <span className="text-xs text-muted-foreground">
        {joiningWaitlist
          ? waitlistEnabled
            ? "The room is full. You can still join the queue — you are told your place immediately."
            : "The room is full."
          : "One ticket per person. You can give it back at any time."}
      </span>
    </div>
  );
}
