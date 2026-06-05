/**
 * FAKE Magnific Space implementing the narrow `SpaceMcpPort` — THIS IS THE MAGNIFIC FAKE.
 *
 * The build is hermetic: the Space driver is exercised entirely through this in-memory fake at the MCP
 * boundary — NO live `spaces_*`/`creations_*` calls, no credits, no board mutation, no network
 * (CLAUDE.md build pipeline; ADR-0003/0004). The live MCP adapter is deferred to the worker slice.
 *
 * It composes the EXISTING fake `spaces_state` from `execution-protocol/fixtures/space-state.ts` (so
 * there is one fake Space, not two) and adds the run-time behavior the driver needs:
 *
 *   • inject: a natural-language `edit` targeting `JSON Master` replaces that node's text, so a readback
 *     shows the text CHANGED (models Spike 1's verified inject + readback).
 *   • cast run: a `downstream` run started at "Character Variants Generator" fires EXACTLY the 6
 *     Cast-phase nodes and produces 6 Cast creations — firing NO clip/video nodes (models Spike 2).
 *   • recovery: a variant whose cast run reports the start node missing/stale, so the driver must fall
 *     back to the in-canvas agent (Fallback Protocol). The fallback edit goal is recorded so a test can
 *     assert the Fallback Protocol was used; in the fallback path the agent run yields the same Cast.
 *
 * Async edits/runs are modelled as a tiny poll sequence: the first status poll returns `running`, the
 * next returns terminal — so the driver's "poll to terminal" loop is genuinely exercised (not a
 * one-shot), yet deterministic with no timers.
 */

import type {
  Creation,
  EditStatus,
  RunStatus,
  SpaceMcpPort,
} from "../port.ts";
import type { SpaceStateLike, SpaceStateNode } from "../../execution-protocol/parse.ts";
import {
  fakeSpaceState,
  fakeSpaceStateWithMissingRunPoint,
  type FakeSpaceState,
} from "../../execution-protocol/fixtures/space-state.ts";

/** The exact name of the Spec-input text node (the Fallback Protocol inject target). */
export const JSON_MASTER_NODE_NAME = "JSON Master";

/** The name of the cast run-point's start node (Spike 2 inventory). */
export const CAST_START_NODE_NAME = "Character Variants Generator";

/**
 * The 6 Cast-phase node names a `downstream` cast run fires (Spike 2). These are the nodes between the
 * variant generator and the Cast — and NONE of them is a clip/video node.
 */
export const CAST_PHASE_NODE_NAMES: readonly string[] = [
  "Character Variants Generator",
  "Character concepts list",
  "Nano Banana Style (3 imgs)",
  "Seedream Style (3 imgs)",
  "Nano Banana list",
  "Seedream list",
];

/** The 6 Cast creations a successful cast run produces. */
function castCreations(): readonly Creation[] {
  return [
    { identifier: "cast-1", url: "https://magnific.example/cast/1.png" },
    { identifier: "cast-2", url: "https://magnific.example/cast/2.png" },
    { identifier: "cast-3", url: "https://magnific.example/cast/3.png" },
    { identifier: "cast-4", url: "https://magnific.example/cast/4.png" },
    { identifier: "cast-5", url: "https://magnific.example/cast/5.png" },
    { identifier: "cast-6", url: "https://magnific.example/cast/6.png" },
  ];
}

/** Options that select which fault the fake models (default: a fully-healthy Space). */
export interface FakeSpaceOptions {
  /**
   * When true, the cast run reports its start node missing/stale (`startNodeMissing: true`), forcing the
   * driver onto the Fallback Protocol. The agent-fallback run then yields the Cast.
   */
  readonly castRunPointStale?: boolean;
  /**
   * When true, the `edit` that injects the Spec does NOT change the `JSON Master` text, so the driver's
   * readback confirmation fails (models a no-op/failed inject).
   */
  readonly injectNoOp?: boolean;
}

/**
 * A FAKE Magnific Space implementing the narrow `SpaceMcpPort`. Stateful only in memory: it tracks the
 * current node values (so an inject is visible on readback) and records every `edit` goal issued (so a
 * test can assert the Fallback Protocol was used).
 */
export class FakeSpace implements SpaceMcpPort {
  private nodes: SpaceStateNode[];
  private readonly options: FakeSpaceOptions;

  /** Every natural-language edit goal issued through `edit`, in order (for Fallback-Protocol assertions). */
  public readonly editGoals: string[] = [];
  /** Every `(startNodeId, mode)` a run was started at, in order. */
  public readonly runs: Array<{ startNodeId: string; mode: string }> = [];

  // Poll bookkeeping: an edit/run returns `running` once, then terminal — so the driver's poll loop runs.
  private readonly editPollsLeft = new Map<string, number>();
  private readonly runPollsLeft = new Map<string, number>();
  private readonly runStartNodeIds = new Map<string, string>();
  private editSeq = 0;
  private runSeq = 0;

  constructor(base: FakeSpaceState = fakeSpaceState(), options: FakeSpaceOptions = {}) {
    // Copy nodes so injects mutate only this fake's in-memory state, never the shared fixture.
    this.nodes = base.nodes.map((n) => ({ ...n }));
    this.options = options;
  }

  async readState(): Promise<SpaceStateLike> {
    return { nodes: this.nodes.map((n) => ({ ...n })) };
  }

  async edit(goal: string): Promise<{ editId: string }> {
    this.editGoals.push(goal);
    // Applying the goal's effect: if the goal targets JSON Master and we're not modelling a no-op,
    // replace that node's text so a readback shows it changed.
    if (goal.includes(JSON_MASTER_NODE_NAME) && !this.options.injectNoOp) {
      this.nodes = this.nodes.map((n) =>
        n.name === JSON_MASTER_NODE_NAME ? { ...n, value: extractInjectedText(goal) } : n,
      );
    }
    const editId = `edit-${++this.editSeq}`;
    this.editPollsLeft.set(editId, 1); // one `running` poll, then terminal
    return { editId };
  }

  async editStatus(editId: string): Promise<EditStatus> {
    const left = this.editPollsLeft.get(editId) ?? 0;
    if (left > 0) {
      this.editPollsLeft.set(editId, left - 1);
      return { phase: "running" };
    }
    return { phase: "succeeded" };
  }

  async run(startNodeId: string, mode: string): Promise<{ runId: string }> {
    this.runs.push({ startNodeId, mode });
    const runId = `run-${++this.runSeq}`;
    this.runPollsLeft.set(runId, 1); // one `running` poll, then terminal
    this.runStartNodeIds.set(runId, startNodeId);
    return { runId };
  }

  async runStatus(runId: string): Promise<RunStatus> {
    const left = this.runPollsLeft.get(runId) ?? 0;
    if (left > 0) {
      this.runPollsLeft.set(runId, left - 1);
      return { phase: "running" };
    }
    // Terminal. If this Space models a stale cast run-point, the cast run fails as start-node-missing.
    if (this.options.castRunPointStale) {
      return {
        phase: "failed",
        startNodeMissing: true,
        error: "start node is gone/stale on the canvas",
      };
    }
    // Healthy: a downstream cast run fires exactly the 6 Cast-phase nodes and yields 6 Cast creations.
    return {
      phase: "succeeded",
      firedNodeNames: [...CAST_PHASE_NODE_NAMES],
      creationIds: castCreations().map((c) => c.identifier),
    };
  }

  async fetchCreations(ids: readonly string[]): Promise<readonly Creation[]> {
    const all = castCreations();
    return ids
      .map((id) => all.find((c) => c.identifier === id))
      .filter((c): c is Creation => c !== undefined);
  }
}

/**
 * Models the in-canvas-agent fallback for the recovery path: when the named cast run-point is
 * missing/stale, the driver delegates the cast to the agent via a natural-language run-by-goal `edit`.
 * This fake makes that agent-fallback "run" succeed and surface the Cast. It reuses `FakeSpace`'s edit
 * recording, but its `runStatus` always succeeds (the run-point is bypassed via the agent), and an
 * `edit` whose goal asks the agent to RUN (not inject) records the goal AND marks the Cast as produced.
 */
export class FakeSpaceWithAgentFallbackCast extends FakeSpace {
  /** True once an agent-run-by-goal fallback edit was issued (the recovery path was taken). */
  public fellBackToAgent = false;

  constructor() {
    // The base run-point is stale, so the by-name run fails start-node-missing and recovery triggers.
    super(fakeSpaceStateWithMissingRunPoint(), { castRunPointStale: true });
  }

  override async edit(goal: string): Promise<{ editId: string }> {
    // An inject edit targets "JSON Master"; an agent-RUN-by-goal fallback asks the agent to produce the
    // Cast. Distinguish by the goal text the driver issues. (`fetchCreations` from the base already
    // returns the 6 Cast candidates, so the recovered Cast surfaces without a by-name run.)
    if (!goal.includes(JSON_MASTER_NODE_NAME)) {
      this.fellBackToAgent = true;
    }
    return super.edit(goal);
  }
}

/** The identifiers of the Cast the fallback path surfaces (same 6 as a healthy cast run). */
export function fallbackCastIds(): readonly string[] {
  return castCreations().map((c) => c.identifier);
}

/** The expected Cast image URLs (for assertions). */
export function expectedCastUrls(): readonly string[] {
  return castCreations().map((c) => c.url);
}

/**
 * Pull the to-be-injected text out of the driver's natural-language goal. The driver embeds the exact
 * Spec JSON it wants set; the fake stores that as the node's new value so a readback reflects it. If no
 * embedded payload is found, fall back to a sentinel so the value still differs from the placeholder.
 */
function extractInjectedText(goal: string): string {
  const marker = goal.indexOf("{");
  if (marker !== -1) {
    return goal.slice(marker);
  }
  return "INJECTED";
}
