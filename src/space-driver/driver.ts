/**
 * Space driver — the Producer's generic run-until-gate engine (ADR-0010, revising ADR-0003's fixed
 * two-phase split; issue #57).
 *
 * It drives a Magnific Space through the narrow injected `SpaceMcpPort` (never the live MCP tools — the
 * build is hermetic; tests pass the Magnific fake). It hides the MCP/polling detail and the `spaces_edit`
 * Fallback Protocol behind a handful of primitives plus ONE generic orchestrator:
 *
 *   • injectSpec(port, spec, promptNode)       — Fallback-Protocol inject into the Recipe's OWN prompt
 *                                                node (`Recipe.canvasInputs.promptNode` — the wired
 *                                                character Recipe and the News Carousel Recipe each
 *                                                declare their OWN "JSON Master" node, on two DIFFERENT
 *                                                Spaces — issue #88/#89, ADR-0016) + readback. Never
 *                                                hard-coded to one Recipe's node name.
 *   • runRunPoint(port, startNodeId, mode)     — start a run, poll to terminal, return fired-nodes + creations.
 *   • pinPick(port, pick, nodeName)            — Fallback-Protocol pin of a resolved pick into a named
 *                                                on-canvas node (the node name is Recipe-declared, never
 *                                                hard-coded here) + readback confirm via `port.verifyPinned`.
 *   • bindMediaAsset(port, path, media, node)  — Fallback-Protocol bind of a Brand Asset's LOCAL media
 *                                                file (image/video/audio) into a named on-canvas
 *                                                reference node — the bind phase's brand-asset media
 *                                                slots (issue #88, ADR-0016). Reuses the SAME
 *                                                `edit`/`verifyPinned` primitives `pinPick` already
 *                                                uses (no new port method): the in-canvas agent is what
 *                                                actually calls whichever media-type-matching Magnific
 *                                                tool the asset's kind needs, under the hood of the one
 *                                                `edit` call.
 *   • fetchCast(port, creationIds)             — resolve creation ids to aligned {identifier, url} pairs
 *                                                (used for a paused gate's candidates AND, via
 *                                                `fetchAsset`, the finished Asset).
 *   • driveToNextGate(port, state, input)      — walk ONE leg of a Recipe's Execution Protocol: either
 *                                                the FIRST leg (inject the Spec into the Recipe's OWN
 *                                                prompt node, run to the Recipe's first declared gate —
 *                                                or straight through for a gateless Recipe) or a RESUMED
 *                                                leg (pin the Operator's resolved pick, run to the NEXT
 *                                                declared gate, or to the final render when there is
 *                                                none). Recovers via the in-canvas agent (Fallback
 *                                                Protocol) when the FIRST leg's run-point is
 *                                                missing/stale.
 *
 * `driveToNextGate` REPLACES the old fixed `composeAndCast`/`pickAndRender` two-phase split: instead of
 * hard-coding "the cast run-point" and "the clip run-point", it resolves whichever run-point the parsed
 * Execution Protocol marks with the CALLER-supplied `targetGate` (`null` for a gateless/final leg) — a
 * Recipe with zero, one, or several gates all drive through the SAME loop, one leg per queue job
 * (`src/production-queue/queue.ts`'s generic `gate` cursor). The seeded *Character Explainer with Cast*
 * Recipe still behaves identically: its first leg targets gate `"cast"`, its second (resumed) leg
 * targets `null` (the final render) — this is proven byte-for-byte against the SAME fake this module's
 * predecessor used (`driver.test.ts`).
 *
 * Every expected failure is returned as a `{ ok: false, code, message }`, never thrown — mirroring
 * `execution-protocol/parse.ts` and `production-spec/validate.ts`, so callers/tests assert the SPECIFIC
 * reason. The driver NEVER publishes: a paused leg surfaces candidates for a human, and the finished
 * Asset is returned for a human to publish (generate-never-publish).
 */

import type { Creation, EditStatus, RunStatus, SpaceMcpPort } from "./port.ts";
import type { ProductionSpec } from "../production-spec/contract.ts";
import { parse } from "../execution-protocol/parse.ts";
import type { SpaceStateLike } from "../execution-protocol/parse.ts";

/** The exact name of the Spec-input text node the Spec is injected into (Spike 1). */
export const JSON_MASTER_NODE_NAME = "JSON Master";

/** The run mode every leg's run-point is driven in (ADR-0003 / Spike 2). */
export const DOWNSTREAM_MODE = "downstream";

/** Node-name fragments that identify a clip/video node (used to assert the cast run stops at the Cast). */
const CLIP_VIDEO_NODE_MARKERS: readonly string[] = ["Clip", "Video", "Veo"];

/** The exact name of the *Character Explainer with Cast* Recipe's pinned-reference creation node. */
export const CHARACTER_NODE_NAME = "Character #2";

/**
 * The exact name of the *Character Explainer with Cast* Recipe's watermark-instructions text node —
 * verified in the live capture (`src/space-driver/fixtures/live-captures/02-spaces_get_nodes.keynodes.txt`'s
 * `Producer Protocol`'s `replace_text` step). QA-1 (issue #88 Round 1): this step was dropped from the
 * rewritten `producer.md` by mistake and is restored here as a generic, Recipe-declared primitive
 * (`Recipe.space.nodes.watermarkNode`) rather than hard-coded procedure.
 */
export const WATERMARK_NODE_NAME = "Watermark instructions";

/** Stable, machine-checkable failure codes for the driver's operations. */
export type DriverErrorCode =
  /** The natural-language inject edit failed at the agent (terminal `failed`). */
  | "inject_edit_failed"
  /** The readback after the inject did not show the prompt node's text changed. */
  | "inject_unconfirmed"
  /** The Recipe's prompt node (e.g. `JSON Master`) was not found on the Space for readback (issue #88
   *  — generalized beyond the one wired Recipe's own node; a DIFFERENT Recipe's "JSON Master" lives on
   *  a DIFFERENT Space, never assumed to be the same node). */
  | "prompt_node_missing"
  /** A run failed for a reason other than a missing/stale start node. */
  | "run_failed"
  /** A run failed because its start node is gone/stale (the recovery trigger, first-leg only). */
  | "run_point_stale"
  /** A RESUMED leg's target-gate run-point could not be resolved from the Execution Protocol (no
   *  Fallback-Protocol recovery applies past the first leg — ADR-0003's recovery scope). */
  | "run_point_unresolved"
  /** A paused leg's run (named or agent-fallback) surfaced no candidates to show the Operator. */
  | "candidates_empty"
  /** The natural-language pin edit failed at the agent (terminal `failed`). */
  | "pin_edit_failed"
  /** The readback after the pin did not confirm the resolved pick is pinned. */
  | "pin_unconfirmed"
  /** The natural-language media-bind edit failed at the agent (terminal `failed`) — binding a Brand
   *  Asset's local media into a named canvas reference node (issue #88, ADR-0016). */
  | "media_bind_edit_failed"
  /** The readback after the media-bind edit did not confirm the Brand Asset is bound to the node. */
  | "media_bind_unconfirmed"
  /** The natural-language watermark-handle edit failed at the agent (terminal `failed`) — setting the
   *  Brand's `@handle` onto a Recipe-declared watermark node before the final render (QA-1, issue #88). */
  | "watermark_edit_failed"
  /** The Recipe's watermark node was not found on the Space for readback. */
  | "watermark_node_missing"
  /** The readback after the watermark edit did not confirm the Brand's handle was applied. */
  | "watermark_unconfirmed";

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

/** A successful pin carries the confirmed pinned pick's identifier. */
export type PinResult =
  | { readonly ok: true; readonly pick: string }
  | { readonly ok: false; readonly error: DriverError };

/** The finished Asset's creation identifier and its media URL. */
export interface AssetResult {
  /**
   * The Operator's resolved pick that produced this render — present on every RESUMED leg (there was a
   * preceding gate); absent only for a gateless Recipe's single first-and-final leg, where there was
   * nothing to pick. `exactOptionalPropertyTypes`: omitted, never `undefined`, when not applicable.
   */
  readonly pick?: string;
  /** The finished Asset's creation identifier. */
  readonly assetId: string;
  /** The finished Asset's media URL (the Operator publishes this; the Producer never does). */
  readonly assetUrl: string;
}

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

// --- Polling helpers (hide the poll loop; a live Space op takes MINUTES, so poll on an injected
//     interval against a TIME budget — never a raw instant-count that "fails" in milliseconds, C10) ---

/** Default real sleep between polls (production). Tests inject a no-op/tiny sleep to stay fast. */
const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Default gap between status polls (ms). A live Space op takes minutes; don't hammer the API. */
export const DEFAULT_POLL_INTERVAL_MS = 5_000;

/** Default total time budget (ms) for one op to reach terminal before the driver declares a timeout. */
export const DEFAULT_POLL_BUDGET_MS = 15 * 60_000;

/**
 * How the driver waits between status polls. Injected so a live adapter gets a real multi-minute budget
 * with a backoff sleep, while tests pass a no-op `sleep` (instant) and a deterministic `now`/budget.
 */
export interface PollOptions {
  /** Sleep this many ms between polls. Default: real `setTimeout`. Tests pass a no-op to stay fast. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Gap between polls (ms). Default {@link DEFAULT_POLL_INTERVAL_MS}. */
  readonly intervalMs?: number;
  /** Total time budget (ms) before the op is declared timed-out. Default {@link DEFAULT_POLL_BUDGET_MS}. */
  readonly budgetMs?: number;
  /** Monotonic clock (ms). Default `Date.now`. Injected so tests drive the budget deterministically. */
  readonly now?: () => number;
}

interface ResolvedPoll {
  readonly sleep: (ms: number) => Promise<void>;
  readonly intervalMs: number;
  readonly budgetMs: number;
  readonly now: () => number;
}

function resolvePoll(poll: PollOptions): ResolvedPoll {
  return {
    sleep: poll.sleep ?? defaultSleep,
    intervalMs: poll.intervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    budgetMs: poll.budgetMs ?? DEFAULT_POLL_BUDGET_MS,
    now: poll.now ?? Date.now,
  };
}

async function pollEdit(port: SpaceMcpPort, editId: string, poll: PollOptions): Promise<EditStatus> {
  const { sleep, intervalMs, budgetMs, now } = resolvePoll(poll);
  const deadline = now() + budgetMs;
  for (;;) {
    const status = await port.editStatus(editId);
    if (status.phase !== "running") return status;
    if (now() >= deadline) {
      return { phase: "failed", error: `edit did not reach terminal within the ${budgetMs}ms budget` };
    }
    await sleep(intervalMs);
  }
}

async function pollRun(port: SpaceMcpPort, runId: string, poll: PollOptions): Promise<RunStatus> {
  const { sleep, intervalMs, budgetMs, now } = resolvePoll(poll);
  const deadline = now() + budgetMs;
  for (;;) {
    const status = await port.runStatus(runId);
    if (status.phase !== "running") return status;
    if (now() >= deadline) {
      return { phase: "failed", error: `run did not reach terminal within the ${budgetMs}ms budget` };
    }
    await sleep(intervalMs);
  }
}

// --- injectSpec (Fallback Protocol: natural-language edit into JSON Master + readback confirm) ------

/**
 * Build the natural-language goal the in-canvas agent receives to inject the Spec. It names the TARGET
 * node — the Recipe's own prompt node (`promptNode` — `Recipe.canvasInputs.promptNode`, issue #88; the
 * wired character Recipe and the News Carousel Recipe each declare their OWN "JSON Master" node, on
 * two DIFFERENT Spaces) — and embeds the exact JSON to set, so the agent replaces that node's text
 * contract. Never hard-coded to one Recipe's node name.
 */
export function injectGoal(spec: ProductionSpec | Record<string, unknown>, promptNode: string): string {
  const json = JSON.stringify(spec);
  return `Replace the entire text content of the "${promptNode}" node with exactly this JSON: ${json}`;
}

/**
 * Inject a validated Production Spec into the Recipe's OWN prompt node (`promptNode`) via the Fallback
 * Protocol, then read back the node and confirm the text CHANGED (Spike 1; generalized beyond the one
 * wired Recipe's `JSON Master` in issue #88). Polls the edit to terminal before reading back. Returns
 * the confirmed new text on success; an identifiable failure if the edit failed, the node is missing, or
 * the readback shows no change.
 */
export async function injectSpec(
  port: SpaceMcpPort,
  spec: ProductionSpec | Record<string, unknown>,
  promptNode: string,
  poll: PollOptions = {},
): Promise<InjectResult> {
  const before = nodeText(await port.readState(), promptNode);

  const { editId } = await port.edit(injectGoal(spec, promptNode));
  const status = await pollEdit(port, editId, poll);
  if (status.phase === "failed") {
    return { ok: false, error: err("inject_edit_failed", status.error ?? "the inject edit failed") };
  }

  const after = nodeText(await port.readState(), promptNode);
  if (after === undefined) {
    return {
      ok: false,
      error: err("prompt_node_missing", `No "${promptNode}" node to read back.`),
    };
  }
  if (after === before) {
    return {
      ok: false,
      error: err(
        "inject_unconfirmed",
        `The "${promptNode}" text did not change after the inject — not confirmed.`,
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
  poll: PollOptions = {},
): Promise<RunResult> {
  const { runId } = await port.run(startNodeId, mode);
  const status = await pollRun(port, runId, poll);
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

// --- fetchCast (creation ids -> aligned {identifier, url} pairs) -------------------------------------

/**
 * Resolve creation identifiers to their `{ identifier, url }` pairs — used to surface a paused gate's
 * candidates for the Operator to judge (`fetchAsset` below resolves the single finished-Asset creation
 * separately, via the same underlying port call). Returns pairs, not a parallel id/url array, so a
 * creation's id and url can never drift apart (C36); an empty result is never returned as an overall
 * success (the caller fails the op instead — see `candidates_empty`).
 */
export async function fetchCast(
  port: SpaceMcpPort,
  creationIds: readonly string[],
): Promise<readonly Creation[]> {
  return port.fetchCreations(creationIds);
}

// --- pinPick (Fallback Protocol: natural-language pin of a resolved pick + readback confirm) ---------

/**
 * Build the natural-language goal the in-canvas agent receives to pin the Operator's resolved pick into
 * a named on-canvas creation node. The node name is supplied by the CALLER — a Recipe-declared reference
 * (`Recipe.space.nodes.pinnedReference`, `src/recipe/registry.ts`), never hard-coded here (ADR-0010).
 */
export function pinGoal(pick: string, nodeName: string): string {
  return `Pin the "${pick}" creation as the "${nodeName}" creation node, so the following steps render against it.`;
}

/**
 * Pin the Operator's resolved pick into `nodeName` via the **Fallback Protocol** (a natural-language
 * `edit`), poll the edit to terminal, then **confirm the pin through the port** (`port.verifyPinned`) —
 * the port owns "is this pick pinned?", so the confirmation is implementable against real Space state,
 * not a fake-only marker (ADR-0003 Phase B; Spike 1). Returns the confirmed pick on success; an
 * identifiable failure if the pin edit failed or the pin cannot be confirmed.
 */
export async function pinPick(
  port: SpaceMcpPort,
  pick: string,
  nodeName: string,
  poll: PollOptions = {},
): Promise<PinResult> {
  const { editId } = await port.edit(pinGoal(pick, nodeName));
  const status = await pollEdit(port, editId, poll);
  if (status.phase === "failed") {
    return { ok: false, error: err("pin_edit_failed", status.error ?? "the pin edit failed") };
  }

  if (!(await port.verifyPinned(pick))) {
    return {
      ok: false,
      error: err(
        "pin_unconfirmed",
        `The resolved pick "${pick}" is not pinned after the edit — not confirmed.`,
      ),
    };
  }
  return { ok: true, pick };
}

// --- bindMediaAsset (Fallback Protocol: bind a Brand Asset's local media into a named node) -----------

/**
 * Build the natural-language goal the in-canvas agent receives to bind a Brand Asset's LOCAL media file
 * into a named on-canvas reference node (issue #88, ADR-0016's bind phase). It names the local path, the
 * media kind (so the agent picks the matching Magnific tool — `images_*`/`video_*`/`audio_*`), and the
 * TARGET node (a Recipe-declared media slot's physical canvas target — never hard-coded here).
 */
export function bindMediaGoal(path: string, media: "image" | "video" | "audio", nodeName: string): string {
  return (
    `Upload the ${media} file at "${path}" using the matching Magnific tool, and set the result as the ` +
    `"${nodeName}" node's reference asset, replacing whatever it currently holds.`
  );
}

/**
 * Bind a Brand Asset's local media file (`src/brand-asset/store.ts`'s `BrandAssetStore`) into a named
 * canvas node via the Fallback Protocol, then confirm via `port.verifyPinned` — the SAME port primitive
 * `pinPick` already uses to confirm a Character pin, reused here for a bound Brand Asset (no new port
 * method: the port already models "is THIS value confirmed as bound to the canvas?" generically).
 * Mirrors `pinPick`'s shape/failure modes exactly, with its own distinct error codes.
 */
export async function bindMediaAsset(
  port: SpaceMcpPort,
  path: string,
  media: "image" | "video" | "audio",
  nodeName: string,
  poll: PollOptions = {},
): Promise<PinResult> {
  const { editId } = await port.edit(bindMediaGoal(path, media, nodeName));
  const status = await pollEdit(port, editId, poll);
  if (status.phase === "failed") {
    return {
      ok: false,
      error: err("media_bind_edit_failed", status.error ?? "the media-bind edit failed"),
    };
  }

  if (!(await port.verifyPinned(path))) {
    return {
      ok: false,
      error: err(
        "media_bind_unconfirmed",
        `The Brand Asset at "${path}" is not bound to "${nodeName}" after the edit — not confirmed.`,
      ),
    };
  }
  return { ok: true, pick: path };
}

// --- setWatermarkHandle (Fallback Protocol: swap ONLY the @handle on a Recipe-declared node) ----------

/**
 * Build the natural-language goal the in-canvas agent receives to set the Brand's watermark `@handle`
 * onto a Recipe-declared node — a SURGICAL swap: only the `@handle` placeholder changes; every other
 * word of the node's existing text is left untouched (QA-1, issue #88; restores the pre-#88 behaviour
 * byte-for-byte — the real, captured `Producer Protocol`'s `replace_text`/`"replace_only": "@handle"`
 * step, `src/space-driver/fixtures/live-captures/02-spaces_get_nodes.keynodes.txt`).
 */
export function watermarkGoal(handle: string, nodeName: string): string {
  return (
    `Replace ONLY the "@handle" placeholder in the "${nodeName}" node's text with "${handle}" — leave ` +
    "every other word of the existing text unchanged."
  );
}

/**
 * Set the Brand's watermark `@handle` onto a Recipe-declared node (`Recipe.space.nodes.watermarkNode`)
 * via the Fallback Protocol, then read back that node and confirm its text now carries `handle` — a
 * generic, Recipe-declared pre-render step (this is NOT the Asset's Copy, ADR-0012): only a Recipe that
 * declares a `watermarkNode` runs this at all; the wired *Character Explainer with Cast* Recipe does
 * (`WATERMARK_NODE_NAME`), the *News Carousel* Recipe does not. Mirrors `injectSpec`'s readback-confirm
 * shape, with its own distinct error codes.
 */
export async function setWatermarkHandle(
  port: SpaceMcpPort,
  handle: string,
  nodeName: string,
  poll: PollOptions = {},
): Promise<InjectResult> {
  const { editId } = await port.edit(watermarkGoal(handle, nodeName));
  const status = await pollEdit(port, editId, poll);
  if (status.phase === "failed") {
    return {
      ok: false,
      error: err("watermark_edit_failed", status.error ?? "the watermark-handle edit failed"),
    };
  }

  const after = nodeText(await port.readState(), nodeName);
  if (after === undefined) {
    return {
      ok: false,
      error: err("watermark_node_missing", `No "${nodeName}" node to read back.`),
    };
  }
  if (!after.includes(handle)) {
    return {
      ok: false,
      error: err(
        "watermark_unconfirmed",
        `The "${nodeName}" text does not include the handle "${handle}" after the edit — not confirmed.`,
      ),
    };
  }
  return { ok: true, text: after };
}

// --- fetchAsset (the finished Asset creation -> its media URL) ---------------------------------------

/** Resolve the finished Asset's creation identifier to its media URL (the Operator publishes this). */
export async function fetchAsset(port: SpaceMcpPort, creationId: string): Promise<string | null> {
  const creations = await port.fetchCreations([creationId]);
  return creations[0]?.url ?? null;
}

// ====================================================================================================
// === driveToNextGate — the generic run-until-gate engine (ADR-0010, issue #57) ========================
// ====================================================================================================

/**
 * One leg's input: either the Recipe's FIRST leg (no gate has resolved yet — inject the Spec) or a
 * RESUMED leg (a preceding gate's pick has resolved — pin it into the Recipe-declared node before
 * continuing). Mirrors the Production Queue's job shape (`src/production-queue/queue.ts`, issue #56): a
 * job with no `pick` is a first leg; a job carrying `pick` is a resumed leg.
 */
export type DriveLegInput =
  | {
      readonly kind: "first";
      /** The gate this leg's run-point pauses at, or `null` for a gateless Recipe (runs straight through). */
      readonly targetGate: string | null;
      readonly spec: ProductionSpec | Record<string, unknown>;
      /** The Recipe's OWN prompt node to inject the Spec into (`Recipe.canvasInputs.promptNode`, e.g.
       *  `JSON Master` — a different Recipe's own node on a different Space, never assumed shared) —
       *  Recipe-declared, never hard-coded here (issue #88). */
      readonly promptNode: string;
    }
  | {
      readonly kind: "resumed";
      /** The gate this leg's run-point pauses at, or `null` when this is the FINAL leg (renders the Asset). */
      readonly targetGate: string | null;
      /** The Operator's resolved pick from the PRECEDING gate. */
      readonly pick: string;
      /** The on-canvas creation node the pick is pinned into before this leg's run-point runs
       *  (Recipe-declared — `Recipe.space.nodes.pinnedReference`; never hard-coded here). */
      readonly pinnedReferenceNodeName: string;
    };

/**
 * One leg's outcome: PAUSED at a declared gate with candidates for the Operator to choose from, or
 * FINISHED (the terminal, gateless leg rendered the Asset).
 */
export type DriveOutcome =
  | {
      readonly kind: "paused";
      readonly gate: string;
      readonly candidates: readonly Creation[];
      /** True when recovery via the in-canvas agent (Fallback Protocol) produced these candidates. */
      readonly usedFallback: boolean;
    }
  | {
      readonly kind: "finished";
      readonly asset: AssetResult;
      /** True when recovery via the in-canvas agent (Fallback Protocol) produced this render. */
      readonly usedFallback: boolean;
    };

export type DriveToNextGateResult =
  | { readonly ok: true; readonly outcome: DriveOutcome }
  | { readonly ok: false; readonly error: DriverError };

/**
 * Build the natural-language goal that delegates a leg to the in-canvas agent when its target run-point
 * is missing/stale — the Fallback Protocol's run-by-goal recovery (ADR-0003; recovery applies only to a
 * Recipe's FIRST leg, mirroring today's Cast-gate recovery — a resumed leg's run-point failing to
 * resolve is reported directly, since the Space has already been driven partway by an EARLIER leg and
 * there is no general "resume from here" goal for the agent to work from). It does NOT name a node to
 * run — it states the GOAL, so the agent figures out how to produce the result on the changed canvas.
 */
export function fallbackGoal(targetGate: string | null): string {
  return targetGate === null
    ? "Generate the final render (the Asset) from the current Spec, running it all the way to completion."
    : `Generate the candidates for the "${targetGate}" gate from the current Spec and stop there — do not proceed any further.`;
}

/**
 * Resolve ONE leg's terminal run outcome: a PAUSED leg (`targetGate` non-null) surfaces the produced
 * creations as candidates for the Operator — failing `candidates_empty` rather than returning ok with
 * nothing to show (C36); a FINISHED leg (`targetGate === null`) resolves the single produced Asset
 * creation to its media URL.
 */
async function finishLeg(
  port: SpaceMcpPort,
  targetGate: string | null,
  creationIds: readonly string[],
  pick: string | undefined,
  usedFallback: boolean,
): Promise<DriveToNextGateResult> {
  if (targetGate !== null) {
    const candidates = await fetchCast(port, creationIds);
    if (candidates.length === 0) {
      return {
        ok: false,
        error: err(
          "candidates_empty",
          `the run for gate "${targetGate}" produced no candidates to surface.`,
        ),
      };
    }
    return { ok: true, outcome: { kind: "paused", gate: targetGate, candidates, usedFallback } };
  }

  const assetId = creationIds[0];
  if (assetId === undefined) {
    return { ok: false, error: err("run_failed", "the final run produced no Asset creation") };
  }
  const assetUrl = await fetchAsset(port, assetId);
  if (assetUrl === null) {
    return { ok: false, error: err("run_failed", "the finished Asset creation has no media URL") };
  }
  const asset: AssetResult = pick !== undefined ? { pick, assetId, assetUrl } : { assetId, assetUrl };
  return { ok: true, outcome: { kind: "finished", asset, usedFallback } };
}

/**
 * Fallback Protocol recovery: delegate the leg to the in-canvas agent via a natural-language run-by-goal
 * edit, then resolve its result exactly like a named run (paused candidates, or the finished Asset).
 */
async function recoverViaAgent(
  port: SpaceMcpPort,
  poll: PollOptions,
  targetGate: string | null,
): Promise<DriveToNextGateResult> {
  const { editId } = await port.edit(fallbackGoal(targetGate));
  const status = await pollEdit(port, editId, poll);
  if (status.phase === "failed") {
    return { ok: false, error: err("run_failed", status.error ?? "the agent-fallback run failed") };
  }
  // The recovered result is whatever the agent-run-by-goal edit reports it produced — never a
  // hard-coded id list (C9). An adapter that reports no ids resolves to an empty candidate/asset set,
  // which `finishLeg` fails identifiably rather than inventing a result.
  return finishLeg(port, targetGate, status.creationIds ?? [], undefined, true);
}

/**
 * Drive ONE leg of a Recipe's Execution Protocol (ADR-0010): the generic replacement for the old fixed
 * `composeAndCast`/`pickAndRender` two-phase split. Resolves the run-point whose `gate` matches
 * `input.targetGate` from the parsed Execution Protocol — by NAME, never hard-coded — runs it, and
 * either PAUSES with that gate's candidates or, for a `null` target, FINISHES with the rendered Asset.
 *
 * - A **first** leg (`input.kind === "first"`) injects the Spec before resolving/running its run-point,
 *   and recovers via the in-canvas agent (Fallback Protocol) when the run-point cannot be resolved or
 *   reports its start node missing/stale — mirroring the seeded Recipe's Cast-gate recovery exactly.
 * - A **resumed** leg (`input.kind === "resumed"`) pins the Operator's resolved pick into
 *   `input.pinnedReferenceNodeName` before resolving/running its run-point. There is no Fallback-Protocol
 *   recovery for a resumed leg's run-point (mirrors today's Phase-B behavior: a missing/stale clip
 *   run-point fails directly rather than attempting agent recovery mid-flight).
 *
 * A Recipe with ZERO gates drives its single run-point as a first leg with `targetGate: null` — it
 * injects the Spec, runs straight through, and FINISHES with the Asset, no pause at all. A Recipe with
 * SEVERAL gates drives one leg per gate (plus one final leg): each resumed leg targets the NEXT gate in
 * the Recipe's own declared order (or `null` for the last leg), resolved by the caller/orchestration
 * shell from `Recipe.gates` — this module carries no dependency on the Recipe registry itself, staying a
 * pure, Recipe-agnostic deep module driven entirely by its explicit `DriveLegInput`.
 *
 * The driver never publishes: a paused leg surfaces candidates for a human and stops; a finished leg
 * surfaces the Asset for a human to publish and stops (generate-never-publish).
 */
export async function driveToNextGate(
  port: SpaceMcpPort,
  spaceState: SpaceStateLike,
  input: DriveLegInput,
  poll: PollOptions = {},
): Promise<DriveToNextGateResult> {
  if (input.kind === "first") {
    const injected = await injectSpec(port, input.spec, input.promptNode, poll);
    if (!injected.ok) {
      return { ok: false, error: injected.error };
    }
  } else {
    const pinned = await pinPick(port, input.pick, input.pinnedReferenceNodeName, poll);
    if (!pinned.ok) {
      return { ok: false, error: pinned.error };
    }
  }

  // Resolve THIS leg's run-point — the one whose gate matches the target — by NAME from the parsed
  // Execution Protocol, never hard-coded.
  const parsed = parse(spaceState);
  const runPoint = parsed.ok ? parsed.runPoints.find((rp) => rp.gate === input.targetGate) ?? null : null;

  if (runPoint === null) {
    if (input.kind === "first") {
      // Cannot resolve the target run-point at all — recover via the in-canvas agent.
      return recoverViaAgent(port, poll, input.targetGate);
    }
    return {
      ok: false,
      error: err(
        "run_point_unresolved",
        `Could not resolve the run-point for gate ${JSON.stringify(input.targetGate)} from the Execution Protocol.`,
      ),
    };
  }

  const run = await runRunPoint(port, runPoint.start_node_id, DOWNSTREAM_MODE, poll);
  if (!run.ok) {
    if (run.error.code === "run_point_stale" && input.kind === "first") {
      // The run-point is gone/stale on the canvas — recover via the in-canvas agent.
      return recoverViaAgent(port, poll, input.targetGate);
    }
    return { ok: false, error: run.error };
  }

  const pick = input.kind === "resumed" ? input.pick : undefined;
  return finishLeg(port, input.targetGate, run.outcome.creationIds, pick, false);
}
