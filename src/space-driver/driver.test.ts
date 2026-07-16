import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  injectSpec,
  runRunPoint,
  fetchCast,
  driveToNextGate,
  isClipOrVideoNode,
  injectGoal,
  fallbackGoal,
  pinPick,
  pinGoal,
  fetchAsset,
  JSON_MASTER_NODE_NAME,
  CHARACTER_NODE_NAME,
  DOWNSTREAM_MODE,
  type DriveLegInput,
  type PollOptions,
} from "./driver.ts";
import type { Creation, EditStatus, RunStatus, SpaceMcpPort } from "./port.ts";
import {
  FakeSpace,
  FakeSpaceWithAgentFallbackCast,
  CAST_PHASE_NODE_NAMES,
  expectedCastUrls,
  fallbackCastIds,
  CAST_START_NODE_NAME,
  CLIP_START_NODE_NAME,
  ASSET_CREATION_ID,
  ASSET_URL,
  isPinnedTo,
} from "./fixtures/fake-space.ts";
import { fakeSpaceState } from "../execution-protocol/fixtures/space-state.ts";
import type { SpaceStateLike, SpaceStateNode } from "../execution-protocol/parse.ts";
import { parse } from "../execution-protocol/parse.ts";
import {
  PRODUCER_PROTOCOL_NODE_NAME,
  serializeProtocol,
  type ProtocolDocument,
} from "../execution-protocol/protocol.ts";
import { validSpec } from "../production-spec/fixtures/specs.ts";

/**
 * A no-op poll policy: the fake reaches terminal on the second poll, so injecting an instant `sleep`
 * keeps every poll-driven test fast (no real backoff wait). See C10 for why the driver sleeps in prod.
 */
const FAST: PollOptions = { sleep: async () => {} };

/**
 * A port that NEVER reaches terminal (every status poll returns `running`) — used to prove the driver's
 * poll loops honour a TIME budget (C10), not a raw instant count. Counts its status polls so a test can
 * assert it polled repeatedly before the injected clock crossed the deadline.
 */
class StuckSpace implements SpaceMcpPort {
  public editStatusCalls = 0;
  public runStatusCalls = 0;
  async readState(): Promise<SpaceStateLike> {
    return fakeSpaceState();
  }
  async edit(): Promise<{ readonly editId: string }> {
    return { editId: "edit-stuck" };
  }
  async editStatus(): Promise<EditStatus> {
    this.editStatusCalls++;
    return { phase: "running" };
  }
  async run(): Promise<{ readonly runId: string }> {
    return { runId: "run-stuck" };
  }
  async runStatus(): Promise<RunStatus> {
    this.runStatusCalls++;
    return { phase: "running" };
  }
  async fetchCreations(): Promise<readonly Creation[]> {
    return [];
  }
  async verifyPinned(): Promise<boolean> {
    return false;
  }
}

/**
 * A port that confirms a pin through `verifyPinned` WITHOUT ever writing the fake's `PINNED:` marker — a
 * live adapter's honest shape. Proves the driver's pin confirmation goes through the port, not a
 * fake-only node value (C9). The confirmation verdict is configurable.
 */
class PinConfirmingSpace implements SpaceMcpPort {
  constructor(private readonly pinned = true) {}
  async readState(): Promise<SpaceStateLike> {
    return fakeSpaceState();
  }
  async edit(): Promise<{ readonly editId: string }> {
    return { editId: "edit-1" };
  }
  async editStatus(): Promise<EditStatus> {
    return { phase: "succeeded" };
  }
  async run(): Promise<{ readonly runId: string }> {
    return { runId: "run-1" };
  }
  async runStatus(): Promise<RunStatus> {
    return { phase: "succeeded", firedNodeNames: [], creationIds: [] };
  }
  async fetchCreations(): Promise<readonly Creation[]> {
    return [];
  }
  async verifyPinned(): Promise<boolean> {
    return this.pinned;
  }
}

/** An injected clock that advances a fixed step on every read — deterministic budget exhaustion. */
function steppingClock(stepMs: number): () => number {
  let t = 0;
  return () => (t += stepMs);
}

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

// === injectSpec — Fallback-Protocol inject + readback confirm ========================================

describe("injectSpec — inject into JSON Master via the Fallback Protocol and confirm by readback", () => {
  it("issues a natural-language edit targeting JSON Master and confirms the text changed", async () => {
    const space = new FakeSpace();
    const before = (await space.readState()).nodes.find((n) => n.name === JSON_MASTER_NODE_NAME)!.value;

    const result = await injectSpec(space, validSpec(), FAST);

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
    await injectSpec(space, validSpec(), FAST);
    // The only Space interaction the driver performed was through the port: an edit was recorded, and the
    // node value visible on readState reflects it. No clip/video run was started.
    assert.equal(space.runs.length, 0);
    assert.equal(space.editGoals.length, 1);
  });

  it("reports an identifiable failure when the readback shows the text did NOT change", async () => {
    const space = new FakeSpace(fakeSpaceState(), { injectNoOp: true });
    const result = await injectSpec(space, validSpec(), FAST);
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

// === runRunPoint — start + poll to terminal; yields the Cast and stops at the Cast ===================

describe("runRunPoint — run a run-point downstream, poll to terminal, return the fired nodes + creations", () => {
  it("polls the run to terminal and returns the 6 Cast creations", async () => {
    const space = new FakeSpace();
    const result = await runRunPoint(space, castNodeId(), DOWNSTREAM_MODE, FAST);

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
    const result = await runRunPoint(space, castNodeId(), DOWNSTREAM_MODE, FAST);
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
    const result = await runRunPoint(space, castNodeId(), DOWNSTREAM_MODE, FAST);
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

// === fetchCast — creations -> image URLs through the port ============================================

describe("fetchCast — resolve creation identifiers to aligned {identifier, url} pairs", () => {
  it("returns the 6 Cast pairs (id + url) for the Cast creation identifiers", async () => {
    const space = new FakeSpace();
    const cast = await fetchCast(space, fallbackCastIds());
    assert.deepEqual([...cast].map((c) => c.url).sort(), [...expectedCastUrls()].sort());
    // Each returned entry carries its OWN id and url — the two never come back as parallel arrays (C36).
    for (const c of cast) {
      assert.equal(typeof c.identifier, "string");
      assert.equal(typeof c.url, "string");
    }
  });
});

// === fetchAsset — Asset creation -> media URL through the port =======================================

describe("fetchAsset — resolve the finished Asset's creation identifier to its media URL", () => {
  it("returns the finished Asset's media URL for the Asset creation identifier", async () => {
    const space = new FakeSpace();
    const url = await fetchAsset(space, ASSET_CREATION_ID);
    assert.equal(url, ASSET_URL);
  });
});

// ====================================================================================================
// === driveToNextGate — the generic run-until-gate engine (ADR-0010, issue #57) ========================
// ====================================================================================================

// === The wired *Character Explainer with Cast* Recipe behaves identically (cast → pick → render) ====

describe("driveToNextGate — the wired recipe: first leg (targetGate: cast) pauses with the Cast", () => {
  it("injects the Spec, runs the cast run-point, and PAUSES with the Cast candidates", async () => {
    const space = new FakeSpace();
    const input: DriveLegInput = { kind: "first", targetGate: "cast", spec: validSpec() };
    const result = await driveToNextGate(space, fakeSpaceState(), input, FAST);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome.kind, "paused");
    if (result.outcome.kind !== "paused") return;

    assert.equal(result.outcome.gate, "cast");
    assert.equal(result.outcome.usedFallback, false);
    assert.equal(result.outcome.candidates.length, 6);
    assert.deepEqual([...result.outcome.candidates].map((c) => c.url).sort(), [...expectedCastUrls()].sort());

    // The Cast is aligned {identifier, url} pairs (ids and urls cannot diverge — C36).
    const expectedPairs = fallbackCastIds().map((identifier, i) => ({
      identifier,
      url: expectedCastUrls()[i]!,
    }));
    assert.deepEqual([...result.outcome.candidates], expectedPairs);

    // Inject ran (one edit targeting JSON Master) and exactly one cast run was started, at the resolved
    // cast node — the SAME node `parse()` resolves by name from the Execution Protocol.
    assert.equal(space.editGoals.length, 1);
    assert.match(space.editGoals[0]!, new RegExp(JSON_MASTER_NODE_NAME));
    assert.equal(space.runs.length, 1);
    assert.equal(space.runs[0]!.startNodeId, castNodeId());
    const parsed = parse(fakeSpaceState());
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const cast = parsed.runPoints.find((rp) => rp.gate === "cast")!;
    assert.equal(cast.start_name, CAST_START_NODE_NAME);
  });

  it("falls back to the in-canvas agent when the cast run-point is stale, still pausing with the Cast", async () => {
    const space = new FakeSpace(fakeSpaceState(), { castRunPointStale: true });
    const input: DriveLegInput = { kind: "first", targetGate: "cast", spec: validSpec() };
    const result = await driveToNextGate(space, fakeSpaceState(), input, FAST);

    assert.equal(result.ok, true, "must recover, not hard-fail");
    if (!result.ok) return;
    assert.equal(result.outcome.kind, "paused");
    if (result.outcome.kind !== "paused") return;
    assert.equal(result.outcome.usedFallback, true);
    assert.equal(result.outcome.candidates.length, 6);

    // A natural-language run-by-goal fallback edit was issued (in addition to the inject edit).
    const fallbackEdits = space.editGoals.filter((g) => !g.includes(JSON_MASTER_NODE_NAME));
    assert.equal(fallbackEdits.length, 1);
    assert.equal(fallbackEdits[0]!, fallbackGoal("cast"));
  });

  it("falls back when the cast run-point cannot be resolved from the Execution Protocol at all", async () => {
    const space = new FakeSpaceWithAgentFallbackCast();
    const input: DriveLegInput = { kind: "first", targetGate: "cast", spec: validSpec() };
    const result = await driveToNextGate(space, await space.readState(), input, FAST);

    assert.equal(result.ok, true, "must recover, not hard-fail");
    if (!result.ok) return;
    assert.equal(result.outcome.kind, "paused");
    if (result.outcome.kind !== "paused") return;
    assert.equal(result.outcome.usedFallback, true);
    assert.equal(space.fellBackToAgent, true);
    assert.equal(result.outcome.candidates.length, 6);

    // It never started a by-name run (the run-point was unresolvable); recovery is via the agent edit.
    assert.equal(space.runs.length, 0);
  });

  it("hard-fails only when the inject itself cannot be confirmed (not a recovery case)", async () => {
    const space = new FakeSpace(fakeSpaceState(), { injectNoOp: true });
    const input: DriveLegInput = { kind: "first", targetGate: "cast", spec: validSpec() };
    const result = await driveToNextGate(space, fakeSpaceState(), input, FAST);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "inject_unconfirmed");
  });
});

describe("driveToNextGate — the wired recipe: resumed leg (targetGate: null) pins, renders, and FINISHES", () => {
  it("pins the chosen Character, runs the clip run-point, and surfaces one finished Asset URL", async () => {
    const space = new FakeSpace();
    const input: DriveLegInput = {
      kind: "resumed",
      targetGate: null,
      pick: "cast-3",
      pinnedReferenceNodeName: CHARACTER_NODE_NAME,
    };
    const result = await driveToNextGate(space, fakeSpaceState(), input, FAST);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome.kind, "finished");
    if (result.outcome.kind !== "finished") return;
    assert.equal(result.outcome.usedFallback, false);
    assert.equal(result.outcome.asset.pick, "cast-3");
    assert.equal(result.outcome.asset.assetId, ASSET_CREATION_ID);
    assert.equal(result.outcome.asset.assetUrl, ASSET_URL);

    // A pin edit (naming the Character) ran, and exactly one clip run was started at the clip node.
    assert.equal(space.editGoals.length, 1);
    assert.match(space.editGoals[0]!, new RegExp(CHARACTER_NODE_NAME));
    assert.equal(space.runs.length, 1);
    assert.equal(space.runs[0]!.startNodeId, clipNodeId());

    const readback = await space.readState();
    assert.ok(readback.nodes.some((n) => isPinnedTo(n.value, "cast-3")));
  });

  it("resolves the clip run-point by name as the null-gate run-point (never hard-coded)", async () => {
    const space = new FakeSpace();
    const input: DriveLegInput = {
      kind: "resumed",
      targetGate: null,
      pick: "cast-1",
      pinnedReferenceNodeName: CHARACTER_NODE_NAME,
    };
    const result = await driveToNextGate(space, fakeSpaceState(), input, FAST);
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
    const input: DriveLegInput = {
      kind: "resumed",
      targetGate: null,
      pick: "cast-2",
      pinnedReferenceNodeName: CHARACTER_NODE_NAME,
    };
    const result = await driveToNextGate(space, fakeSpaceState(), input, FAST);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    if (result.outcome.kind !== "finished") return;
    // The driver surfaces the Asset for the Operator and stops; the only Space calls were the pin edit
    // and the single clip render run — no publish/post primitive exists on the port or the driver.
    assert.equal(space.editGoals.length, 1);
    assert.equal(space.runs.length, 1);
    assert.equal(result.outcome.asset.assetUrl, ASSET_URL);
  });

  it("fails with pin_unconfirmed when the pin cannot be confirmed; never runs the clip render", async () => {
    const space = new FakeSpace(fakeSpaceState(), { pinNoOp: true });
    const input: DriveLegInput = {
      kind: "resumed",
      targetGate: null,
      pick: "cast-3",
      pinnedReferenceNodeName: CHARACTER_NODE_NAME,
    };
    const result = await driveToNextGate(space, fakeSpaceState(), input, FAST);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "pin_unconfirmed");
    // The render never started because the pin was not confirmed.
    assert.equal(space.runs.length, 0);
  });
});

// === candidates_empty — an empty gate/render result fails the op instead of an ok with nothing to show

describe("candidates_empty — an empty result fails the op instead of returning ok with nothing to show", () => {
  it("fails candidates_empty when the named cast run surfaces no creations", async () => {
    const space = new FakeSpace(fakeSpaceState(), { castRunEmpty: true });
    const input: DriveLegInput = { kind: "first", targetGate: "cast", spec: validSpec() };
    const result = await driveToNextGate(space, fakeSpaceState(), input, FAST);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "candidates_empty");
  });

  it("fails candidates_empty when the agent fallback surfaces no creations (never invents candidates)", async () => {
    const space = new FakeSpace(fakeSpaceState(), {
      castRunPointStale: true,
      fallbackProducesNoCast: true,
    });
    const input: DriveLegInput = { kind: "first", targetGate: "cast", spec: validSpec() };
    const result = await driveToNextGate(space, fakeSpaceState(), input, FAST);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "candidates_empty");
  });
});

// === run_point_unresolved — a RESUMED leg gets no Fallback-Protocol recovery (ADR-0003 recovery scope)

describe("driveToNextGate — a resumed leg's unresolved run-point fails directly (no recovery)", () => {
  it("fails run_point_unresolved when the target gate has no matching run-point, without falling back", async () => {
    const space = new FakeSpace();
    const input: DriveLegInput = {
      kind: "resumed",
      targetGate: "nonexistent-gate",
      pick: "cast-1",
      pinnedReferenceNodeName: CHARACTER_NODE_NAME,
    };
    const result = await driveToNextGate(space, fakeSpaceState(), input, FAST);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "run_point_unresolved");
    // No recovery was attempted: the only edit was the pin, and no run was started.
    assert.equal(space.editGoals.length, 1);
    assert.equal(space.runs.length, 0);
  });
});

// === pinPick / pinGoal — generalized over the target node name (ADR-0010) ============================

describe("pinPick — pin a resolved candidate via the Fallback Protocol and confirm by readback", () => {
  it("issues a natural-language edit naming the target node and confirms the pin by readback", async () => {
    const space = new FakeSpace();
    const result = await pinPick(space, "cast-3", CHARACTER_NODE_NAME, FAST);

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(space.editGoals.length, 1);
    assert.match(space.editGoals[0]!, new RegExp(CHARACTER_NODE_NAME));
    assert.ok(space.editGoals[0]!.includes("cast-3"));

    const after = await space.readState();
    assert.equal(after.nodes.some((n) => isPinnedTo(n.value, "cast-3")), true);
  });

  it("embeds the chosen candidate AND the target node name in the pin goal", () => {
    const goal = pinGoal("cast-4", CHARACTER_NODE_NAME);
    assert.match(goal, new RegExp(CHARACTER_NODE_NAME));
    assert.ok(goal.includes("cast-4"));
  });

  it("reports an identifiable failure when the readback does NOT confirm the pin", async () => {
    const space = new FakeSpace(fakeSpaceState(), { pinNoOp: true });
    const result = await pinPick(space, "cast-3", CHARACTER_NODE_NAME, FAST);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "pin_unconfirmed");
  });
});

// ====================================================================================================
// === AC4 — a ZERO-gate recipe runs straight through; a MULTI-gate recipe pauses/resumes at each =====
// ====================================================================================================

/** One test-only run-point: its unique node name, its gate (or `null`), and the creation ids its run
 *  produces. Used to build ad hoc, fully synthetic Recipes' protocols/Spaces — never the wired one. */
interface FakeRunPointSpec {
  readonly name: string;
  readonly gate: string | null;
  readonly creationIds: readonly string[];
}

/**
 * A minimal, fully CONFIGURABLE fake `SpaceMcpPort` for proving `driveToNextGate` generalizes to any
 * number of gates (zero, one, several) — never reusing the wired `FakeSpace`'s hard-coded Cast/Character
 * node names, so this is a genuinely independent proof the driver hard-codes nothing Recipe-specific.
 * Every edit/run succeeds on its first poll (the poll LOOP itself is already covered by the `C10`/wired
 * tests above and by `injectSpec`/`runRunPoint`'s own tests) — this fake exists to exercise gate-walking,
 * not polling.
 */
class ConfigurableFakeSpace implements SpaceMcpPort {
  private readonly runPoints: readonly FakeRunPointSpec[];
  private nodes: SpaceStateNode[];
  private readonly pinned = new Set<string>();
  public readonly editGoals: string[] = [];
  public readonly runs: Array<{ startNodeId: string; mode: string }> = [];
  private readonly runIdToNodeId = new Map<string, string>();
  private editSeq = 0;
  private runSeq = 0;

  constructor(runPoints: readonly FakeRunPointSpec[]) {
    this.runPoints = runPoints;
    const protocolDoc: ProtocolDocument = {
      run_points: runPoints.map((rp) => ({ start: rp.name, mode: "downstream", gate: rp.gate })),
    };
    this.nodes = [
      { id: "node-json-master", name: JSON_MASTER_NODE_NAME, value: "placeholder" },
      ...runPoints.map((rp, i) => ({ id: `node-run-point-${i}`, name: rp.name })),
      { id: "node-producer-protocol", name: PRODUCER_PROTOCOL_NODE_NAME, value: serializeProtocol(protocolDoc) },
    ];
  }

  async readState(): Promise<SpaceStateLike> {
    return { nodes: this.nodes.map((n) => ({ ...n })) };
  }

  async edit(goal: string): Promise<{ readonly editId: string }> {
    this.editGoals.push(goal);
    if (goal.includes(JSON_MASTER_NODE_NAME)) {
      this.nodes = this.nodes.map((n) =>
        n.name === JSON_MASTER_NODE_NAME ? { ...n, value: "INJECTED" } : n,
      );
    } else {
      const match = goal.match(/Pin the "([^"]+)" creation as the "[^"]+" creation node/);
      if (match) {
        this.pinned.add(match[1]!);
      }
    }
    return { editId: `edit-${++this.editSeq}` };
  }

  async editStatus(): Promise<EditStatus> {
    return { phase: "succeeded" };
  }

  async run(startNodeId: string, mode: string): Promise<{ readonly runId: string }> {
    this.runs.push({ startNodeId, mode });
    const runId = `run-${++this.runSeq}`;
    this.runIdToNodeId.set(runId, startNodeId);
    return { runId };
  }

  async runStatus(runId: string): Promise<RunStatus> {
    const startNodeId = this.runIdToNodeId.get(runId);
    const runPoint = this.runPoints.find((_rp, i) => `node-run-point-${i}` === startNodeId);
    if (runPoint === undefined) {
      return { phase: "failed", error: `no configured run-point for node id ${String(startNodeId)}` };
    }
    return { phase: "succeeded", firedNodeNames: [runPoint.name], creationIds: [...runPoint.creationIds] };
  }

  async fetchCreations(ids: readonly string[]): Promise<readonly Creation[]> {
    return ids.map((id) => ({ identifier: id, url: `https://fake.example/${id}` }));
  }

  async verifyPinned(candidate: string): Promise<boolean> {
    return this.pinned.has(candidate);
  }
}

describe("driveToNextGate — a ZERO-gate recipe runs straight through, no pause", () => {
  it("a single gateless run-point: first leg injects the Spec, runs it, and FINISHES with the Asset", async () => {
    const space = new ConfigurableFakeSpace([{ name: "Zero Gate Render", gate: null, creationIds: ["asset-zero"] }]);
    const input: DriveLegInput = { kind: "first", targetGate: null, spec: validSpec() };
    const result = await driveToNextGate(space, await space.readState(), input, FAST);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome.kind, "finished");
    if (result.outcome.kind !== "finished") return;
    assert.equal(result.outcome.asset.assetId, "asset-zero");
    assert.equal(result.outcome.asset.assetUrl, "https://fake.example/asset-zero");
    // A gateless Recipe's single first-and-final leg has no preceding pick to carry.
    assert.equal(result.outcome.asset.pick, undefined);

    // Exactly the Spec inject and one run — no pin, no pause.
    assert.equal(space.editGoals.length, 1);
    assert.match(space.editGoals[0]!, new RegExp(JSON_MASTER_NODE_NAME));
    assert.equal(space.runs.length, 1);
  });
});

describe("driveToNextGate — a MULTI-gate recipe pauses at each declared gate and resumes with each pick", () => {
  it("walks 2 gates (gateA, gateB) plus a final render — 3 legs, 3 runs, pausing/resuming at each", async () => {
    const space = new ConfigurableFakeSpace([
      { name: "Gate A Generator", gate: "gateA", creationIds: ["a-1", "a-2"] },
      { name: "Gate B Generator", gate: "gateB", creationIds: ["b-1", "b-2"] },
      { name: "Final Render", gate: null, creationIds: ["asset-final"] },
    ]);

    // Leg 1 — the Recipe's FIRST leg targets gateA (its first declared gate).
    const leg1Input: DriveLegInput = { kind: "first", targetGate: "gateA", spec: validSpec() };
    const leg1 = await driveToNextGate(space, await space.readState(), leg1Input, FAST);
    assert.equal(leg1.ok, true);
    if (!leg1.ok) return;
    assert.equal(leg1.outcome.kind, "paused");
    if (leg1.outcome.kind !== "paused") return;
    assert.equal(leg1.outcome.gate, "gateA");
    assert.deepEqual([...leg1.outcome.candidates].map((c) => c.identifier).sort(), ["a-1", "a-2"]);

    // Leg 2 — RESUMED after gateA's pick, targets gateB (the Recipe's NEXT declared gate).
    const leg2Input: DriveLegInput = {
      kind: "resumed",
      targetGate: "gateB",
      pick: "a-1",
      pinnedReferenceNodeName: "Gate A Reference",
    };
    const leg2 = await driveToNextGate(space, await space.readState(), leg2Input, FAST);
    assert.equal(leg2.ok, true);
    if (!leg2.ok) return;
    assert.equal(leg2.outcome.kind, "paused");
    if (leg2.outcome.kind !== "paused") return;
    assert.equal(leg2.outcome.gate, "gateB");
    assert.deepEqual([...leg2.outcome.candidates].map((c) => c.identifier).sort(), ["b-1", "b-2"]);

    // Leg 3 — RESUMED after gateB's pick, targets null (the Recipe's LAST gate cleared — final render).
    const leg3Input: DriveLegInput = {
      kind: "resumed",
      targetGate: null,
      pick: "b-2",
      pinnedReferenceNodeName: "Gate B Reference",
    };
    const leg3 = await driveToNextGate(space, await space.readState(), leg3Input, FAST);
    assert.equal(leg3.ok, true);
    if (!leg3.ok) return;
    assert.equal(leg3.outcome.kind, "finished");
    if (leg3.outcome.kind !== "finished") return;
    assert.equal(leg3.outcome.asset.assetId, "asset-final");
    assert.equal(leg3.outcome.asset.pick, "b-2");

    // Exactly 3 runs total — one per leg/gate — and each resumed leg's pin targeted its OWN node name.
    assert.equal(space.runs.length, 3);
    assert.ok(space.editGoals.some((g) => g.includes("Gate A Reference") && g.includes("a-1")));
    assert.ok(space.editGoals.some((g) => g.includes("Gate B Reference") && g.includes("b-2")));
  });
});

// ====================================================================================================
// === C10 — polling waits on a time budget, not a raw instant count (survive a real multi-minute op) ===
// ====================================================================================================

describe("C10 — polling waits on a time budget, not a raw instant count", () => {
  it("times out an edit that never terminates, polling repeatedly against the injected clock", async () => {
    const space = new StuckSpace();
    // now() advances 100ms per read; budget 500ms — so the loop polls several times, then times out
    // (a real Space op takes minutes: this proves the driver does NOT fail in a single instant burst).
    const poll: PollOptions = {
      sleep: async () => {},
      now: steppingClock(100),
      intervalMs: 100,
      budgetMs: 500,
    };
    const result = await injectSpec(space, validSpec(), poll);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "inject_edit_failed");
    assert.ok(space.editStatusCalls >= 2, "must poll more than once before the budget elapses");
  });

  it("times out a run that never terminates, polling repeatedly against the injected clock", async () => {
    const space = new StuckSpace();
    const poll: PollOptions = {
      sleep: async () => {},
      now: steppingClock(100),
      intervalMs: 100,
      budgetMs: 500,
    };
    const result = await runRunPoint(space, "start", DOWNSTREAM_MODE, poll);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "run_failed");
    assert.ok(space.runStatusCalls >= 2, "must poll more than once before the budget elapses");
  });

  it("sleeps between polls (the injected sleep is awaited on each running poll)", async () => {
    const space = new StuckSpace();
    let sleeps = 0;
    const poll: PollOptions = {
      sleep: async () => {
        sleeps++;
      },
      now: steppingClock(100),
      intervalMs: 100,
      budgetMs: 300,
    };
    await runRunPoint(space, "start", DOWNSTREAM_MODE, poll);
    assert.ok(sleeps >= 1, "the driver waits between polls rather than busy-looping");
  });
});

// ====================================================================================================
// === C9 — pinPick confirms via port.verifyPinned, not a fake-only node value =========================
// ====================================================================================================

describe("C9 — pinPick confirms via port.verifyPinned, not a fake-only node value", () => {
  it("confirms the pin against a port that never writes a PINNED marker (live-honest adapter)", async () => {
    const space = new PinConfirmingSpace(true);
    const result = await pinPick(space, "cast-3", CHARACTER_NODE_NAME, FAST);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pick, "cast-3");
  });

  it("fails pin_unconfirmed when the port reports the Character is not pinned", async () => {
    const space = new PinConfirmingSpace(false);
    const result = await pinPick(space, "cast-3", CHARACTER_NODE_NAME, FAST);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "pin_unconfirmed");
  });
});
