/**
 * Tests for the legacy → Asset-grain status normalizer (`src/asset/migrate.ts`) — issue #55 / ADR-0011.
 * Pure — no disk.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeIdeaStatus, isLegacyProductionStatus, DEFAULT_ASSET_RECIPE } from "./migrate.ts";
import { listWiredRecipeSlugs } from "../recipe/registry.ts";

// ---------------------------------------------------------------------------
// DEFAULT_ASSET_RECIPE must name a REAL wired Recipe slug (cross-check against the registry).
// ---------------------------------------------------------------------------

describe("DEFAULT_ASSET_RECIPE — aligns with the in-repo Recipe registry", () => {
  it("is a slug the registry actually has wired", () => {
    assert.ok(
      listWiredRecipeSlugs().includes(DEFAULT_ASSET_RECIPE),
      `DEFAULT_ASSET_RECIPE (${DEFAULT_ASSET_RECIPE}) must be a wired Recipe slug`,
    );
  });
});

// ---------------------------------------------------------------------------
// isLegacyProductionStatus
// ---------------------------------------------------------------------------

describe("isLegacyProductionStatus — recognizes exactly the five retired Idea-level production statuses", () => {
  it("recognizes casting/produced/posted/tracking/scored", () => {
    for (const s of ["casting", "produced", "posted", "tracking", "scored"]) {
      assert.ok(isLegacyProductionStatus(s), `${s} must be a legacy production status`);
    }
  });

  it("rejects the canonical Idea statuses and garbage", () => {
    assert.equal(isLegacyProductionStatus("suggested"), false);
    assert.equal(isLegacyProductionStatus("accepted"), false);
    assert.equal(isLegacyProductionStatus("rejected"), false);
    assert.equal(isLegacyProductionStatus(""), false);
    assert.equal(isLegacyProductionStatus("bogus"), false);
  });
});

// ---------------------------------------------------------------------------
// normalizeIdeaStatus — canonical records pass through unchanged
// ---------------------------------------------------------------------------

describe("normalizeIdeaStatus — canonical records (suggested/accepted/rejected) pass through", () => {
  it("suggested with no assets → status unchanged, assets []", () => {
    const result = normalizeIdeaStatus({ id: "i1", status: "suggested" });
    assert.deepEqual(result, { status: "suggested", assets: [] });
  });

  it("accepted with no assets → status unchanged, assets [] (today's real-ledger shape)", () => {
    const result = normalizeIdeaStatus({ id: "i1", status: "accepted" });
    assert.deepEqual(result, { status: "accepted", assets: [] });
  });

  it("rejected with no assets → status unchanged, assets []", () => {
    const result = normalizeIdeaStatus({ id: "i1", status: "rejected" });
    assert.deepEqual(result, { status: "rejected", assets: [] });
  });

  it("accepted with an ALREADY-canonical assets array → passes the assets through", () => {
    const raw = {
      id: "i1",
      status: "accepted",
      assets: [{ recipe: "character-explainer-with-cast", status: "queued" }],
    };
    const result = normalizeIdeaStatus(raw);
    assert.equal(result.status, "accepted");
    assert.deepEqual(result.assets, [{ recipe: "character-explainer-with-cast", status: "queued" }]);
  });
});

// ---------------------------------------------------------------------------
// normalizeIdeaStatus — legacy production statuses fold onto ONE Asset
// ---------------------------------------------------------------------------

describe("normalizeIdeaStatus — legacy 'casting' folds to accepted + one in_production Asset paused at 'cast'", () => {
  it("folds casting → accepted, with an Asset at in_production/pending_gate:cast on the default Recipe", () => {
    const result = normalizeIdeaStatus({ id: "i1", status: "casting" });
    assert.equal(result.status, "accepted");
    assert.equal(result.assets.length, 1);
    assert.deepEqual(result.assets[0], {
      recipe: DEFAULT_ASSET_RECIPE,
      status: "in_production",
      pending_gate: "cast",
    });
  });

  it("carries the Cast candidates and any other populated scalar fields onto the Asset", () => {
    const raw = {
      id: "i1",
      status: "casting",
      cast: [{ identifier: "cast-1", url: "https://x/1.png" }],
    };
    const result = normalizeIdeaStatus(raw);
    assert.equal(result.assets[0]!.status, "in_production");
    assert.deepEqual(result.assets[0]!.cast, [{ identifier: "cast-1", url: "https://x/1.png" }]);
  });

  it("uses the Idea's OWN recipes[0] when recorded, instead of the default Recipe", () => {
    const raw = { id: "i1", status: "casting", recipes: ["character-explainer-with-cast"] };
    const result = normalizeIdeaStatus(raw);
    assert.equal(result.assets[0]!.recipe, "character-explainer-with-cast");
  });
});

describe("normalizeIdeaStatus — legacy 'produced' folds to accepted + one produced Asset (no pending_gate)", () => {
  it("folds produced → accepted, with an Asset at produced and NO pending_gate", () => {
    const raw = {
      id: "i1",
      status: "produced",
      character: "cast-3",
      asset_url: "https://x/asset.mp4",
      produced_at: "2026-06-05T12:00:00.000Z",
    };
    const result = normalizeIdeaStatus(raw);
    assert.equal(result.status, "accepted");
    assert.deepEqual(result.assets[0], {
      recipe: DEFAULT_ASSET_RECIPE,
      status: "produced",
      character: "cast-3",
      asset_url: "https://x/asset.mp4",
      produced_at: "2026-06-05T12:00:00.000Z",
    });
  });
});

describe("normalizeIdeaStatus — legacy posted/tracking/scored fold onto the matching Asset stage", () => {
  it("posted → accepted + Asset at posted, carrying post_url/posted_at", () => {
    const raw = { id: "i1", status: "posted", post_url: "https://facebook.com/post/1", posted_at: "2026-06-07T00:00:00Z" };
    const result = normalizeIdeaStatus(raw);
    assert.equal(result.status, "accepted");
    assert.deepEqual(result.assets[0], {
      recipe: DEFAULT_ASSET_RECIPE,
      status: "posted",
      post_url: "https://facebook.com/post/1",
      posted_at: "2026-06-07T00:00:00Z",
    });
  });

  it("tracking → accepted + Asset at tracking", () => {
    const result = normalizeIdeaStatus({ id: "i1", status: "tracking" });
    assert.equal(result.status, "accepted");
    assert.equal(result.assets[0]!.status, "tracking");
  });

  it("scored → accepted + Asset at scored, carrying performance_score", () => {
    const raw = { id: "i1", status: "scored", performance_score: 0.81 };
    const result = normalizeIdeaStatus(raw);
    assert.equal(result.status, "accepted");
    assert.equal(result.assets[0]!.status, "scored");
    assert.equal(result.assets[0]!.performance_score, 0.81);
  });
});

// ---------------------------------------------------------------------------
// normalizeIdeaStatus — defensive fallback for garbled/missing status
// ---------------------------------------------------------------------------

describe("normalizeIdeaStatus — never crashes on a missing/garbled status (data-handling rule 4)", () => {
  it("missing status → suggested, no assets", () => {
    assert.deepEqual(normalizeIdeaStatus({ id: "i1" }), { status: "suggested", assets: [] });
  });

  it("unrecognized status string → suggested, no assets", () => {
    assert.deepEqual(normalizeIdeaStatus({ id: "i1", status: "bogus" }), { status: "suggested", assets: [] });
  });
});

// ---------------------------------------------------------------------------
// Idempotency — normalizing an already-normalized record is a no-op
// ---------------------------------------------------------------------------

describe("normalizeIdeaStatus — idempotent: normalizing its OWN output changes nothing", () => {
  it("round-trips a folded legacy 'casting' record with no further change", () => {
    const first = normalizeIdeaStatus({ id: "i1", status: "casting", cast: [{ identifier: "c1", url: "https://x/1.png" }] });
    const second = normalizeIdeaStatus({ id: "i1", status: first.status, assets: first.assets });
    assert.equal(second.status, first.status);
    assert.deepEqual(second.assets, first.assets);
  });
});
