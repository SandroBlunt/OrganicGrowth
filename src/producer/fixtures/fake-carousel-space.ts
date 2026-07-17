/**
 * FAKE Magnific Space for the **News Carousel** Recipe — THIS IS THE MAGNIFIC FAKE, a second,
 * purpose-built stand-in alongside `space-driver/fixtures/fake-space.ts`'s character-Recipe fake
 * (issue #88; CLAUDE.md build pipeline — hermetic, no live `spaces_*`/`creations_*` calls, no credits,
 * no board mutation).
 *
 * The News Carousel Recipe (`src/recipe/registry.ts`'s `NEWS_CAROUSEL`) drives a genuinely DIFFERENT
 * canvas shape than the wired character Recipe: ONE node ("Slides Prompts") is simultaneously the
 * Producer's injectable prompt node AND the Execution Protocol's sole, gateless run-point
 * (`canonicalCarouselProtocol()`), plus a reference-image node the Brand's logo Brand Asset binds into
 * (ADR-0016's bind phase). Reusing the character-Recipe `FakeSpace` here would be wrong — its `edit`/
 * `verifyPinned` are hard-coded to `JSON Master`/`Character #2` — so this is an independent, minimal
 * fake implementing the SAME narrow `SpaceMcpPort`.
 */

import type { Creation, EditStatus, RunStatus, SpaceMcpPort } from "../../space-driver/port.ts";
import type { SpaceStateLike, SpaceStateNode } from "../../execution-protocol/parse.ts";
import {
  PRODUCER_PROTOCOL_NODE_NAME,
  canonicalCarouselProtocol,
  serializeProtocol,
} from "../../execution-protocol/protocol.ts";

/** The News Carousel Recipe's sole prompt/run-point node name (matches `NEWS_CAROUSEL.canvasInputs.promptNode`). */
export const SLIDES_PROMPTS_NODE_NAME = "Slides Prompts";

/** The node the downstream run fires on its way to the finished Asset (models the Space's own chain). */
export const GENERATED_SLIDES_NODE_NAME = "Generated Slides";

/** The single finished Asset creation a successful carousel render produces. */
export const CAROUSEL_ASSET_CREATION_ID = "carousel-asset-1";
/** The finished Asset's media URL (for assertions). */
export const CAROUSEL_ASSET_URL = "https://magnific.example/carousel/asset/1.png";

/** A marker prefix recorded on a bound reference node, so `verifyPinned` can confirm WHAT is bound —
 *  reused generically for a Brand Asset's local path, mirroring `fake-space.ts`'s `PINNED:` convention. */
const BOUND_MARKER = "BOUND:";

export interface FakeCarouselSpaceOptions {
  /** When true, the media-bind edit does NOT record the bind, so `verifyPinned` fails (models a
   *  no-op/failed bind). */
  readonly bindNoOp?: boolean;
  /** When true, the Spec-inject edit does NOT change the `Slides Prompts` text (models a no-op inject). */
  readonly injectNoOp?: boolean;
}

/**
 * A FAKE Magnific Space for the News Carousel Recipe's shape. Stateful only in memory: tracks node
 * values (so an inject/bind is visible on readback) and records every edit goal + run started (so a
 * test can assert exactly what the driver did — including asserting NOTHING was called, for the
 * missing-required-asset STOP case).
 */
export class FakeCarouselSpace implements SpaceMcpPort {
  private nodes: SpaceStateNode[];
  private readonly options: FakeCarouselSpaceOptions;
  private readonly bound = new Set<string>();

  /** Every natural-language edit goal issued through `edit`, in order. */
  public readonly editGoals: string[] = [];
  /** Every `(startNodeId, mode)` a run was started at, in order. */
  public readonly runs: Array<{ startNodeId: string; mode: string }> = [];

  private editSeq = 0;
  private runSeq = 0;

  constructor(logoReferenceNodeName: string, options: FakeCarouselSpaceOptions = {}) {
    this.options = options;
    this.nodes = [
      { id: "node-slides-prompts", name: SLIDES_PROMPTS_NODE_NAME, value: "placeholder" },
      { id: "node-logo-reference", name: logoReferenceNodeName, value: "placeholder" },
      { id: "node-generated-slides", name: GENERATED_SLIDES_NODE_NAME },
      {
        id: "node-producer-protocol",
        name: PRODUCER_PROTOCOL_NODE_NAME,
        value: serializeProtocol(canonicalCarouselProtocol()),
      },
    ];
  }

  async readState(): Promise<SpaceStateLike> {
    return { nodes: this.nodes.map((n) => ({ ...n })) };
  }

  async edit(goal: string): Promise<{ readonly editId: string }> {
    this.editGoals.push(goal);

    if (goal.includes(SLIDES_PROMPTS_NODE_NAME) && !this.options.injectNoOp) {
      const marker = goal.indexOf("{");
      const text = marker !== -1 ? goal.slice(marker) : "INJECTED";
      this.nodes = this.nodes.map((n) =>
        n.name === SLIDES_PROMPTS_NODE_NAME ? { ...n, value: text } : n,
      );
    } else if (!goal.includes(SLIDES_PROMPTS_NODE_NAME) && !this.options.bindNoOp) {
      // A media-bind goal (`driver.ts`'s `bindMediaGoal`) embeds the local path in double quotes,
      // followed by "file at". Extract it so `verifyPinned` can confirm the SAME value.
      const match = goal.match(/Upload the \S+ file at "([^"]+)"/);
      if (match) {
        this.bound.add(match[1]!);
        const boundValue = `${BOUND_MARKER}${match[1]!}`;
        let done = false;
        this.nodes = this.nodes.map((n) => {
          if (!done && n.name !== SLIDES_PROMPTS_NODE_NAME && n.name !== PRODUCER_PROTOCOL_NODE_NAME) {
            done = true;
            return { ...n, value: boundValue };
          }
          return n;
        });
      }
    }

    const editId = `edit-${++this.editSeq}`;
    return { editId };
  }

  async editStatus(): Promise<EditStatus> {
    return { phase: "succeeded" };
  }

  async run(startNodeId: string, mode: string): Promise<{ readonly runId: string }> {
    this.runs.push({ startNodeId, mode });
    const runId = `run-${++this.runSeq}`;
    return { runId };
  }

  async runStatus(): Promise<RunStatus> {
    return {
      phase: "succeeded",
      firedNodeNames: [GENERATED_SLIDES_NODE_NAME],
      creationIds: [CAROUSEL_ASSET_CREATION_ID],
    };
  }

  async fetchCreations(ids: readonly string[]): Promise<readonly Creation[]> {
    const all: readonly Creation[] = [{ identifier: CAROUSEL_ASSET_CREATION_ID, url: CAROUSEL_ASSET_URL }];
    return ids.map((id) => all.find((c) => c.identifier === id)).filter((c): c is Creation => c !== undefined);
  }

  /** Confirm a value (a Brand Asset's local path) is bound — the SAME generic port primitive
   *  `pinPick`/`bindMediaAsset` both confirm through. */
  async verifyPinned(value: string): Promise<boolean> {
    return this.bound.has(value);
  }
}
