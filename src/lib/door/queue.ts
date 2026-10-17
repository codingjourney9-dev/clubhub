"use client";

/**
 * The offline scan queue, kept in `localStorage`.
 *
 * Why local storage and not the network: the whole point of this file is the case
 * where there is no network. A scan that was accepted at the door must survive
 * the phone being locked, the browser being closed, and the signal never coming
 * back until morning.
 *
 * Each entry carries a `scanUuid` generated **on the phone, at the moment of the
 * scan**. That id is the idempotency key: flushing the queue twice, or retrying a
 * request that seemed to fail, produces the same rows on the server rather than
 * duplicate check-ins.
 */

export type QueuedScanState = "pending" | "synced" | "rejected";

export interface QueuedScan {
  readonly scanUuid: string;
  readonly code: string;
  /** When the scan actually happened — not when it was finally synced. */
  readonly scannedAt: string;
  readonly source: "SCANNER" | "MANUAL";
  /** Who the phone believes this is, for a readable queue. */
  readonly holder: string | null;
  state: QueuedScanState;
  /** Why the server rejected it, when it did. */
  message?: string;
}

const KEY_PREFIX = "clubhub:door:";

function queueKey(eventId: string): string {
  return `${KEY_PREFIX}${eventId}:queue`;
}

function manifestKey(eventId: string): string {
  return `${KEY_PREFIX}${eventId}:manifest`;
}

/** `localStorage` throws in private modes and when storage is full; never crash the door. */
function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A full disk must not stop a volunteer from scanning; the queue simply
    // lives in memory for this session.
  }
}

export function readQueue(eventId: string): QueuedScan[] {
  const raw = safeRead(queueKey(eventId));
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

export function writeQueue(eventId: string, queue: QueuedScan[]): void {
  safeWrite(queueKey(eventId), JSON.stringify(queue));
}

export function enqueue(eventId: string, scan: QueuedScan): QueuedScan[] {
  const queue = [...readQueue(eventId), scan];
  writeQueue(eventId, queue);
  return queue;
}

export function markSynced(eventId: string, scanUuid: string): QueuedScan[] {
  const queue = readQueue(eventId).map((scan) =>
    scan.scanUuid === scanUuid ? { ...scan, state: "synced" as const } : scan,
  );
  writeQueue(eventId, queue);
  return queue;
}

export function markRejected(eventId: string, scanUuid: string, message: string): QueuedScan[] {
  const queue = readQueue(eventId).map((scan) =>
    scan.scanUuid === scanUuid ? { ...scan, state: "rejected" as const, message } : scan,
  );
  writeQueue(eventId, queue);
  return queue;
}

export function clearSettled(eventId: string): QueuedScan[] {
  const queue = readQueue(eventId).filter((scan) => scan.state === "pending");
  writeQueue(eventId, queue);
  return queue;
}

// ── Cached manifest ──────────────────────────────────────────────────────────

export interface CachedManifestTicket {
  readonly ticketId: string;
  readonly holder: string;
  readonly status: "REGISTERED" | "WAITLISTED";
  /** SHA-256 of the ticket secret: verifies a scan without holding the secret. */
  readonly fingerprint: string;
  /** The short code printed on the ticket, for typed lookups while offline. */
  readonly doorCode: string;
  readonly checkedInAt: string | null;
}

export interface CachedManifest {
  readonly event: {
    readonly id: string;
    readonly title: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly timezone: string;
    readonly status: string;
    readonly capacity: number | null;
  };
  readonly generatedAt: string;
  readonly tickets: readonly CachedManifestTicket[];
}

export function readManifest(eventId: string): CachedManifest | null {
  const raw = safeRead(manifestKey(eventId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CachedManifest;
  } catch {
    return null;
  }
}

export function writeManifest(eventId: string, manifest: CachedManifest): void {
  safeWrite(manifestKey(eventId), JSON.stringify(manifest));
}
