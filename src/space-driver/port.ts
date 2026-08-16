/**
 * The narrow Magnific Space MCP port — the ONLY seam between the Space driver and Magnific.
 *
 * The Space driver (ADR-0003 Phase A) depends on THIS interface, never on the live Magnific MCP tools.
 * It models exactly the operations the driver needs and nothing more:
 *
 *   - read the Space's node state (`readState`),
 *   - issue a natural-language `spaces_edit` delegated to the in-canvas agent (`edit`) and poll it to
 *     terminal (`editStatus`) — this is the Fallback Protocol's transport (Spike 1),
 *   - start a `spaces_run` at a node (`run`) and poll it to terminal (`runStatus`) — Spike 2,
 *   - fetch creations by identifier (`fetchCreations`) — for the Cast image URLs.
 *
 * --- WHY A PORT (hermetic build, CLAUDE.md build pipeline) ---
 *
 * The build is hermetic: NO live `spaces_*`/`creations_*` calls, no credits, no board mutation, no
 * network. Tests pass a FAKE implementing this interface (see `fixtures/fake-space.ts`), so the driver
 * is fully exercised at the MCP boundary without the live Space. The REAL adapter that calls the live
 * Magnific MCP tools (`spaces_state` / `spaces_edit` + `spaces_edit_status` / `spaces_run` +
 * `spaces_run_status` / `creations_*`) implements this same interface and is deferred to the worker
 * slice — it is deliberately NOT built or tested here.
 *
 * The port speaks ONLY in the vocabulary the driver needs. Polling is the driver's job (it calls
 * `editStatus`/`runStatus` until terminal); the port just exposes single steps, so the fake can model a
 * multi-poll run deterministically.
 */

import type { SpaceStateLike } from "../execution-protocol/parse.ts";

/** Terminal-or-not status of an async edit/run, mirroring the MCP status tools. */
export type OperationPhase = "running" | "succeeded" | "failed";

/** The result of polling an edit's status. Terminal when `phase` is `succeeded` or `failed`. */
export interface EditStatus {
  readonly phase: OperationPhase;
  /** Set when `phase === "failed"`: a short reason (e.g. the agent could not complete the goal). */
  readonly error?: string;
  /**
   * Set (terminal, success) when the edit was an agent-RUN-by-goal that produced creations — e.g. the
   * Fallback-Protocol cast recovery, where the agent runs the canvas to a Cast. The driver derives the
   * recovered Cast from THESE ids (never a hard-coded list), so a live adapter can satisfy the contract
   * by reporting whatever the agent actually produced.
   */
  readonly creationIds?: readonly string[];
}

/**
 * The result of polling a run's status. Terminal when `phase` is `succeeded` or `failed`. On success it
 * carries which node NAMES fired and which creation identifiers the run produced; on failure it may flag
 * that the run's start node was missing/stale (the recovery trigger).
 */
export interface RunStatus {
  readonly phase: OperationPhase;
  /** The NAMES of the nodes that fired during the run (terminal, success). */
  readonly firedNodeNames?: readonly string[];
  /** The identifiers of the creations the run produced (terminal, success). */
  readonly creationIds?: readonly string[];
  /** Set when `phase === "failed"`: a short reason. */
  readonly error?: string;
  /**
   * True when the run failed because its start node is gone/stale on the canvas (the Space changed).
   * This is the Fallback-Protocol recovery trigger (ADR-0003 / PRD #1 story 27).
   */
  readonly startNodeMissing?: boolean;
}

/** One creation as the driver reads it: an identifier and its media URL. */
export interface Creation {
  readonly identifier: string;
  /** The viewable media URL the Operator judges the Cast by. */
  readonly url: string;
}

/**
 * The narrow port the Space driver drives. A FAKE implements this in tests; the live MCP adapter
 * implements it in the worker slice. The driver makes NO call outside this interface.
 */
export interface SpaceMcpPort {
  /** Read the current Space node state (the parser/readback source). */
  readState(): Promise<SpaceStateLike>;

  /**
   * Issue a natural-language edit goal, delegated to the Space's in-canvas agent (`spaces_edit`).
   * Returns an operation id to poll. This is the Fallback Protocol's transport — used both to inject the
   * Spec into a text node and to run a step by goal when a run-point is missing/stale.
   */
  edit(goal: string): Promise<{ readonly editId: string }>;

  /** Poll a previously-issued edit's status (the driver calls this until terminal). */
  editStatus(editId: string): Promise<EditStatus>;

  /**
   * Start a `spaces_run` at `startNodeId` in `mode`. Returns an operation id to poll.
   * @param mode "downstream" runs the start node and everything downstream of it (Spike 2).
   */
  run(startNodeId: string, mode: string): Promise<{ readonly runId: string }>;

  /** Poll a previously-started run's status (the driver calls this until terminal). */
  runStatus(runId: string): Promise<RunStatus>;

  /** Fetch creations by identifier (for the Cast image URLs). */
  fetchCreations(ids: readonly string[]): Promise<readonly Creation[]>;

  /**
   * Confirm `value` is bound as the render reference it was just pinned/bound to (the readback
   * confirmation of an `edit` — ADR-0003 Phase B). Originally named for confirming the chosen
   * **Character** pin, this same primitive is REUSED, unchanged, to confirm a Brand Asset's bind
   * (`driver.ts`'s `bindMediaAsset`, issue #88/ADR-0016) — the port owns "is this value bound?" so a
   * live adapter can answer it against real Space state, while the FAKE answers it via its own marker.
   * Returns true when `value` (a Character candidate identifier, or a Brand Asset's local path) is
   * confirmed bound.
   *
   * `nodeName` names WHICH on-canvas node to check (a Recipe-declared reference — e.g. `"Selected
   * Character"` for the wired Recipe's Cast pin, `"Brand_Logo"` for the News Carousel Recipe's logo
   * slot). REQUIRED — a default here is exactly the silent wrong-node trap issue #102 finding #4
   * fixed: a live implementation that fell back to one hard-coded node would silently mis-verify
   * every OTHER Recipe's bind. `pinPick`/`bindMediaAsset` pass their own target node through.
   */
  verifyPinned(value: string, nodeName: string): Promise<boolean>;
}
