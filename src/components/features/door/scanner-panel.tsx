"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  CloudOff,
  Keyboard,
  RefreshCw,
  TriangleAlert,
  WifiOff,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  enqueue,
  markRejected,
  markSynced,
  readManifest,
  readQueue,
  writeManifest,
  type CachedManifest,
  type QueuedScan,
} from "@/lib/door/queue";
import { normaliseDoorCode } from "@/lib/domain/check-in";
import { fingerprintSecretInBrowser } from "@/lib/tickets/fingerprint.browser";
import { canonicalSecret, decodeTicketQr } from "@/lib/tickets/qr";
import { cn } from "@/lib/utils";
import type { ApiFailure, ApiSuccess } from "@/types/api";

/** Mirror of the server's `CheckInOutcome`, for rendering only. */
type Outcome =
  | "CHECKED_IN"
  | "ALREADY_CHECKED_IN"
  | "WAITLISTED"
  | "CANCELLED_TICKET"
  | "NOT_FOUND"
  | "AMBIGUOUS_CODE"
  | "TOO_EARLY"
  | "CLOSED"
  | "EVENT_CANCELLED"
  | "QUEUED_OFFLINE";

type Source = "SCANNER" | "MANUAL";

interface ScanResult {
  readonly id: string;
  readonly outcome: Outcome;
  readonly message: string;
  readonly admitted: boolean;
  readonly at: string;
  readonly offline: boolean;
}

interface CheckInResponse {
  outcome: Outcome;
  message: string;
  admitted: boolean;
  ticket?: { id: string; status: string; holder: string; email: string };
  checkIn?: { at: string; by: string | null; device: string | null; source: string };
  replayed?: boolean;
}

interface ScannerPanelProps {
  eventId: string;
  eventTitle: string;
  startTime: string;
  endTime: string;
  timeZone: string;
}

interface Verdict {
  outcome: Outcome;
  message: string;
  admitted: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The door, as a volunteer sees it.
 *
 * Three design decisions came out of failure modes rather than the happy path:
 *
 *  • **Camera first, never camera only.** A cracked lens, a denied permission or a
 *    QR printed too small must not stop the queue moving, so the typed-code field
 *    is always on screen.
 *  • **Online is a guess; losing a scan is a fact.** `navigator.onLine` only says
 *    an interface exists. Every accepted scan is written to the phone *first* and
 *    sent second, so a dropped connection mid-request costs nothing.
 *  • **Accepted ≠ recorded.** An offline scan is labelled "accepted offline, will
 *    sync" — never "checked in" — because the records do not know about it yet.
 */
export function ScannerPanel({
  eventId,
  eventTitle,
  startTime,
  timeZone,
}: ScannerPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<{ stop: () => void; destroy: () => Promise<void> | void } | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [cameraState, setCameraState] = useState<"idle" | "starting" | "running" | "unavailable">(
    "idle",
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [manifest, setManifest] = useState<CachedManifest | null>(null);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Hydrate from this phone ────────────────────────────────────────────────
  useEffect(() => {
    setOnline(navigator.onLine);
    setQueue(readQueue(eventId));
    setManifest(readManifest(eventId));

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [eventId]);

  const refreshManifest = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/check-in/manifest`, { cache: "no-store" });
      const body = (await response.json()) as ApiSuccess<CachedManifest> | ApiFailure;
      if (!body.ok) return;

      writeManifest(eventId, body.data);
      setManifest(body.data);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [eventId]);

  useEffect(() => {
    void refreshManifest();
  }, [refreshManifest]);

  const pushResult = useCallback(
    (result: Verdict & { offline: boolean }) => {
      setResults((previous) =>
        [
          {
            id: crypto.randomUUID(),
            outcome: result.outcome,
            message: result.message,
            admitted: result.admitted,
            at: new Date().toISOString(),
            offline: result.offline,
          },
          ...previous,
        ].slice(0, 30),
      );
    },
    [],
  );

  // ── Flush the queue ────────────────────────────────────────────────────────
  const sync = useCallback(async () => {
    const pending = readQueue(eventId).filter((scan) => scan.state === "pending");
    if (pending.length === 0) {
      setNotice("Nothing waiting to sync.");
      return;
    }

    setSyncing(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/events/${eventId}/check-in/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceLabel: navigator.userAgent.slice(0, 60),
          scans: pending.map((scan) => ({
            scanUuid: scan.scanUuid,
            code: scan.code,
            scannedAt: scan.scannedAt,
            source: scan.source,
          })),
        }),
      });

      const body = (await response.json()) as
        | ApiSuccess<{
            results: (CheckInResponse & { scanUuid: string })[];
            counts: { checkedIn: number };
          }>
        | ApiFailure;

      if (!body.ok) {
        setNotice(`Could not sync: ${body.error.message}`);
        return;
      }

      let current = readQueue(eventId);
      for (const result of body.data.results) {
        current = result.admitted
          ? markSynced(eventId, result.scanUuid)
          : markRejected(eventId, result.scanUuid, result.message);

        pushResult({ ...result, offline: false });
      }

      setQueue(current);
      setNotice(
        `Synced ${body.data.results.length} scan${body.data.results.length === 1 ? "" : "s"} — ${body.data.counts.checkedIn} newly checked in.`,
      );
      void refreshManifest();
    } catch {
      setOnline(false);
      setNotice("Still offline — the queue is safe on this phone.");
    } finally {
      setSyncing(false);
    }
  }, [eventId, pushResult, refreshManifest]);

  // Auto-sync when the connection returns and something is waiting.
  useEffect(() => {
    if (!online) return;
    const pending = readQueue(eventId).filter((scan) => scan.state === "pending");
    if (pending.length > 0 && !syncing) void sync();
    // `sync` is intentionally omitted: it changes on every manifest refresh and
    // would turn this into a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, eventId]);

  // ── One scan ───────────────────────────────────────────────────────────────
  const handleCode = useCallback(
    async (rawCode: string, source: Source) => {
      const code = rawCode.trim();
      if (code.length === 0) return;

      // A camera reads the same QR many times a second; ignore the repeats.
      const now = Date.now();
      if (lastCodeRef.current.code === code && now - lastCodeRef.current.at < 2500) return;
      lastCodeRef.current = { code, at: now };

      setBusy(true);
      const scanUuid = crypto.randomUUID();
      const scannedAt = new Date().toISOString();

      try {
        // Written down before it is sent: if the phone dies mid-request, the scan
        // is still on the device and will sync later.
        enqueue(eventId, { scanUuid, code, scannedAt, source, holder: null, state: "pending" });

        if (!navigator.onLine) {
          const verdict = await verifyOffline(code, manifest, readQueue(eventId));
          settle(scanUuid, verdict, true);
          return;
        }

        let response: Response;
        try {
          response = await fetch(`/api/events/${eventId}/check-in`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, source, scanUuid, scannedAt }),
          });
        } catch {
          // The request never left the phone — treat it exactly like a scan taken
          // with no signal at all.
          setOnline(false);
          const verdict = await verifyOffline(code, manifest, readQueue(eventId));
          settle(scanUuid, verdict, true);
          return;
        }

        const body = (await response.json()) as ApiSuccess<CheckInResponse> | ApiFailure;

        if (!body.ok) {
          setQueue(markRejected(eventId, scanUuid, body.error.message));
          pushResult({ outcome: "NOT_FOUND", message: body.error.message, admitted: false, offline: false });
          return;
        }

        settle(scanUuid, body.data, false);
        void refreshManifest();
      } finally {
        setBusy(false);
        setManualCode("");
      }

      function settle(scanUuidToSettle: string, verdict: Verdict, offline: boolean) {
        setQueue(
          verdict.admitted
            ? markSynced(eventId, scanUuidToSettle)
            : markRejected(eventId, scanUuidToSettle, verdict.message),
        );
        pushResult({ ...verdict, offline });
      }
    },
    [eventId, manifest, pushResult, refreshManifest],
  );

  // ── Camera lifecycle ───────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraState("starting");
    setCameraError(null);

    try {
      const qrModule = await import("qr-scanner");
      const QrScanner = qrModule.default;

      // Served from /public so decoding does not depend on the bundler's worker
      // handling; without it the video stutters on older phones.
      QrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";

      if (!videoRef.current) return;

      const scanner = new QrScanner(
        videoRef.current,
        (result) => {
          void handleCode(typeof result === "string" ? result : result.data, "SCANNER");
        },
        {
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 8,
          returnDetailedScanResult: true,
        },
      );

      await scanner.start();
      scannerRef.current = scanner;
      setCameraState("running");
    } catch (error) {
      scannerRef.current = null;
      setCameraState("unavailable");
      setCameraError(
        error instanceof Error && error.name === "NotAllowedError"
          ? "The browser blocked the camera. Allow access, or type the code below."
          : "No usable camera here. Type the code printed under the QR instead.",
      );
    }
  }, [handleCode]);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      scanner.stop();
      await scanner.destroy();
    }
    setCameraState("idle");
  }, []);

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner.stop();
        void scanner.destroy();
      }
    };
  }, []);

  const pending = queue.filter((scan) => scan.state === "pending").length;
  const latest = results[0];

  return (
    <div className="flex flex-col gap-5">
      {/* ── Connection ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
        <span className="flex items-center gap-2 text-sm">
          {online ? (
            <>
              <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
              Online — scans are recorded immediately
            </>
          ) : (
            <>
              <WifiOff className="size-4 text-amber-600" />
              Offline — scans are held on this phone
            </>
          )}
        </span>

        <span className="flex items-center gap-2">
          {pending > 0 ? (
            <Badge variant="secondary">{pending} waiting to sync</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Nothing pending</span>
          )}
          <Button size="sm" variant="outline" disabled={syncing} onClick={() => void sync()}>
            <RefreshCw data-icon="inline-start" className={cn(syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </span>
      </div>

      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}

      {/* ── Camera ───────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border bg-black/90">
        <div className="relative aspect-[4/3] w-full sm:aspect-video">
          <video
            ref={videoRef}
            className={cn(
              "h-full w-full object-cover",
              cameraState === "running" ? "opacity-100" : "opacity-0",
            )}
            muted
            playsInline
          />

          {cameraState !== "running" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
              {cameraState === "unavailable" ? <CameraOff className="size-8" /> : <Camera className="size-8" />}
              <p className="max-w-sm text-sm">
                {cameraState === "unavailable"
                  ? (cameraError ?? "No camera available.")
                  : "Point the phone at the QR code on the ticket."}
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={cameraState === "starting"}
                onClick={() => void startCamera()}
              >
                <Camera data-icon="inline-start" />
                {cameraState === "starting" ? "Starting…" : "Start camera"}
              </Button>
            </div>
          ) : null}
        </div>

        {cameraState === "running" ? (
          <div className="flex items-center justify-between gap-2 bg-black px-3 py-2">
            <span className="text-xs text-white/60">Scanning… hold the code steady.</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:text-white"
              onClick={() => void stopCamera()}
            >
              Stop
            </Button>
          </div>
        ) : null}
      </div>

      {/* ── Manual fallback ──────────────────────────────────────────────── */}
      <form
        className="flex flex-col gap-2 rounded-lg border border-dashed p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCode(manualCode, "MANUAL");
        }}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Keyboard className="size-4 text-muted-foreground" />
          Type the door code
        </span>
        <span className="text-xs text-muted-foreground">
          Eight characters, printed under the QR. Use this when the camera is blocked, the screen is
          cracked, or the light is bad.
        </span>
        <div className="flex gap-2">
          <Input
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="A1B2C3D4"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase tracking-widest"
            aria-label="Door code"
          />
          <Button type="submit" disabled={busy || manualCode.trim().length < 4}>
            Check in
          </Button>
        </div>
      </form>

      {/* ── The last result, big ─────────────────────────────────────────── */}
      {latest ? (
        <div
          className={cn(
            "flex flex-col gap-1 rounded-xl border-2 p-4",
            latest.admitted
              ? "border-emerald-500/50 bg-emerald-500/10"
              : "border-rose-500/50 bg-rose-500/10",
          )}
          role="status"
          aria-live="polite"
        >
          <span className="flex items-center gap-2 text-base font-semibold">
            {latest.admitted ? (
              <CheckCircle2 className="size-5 text-emerald-600" />
            ) : (
              <XCircle className="size-5 text-rose-600" />
            )}
            {latest.offline ? "Accepted offline" : outcomeLabel(latest.outcome)}
          </span>
          <span className="text-sm">{latest.message}</span>
          {latest.offline ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CloudOff className="size-3" />
              Held on this phone; it uploads itself when the connection returns.
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── Earlier at this door ─────────────────────────────────────────── */}
      {results.length > 1 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Earlier at this door ({results.length - 1})
          </span>
          <ul className="flex flex-col divide-y rounded-lg border">
            {results.slice(1, 8).map((result) => (
              <li key={result.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <span className="flex items-center gap-2">
                  {result.admitted ? (
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                  ) : (
                    <TriangleAlert className="size-3.5 text-rose-600" />
                  )}
                  {result.message}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(result.at).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── The phone's own log ──────────────────────────────────────────── */}
      {queue.length > 0 ? (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            This phone&apos;s scan log ({queue.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {queue
              .slice()
              .reverse()
              .slice(0, 20)
              .map((scan) => (
                <li key={scan.scanUuid} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono">{scan.scanUuid.slice(0, 8)}</span>
                  <span className="font-mono">{scan.code.slice(-8).toUpperCase()}</span>
                  <Badge
                    variant={
                      scan.state === "synced"
                        ? "secondary"
                        : scan.state === "rejected"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {scan.state}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(scan.scannedAt).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone,
                    })}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Door for <span className="font-medium text-foreground">{eventTitle}</span>. Scans are only
        accepted on the day of the event (
        {new Date(startTime).toLocaleDateString("en-IN", { timeZone })}), in the college&apos;s
        timezone. Every scan here is recorded against your account.
      </p>
    </div>
  );
}

function outcomeLabel(outcome: Outcome): string {
  switch (outcome) {
    case "CHECKED_IN":
      return "Checked in";
    case "ALREADY_CHECKED_IN":
      return "Already checked in";
    case "WAITLISTED":
      return "On the waitlist";
    case "CANCELLED_TICKET":
      return "Ticket cancelled";
    case "EVENT_CANCELLED":
      return "Event cancelled";
    case "TOO_EARLY":
      return "Not today";
    case "CLOSED":
      return "Check-in closed";
    case "AMBIGUOUS_CODE":
      return "Code is ambiguous";
    case "NOT_FOUND":
      return "No matching ticket";
    case "QUEUED_OFFLINE":
      return "Accepted offline";
  }
}

/**
 * Decide a scan **without the server**.
 *
 * The manifest carries a SHA-256 fingerprint per ticket, so the phone can verify a
 * scanned secret by hashing it — without ever holding anything that could be used
 * to forge one.
 *
 * A typed door code cannot be hashed back into a fingerprint, so it is matched
 * against the short codes in the manifest instead. That is safe precisely because
 * the door code is *not* a secret: it is printed on the ticket, and on its own it
 * opens nothing.
 *
 * Refusals here are conservative: anything doubtful is rejected rather than
 * queued, because a person wrongly refused can be let in by an organiser, while a
 * person wrongly admitted cannot be un-let-in.
 */
async function verifyOffline(
  code: string,
  manifest: CachedManifest | null,
  queue: QueuedScan[],
): Promise<Verdict> {
  if (!manifest) {
    return {
      outcome: "NOT_FOUND",
      message: "No guest list saved on this phone yet. Reconnect once to download it.",
      admitted: false,
    };
  }

  // Full secret (QR payload or a copied UUID) → hash it and look the hash up.
  const payloadSecret = decodeTicketQr(code);
  const trimmed = code.trim().toLowerCase();
  const bareSecret = UUID_PATTERN.test(trimmed) ? trimmed : null;
  const secret = payloadSecret ?? bareSecret;

  let matches: typeof manifest.tickets[number][] = [];

  if (secret) {
    const fingerprint = await fingerprintSecretInBrowser(canonicalSecret(secret));
    if (!fingerprint) {
      return {
        outcome: "NOT_FOUND",
        message: "This browser cannot verify tickets offline. Reconnect to check this one in.",
        admitted: false,
      };
    }
    matches = manifest.tickets.filter((ticket) => ticket.fingerprint === fingerprint);
  } else {
    const doorCode = normaliseDoorCode(code).toUpperCase();
    if (doorCode.length < 4) {
      return { outcome: "NOT_FOUND", message: "That is not a ticket code.", admitted: false };
    }
    matches = manifest.tickets.filter((ticket) => ticket.doorCode.endsWith(doorCode));
  }

  if (matches.length === 0) {
    return {
      outcome: "NOT_FOUND",
      message: "That ticket is not on this event's guest list.",
      admitted: false,
    };
  }

  if (matches.length > 1) {
    return {
      outcome: "AMBIGUOUS_CODE",
      message: "Several tickets match. Type a few more characters.",
      admitted: false,
    };
  }

  const ticket = matches[0]!;

  if (ticket.status === "WAITLISTED") {
    return {
      outcome: "WAITLISTED",
      message: `${ticket.holder} is on the waitlist — no seat.`,
      admitted: false,
    };
  }

  if (ticket.checkedInAt) {
    return {
      outcome: "ALREADY_CHECKED_IN",
      message: `${ticket.holder} was already checked in.`,
      admitted: true,
    };
  }

  // Already accepted at this door earlier this evening and not yet uploaded.
  const alreadyQueued = queue.some(
    (scan) => scan.state === "pending" && scan.code.trim() === code.trim(),
  );

  if (alreadyQueued) {
    return {
      outcome: "ALREADY_CHECKED_IN",
      message: `${ticket.holder} is already in this phone's queue.`,
      admitted: true,
    };
  }

  return {
    outcome: "QUEUED_OFFLINE",
    message: `${ticket.holder} — accepted offline.`,
    admitted: true,
  };
}
