/**
 * Tests for the Asset pure deep module (`src/asset/asset.ts`) — issue #55 / ADR-0011.
 *
 * All tests are pure — literal in-memory objects only. No disk, no Magnific Space, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAssetStatus,
  earlierAssetStatus,
  parseCastCandidate,
  parseCastArray,
  parseCopy,
  parseAssetRecord,
  parseAssetsArray,
  findAsset,
  upsertAsset,
  rollupAssetStatus,
  deriveIdeaRollup,
  ideaAtGate,
  ideaHasAssetStatus,
  pendingGateNames,
  type LedgerAssetRecord,
} from "./asset.ts";

// ---------------------------------------------------------------------------
// isAssetStatus / earlierAssetStatus
// ---------------------------------------------------------------------------

describe("isAssetStatus — recognizes exactly the six Asset stages", () => {
  it("accepts every canonical stage", () => {
    for (const s of ["queued", "in_production", "produced", "posted", "tracking", "scored"]) {
      assert.ok(isAssetStatus(s), `${s} must be a valid AssetStatus`);
    }
  });

  it("rejects the retired Idea-level 'casting' and other garbage", () => {
    assert.equal(isAssetStatus("casting"), false);
    assert.equal(isAssetStatus("accepted"), false);
    assert.equal(isAssetStatus(""), false);
    assert.equal(isAssetStatus(42), false);
    assert.equal(isAssetStatus(null), false);
    assert.equal(isAssetStatus(undefined), false);
  });
});

describe("earlierAssetStatus — orders queued < in_production < produced < posted < tracking < scored", () => {
  it("returns the earlier of two stages regardless of argument order", () => {
    assert.equal(earlierAssetStatus("queued", "scored"), "queued");
    assert.equal(earlierAssetStatus("scored", "queued"), "queued");
    assert.equal(earlierAssetStatus("in_production", "produced"), "in_production");
    assert.equal(earlierAssetStatus("posted", "tracking"), "posted");
  });

  it("returns the same stage when both are equal", () => {
    assert.equal(earlierAssetStatus("produced", "produced"), "produced");
  });
});

// ---------------------------------------------------------------------------
// parseCastCandidate / parseCastArray
// ---------------------------------------------------------------------------

describe("parseCastCandidate — defensive parse of one Cast candidate", () => {
  it("parses a well-formed candidate", () => {
    const c = parseCastCandidate({ identifier: "cast-1", url: "https://x/1.png" });
    assert.deepEqual(c, { identifier: "cast-1", url: "https://x/1.png" });
  });

  it("returns null for garbled input (never throws)", () => {
    assert.equal(parseCastCandidate(null), null);
    assert.equal(parseCastCandidate("cast-1"), null);
    assert.equal(parseCastCandidate({ identifier: "cast-1" }), null);
    assert.equal(parseCastCandidate({ url: "https://x/1.png" }), null);
    assert.equal(parseCastCandidate({ identifier: "", url: "https://x/1.png" }), null);
  });
});

describe("parseCastArray — drops malformed entries, never throws", () => {
  it("keeps only well-formed candidates, in order", () => {
    const raw = [
      { identifier: "cast-1", url: "https://x/1.png" },
      { identifier: "cast-2" }, // malformed — dropped
      { identifier: "cast-3", url: "https://x/3.png" },
    ];
    assert.deepEqual(parseCastArray(raw), [
      { identifier: "cast-1", url: "https://x/1.png" },
      { identifier: "cast-3", url: "https://x/3.png" },
    ]);
  });

  it("returns [] for non-array input", () => {
    assert.deepEqual(parseCastArray(undefined), []);
    assert.deepEqual(parseCastArray("nope"), []);
  });
});

describe("parseCopy — structured Copy, defensive (ADR-0012, issue #58)", () => {
  it("parses a well-formed Copy", () => {
    const raw = { caption: "Check this out! 🎉", hashtags: ["#tip", "#morning"] };
    assert.deepEqual(parseCopy(raw), raw);
  });

  it("defaults hashtags to [] when missing or non-array", () => {
    assert.deepEqual(parseCopy({ caption: "x" }), { caption: "x", hashtags: [] });
    assert.deepEqual(parseCopy({ caption: "x", hashtags: "nope" }), { caption: "x", hashtags: [] });
  });

  it("drops non-string hashtag entries defensively", () => {
    assert.deepEqual(parseCopy({ caption: "x", hashtags: ["#a", 7, "#b"] }), {
      caption: "x",
      hashtags: ["#a", "#b"],
    });
  });

  it("returns null when caption is missing, blank, or the value isn't an object", () => {
    assert.equal(parseCopy({ hashtags: [] }), null);
    assert.equal(parseCopy({ caption: "" }), null);
    assert.equal(parseCopy(null), null);
    assert.equal(parseCopy("nope"), null);
  });
});

// ---------------------------------------------------------------------------
// parseAssetRecord / parseAssetsArray
// ---------------------------------------------------------------------------

describe("parseAssetRecord — defensive parse of one raw Asset record", () => {
  it("requires a non-empty recipe and a valid AssetStatus", () => {
    assert.equal(parseAssetRecord({ recipe: "", status: "queued" }), null);
    assert.equal(parseAssetRecord({ recipe: "r", status: "casting" }), null);
    assert.equal(parseAssetRecord({ status: "queued" }), null);
    assert.equal(parseAssetRecord(null), null);
    assert.equal(parseAssetRecord("nope"), null);
  });

  it("parses the minimal shape (recipe + status only)", () => {
    const a = parseAssetRecord({ recipe: "character-explainer-with-cast", status: "queued" });
    assert.deepEqual(a, { recipe: "character-explainer-with-cast", status: "queued" });
  });

  it("parses every optional field when present and well-typed", () => {
    const raw = {
      recipe: "character-explainer-with-cast",
      status: "in_production",
      pending_gate: "cast",
      spec_path: "ideas/2026-W22/idea-01.character-explainer-with-cast.spec.json",
      copy: { caption: "Check this out! 🎉", hashtags: ["#tip"] },
      cast: [{ identifier: "cast-1", url: "https://x/1.png" }],
      character: "cast-1",
      asset_url: "https://x/asset.mp4",
      produced_at: "2026-06-05T12:00:00.000Z",
      post_url: "https://facebook.com/post/1",
      posted_at: "2026-06-06T12:00:00.000Z",
      performance_score: 0.72,
    };
    const a = parseAssetRecord(raw);
    assert.deepEqual(a, raw);
  });

  it("silently drops malformed optional fields rather than crashing", () => {
    const a = parseAssetRecord({
      recipe: "r",
      status: "produced",
      performance_score: "not-a-number",
      cast: "not-an-array",
      character: 42,
    });
    assert.deepEqual(a, { recipe: "r", status: "produced" });
  });
});

describe("parseAssetsArray — drops malformed entries, never throws", () => {
  it("keeps only well-formed Asset records, in order", () => {
    const raw = [
      { recipe: "r1", status: "queued" },
      { recipe: "r2" }, // malformed — dropped
      { recipe: "r3", status: "produced" },
    ];
    assert.deepEqual(parseAssetsArray(raw), [
      { recipe: "r1", status: "queued" },
      { recipe: "r3", status: "produced" },
    ]);
  });

  it("returns [] for non-array/absent input", () => {
    assert.deepEqual(parseAssetsArray(undefined), []);
    assert.deepEqual(parseAssetsArray(null), []);
  });
});

// ---------------------------------------------------------------------------
// findAsset / upsertAsset
// ---------------------------------------------------------------------------

describe("findAsset — looks up an Asset by recipe", () => {
  const assets: LedgerAssetRecord[] = [
    { recipe: "r1", status: "queued" },
    { recipe: "r2", status: "produced" },
  ];

  it("returns the matching Asset", () => {
    assert.deepEqual(findAsset(assets, "r2"), { recipe: "r2", status: "produced" });
  });

  it("returns null when no Asset matches", () => {
    assert.equal(findAsset(assets, "r3"), null);
  });
});

describe("upsertAsset — pure insert-or-update keyed by recipe", () => {
  it("appends a NEW Asset when the recipe is not yet present", () => {
    const assets: LedgerAssetRecord[] = [{ recipe: "r1", status: "queued" }];
    const after = upsertAsset(assets, "r2", { status: "queued" });
    assert.equal(after.length, 2);
    assert.deepEqual(findAsset(after, "r2"), { recipe: "r2", status: "queued" });
  });

  it("updates an EXISTING Asset in place (same array length), merging the patch", () => {
    const assets: LedgerAssetRecord[] = [{ recipe: "r1", status: "queued" }];
    const after = upsertAsset(assets, "r1", { status: "in_production", pending_gate: "cast" });
    assert.equal(after.length, 1);
    assert.deepEqual(after[0], { recipe: "r1", status: "in_production", pending_gate: "cast" });
  });

  it("is pure: never mutates the input array or its records", () => {
    const assets: LedgerAssetRecord[] = [{ recipe: "r1", status: "queued" }];
    const snapshot = JSON.stringify(assets);
    upsertAsset(assets, "r1", { status: "produced" });
    assert.equal(JSON.stringify(assets), snapshot);
  });

  it("preserves other Assets untouched when updating one", () => {
    const assets: LedgerAssetRecord[] = [
      { recipe: "r1", status: "queued" },
      { recipe: "r2", status: "produced" },
    ];
    const after = upsertAsset(assets, "r1", { status: "in_production" });
    assert.deepEqual(findAsset(after, "r2"), { recipe: "r2", status: "produced" });
  });
});

// ---------------------------------------------------------------------------
// rollupAssetStatus / deriveIdeaRollup
// ---------------------------------------------------------------------------

describe("rollupAssetStatus — the EARLIEST stage across an Idea's Assets wins", () => {
  it("returns null for an empty Assets list", () => {
    assert.equal(rollupAssetStatus([]), null);
  });

  it("returns the single Asset's status when there is only one", () => {
    assert.equal(rollupAssetStatus([{ recipe: "r1", status: "produced" }]), "produced");
  });

  it("returns the EARLIEST stage when Assets are at different stages (mirrors resolvePhase's earlierPhase)", () => {
    const assets: LedgerAssetRecord[] = [
      { recipe: "r1", status: "posted" },
      { recipe: "r2", status: "in_production", pending_gate: "cast" },
    ];
    assert.equal(rollupAssetStatus(assets), "in_production");
  });

  it("returns scored only when EVERY Asset is scored", () => {
    const assets: LedgerAssetRecord[] = [
      { recipe: "r1", status: "scored" },
      { recipe: "r2", status: "scored" },
    ];
    assert.equal(rollupAssetStatus(assets), "scored");
  });
});

describe("deriveIdeaRollup — the Idea's derived roll-up status", () => {
  it("passes through 'suggested' and 'rejected' unchanged (no Assets involved)", () => {
    assert.equal(deriveIdeaRollup("suggested", []), "suggested");
    assert.equal(deriveIdeaRollup("rejected", [{ recipe: "r1", status: "produced" }]), "rejected");
  });

  it("returns 'accepted' when accepted but no Assets exist yet (today's real-ledger case)", () => {
    assert.equal(deriveIdeaRollup("accepted", []), "accepted");
  });

  it("returns the rolled-up Asset stage when accepted WITH Assets", () => {
    assert.equal(
      deriveIdeaRollup("accepted", [{ recipe: "r1", status: "in_production", pending_gate: "cast" }]),
      "in_production",
    );
  });

  it("is pure and does not mutate its input", () => {
    const assets: LedgerAssetRecord[] = [{ recipe: "r1", status: "produced" }];
    const snapshot = JSON.stringify(assets);
    deriveIdeaRollup("accepted", assets);
    assert.equal(JSON.stringify(assets), snapshot);
  });
});

// ---------------------------------------------------------------------------
// ideaAtGate / ideaHasAssetStatus / pendingGateNames
// ---------------------------------------------------------------------------

describe("ideaAtGate — true only when an Asset is in_production AND paused at the named gate", () => {
  it("true when an Asset is paused at the named gate", () => {
    assert.equal(ideaAtGate({ assets: [{ recipe: "r1", status: "in_production", pending_gate: "cast" }] }, "cast"), true);
  });

  it("false when the Asset is in_production but paused at a DIFFERENT gate", () => {
    assert.equal(ideaAtGate({ assets: [{ recipe: "r1", status: "in_production", pending_gate: "other" }] }, "cast"), false);
  });

  it("false when the Asset is in_production with no pending_gate (not paused)", () => {
    assert.equal(ideaAtGate({ assets: [{ recipe: "r1", status: "in_production" }] }, "cast"), false);
  });

  it("false when the Asset has moved past in_production", () => {
    assert.equal(ideaAtGate({ assets: [{ recipe: "r1", status: "produced" }] }, "cast"), false);
  });

  it("false when assets is absent (undefined) — never throws", () => {
    assert.equal(ideaAtGate({}, "cast"), false);
  });
});

describe("ideaHasAssetStatus — true when ANY Asset is at the given stage", () => {
  it("true when one of several Assets matches", () => {
    const idea = {
      assets: [
        { recipe: "r1", status: "in_production" as const, pending_gate: "cast" },
        { recipe: "r2", status: "produced" as const },
      ],
    };
    assert.equal(ideaHasAssetStatus(idea, "produced"), true);
    assert.equal(ideaHasAssetStatus(idea, "posted"), false);
  });

  it("false when assets is absent — never throws", () => {
    assert.equal(ideaHasAssetStatus({}, "produced"), false);
  });
});

describe("pendingGateNames — the set of gate names currently paused across an Idea's Assets", () => {
  it("returns the gate names for every in_production Asset paused at a gate, deduplicated", () => {
    const assets: LedgerAssetRecord[] = [
      { recipe: "r1", status: "in_production", pending_gate: "cast" },
      { recipe: "r2", status: "in_production", pending_gate: "cast" },
      { recipe: "r3", status: "produced" },
    ];
    assert.deepEqual(pendingGateNames(assets), ["cast"]);
  });

  it("returns [] when nothing is paused", () => {
    assert.deepEqual(pendingGateNames([{ recipe: "r1", status: "queued" }]), []);
    assert.deepEqual(pendingGateNames([]), []);
  });
});
