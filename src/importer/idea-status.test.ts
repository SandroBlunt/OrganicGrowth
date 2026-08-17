/**
 * Tests for `resolveIdeaStatus` (`src/importer/idea-status.ts`) — issue #204.
 *
 * Covers Straw Motion's THIRD Idea shape: a real record (`idea-2026-08-11-12` in
 * `data/brands/straw-motion/ledger.json`) whose top-level `status` is a RETIRED ADR-0011 production
 * value (`"produced"`) even though its `assets` array is already populated at the canonical grain —
 * `src/asset/migrate.ts`'s `normalizeIdeaStatus` passes such a record's raw `status` straight through
 * (its own `existingAssets.length > 0` branch never re-derives a legacy status), so the importer's own
 * loader-facing wrapper resolves it here instead.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveIdeaStatus } from "./idea-status.ts";

describe("resolveIdeaStatus — the SQL idea.status CHECK's ('suggested'|'accepted'|'rejected') value for one loader-normalized record", () => {
  it("passes a canonical suggested status through unchanged", () => {
    assert.equal(resolveIdeaStatus("suggested", 0), "suggested");
  });

  it("passes a canonical accepted status through unchanged", () => {
    assert.equal(resolveIdeaStatus("accepted", 2), "accepted");
  });

  it("passes a canonical rejected status through unchanged", () => {
    assert.equal(resolveIdeaStatus("rejected", 0), "rejected");
  });

  it("coerces a retired legacy production status to accepted when Assets are already populated (the idea-2026-08-11-12 shape)", () => {
    assert.equal(resolveIdeaStatus("produced", 2), "accepted");
  });

  it("coerces any other non-canonical status to accepted when Assets are already populated", () => {
    assert.equal(resolveIdeaStatus("posted", 1), "accepted");
    assert.equal(resolveIdeaStatus("scored", 1), "accepted");
  });

  it("defensively falls back to suggested for a non-canonical status with no Assets (should not occur in real data, never crashes)", () => {
    assert.equal(resolveIdeaStatus("produced", 0), "suggested");
  });
});
