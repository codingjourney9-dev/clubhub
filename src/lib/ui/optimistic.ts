/**
 * The small, testable half of an optimistic update.
 *
 * The idea: show the new value immediately, then either confirm it (the server
 * agreed) or take it back (the server did not). The tricky part is *when* to take
 * it back — too early and the UI flickers back and forth while the page refreshes.
 *
 * So a patch is not a one-shot value; it is a claim that lives until the server's
 * own data agrees with it. These helpers are pure so the lifecycle can be tested
 * without a browser.
 */

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";

export interface StatusPatch {
  readonly status?: EventStatus;
  readonly removed?: boolean;
}

export type PatchMap = Readonly<Record<string, StatusPatch>>;

/** Adds a claim, replacing any previous one for the same row. */
export function applyPatch(patches: PatchMap, id: string, patch: StatusPatch): PatchMap {
  return { ...patches, [id]: patch };
}

/** Takes a claim back — this is the "rollback" when a request fails. */
export function rollbackPatch(patches: PatchMap, id: string): PatchMap {
  if (!(id in patches)) return patches;
  const next = { ...patches };
  delete next[id];
  return next;
}

/**
 * Drops every claim that the freshly-loaded server list now agrees with.
 *
 * Called whenever new props arrive. Without this the patch would be permanent:
 * the row would keep saying "published" even if somebody else cancelled it later.
 */
export function settlePatches<T extends { id: string; status: EventStatus }>(
  patches: PatchMap,
  serverRows: readonly T[],
): PatchMap {
  let changed = false;
  const next: Record<string, StatusPatch> = { ...patches };

  for (const [id, patch] of Object.entries(patches)) {
    const serverRow = serverRows.find((row) => row.id === id);

    if (patch.removed) {
      // The server no longer lists it: the delete really happened.
      if (!serverRow) {
        delete next[id];
        changed = true;
      }
      continue;
    }

    // The server's status caught up with the claim.
    if (patch.status && serverRow?.status === patch.status) {
      delete next[id];
      changed = true;
    }
  }

  return changed ? next : patches;
}

/** The list as the user should see it right now: server data plus live claims. */
export function projectRows<T extends { id: string; status: EventStatus }>(
  patches: PatchMap,
  serverRows: readonly T[],
): T[] {
  return serverRows
    .filter((row) => !patches[row.id]?.removed)
    .map((row) => {
      const patch = patches[row.id];
      return patch?.status ? { ...row, status: patch.status } : row;
    });
}
