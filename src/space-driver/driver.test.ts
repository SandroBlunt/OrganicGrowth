import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  injectSpec,
  runRunPoint,
  fetchCast,
  composeAndCast,
  isClipOrVideoNode,
  injectGoal,
  castFallbackGoal,
  pinCharacter,
  pinGoal,
  fetchAsset,
  pickAndRender,
  JSON_MASTER_NODE_NAME,
  DOWNSTREAM_MODE,
} from "./driver.ts";
import {
  FakeSpace,
  FakeSpaceWithAgentFallbackCast,
  CAST_PHASE_NODE_NAMES,
  expectedCastUrls,
  fallbackCastIds,
  CAST_START_NODE_NAME,
  CLIP_START_NODE_NAME,
  CHARACTER_NODE_NAME,
  ASSET_CREATION_ID,
  ASSET_URL,
  isPinnedTo,
} from "./fixtures/fake-space.ts";
import { fakeSpaceState } from "../execution-protocol/fixtures/space-state.ts";
import { parse } from "../execution-protocol/parse.ts";
import { validSpec } from "../production-spec/fixtures/specs.ts";

/** The resolved cast node ID for the canonical fake (looked up by name, not hard-coded into the driver). */
function castNodeId(): string {
  const parsed = parse(fakeSpaceState());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("fixture parse failed");
  const cast = parsed.runPoints.find((rp) => rp.gate === "cast");
  assert.ok(cast, "fixture must have a cast-gated run-point");
  return cast!.start_node_id;
}

/** The resolved clip node ID for the canonical fake (the non-cast-gate run-point, looked up by name). */
function clipNodeId(): string {
  const parsed = parse(fakeSpaceState());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("fixture parse failed");
  const clip = parsed.runPoints.find((rp) => rp.gate === null);
  assert.ok(clip, "fixture must have a non-cast-gate (clip) run-point");
  return clip!.start_node_id;
}

// === AC1 / AC5: injectSpec — Fallback-Protocol inject + readback confirm =============================

describe("injectSpec — inject into JSON Master via the Fallback Protocol and confirm by readback", () => {
  it("issues a natural-language edit targeting JSON Master and confirms the text changed", async () => {
    const space = new FakeSpace();
    const before = (await space.readState()).nodes.find((n) => n.name === JSON_MASTER_NODE_NAME)!.value;

    const result = await injectSpec(space, validSpec());

    assert.equal(result.ok, true);
    if (!result.ok) return;

    // The Fallback Protocol was used: exactly one natural-language edit, targeting JSON Master by name.
    assert.equal(space.editGoals.length, 1);
    assert.match(space.editGoals[0]!, new RegExp(JSON_MASTER_NODE_NAME));

    // The readback confirms the text CHANGED.
    const after = (await space.readState()).nodes.find((n) => n.name === JSON_MASTER_NODE_NAME)!.value;
    assert.notEqual(after, before);
    assert.equal(result.text, after);
  });

  it("makes no call outside the injected port (issues the edit + polls + reads back through the port)", async () => {
    const space = new FakeSpace();
    await injectSpec(space, validSpec());
    // The only Space interaction the driver performed was through the port: an edit was recorded, and the
    // node value visible on readState reflects it. No clip/video run was started.
    assert.equal(space.runs.length, 0);
    assert.equal(space.editGoals.length, 1);
  });

  it("reports an identifiable failure when the readback shows the text did NOT change", async () => {
    const space = new FakeSpace(fakeSpaceState(), { injectNoOp: true });
    const result = await injectSpec(space, validSpec());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "inject_unconfirmed");
  });

  it("embeds the exact Spec JSON in the inject goal", () => {
    const spec = validSpec();
    const goal = injectGoal(spec);
    assert.match(goal, new RegExp(JSON_MASTER_NODE_NAME));
    assert.ok(goal.includes(JSON.stringify(spec)));
  });
});

// === AC2 / AC5: runRunPoint — start + poll to terminal; yields the Cast and stops at the Cast ========

describe("runRunPoint — run the cast run-point downstream, poll to terminal, return the Cast", () => {
  it("polls the run to terminal and returns the 6 Cast creations", async () => {
    const space = new FakeSpace();
    const result = await runRunPoint(space, castNodeId(), DOWNSTREAM_MODE);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome.creationIds.length, 6);

    // It actually started a run at the resolved cast node ID, in downstream mode (through the port).
    assert.equal(space.runs.length, 1);
    assert.equal(space.runs[0]!.startNodeId, castNodeId());
    assert.equal(space.runs[0]!.mode, DOWNSTREAM_MODE);
  });

  it("stops cleanly at the Cast: fires exactly the 6 Cast-phase nodes, NO clip/video nodes", async () => {
    const space = new FakeSpace();
    const result = await runRunPoint(space, castNodeId(), DOWNSTREAM_MODE);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.outcome.firedNodeNames.length, 6);
    assert.deepEqual([...result.outcome.firedNodeNames].sort(), [...CAST_PHASE_NODE_NAMES].sort());

    // The load-bearing Spike-2 assertion: NOT ONE fired node is a clip/video node.
    const offenders = result.outcome.firedNodeNames.filter(isClipOrVideoNode);
    assert.deepEqual(offenders, [], `clip/video nodes must not fire in a cast run: ${offenders}`);
  });

  it("returns an identifiable stale-run-point failure when the start node is gone/stale", async () => {
    const space = new FakeSpace(fakeSpaceState(), { castRunPointStale: true });
    const result = await runRunPoint(space, castNodeId(), DOWNSTREAM_MODE);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "run_point_stale");
  });
});

describe("isClipOrVideoNode — clip/video node guard", () => {
  it("flags clip and video nodes and clears Cast-phase nodes", () => {
    assert.equal(isClipOrVideoNode("Clip extractor"), true);
    assert.equal(isClipOrVideoNode("Video Combiner"), true);
    assert.equal(isClipOrVideoNode("Character Variants Generator"), false);
    assert.equal(isClipOrVideoNode("Nano Banana Style (3 imgs)"), false);
  });
});

// === AC5: fetchCast — creations -> image URLs through the port =======================================

describe("fetchCast — resolve Cast creation identifiers to image URLs", () => {
  it("returns the 6 Cast image URLs for the Cast creation identifiers", async () => {
    const space = new FakeSpace();
    const urls = await fetchCast(space, fallbackCastIds());
    assert.deepEqual([...urls].sort(), [...expectedCastUrls()].sort());
  });
});

// === AC3: composeAndCast — Phase A surfaces the Cast; the run stops at the Cast ======================

describe("composeAndCast — Phase A returns the Cast and stops at the Cast", () => {
  it("injects the Spec, runs the cast run-point, and surfaces the Cast image URLs", async () => {
    const space = new FakeSpace();
    const result = await composeAndCast(space, fakeSpaceState(), validSpec());

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.cast.usedAgentFallback, false);
    assert.equal(result.cast.castIds.length, 6);
    assert.deepEqual([...result.cast.castUrls].sort(), [...expectedCastUrls()].sort());

    // Inject ran (one edit targeting JSON Master) and exactly one cast run was started.
    assert.equal(space.editGoals.length, 1);
    assert.match(space.editGoals[0]!, new RegExp(JSON_MASTER_NODE_NAME));
    assert.equal(space.runs.length, 1);
    assert.equal(space.runs[0]!.startNodeId, castNodeId());
  });

  it("the cast run within Phase A fires no clip/video nodes (resolves the cast run-point by name)", async () => {
    const space = new FakeSpace();
    const result = await composeAndCast(space, fakeSpaceState(), validSpec());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Only the cast run-point's node was started; the resolved node is the named cast generator's node.
    assert.equal(space.runs.length, 1);
    const parsed = parse(fakeSpaceState());
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const cast = parsed.runPoints.find((rp) => rp.gate === "cast")!;
    assert.equal(cast.start_name, CAST_START_NODE_NAME);
    assert.equal(space.runs[0]!.startNodeId, cast.start_node_id);
  });
});

// === AC4: composeAndCast — recovery via the in-canvas agent on a missing/stale run-point =============

describe("composeAndCast — Fallback Protocol recovery on a missing/stale run-point", () => {
  it("falls back to the in-canvas agent (run-by-goal) when the run reports the start node stale", async () => {
    // parse() succeeds (canonical protocol) so the run-point resolves, but the RUN reports it stale.
    const space = new FakeSpace(fakeSpaceState(), { castRunPointStale: true });
    const result = await composeAndCast(space, fakeSpaceState(), validSpec());

    assert.equal(result.ok, true, "must recover, not hard-fail");
    if (!result.ok) return;
    assert.equal(result.cast.usedAgentFallback, true);
    assert.equal(result.cast.castUrls.length, 6);

    // A natural-language run-by-goal fallback edit was issued (in addition to the inject edit).
    const fallbackEdits = space.editGoals.filter((g) => !g.includes(JSON_MASTER_NODE_NAME));
    assert.equal(fallbackEdits.length, 1);
    assert.equal(fallbackEdits[0]!, castFallbackGoal());
  });

  it("falls back when the cast run-point cannot be resolved from the Execution Protocol", async () => {
    // This fake's protocol does not resolve a clean cast run-point (the protocol is stale/broken), so the
    // driver cannot drive by name and must delegate to the in-canvas agent.
    const space = new FakeSpaceWithAgentFallbackCast();
    const result = await composeAndCast(space, await space.readState(), validSpec());

    assert.equal(result.ok, true, "must recover, not hard-fail");
    if (!result.ok) return;
    assert.equal(result.cast.usedAgentFallback, true);
    assert.equal(space.fellBackToAgent, true);
    assert.equal(result.cast.castUrls.length, 6);

    // It never started a by-name run (the run-point was unresolvable); recovery is via the agent edit.
    assert.equal(space.runs.length, 0);
  });

  it("hard-fails only when the inject itself cannot be confirmed (not a recovery case)", async () => {
    const space = new FakeSpace(fakeSpaceState(), { injectNoOp: true });
    const result = await composeAndCast(space, fakeSpaceState(), validSpec());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "inject_unconfirmed");
  });
});

// ====================================================================================================
// === PHASE B — pick the Cast, render, link the Asset (casting → produced) ============================
// ====================================================================================================

// === AC1 / AC5: pinCharacter — Fallback-Protocol pin + readback confirm ==============================

describe("pinCharacter — pin the chosen Character via the Fallback Protocol and confirm by readback", () => {
  it("issues a natural-language edit naming the chosen Character and confirms the pin by readback", async () => {
    const space = new FakeSpace();
    const result = await pinCharacter(space, "cast-3");

    assert.equal(result.ok, true);
    if (!result.ok) return;

    // The Fallback Protocol was used: exactly one natural-language edit naming the Character creation node.
    assert.equal(space.editGoals.length, 1);
    assert.match(space.editGoals[0]!, new RegExp(CHARACTER_NODE_NAME));
    assert.ok(space.editGoals[0]!.includes("cast-3"));

    // The readback confirms a Character creation node is pinned to the chosen candidate.
    const after = await space.readState();
    const pinned = after.nodes.some((n) => isPinnedTo(n.value, "cast-3"));
    assert.equal(pinned, true);
  });

  it("makes no call outside the injected port (edits + polls + reads back through the port)", async () => {
    const space = new FakeSpace();
    await pinCharacter(space, "cast-1");
    // The only Space interaction was the pin edit through the port; no run was started.
    assert.equal(space.runs.length, 0);
    assert.equal(space.editGoals.length, 1);
  });

  it("reports an identifiable failure when the readback does NOT confirm the pin", async () => {
    const space = new FakeSpace(fakeSpaceState(), { pinNoOp: true });
    const result = await pinCharacter(space, "cast-3");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "pin_unconfirmed");
  });

  it("embeds the chosen Character identifier in the pin goal", () => {
    const goal = pinGoal("cast-4");
    assert.match(goal, new RegExp(CHARACTER_NODE_NAME));
    assert.ok(goal.includes("cast-4"));
  });
});

// === AC2 / AC5: the clip runRunPoint renders the clip chain to one Asset =============================

describe("runRunPoint — run the clip run-point downstream to the render chain and one Asset", () => {
  it("polls the clip run to terminal, fires the Video Combiner + Final Output, and yields one Asset", async () => {
    const space = new FakeSpace();
    const result = await runRunPoint(space, clipNodeId(), DOWNSTREAM_MODE);

    assert.equal(result.ok, true);
    if (!result.ok) return;

    // The render chain fired (clip → Video Combiner → Final Output) and exactly one Asset was produced.
    assert.ok(result.outcome.firedNodeNames.includes("Video Combiner"));
    assert.ok(result.outcome.firedNodeNames.includes("Final Output"));
    assert.deepEqual(result.outcome.creationIds, [ASSET_CREATION_ID]);

    // It started a run at the resolved clip node ID, in downstream mode, through the port.
    assert.equal(space.runs.length, 1);
    assert.equal(space.runs[0]!.startNodeId, clipNodeId());
    assert.equal(space.runs[0]!.mode, DOWNSTREAM_MODE);
  });
});

// === AC5: fetchAsset — Asset creation -> media URL through the port ==================================

describe("fetchAsset — resolve the finished Asset's creation identifier to its media URL", () => {
  it("returns the finished Asset's media URL for the Asset creation identifier", async () => {
    const space = new FakeSpace();
    const url = await fetchAsset(space, ASSET_CREATION_ID);
    assert.equal(url, ASSET_URL);
  });
});

// === AC2 / AC3 / AC4: pickAndRender — Phase B pins, renders to one Asset, never publishes ============

describe("pickAndRender — Phase B pins the Character, renders the Asset, and stops (no publish)", () => {
  it("pins the chosen Character, runs the clip run-point, and surfaces one finished Asset URL", async () => {
    const space = new FakeSpace();
    const result = await pickAndRender(space, fakeSpaceState(), "cast-3");

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.asset.assetId, ASSET_CREATION_ID);
    assert.equal(result.asset.assetUrl, ASSET_URL);

    // A pin edit (naming the Character) ran, and exactly one clip run was started at the clip node.
    assert.equal(space.editGoals.length, 1);
    assert.match(space.editGoals[0]!, new RegExp(CHARACTER_NODE_NAME));
    assert.equal(space.runs.length, 1);
    assert.equal(space.runs[0]!.startNodeId, clipNodeId());
  });

  it("resolves the clip run-point by name as the non-cast-gate run-point (never hard-coded)", async () => {
    const space = new FakeSpace();
    const result = await pickAndRender(space, fakeSpaceState(), "cast-1");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const parsed = parse(fakeSpaceState());
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const clip = parsed.runPoints.find((rp) => rp.gate === null)!;
    assert.equal(clip.start_name, CLIP_START_NODE_NAME);
    assert.equal(space.runs[0]!.startNodeId, clip.start_node_id);
  });

  it("renders the Asset and takes NO publish action (no publish path exists)", async () => {
    const space = new FakeSpace();
    const result = await pickAndRender(space, fakeSpaceState(), "cast-2");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // The driver surfaces the Asset for the Operator and stops; the only Space calls were the pin edit
    // and the single clip render run — no publish/post primitive exists on the port or the driver.
    assert.equal(space.editGoals.length, 1);
    assert.equal(space.runs.length, 1);
    assert.equal(result.asset.assetUrl, ASSET_URL);
  });

  it("fails with the identifiable pin failure when the Character pin cannot be confirmed", async () => {
    const space = new FakeSpace(fakeSpaceState(), { pinNoOp: true });
    const result = await pickAndRender(space, fakeSpaceState(), "cast-3");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "pin_unconfirmed");
    // The render never started because the pin was not confirmed.
    assert.equal(space.runs.length, 0);
  });
});
