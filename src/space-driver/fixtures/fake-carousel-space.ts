/**
 * FAKE Magnific Space implementing the narrow `SpaceMcpPort` — the News Carousel Recipe's Space ("AI
 * News", issue #60). THIS IS PART OF THE MAGNIFIC FAKE: hermetic, no live `spaces_*`/`creations_*`
 * calls, no credits, no board mutation (CLAUDE.md build pipeline; ADR-0003).
 *
 * Composes the fake `spaces_state` from `execution-protocol/fixtures/carousel-space-state.ts` (one fake
 * Space per real Space, mirroring `space-driver/fixtures/fake-space.ts`'s pattern for the wired one) and
 * adds the run-time behavior `driveSelectedRunPoints` needs:
 *
 *   - inject: a natural-language `edit` targeting `JSON Master` replaces that node's text (same
 *     Fallback-Protocol convention as the wired Space).
 *   - per-slide run: a `downstream` run started at `Image Prompt Slide N`'s node id fires that
 *     extractor AND its own `Slide N Generator`, producing exactly ONE image creation for that slide —
 *     never any other slide's nodes (proving the driver only touches the slides it targets).
 *   - this Recipe is ZERO-gate: there is no pin/pick step, so `verifyPinned` is never meaningfully
 *     exercised (it always answers `false` — nothing ever pins against this fake).
 */

import type { Creation, EditStatus, RunStatus, SpaceMcpPort } from "../port.ts";
import type { SpaceStateLike, SpaceStateNode } from "../../execution-protocol/parse.ts";
import {
  fakeCarouselSpaceState,
  CAROUSEL_JSON_MASTER_NODE_NAME,
} from "../../execution-protocol/fixtures/carousel-space-state.ts";
import type { FakeSpaceState } from "../../execution-protocol/fixtures/space-state.ts";

/** The finished creation identifier for one slide's rendered image. */
export function slideCreationId(slideIndex: number): string {
  return `slide-${slideIndex}-image`;
}

/** The finished media URL for one slide's rendered image (for assertions). */
export function slideCreationUrl(slideIndex: number): string {
  return `https://magnific.example/carousel/slide-${slideIndex}.png`;
}

/** The node names a healthy run of one slide's run-point fires: its extractor + its own generator. */
export function slideFiredNodeNames(slideIndex: number): readonly string[] {
  return [`Image Prompt Slide ${slideIndex}`, `Slide ${slideIndex} Generator`];
}

/** Options that select which fault the fake models (default: a fully-healthy Space). */
export interface FakeCarouselSpaceOptions {
  /** When true, the inject edit does NOT change `JSON Master`'s text (models a no-op/failed inject). */
  readonly injectNoOp?: boolean;
  /** When set, the run started for THIS 1-based slide index reports a plain failure (never
   *  `startNodeMissing` — this Recipe's driving primitive attempts no Fallback-Protocol recovery). */
  readonly slideRunFails?: number;
}

/** A FAKE "AI News" Space implementing the narrow `SpaceMcpPort`. Stateful only in memory. */
export class FakeCarouselSpace implements SpaceMcpPort {
  private nodes: SpaceStateNode[];
  private readonly options: FakeCarouselSpaceOptions;

  /** Every natural-language edit goal issued through `edit`, in order. */
  public readonly editGoals: string[] = [];
  /** Every `(startNodeId, mode)` a run was started at, in order — proves EXACTLY which slides ran. */
  public readonly runs: Array<{ startNodeId: string; mode: string }> = [];

  private readonly editPollsLeft = new Map<string, number>();
  private readonly runPollsLeft = new Map<string, number>();
  private readonly runStartNodeIds = new Map<string, string>();
  private editSeq = 0;
  private runSeq = 0;

  constructor(base: FakeSpaceState = fakeCarouselSpaceState(), options: FakeCarouselSpaceOptions = {}) {
    this.nodes = base.nodes.map((n) => ({ ...n }));
    this.options = options;
  }

  async readState(): Promise<SpaceStateLike> {
    return { nodes: this.nodes.map((n) => ({ ...n })) };
  }

  async edit(goal: string): Promise<{ editId: string }> {
    this.editGoals.push(goal);
    if (goal.includes(CAROUSEL_JSON_MASTER_NODE_NAME) && !this.options.injectNoOp) {
      this.nodes = this.nodes.map((n) =>
        n.name === CAROUSEL_JSON_MASTER_NODE_NAME ? { ...n, value: extractInjectedText(goal) } : n,
      );
    }
    const editId = `edit-${++this.editSeq}`;
    this.editPollsLeft.set(editId, 1);
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
    this.runPollsLeft.set(runId, 1);
    this.runStartNodeIds.set(runId, startNodeId);
    return { runId };
  }

  async runStatus(runId: string): Promise<RunStatus> {
    const left = this.runPollsLeft.get(runId) ?? 0;
    if (left > 0) {
      this.runPollsLeft.set(runId, left - 1);
      return { phase: "running" };
    }
    const slideIndex = this.slideIndexForRun(runId);
    if (slideIndex === null) {
      return { phase: "failed", error: "no configured slide run-point for this node id" };
    }
    if (this.options.slideRunFails === slideIndex) {
      return { phase: "failed", error: `slide ${slideIndex}'s run failed` };
    }
    return {
      phase: "succeeded",
      firedNodeNames: [...slideFiredNodeNames(slideIndex)],
      creationIds: [slideCreationId(slideIndex)],
    };
  }

  /** Resolve which 1-based slide a run's start node id names, or `null` if it names none of them. */
  private slideIndexForRun(runId: string): number | null {
    const startId = this.runStartNodeIds.get(runId);
    if (startId === undefined) return null;
    const node = this.nodes.find((n) => n.id === startId);
    if (node === undefined) return null;
    const match = /^Image Prompt Slide (\d+)$/.exec(node.name);
    return match ? Number(match[1]) : null;
  }

  async fetchCreations(ids: readonly string[]): Promise<readonly Creation[]> {
    const all: readonly Creation[] = Array.from({ length: 7 }, (_, i) => ({
      identifier: slideCreationId(i + 1),
      url: slideCreationUrl(i + 1),
    }));
    return ids
      .map((id) => all.find((c) => c.identifier === id))
      .filter((c): c is Creation => c !== undefined);
  }

  /** This Recipe is zero-gate: nothing ever pins against it, so this always answers false. */
  async verifyPinned(): Promise<boolean> {
    return false;
  }
}

/** Pull the to-be-injected text out of the driver's natural-language goal (mirrors `fake-space.ts`). */
function extractInjectedText(goal: string): string {
  const marker = goal.indexOf("{");
  const bracket = goal.indexOf("[");
  const start = marker === -1 ? bracket : bracket === -1 ? marker : Math.min(marker, bracket);
  if (start !== -1) {
    return goal.slice(start);
  }
  return "INJECTED";
}
