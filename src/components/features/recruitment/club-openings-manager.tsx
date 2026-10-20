"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, Megaphone, Plus } from "lucide-react";
import { toast } from "sonner";

import { OpeningForm, type EditableOpening } from "@/components/features/recruitment/opening-form";
import { OpeningRoleStamp } from "@/components/features/recruitment/opening-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { callApi, notifyFailure } from "@/lib/api/client";
import type { OpeningState } from "@/lib/domain/openings";
import { cn } from "@/lib/utils";

export interface ClubOpeningManageRow extends EditableOpening {
  readonly state: OpeningState;
  readonly status: "OPEN" | "CLOSED";
  /** Already formatted on the server, in the college's timezone. */
  readonly closesLabel: string;
  /** Its closing date is in the past (whatever the Open/Closed switch says). */
  readonly datePassed: boolean;
  readonly pendingCount: number;
  readonly totalCount: number;
  readonly canManage: boolean;
}

/**
 * The Openings card in a club workspace. Members see what's open; Leads and the
 * President also post, edit, close/reopen and review. What each row allows is
 * decided on the server (`canManage`), and every write is re-checked by the API.
 */
export function ClubOpeningsManager({
  clubId,
  timeZone,
  openings,
  offerableRoles,
}: {
  clubId: string;
  timeZone: string;
  openings: readonly ClubOpeningManageRow[];
  offerableRoles: readonly ("MEMBER" | "EVENT_MANAGER")[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canPost = offerableRoles.length > 0;

  async function setOpen(row: ClubOpeningManageRow, open: boolean) {
    setBusyId(row.id);
    try {
      // Reopening one whose date has passed also clears that date — otherwise
      // it would still read as closed.
      const json = open
        ? { status: "OPEN", ...(row.datePassed ? { closesAt: null } : {}) }
        : { status: "CLOSED" };
      const result = await callApi(`/api/clubs/${clubId}/openings/${row.id}`, { method: "PATCH", json });
      if (!result.ok) return notifyFailure(result, open ? "Could not reopen it" : "Could not close it");
      toast.success(open ? "Opening reopened" : "Opening closed", {
        description: open
          ? row.datePassed
            ? "The old closing date was removed. Set a new one with Edit if you want."
            : undefined
          : "No new applications. You can still decide the pending ones.",
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-4 text-muted-foreground" />
          Openings
        </CardTitle>
        <CardDescription>
          {canPost
            ? "Recruit for the club. Openings appear on the public recruitment board; anyone signed in, from any college, can apply."
            : "Roles this club is recruiting for. Leads and the President post them."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {openings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canPost ? "No openings yet. Post the first one below." : "The club isn't recruiting right now."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {openings.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 rounded-lg border p-4">
                {editingId === row.id ? (
                  <OpeningForm
                    clubId={clubId}
                    timeZone={timeZone}
                    offerableRoles={offerableRoles}
                    opening={row}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <Link
                          href={`/openings/${row.id}`}
                          className="text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {row.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{row.closesLabel}</span>
                      </div>
                      <OpeningRoleStamp role={row.role} state={row.state} />
                    </div>

                    {row.canManage ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/clubs/${clubId}/openings/${row.id}`}
                          className={cn(buttonVariants({ size: "sm", variant: row.pendingCount ? "default" : "outline" }))}
                        >
                          <Inbox />
                          Review applications ({row.pendingCount} pending
                          {row.totalCount > row.pendingCount ? ` · ${row.totalCount} total` : ""})
                        </Link>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(row.id)}>
                          Edit
                        </Button>
                        {row.state === "open" ? (
                          <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => setOpen(row, false)}>
                            Close
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => setOpen(row, true)}>
                            Reopen
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {canPost ? (
          <div className="rounded-lg border border-dashed p-4">
            {creating ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">New opening</span>
                  <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                    Close
                  </Button>
                </div>
                <OpeningForm
                  clubId={clubId}
                  timeZone={timeZone}
                  offerableRoles={offerableRoles}
                  onDone={() => setCreating(false)}
                />
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <span className="text-sm font-medium">Recruit someone</span>
                <span className="text-xs text-muted-foreground">
                  Accepting an applicant gives them the role straight away.
                </span>
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus />
                  New opening
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
