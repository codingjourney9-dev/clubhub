"use client";

import { useCallback, useMemo, useState } from "react";
import {
  BadgeCheck,
  CloudOff,
  Cloud,
  RotateCcw,
  ScanLine,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A rehearsal of the worst case, with nothing at stake.
 *
 * This is a **simulation** and says so on screen: it holds its own list of rows
 * in the browser and never calls the API. The rules it follows are the server's
 * rules — a ticket enters the room once (`UNIQUE(ticket_id)`), and a queued scan
 * is identified by its `scanUuid` so re-sending a batch is a no-op — which is
 * exactly what `tests/integration/check-in.test.ts` proves against the real
 * database.
 */

export interface DrillTicket {
  readonly ticketId: string;
  readonly holder: string;
  readonly doorCode: string;
  readonly alreadyIn: boolean;
}

interface QueuedScan {
  readonly scanUuid: string;
  readonly ticketId: string;
  readonly holder: string;
  readonly scannedAt: string;
}

type Line = {
  readonly id: string;
  readonly tone: "ok" | "warn" | "bad" | "muted";
  readonly text: string;
};

const newScanUuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `scan-${Math.random().toString(16).slice(2)}`;

const clock = () =>
  new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export function OfflineDrill({ tickets }: { tickets: readonly DrillTicket[] }) {
  const initial = useMemo(
    () => new Set(tickets.filter((ticket) => ticket.alreadyIn).map((ticket) => ticket.ticketId)),
    [tickets],
  );

  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState<readonly QueuedScan[]>([]);
  const [rows, setRows] = useState<ReadonlySet<string>>(initial);
  const [lines, setLines] = useState<readonly Line[]>([]);
  const [uploads, setUploads] = useState(0);

  const say = useCallback((tone: Line["tone"], text: string) => {
    setLines((previous) => [{ id: newScanUuid(), tone, text }, ...previous].slice(0, 8));
  }, []);

  /** The server's write, mirrored: `UNIQUE(ticket_id)` means the second attempt loses. */
  const acceptIntoRoom = useCallback(
    (scan: QueuedScan): "accepted" | "duplicate" => {
      let outcome: "accepted" | "duplicate" = "duplicate";
      setRows((previous) => {
        if (previous.has(scan.ticketId)) return previous;
        outcome = "accepted";
        const next = new Set(previous);
        next.add(scan.ticketId);
        return next;
      });
      return outcome;
    },
    [],
  );

  const scan = (ticket: DrillTicket) => {
    const queued: QueuedScan = {
      scanUuid: newScanUuid(),
      ticketId: ticket.ticketId,
      holder: ticket.holder,
      scannedAt: clock(),
    };

    if (offline) {
      // Verified against the cached list on the phone — no network, no server.
      setQueue((previous) => [...previous, queued]);
      say("warn", `${ticket.holder} accepted offline at ${queued.scannedAt} — queued, not in the room yet.`);
      return;
    }

    // Online: the write lands immediately.
    const result = rows.has(ticket.ticketId) ? "duplicate" : acceptIntoRoom(queued);
    say(
      result === "duplicate" ? "warn" : "ok",
      result === "duplicate"
        ? `${ticket.holder} is already inside — “already checked in”, not an error.`
        : `${ticket.holder} checked in at ${queued.scannedAt}.`,
    );
  };

  const flush = (label: string) => {
    if (queue.length === 0) return;

    let accepted = 0;
    let duplicates = 0;
    const seen = new Set(rows);

    for (const scan of queue) {
      if (seen.has(scan.ticketId)) {
        duplicates += 1;
        continue;
      }
      seen.add(scan.ticketId);
      accepted += 1;
    }

    setRows(seen);
    setUploads((count) => count + 1);
    setQueue([]);
    say(
      accepted > 0 ? "ok" : "warn",
      `${label}: ${accepted} new row${accepted === 1 ? "" : "s"}, ` +
        `${duplicates} already known (ignored, not duplicated).`,
    );
  };

  const reset = () => {
    setOffline(false);
    setQueue([]);
    setRows(initial);
    setLines([]);
    setUploads(0);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={offline ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setOffline((value) => !value);
            say(
              "muted",
              offline ? "Signal is back." : "Signal lost. From here the phone is on its own.",
            );
          }}
          className={cn("gap-2", offline ? "bg-amber-600 hover:bg-amber-600/90" : "")}
        >
          {offline ? <WifiOff className="size-4" /> : <Wifi className="size-4" />}
          {offline ? "Simulating: offline" : "Simulate: go offline"}
        </Button>

        <Badge variant={queue.length > 0 ? "destructive" : "secondary"} className="gap-1">
          <CloudOff className="size-3" /> Pending {queue.length}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Cloud className="size-3" /> Saved rows {rows.size}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => flush("Upload")}
          disabled={queue.length === 0}
          className="gap-2"
        >
          <ScanLine className="size-4" /> Reconnect &amp; sync
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset} className="gap-2">
          <RotateCcw className="size-4" /> Start over
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Door code</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Scan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => {
              const inRoom = rows.has(ticket.ticketId);
              const queued = queue.some((scan) => scan.ticketId === ticket.ticketId);
              return (
                <TableRow key={ticket.ticketId}>
                  <TableCell className="font-medium">{ticket.holder}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {ticket.doorCode}
                  </TableCell>
                  <TableCell>
                    {inRoom ? (
                      <Badge variant="secondary" className="gap-1">
                        <BadgeCheck className="size-3" /> inside
                      </Badge>
                    ) : queued ? (
                      <Badge variant="destructive" className="gap-1">
                        <CloudOff className="size-3" /> queued
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">expected</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" size="sm" variant="outline" onClick={() => scan(ticket)}>
                      Scan
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {uploads > 1 ? (
        <p className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          You have synced {uploads} times. The saved-row count has not moved because the same scans
          carry the same ids — that is the whole trick.
        </p>
      ) : null}

      <ol className="flex flex-col gap-1.5" aria-live="polite">
        {lines.length === 0 ? (
          <li className="text-xs text-muted-foreground">
            Press <strong>Simulate: go offline</strong>, scan the three people who are expected, then
            press <strong>Reconnect &amp; sync</strong>.
          </li>
        ) : null}
        {lines.map((line) => (
          <li
            key={line.id}
            className={cn(
              "text-xs",
              line.tone === "ok" && "text-emerald-700 dark:text-emerald-400",
              line.tone === "warn" && "text-amber-700 dark:text-amber-400",
              line.tone === "bad" && "text-destructive",
              line.tone === "muted" && "text-muted-foreground",
            )}
          >
            {line.text}
          </li>
        ))}
      </ol>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        A rehearsal, not a request: this panel keeps its own rows in the browser and writes nothing.
        The real queue lives in the phone&apos;s local storage and uploads to{" "}
        <span className="font-mono">/check-in/sync</span>; the integration test replays the same
        batch twice against Postgres and asserts exactly three rows.
      </p>
    </div>
  );
}
