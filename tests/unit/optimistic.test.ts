import { describe, expect, it } from "vitest";

import {
  applyPatch,
  projectRows,
  rollbackPatch,
  settlePatches,
} from "@/lib/ui/optimistic";

/**
 * Optimistic updates have exactly one hard part: deciding when a claim stops
 * being a claim and becomes the truth. Getting it wrong is invisible in a happy
 * path and obvious in production — a row stuck on "published" after somebody else
 * cancelled it.
 */

const serverRows = [
  { id: "a", status: "DRAFT" as const },
  { id: "b", status: "PUBLISHED" as const },
];

describe("optimistic patches", () => {
  it("shows the claim immediately, before the server answers", () => {
    const patches = applyPatch({}, "a", { status: "PUBLISHED" });

    expect(projectRows(patches, serverRows)).toEqual([
      { id: "a", status: "PUBLISHED" },
      { id: "b", status: "PUBLISHED" },
    ]);
  });

  it("never mutates the server list it was given", () => {
    const before = JSON.stringify(serverRows);
    const patches = applyPatch({}, "a", { status: "CANCELLED" });

    projectRows(patches, serverRows);

    expect(JSON.stringify(serverRows)).toBe(before);
  });

  it("rolls back to the server's value when the request fails", () => {
    const optimistic = applyPatch({}, "a", { status: "PUBLISHED" });
    const rolledBack = rollbackPatch(optimistic, "a");

    expect(projectRows(rolledBack, serverRows)[0]).toEqual({ id: "a", status: "DRAFT" });
  });

  it("hides a row optimistically while a delete is in flight", () => {
    const patches = applyPatch({}, "a", { removed: true });

    expect(projectRows(patches, serverRows).map((row) => row.id)).toEqual(["b"]);
  });

  it("keeps the claim until the server's data agrees", () => {
    const patches = applyPatch({}, "a", { status: "PUBLISHED" });

    // The refresh has not landed yet — the old rows still say DRAFT.
    expect(settlePatches(patches, serverRows)).toEqual(patches);
  });

  it("drops the claim once the server reports the same status", () => {
    const patches = applyPatch({}, "a", { status: "PUBLISHED" });
    const refreshed = [
      { id: "a", status: "PUBLISHED" as const },
      { id: "b", status: "PUBLISHED" as const },
    ];

    expect(settlePatches(patches, refreshed)).toEqual({});
  });

  it("drops a delete claim once the row is really gone", () => {
    const patches = applyPatch({}, "a", { removed: true });

    expect(settlePatches(patches, [{ id: "b", status: "PUBLISHED" as const }])).toEqual({});
  });

  it("keeps a delete claim if the row is still there — somebody re-created it", () => {
    const patches = applyPatch({}, "a", { removed: true });

    expect(settlePatches(patches, serverRows)).toEqual(patches);
  });

  it("returns the same object when nothing changed, so React can skip a render", () => {
    const patches = applyPatch({}, "a", { status: "PUBLISHED" });

    expect(settlePatches(patches, serverRows)).toBe(patches);
    expect(rollbackPatch(patches, "missing")).toBe(patches);
  });
});
