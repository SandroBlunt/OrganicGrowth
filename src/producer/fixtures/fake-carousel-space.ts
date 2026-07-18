/**
 * FAKE Magnific Space for the **News Carousel** Recipe — THIS IS THE MAGNIFIC FAKE, a second,
 * purpose-built stand-in alongside `space-driver/fixtures/fake-space.ts`'s character-Recipe fake
 * (issue #88; CLAUDE.md build pipeline — hermetic, no live `spaces_*`/`creations_*` calls, no credits,
 * no board mutation).
 *
 * The News Carousel Recipe (`src/recipe/registry.ts`'s `NEWS_CAROUSEL`) drives a genuinely DIFFERENT
 * canvas shape than the wired character Recipe: ONE node ("JSON Master") is simultaneously the
 * Producer's injectable prompt node AND the Execution Protocol's sole, gateless run-point
 * (`canonicalCarouselProtocol()`), plus a reference-image node the Brand's logo Brand Asset binds into
 * (ADR-0016's bind phase). Reusing the character-Recipe `FakeSpace` here would be wrong — its `edit`/
 * `verifyPinned` are hard-coded to `JSON Master`/`Character #2` on a DIFFERENT Space — so this is an
 * independent, minimal fake implementing the SAME narrow `SpaceMcpPort`.
 *
 * --- Rebuilt to the REAL, captured single-lane shape (issue #86/#89) ---
 *
 * Every node name below, the wiring, the Execution Protocol run-point, and the Image Generator's
 * settings are taken VERBATIM from the sanctioned live capture of the real "Carrousel" Space
 * (`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`, issue #86):
 * 7 nodes, 5 connections. `fake-carousel-space.test.ts` parses that SAME capture file and asserts this
 * fake's declared inventory matches it exactly, so the two can never silently drift apart. The earlier
 * placeholder names (`"Slides Prompts"`, `"Brand Logo"`) named no real canvas node at all — the
 * Operator chose to align the BUILD to the canvas rather than rename the canvas (issue #89).
 */

import type { Creation, EditStatus, RunStatus, SpaceMcpPort } from "../../space-driver/port.ts";
import type { SpaceStateLike, SpaceStateNode } from "../../execution-protocol/parse.ts";
import {
  PRODUCER_PROTOCOL_NODE_NAME,
  canonicalCarouselProtocol,
  serializeProtocol,
} from "../../execution-protocol/protocol.ts";

// ---------------------------------------------------------------------------
// Real, captured node names (issue #86's `00-spaces_show.fullboard.json`)
// ---------------------------------------------------------------------------

/**
 * The News Carousel Recipe's sole prompt/run-point node name (matches
 * `NEWS_CAROUSEL.canvasInputs.promptNode` / `NEWS_CAROUSEL.space.nodes.specInput`,
 * `src/recipe/registry.ts`). This is a DIFFERENT node, on a DIFFERENT Space, than the wired
 * *Character Explainer with Cast* Recipe's own "JSON Master" node (`space-driver/driver.ts`'s
 * `JSON_MASTER_NODE_NAME`) — the two share only a name.
 */
export const CARROUSEL_JSON_MASTER_NODE_NAME = "JSON Master";

/** The Brand's logo reference-image node — the News Carousel Recipe's sole `"Brand_Logo"` brand-asset
 *  media slot binds into this node (its map key IS this physical node name; see `recipe/registry.ts`). */
export const CARROUSEL_BRAND_LOGO_NODE_NAME = "Brand_Logo";

/** The `prompt-generator` node that turns the injected JSON Master text into a list of image prompts. */
export const CARROUSEL_ASSISTANT_NODE_NAME = "Assistant";

/** The `list` node the Assistant's generated prompts land in on their way to the Image Generator. */
export const CARROUSEL_LIST_NODE_NAME = "List";

/** The `image-generator` node — real settings: `imagen-nano-banana-2-flash`, `3:4`, `1k` (Operator
 *  confirmed flash-vs-non-flash 2026-07-18; no canvas change — see the capture README). */
export const CARROUSEL_IMAGE_GENERATOR_NODE_NAME = "Image Generator #21";

/** The final `list` node (mode `replace`) the finished 7 slide images land in. */
export const CARROUSEL_GENERATED_SLIDES_NODE_NAME = "Generated slides";

/** The Image Generator's real, captured settings (issue #86) — recorded for the node-inventory test;
 *  the fake's port surface does not itself model generation settings (the port has no such primitive). */
export const CARROUSEL_IMAGE_GENERATOR_SETTINGS = {
  mode: "imagen-nano-banana-2-flash",
  aspectRatio: "3:4",
  resolution: "1k",
} as const;

// ---------------------------------------------------------------------------
// Node inventory + wiring — a small, typed description of the captured shape, so a companion test can
// assert it matches the live capture JSON byte-for-byte (issue #89 AC1).
// ---------------------------------------------------------------------------

/** One node in the captured inventory: its real name and its real Magnific element `type`. */
export interface CarrouselNodeDescriptor {
  readonly name: string;
  readonly type: string;
}

/** The 7 real, captured nodes (name + type), in the order `00-spaces_show.fullboard.json` lists them. */
export const CARROUSEL_NODE_INVENTORY: readonly CarrouselNodeDescriptor[] = [
  { name: PRODUCER_PROTOCOL_NODE_NAME, type: "text" },
  { name: CARROUSEL_ASSISTANT_NODE_NAME, type: "prompt-generator" },
  { name: CARROUSEL_GENERATED_SLIDES_NODE_NAME, type: "list" },
  { name: CARROUSEL_IMAGE_GENERATOR_NODE_NAME, type: "image-generator" },
  { name: CARROUSEL_JSON_MASTER_NODE_NAME, type: "text" },
  { name: CARROUSEL_LIST_NODE_NAME, type: "list" },
  { name: CARROUSEL_BRAND_LOGO_NODE_NAME, type: "creation" },
];

/** One connection in the captured wiring: source/target node NAMEs (resolved from the capture's raw
 *  element ids) plus the real source/target ports and data type. */
export interface CarrouselConnectionDescriptor {
  readonly source: string;
  readonly target: string;
  readonly sourcePort: string;
  readonly targetPort: string;
  readonly dataType: string;
}

/** The 5 real, captured connections, in the order `00-spaces_show.fullboard.json` lists them. */
export const CARROUSEL_CONNECTIONS: readonly CarrouselConnectionDescriptor[] = [
  {
    source: CARROUSEL_IMAGE_GENERATOR_NODE_NAME,
    target: CARROUSEL_GENERATED_SLIDES_NODE_NAME,
    sourcePort: "output",
    targetPort: "images",
    dataType: "image",
  },
  {
    source: CARROUSEL_BRAND_LOGO_NODE_NAME,
    target: CARROUSEL_IMAGE_GENERATOR_NODE_NAME,
    sourcePort: "output",
    targetPort: "reference",
    dataType: "image",
  },
  {
    source: CARROUSEL_ASSISTANT_NODE_NAME,
    target: CARROUSEL_LIST_NODE_NAME,
    sourcePort: "generated_prompt",
    targetPort: "texts",
    dataType: "text",
  },
  {
    source: CARROUSEL_JSON_MASTER_NODE_NAME,
    target: CARROUSEL_ASSISTANT_NODE_NAME,
    sourcePort: "text",
    targetPort: "prompt",
    dataType: "text",
  },
  {
    source: CARROUSEL_LIST_NODE_NAME,
    target: CARROUSEL_IMAGE_GENERATOR_NODE_NAME,
    sourcePort: "output-texts",
    targetPort: "prompt",
    dataType: "text",
  },
];

// ---------------------------------------------------------------------------
// The finished Asset — the real 7 slide creation identifiers from the capture's "Generated slides"
// list (issue #86), so the fake's produced Asset traces back to a genuinely captured shape. The media
// URLs are SYNTHETIC (never a real, expiring signed URL — the capture README's own rule: "fetch fresh,
// never persist").
// ---------------------------------------------------------------------------

/** The real, captured "Generated slides" list's 7 creation identifiers, in capture order. */
export const CARROUSEL_SLIDE_CREATION_IDS: readonly string[] = [
  "BmDJJKWoQR",
  "cDGxxQY0eP",
  "xg5MMYCjfW",
  "rlbVV0Gxtc",
  "8veyy4ZIrU",
  "fFt33zbCDY",
  "bruYYB65Y2",
];

/** The single finished Asset creation a successful carousel render produces — the FIRST of the 7 real
 *  slide identifiers (the driver's `AssetResult` carries one representative id/url per finished leg;
 *  see `space-driver/driver.ts`'s `finishLeg`). */
export const CAROUSEL_ASSET_CREATION_ID = CARROUSEL_SLIDE_CREATION_IDS[0]!;

/** The finished Asset's media URL (for assertions) — synthetic, mirroring the real id above. */
export const CAROUSEL_ASSET_URL = "https://magnific.example/carousel/asset/1.png";

/** Every produced slide creation, resolved to a synthetic media URL (for `fetchCreations`). */
function slideCreations(): readonly Creation[] {
  return CARROUSEL_SLIDE_CREATION_IDS.map((identifier, i) => ({
    identifier,
    url: `https://magnific.example/carousel/asset/${i + 1}.png`,
  }));
}

/** A marker prefix recorded on a bound reference node, so `verifyPinned` can confirm WHAT is bound —
 *  reused generically for a Brand Asset's local path, mirroring `fake-space.ts`'s `PINNED:` convention. */
const BOUND_MARKER = "BOUND:";

export interface FakeCarouselSpaceOptions {
  /** When true, the media-bind edit does NOT record the bind, so `verifyPinned` fails (models a
   *  no-op/failed bind). */
  readonly bindNoOp?: boolean;
  /** When true, the Spec-inject edit does NOT change the `JSON Master` text (models a no-op inject). */
  readonly injectNoOp?: boolean;
}

/**
 * A FAKE Magnific Space for the News Carousel Recipe's REAL single-lane shape. Stateful only in
 * memory: tracks node values (so an inject/bind is visible on readback) and records every edit goal +
 * run started (so a test can assert exactly what the driver did — including asserting NOTHING was
 * called, for the missing-required-asset STOP case).
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

  constructor(options: FakeCarouselSpaceOptions = {}) {
    this.options = options;
    this.nodes = [
      {
        id: "node-producer-protocol",
        name: PRODUCER_PROTOCOL_NODE_NAME,
        value: serializeProtocol(canonicalCarouselProtocol()),
      },
      { id: "node-json-master", name: CARROUSEL_JSON_MASTER_NODE_NAME, value: "placeholder" },
      { id: "node-assistant", name: CARROUSEL_ASSISTANT_NODE_NAME },
      { id: "node-list", name: CARROUSEL_LIST_NODE_NAME },
      { id: "node-image-generator", name: CARROUSEL_IMAGE_GENERATOR_NODE_NAME },
      { id: "node-generated-slides", name: CARROUSEL_GENERATED_SLIDES_NODE_NAME },
      { id: "node-brand-logo", name: CARROUSEL_BRAND_LOGO_NODE_NAME, value: "placeholder" },
    ];
  }

  async readState(): Promise<SpaceStateLike> {
    return { nodes: this.nodes.map((n) => ({ ...n })) };
  }

  async edit(goal: string): Promise<{ readonly editId: string }> {
    this.editGoals.push(goal);

    if (goal.includes(CARROUSEL_JSON_MASTER_NODE_NAME) && !this.options.injectNoOp) {
      const marker = goal.indexOf("{");
      const text = marker !== -1 ? goal.slice(marker) : "INJECTED";
      this.nodes = this.nodes.map((n) =>
        n.name === CARROUSEL_JSON_MASTER_NODE_NAME ? { ...n, value: text } : n,
      );
    } else if (!goal.includes(CARROUSEL_JSON_MASTER_NODE_NAME) && !this.options.bindNoOp) {
      // A media-bind goal (`driver.ts`'s `bindMediaGoal`) embeds the local path in double quotes,
      // following "Upload the ... file at". Extract it so `verifyPinned` can confirm the SAME value.
      const match = goal.match(/Upload the \S+ file at "([^"]+)"/);
      if (match) {
        this.bound.add(match[1]!);
        const boundValue = `${BOUND_MARKER}${match[1]!}`;
        this.nodes = this.nodes.map((n) =>
          n.name === CARROUSEL_BRAND_LOGO_NODE_NAME ? { ...n, value: boundValue } : n,
        );
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
    // A downstream run at "JSON Master" fires the whole captured chain: JSON Master -> Assistant ->
    // List -> Image Generator #21 -> Generated slides, producing the 7 real slide creations.
    return {
      phase: "succeeded",
      firedNodeNames: [
        CARROUSEL_JSON_MASTER_NODE_NAME,
        CARROUSEL_ASSISTANT_NODE_NAME,
        CARROUSEL_LIST_NODE_NAME,
        CARROUSEL_IMAGE_GENERATOR_NODE_NAME,
        CARROUSEL_GENERATED_SLIDES_NODE_NAME,
      ],
      creationIds: [...CARROUSEL_SLIDE_CREATION_IDS],
    };
  }

  async fetchCreations(ids: readonly string[]): Promise<readonly Creation[]> {
    const all = slideCreations();
    return ids.map((id) => all.find((c) => c.identifier === id)).filter((c): c is Creation => c !== undefined);
  }

  /** Confirm a value (a Brand Asset's local path) is bound — the SAME generic port primitive
   *  `pinPick`/`bindMediaAsset` both confirm through. */
  async verifyPinned(value: string): Promise<boolean> {
    return this.bound.has(value);
  }
}
