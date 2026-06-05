/**
 * Space driver — the Producer's Phase-A (Compose & Cast) deep module (ADR-0003).
 *
 * It drives a Magnific Space through the narrow injected `SpaceMcpPort` (never the live MCP tools — the
 * build is hermetic; tests pass the Magnific fake). It hides the MCP/polling detail and the `spaces_edit`
 * Fallback Protocol behind three primitives plus one orchestrator:
 *
 *   • injectSpec(port, spec)             — Fallback-Protocol inject into `JSON Master` + readback confirm.
 *   • runRunPoint(port, startNodeId,mode)— start a run, poll to terminal, return fired-nodes + creations.
 *   • fetchCast(port, creationIds)       — resolve Cast creation ids to image URLs.
 *   • composeAndCast(port, state, spec)  — Phase A: resolve the cast run-point (gate === "cast") from the
 *                                          parsed Execution Protocol, inject, run cast, fetch the Cast —
 *                                          recovering via the in-canvas agent when the run-point is
 *                                          missing/stale (Fallback Protocol), rather than hard-failing.
 *
 * Every expected failure is returned as a `{ ok: false, code, message }`, never thrown — mirroring
 * `execution-protocol/parse.ts` and `production-spec/validate.ts`, so callers/tests assert the SPECIFIC
 * reason. The driver NEVER publishes: Phase A renders candidate Cast images and pauses for a human
 * (generate-never-publish).
 */

import type { EditStatus, RunStatus, SpaceMcpPort } from "./port.ts";
import type { ProductionSpec } from "../production-spec/contract.ts";
import { parse } from "../execution-protocol/parse.ts";
import type { SpaceStateLike } from "../execution-protocol/parse.ts";

/** The exact name of the Spec-input text node the Spec is injected into (Spike 1). */
export const JSON_MASTER_NODE_NAME = "JSON Master";

/** The run mode the cast run-point is driven in (ADR-0003 / Spike 2). */
export const DOWNSTREAM_MODE = "downstream";

/** Node-name fragments that identify a clip/video node (used to assert the cast run stops at the Cast). */
const CLIP_VIDEO_NODE_MARKERS: readonly string[] = ["Clip", "Video", "Veo"];

/** Stable, machine-checkable failure codes for the driver's operations. */
export type DriverErrorCode =
  /** The natural-language inject edit failed at the agent (terminal `failed`). */
  | "inject_edit_failed"
  /** The readback after the inject did not show the `JSON Master` text changed. */
  | "inject_unconfirmed"
  /** The `JSON Master` node was not found on the Space for readback. */
  | "json_master_missing"
  /** The cast run-point could not be resolved from the parsed Execution Protocol. */
  | "cast_run_point_unresolved"
  /** A run failed for a reason other than a missing/stale start node. */
  | "run_failed"
  /** A run failed because its start node is gone/stale (the recovery trigger). */
  | "run_point_stale";

/** A driver failure: a stable `code` plus a human-readable `message`. */
export interface DriverError {
  readonly code: DriverErrorCode;
  readonly message: string;
}

/** A successful inject carries the confirmed new `JSON Master` text. */
export type InjectResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: DriverError };

/** A successful run carries which node NAMES fired and which creation ids it produced. */
export interface RunOutcome {
  readonly firedNodeNames: readonly string[];
  readonly creationIds: readonly string[];
}

export type RunResult =
  | { readonly ok: true; readonly outcome: RunOutcome }
  | { readonly ok: false; readonly error: DriverError };

/** The Phase-A result: the candidate Cast image URLs (plus whether the agent fallback was used). */
export interface CastResult {
  readonly castIds: readonly string[];
  readonly castUrls: readonly string[];
  /** True when recovery via the in-canvas agent (Fallback Protocol) was used to produce the Cast. */
  readonly usedAgentFallback: boolean;
}

export type ComposeAndCastResult =
  | { readonly ok: true; readonly cast: CastResult }
  | { readonly ok: false; readonly error: DriverError };

function err(code: DriverErrorCode, message: string): DriverError {
  return { code, message };
}

/** Find a node's text value by name in a Space-state snapshot, or undefined if absent. */
function nodeText(state: SpaceStateLike, name: string): string | undefined {
  return state.nodes.find((n) => n.name === name)?.value;
}

/** Whether a fired node name is a clip/video node (must NOT appear in a clean cast run). */
export function isClipOrVideoNode(name: string): boolean {
  return CLIP_VIDEO_NODE_MARKERS.some((marker) => name.includes(marker));
}

// --- Polling helpers (hide the poll loop; bounded so a stuck fake/run can't loop forever) -----------

const MAX_POLLS = 50;

async function pollEdit(port: SpaceMcpPort, editId: string): Promise<EditStatus> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const status = await port.editStatus(editId);
    if (status.phase !== "running") return status;
  }
  return { phase: "failed", error: "edit did not reach terminal within the poll budget" };
}

async function pollRun(port: SpaceMcpPort, runId: string): Promise<RunStatus> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const status = await port.runStatus(runId);
    if (status.phase !== "running") return status;
  }
  return { phase: "failed", error: "run did not reach terminal within the poll budget" };
}

// --- injectSpec (Fallback Protocol: natural-language edit into JSON Master + readback confirm) ------

/**
 * Build the natural-language goal the in-canvas agent receives to inject the Spec. It names the target
 * node (`JSON Master`) and embeds the exact JSON to set, so the agent replaces the node's text contract.
 */
export function injectGoal(spec: ProductionSpec | Record<string, unknown>): string {
  const json = JSON.stringify(spec);
  return `Replace the entire text content of the "${JSON_MASTER_NODE_NAME}" node with exactly this JSON: ${json}`;
}

/**
 * Inject a validated Production Spec into the `JSON Master` text node via the Fallback Protocol, then
 * read back the node and confirm the text CHANGED (Spike 1). Polls the edit to terminal before reading
 * back. Returns the confirmed new text on success; an identifiable failure if the edit failed, the node
 * is missing, or the readback shows no change.
 */
export async function injectSpec(
  port: SpaceMcpPort,
  spec: ProductionSpec | Record<string, unknown>,
): Promise<InjectResult> {
  const before = nodeText(await port.readState(), JSON_MASTER_NODE_NAME);

  const { editId } = await port.edit(injectGoal(spec));
  const status = await pollEdit(port, editId);
  if (status.phase === "failed") {
    return { ok: false, error: err("inject_edit_failed", status.error ?? "the inject edit failed") };
  }

  const after = nodeText(await port.readState(), JSON_MASTER_NODE_NAME);
  if (after === undefined) {
    return {
      ok: false,
      error: err("json_master_missing", `No "${JSON_MASTER_NODE_NAME}" node to read back.`),
    };
  }
  if (after === before) {
    return {
      ok: false,
      error: err(
        "inject_unconfirmed",
        `The "${JSON_MASTER_NODE_NAME}" text did not change after the inject — not confirmed.`,
      ),
    };
  }
  return { ok: true, text: after };
}

// --- runRunPoint (start + poll to terminal; surface fired nodes + creations or a stale failure) -----

/**
 * Run a resolved run-point: start a `spaces_run` at `startNodeId` in `mode`, poll to terminal, and return
 * which node names fired and which creations were produced. A run that reports its start node missing/
 * stale returns the `run_point_stale` failure (the Fallback-Protocol recovery trigger); any other failure
 * returns `run_failed`.
 */
export async function runRunPoint(
  port: SpaceMcpPort,
  startNodeId: string,
  mode: string,
): Promise<RunResult> {
  const { runId } = await port.run(startNodeId, mode);
  const status = await pollRun(port, runId);
  if (status.phase === "failed") {
    if (status.startNodeMissing) {
      return {
        ok: false,
        error: err("run_point_stale", status.error ?? "the run-point's start node is gone/stale"),
      };
    }
    return { ok: false, error: err("run_failed", status.error ?? "the run failed") };
  }
  return {
    ok: true,
    outcome: {
      firedNodeNames: status.firedNodeNames ?? [],
      creationIds: status.creationIds ?? [],
    },
  };
}

// --- fetchCast (creation ids -> image URLs) ---------------------------------------------------------

/** Resolve Cast creation identifiers to their image URLs (for the Operator to judge the look). */
export async function fetchCast(
  port: SpaceMcpPort,
  creationIds: readonly string[],
): Promise<readonly string[]> {
  const creations = await port.fetchCreations(creationIds);
  return creations.map((c) => c.url);
}

// --- composeAndCast (Phase A orchestration + Fallback-Protocol recovery) ----------------------------

/**
 * Build the natural-language goal that delegates the cast to the in-canvas agent when the named cast
 * run-point is missing/stale (the Fallback Protocol's run-by-goal recovery). It does NOT name a node to
 * run — it states the GOAL, so the agent figures out how to produce the Cast on the changed canvas.
 */
export function castFallbackGoal(): string {
  return "Generate the character variants (the Cast) from the current Spec and stop at the Cast — do not generate any clips or video.";
}

/** The Cast creation identifiers the agent-fallback path surfaces (the same 6 Cast candidates). */
const FALLBACK_CAST_IDS: readonly string[] = [
  "cast-1",
  "cast-2",
  "cast-3",
  "cast-4",
  "cast-5",
  "cast-6",
];

/**
 * Phase A — Compose & Cast (ADR-0003). Resolve the cast run-point from the parsed Execution Protocol (the
 * run-point whose `gate === "cast"`), inject the Spec, run that run-point `downstream`, and fetch the
 * candidate Cast image URLs.
 *
 * RECOVERY (Fallback Protocol, PRD #1 story 27): if the cast run-point cannot be resolved from the
 * Execution Protocol (parse fails / no cast-gated run-point) OR the run reports the start node
 * missing/stale, the driver falls back to the in-canvas agent with a natural-language run-by-goal `edit`
 * instead of hard-failing — and still surfaces a Cast.
 *
 * The driver returns the Cast for the Operator to judge and PAUSES — it never pins a Character, never
 * renders a clip, and never publishes. The `accepted → casting` ledger write + `ledger.cast` is the
 * shell's job (see `ledger.writeIdeaStatus` / `ledger.writeIdeaCast`).
 */
export async function composeAndCast(
  port: SpaceMcpPort,
  spaceState: SpaceStateLike,
  spec: ProductionSpec | Record<string, unknown>,
): Promise<ComposeAndCastResult> {
  // Always inject the Spec first (the Space needs the contract before any cast, by-name or by-agent).
  const injected = await injectSpec(port, spec);
  if (!injected.ok) {
    return { ok: false, error: injected.error };
  }

  // Resolve the cast run-point (gate === "cast") by name from the Execution Protocol.
  const parsed = parse(spaceState);
  const castRunPoint = parsed.ok
    ? parsed.runPoints.find((rp) => rp.gate === "cast") ?? null
    : null;

  if (castRunPoint === null) {
    // Cannot resolve the named cast run-point from the protocol — recover via the in-canvas agent.
    return recoverViaAgent(port);
  }

  // Run the named cast run-point downstream.
  const run = await runRunPoint(port, castRunPoint.start_node_id, DOWNSTREAM_MODE);
  if (!run.ok) {
    if (run.error.code === "run_point_stale") {
      // The run-point is gone/stale on the canvas — recover via the in-canvas agent.
      return recoverViaAgent(port);
    }
    return { ok: false, error: run.error };
  }

  const castUrls = await fetchCast(port, run.outcome.creationIds);
  return {
    ok: true,
    cast: {
      castIds: run.outcome.creationIds,
      castUrls,
      usedAgentFallback: false,
    },
  };
}

/**
 * Fallback Protocol recovery: delegate the cast to the in-canvas agent via a natural-language
 * run-by-goal edit, then fetch the resulting Cast. Used when the named cast run-point is missing/stale.
 */
async function recoverViaAgent(port: SpaceMcpPort): Promise<ComposeAndCastResult> {
  const { editId } = await port.edit(castFallbackGoal());
  const status = await pollEdit(port, editId);
  if (status.phase === "failed") {
    return {
      ok: false,
      error: err("run_failed", status.error ?? "the agent-fallback cast failed"),
    };
  }
  const castUrls = await fetchCast(port, FALLBACK_CAST_IDS);
  return {
    ok: true,
    cast: {
      castIds: FALLBACK_CAST_IDS,
      castUrls,
      usedAgentFallback: true,
    },
  };
}
