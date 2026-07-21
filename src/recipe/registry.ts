/**
 * Recipe registry — the brand-agnostic, in-repo definition every downstream slice keys off
 * (CONTEXT.md "Recipe"; ADR-0009, ADR-0010, ADR-0016).
 *
 * A **Recipe** is a production plan: how one Idea becomes one Asset — its ordered **gate list**
 * (zero..many human picks), its **Production-Spec shape** (schema + validator + banned-word scan),
 * its **copy shape**, **which Space it drives** (+ the on-canvas node NAMES it touches), and its
 * canvas's **two typed inputs** — a named **media-slot map** and a **prompt node** (ADR-0016,
 * issue #81). Recipes are defined HERE, in the repo — never per-Brand — so every Brand can use any
 * WIRED Recipe (ADR-0013). "Wired" means "present in this registry"; `isWiredRecipe`/`getRecipe` are
 * the ONLY gate for whether a Recipe is ever offered to the Operator (issue #54 AC4) — an unwired
 * Recipe (a slug not in `REGISTRY`, e.g. a stray value in a Format's `default_recipes`) is never
 * surfaced at Review.
 *
 * --- Seeded entry #1: "Character Explainer with Cast", reproducing today's wired path UNCHANGED ---
 *
 * "Character Explainer with Cast" wraps today's existing Production-Spec contract
 * (`production-spec/contract.ts` + `validate.ts` + `brand-safety.ts`), Execution Protocol
 * (`canonicalProtocol()`), and cast/clip gates BYTE-FOR-BYTE — this slice makes ZERO behaviour change
 * to the wired production path (issue #81 AC5). The registry entry below does not duplicate any of
 * that logic: it REFERENCES the same exported constants/functions those modules already use
 * (`validateProductionSpec`, `scanForBannedWords`, `JSON_MASTER_NODE_NAME`, `CHARACTER_NODE_NAME`,
 * `canonicalProtocol()`), so there is no risk of the registry's description drifting from what the
 * driver/validator actually do. `driver.ts`, `contract.ts`, `validate.ts` (beyond the additive
 * `ValidationError.code` widening, issue #81), `brand-safety.ts`, `protocol.ts`, and `parse.ts` are NOT
 * behaviourally modified for this Recipe — the generic run-until-gate driver that would actually
 * SOURCE its behavior from a Recipe (rather than merely being describable by one) is issue #57.
 *
 * The Space `id` this Recipe targets ("Organic Character Explainer") is verified in
 * `docs/producer-spikes-results.md` and the live capture at
 * `src/space-driver/fixtures/live-captures/README.md`. THIS `space` field is now the ONLY source of
 * truth for Space targeting (ADR-0013/ADR-0016) — the thin, recipe-generic Producer resolves it from
 * here; the old per-Brand `brand-profile.yaml` pointer this Recipe used to also be configured at is
 * RETIRED (issue #88 — `producer.md` no longer reads any Brand Profile field for a Space id).
 *
 * --- Seeded entry #2: "News Carousel" — a SECOND, zero-gate Recipe (issue #81, map ticket #77) ---
 *
 * "News Carousel" drives the rebuilt, single-lane "Carrousel" Space (one run-point: inject + run
 * "JSON Master" downstream, no gate — `canonicalCarouselProtocol()`) with the #77-decided thin
 * Spec shape (`news-carousel-contract.ts`/`news-carousel-validate.ts`): exactly 7 slides, fixed role
 * order. Its own copy shape and its own banned-word scan (`news-carousel-brand-safety.ts`, covering
 * EVERY slide text field including `image_prompt` — closing the gap the issue-60 salvage build report
 * flagged) prove the registry's per-Recipe shapes generalize to a genuinely different Recipe. This
 * slice registers the Recipe DESCRIPTIVELY only — actually driving/binding it (the Brand Asset store,
 * the producer Skill, the generic thin producer) is issues #82/#87/#88.
 *
 * --- Node-name alignment to the live canvas (issue #86/#89) ---
 *
 * The live "Carrousel" Space capture (issue #86) showed the real canvas uses `"JSON Master"` as its
 * inject/run-point node (NOT the earlier placeholder `"Slides Prompts"`) and `"Brand_Logo"` as its
 * logo reference node (NOT `"Brand Logo"`). The Operator chose to align the BUILD to the canvas (issue
 * #89) — `NEWS_CAROUSEL_SLIDES_NODE_NAME` and the `mediaSlots` key below now hold the REAL, captured
 * names. This is a DIFFERENT Space than the wired *Character Explainer with Cast* Recipe's own "JSON
 * Master" node — the two share only a string, never a canvas.
 *
 * --- Phase Contracts (ADR-0017, issue #85) ---
 *
 * Both Recipes now also declare `phases`: their six ordered Phase Contracts (`author`, `bind-media`,
 * `gate`, `render`, `copy`, `save` — `recipe/phase-contract.ts`'s `PHASE_ORDER`), each a checklist of
 * what a valid output for that phase looks like. Mechanical items REFERENCE this Recipe's own
 * `specShape`/`copyShape` functions (or, for News Carousel's author phase, the graduated
 * `production-spec/news-carousel-author-checklist.ts`) — never re-implementing them; the rest are
 * agent-judged prose. `declaresAllPhasesInOrder` is checked at import time for both Recipes below,
 * mirroring the CAST_RUN_POINT/CLIP_RUN_POINT defensive pattern. This is the checkable-contract HALF
 * of ADR-0017 — the Producer actually self-auditing against these at production time is later work
 * (issues #87/#88).
 */

import {
  validate as validateProductionSpec,
  type ValidationResult,
} from "../production-spec/validate.ts";
import {
  REQUIRED_CHARACTER_CONCEPTS,
  REQUIRED_CLIPS,
  REQUIRED_THUMBNAILS,
} from "../production-spec/contract.ts";
import { scanForBannedWords, type BrandSafetyResult } from "../production-spec/brand-safety.ts";
import { validateNewsCarouselSpec } from "../production-spec/news-carousel-validate.ts";
import { scanNewsCarouselForBannedWords } from "../production-spec/news-carousel-brand-safety.ts";
import {
  JSON_MASTER_NODE_NAME,
  CHARACTER_NODE_NAME,
  WATERMARK_NODE_NAME,
} from "../space-driver/driver.ts";
import { canonicalProtocol, canonicalCarouselProtocol } from "../execution-protocol/protocol.ts";
import { declaresAllPhasesInOrder, type PhaseContract } from "./phase-contract.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which Magnific Space a Recipe drives, and the on-canvas node NAMES it touches (ADR-0010). */
export interface RecipeSpaceTarget {
  /** The Magnific Space's id. Brand-agnostic: every Brand renders through the same Space. */
  readonly id: string;
  /** Human-readable Space name, for messages/logs. */
  readonly name: string;
  /** The node NAMES this Recipe's media steps touch (all by-name, never hard-coded node IDs). */
  readonly nodes: RecipeSpaceNodes;
}

/**
 * The on-canvas node names a Recipe's Space steps reference, by name (never a raw node id).
 * `pinnedReference`/`castRunPoint` are OPTIONAL (issue #81): they only apply to a Recipe that has at
 * least one pick-gate to pin/render a paused Cast for. The seeded, one-gate *Character Explainer with
 * Cast* Recipe sets both; the zero-gate *News Carousel* Recipe sets neither — it has nothing to pin and
 * only one (simultaneously first-and-final) run-point. `specInput` and `clipRunPoint` stay REQUIRED:
 * every Recipe injects its Spec somewhere and has exactly one gateless run-point that renders the
 * final Asset (for a zero-gate Recipe, that IS its only run-point).
 *
 * `watermarkNode` is OPTIONAL too (QA-1, issue #88): a Recipe whose canvas carries a watermark
 * parameter node names it here; the thin Producer then sets the Brand's `watermark_handle` onto that
 * node before the final render — a GENERIC, Recipe-declared pre-render step
 * (`src/space-driver/driver.ts`'s `setWatermarkHandle`), never hard-coded per Recipe. The seeded
 * *Character Explainer with Cast* Recipe sets it (`WATERMARK_NODE_NAME`, verified in the live capture);
 * the *News Carousel* Recipe has no such node and leaves it absent — the step is simply skipped for
 * any Recipe that doesn't declare one.
 */
export interface RecipeSpaceNodes {
  /** The Spec-input text node the Producer injects the Production Spec into (Fallback Protocol). */
  readonly specInput: string;
  /** The pinned-reference creation node the Operator's gate pick is re-pinned to. Present only for a
   *  Recipe with at least one pick-gate. */
  readonly pinnedReference?: string;
  /** The Execution Protocol run-point that renders this Recipe's FIRST gate's candidates. Present only
   *  for a Recipe whose first leg targets a declared gate. */
  readonly castRunPoint?: string;
  /** The Execution Protocol run-point that renders the final Asset (no gate follows it). For a
   *  zero-gate Recipe this is its ONLY run-point (first-and-final leg in one). */
  readonly clipRunPoint: string;
  /** The watermark-instructions text node the Brand's `watermark_handle` is set onto before the final
   *  render (`setWatermarkHandle`). Present only for a Recipe whose canvas has one. */
  readonly watermarkNode?: string;
}

/** A Recipe's declared Production-Spec shape: a human description plus the validator + banned-word
 *  scan that enforce it. */
export interface RecipeSpecShape {
  readonly description: string;
  /** Validate a candidate Spec against this Recipe's contract. Never throws on shape (mirrors `validate.ts`). */
  readonly validate: (spec: unknown) => ValidationResult;
  /**
   * Scan a candidate Spec for the Brand's banned words, covering EVERY text field THIS Recipe's shape
   * defines (issue #81 — closes the gap the issue-60 salvage build report flagged, where a carousel
   * Spec's `image_prompt` was never scanned because the shared scanner only knew the wired Recipe's own
   * field names). Reuses `brand-safety.ts`'s shared `scanTextFields` core so the word-boundary/
   * case-insensitivity rule can never drift between Recipes. Never throws on shape; when the Brand
   * defines no banned words the scan always passes.
   */
  readonly scanBannedWords: (spec: unknown, bannedWords: readonly string[]) => BrandSafetyResult;
}

/** A Recipe's declared copy shape — the constraints its copy step's output must satisfy. */
export interface RecipeCopyShape {
  readonly description: string;
  readonly maxChars: number;
  readonly minEmojis: number;
  readonly maxEmojis: number;
}

// ---------------------------------------------------------------------------
// Canvas typed inputs — media slots + prompt node (ADR-0016, issue #81)
// ---------------------------------------------------------------------------

/** The kind of media a canvas media slot holds. */
export type MediaKind = "image" | "video" | "audio";

/** Fields every media slot carries, regardless of kind. */
interface BaseMediaSlot {
  readonly media: MediaKind;
  /** A missing REQUIRED slot's asset STOPS the run (ADR-0016) — never bind a half-complete Asset. An
   *  optional slot may be skipped. */
  readonly required: boolean;
}

/**
 * A media slot filled from the Brand's **Brand Asset** store (`data/brands/<slug>/assets/`) — reused
 * every run (e.g. the News Carousel Recipe's "Brand_Logo"). `brandAssetKey` is the store key the
 * `BrandAssetStore` (issue #82) reads — a SEPARATE thing from the slot's own map-key/name (below).
 */
export interface BrandAssetMediaSlot extends BaseMediaSlot {
  readonly kind: "brand-asset";
  readonly brandAssetKey: string;
}

/**
 * A media slot filled from a human gate pick — per Idea, resolved once the Operator's pick is in
 * (e.g. the Character Explainer with Cast Recipe's "Selected Character", filled by its `"cast"` gate).
 * `gate` SHALL be one of this Recipe's own `gates`.
 */
export interface IdeaPickMediaSlot extends BaseMediaSlot {
  readonly kind: "idea-pick";
  readonly gate: string;
}

/** One of a Recipe's canvas media slots — either kind (ADR-0016). */
export type MediaSlot = BrandAssetMediaSlot | IdeaPickMediaSlot;

/**
 * A Recipe's named media-slot map: slot name -> its definition. The slot NAME is the conceptual,
 * product-facing name — not NECESSARILY identical to the underlying Space's own on-canvas
 * reference-node name. An **idea-pick** slot's physical target is tracked SEPARATELY, on
 * `RecipeSpaceNodes.pinnedReference` (e.g. the character Recipe's slot is named "Selected Character"
 * but pins into the canvas node "Character #2"). A **brand-asset** slot has no such separate field —
 * its map key IS its physical canvas target (mirroring `promptNode`'s convention below); the News
 * Carousel Recipe's `"Brand_Logo"` slot therefore names the REAL, captured canvas node directly
 * (issue #86/#89) — resolving a slot to whatever it binds is the binding step's job (issue #88).
 */
export type MediaSlotMap = Readonly<Record<string, MediaSlot>>;

/**
 * A Recipe's canvas's two typed inputs (ADR-0016): its named **media-slot map** and its **prompt
 * node** — the text node the Producer authors/injects its media prompt into. Authoring the prompt is
 * the Producer's core craft; binding media into the slots is the second job.
 */
export interface RecipeCanvasInputs {
  readonly mediaSlots: MediaSlotMap;
  /** The text node name the Producer authors/injects its prompt into (e.g. `"JSON Master"`, `"Slides
   *  Prompts"`). */
  readonly promptNode: string;
}

/**
 * A production plan: how one Idea becomes one Asset (CONTEXT.md "Recipe"; ADR-0009/0010/0016). Recipes
 * are brand-agnostic and shared — every Brand can use any WIRED one (`isWiredRecipe`).
 */
export interface Recipe {
  /** Stable identifier, e.g. `"character-explainer-with-cast"`. Matches a Format's `default_recipes` entries. */
  readonly slug: string;
  /** Human-readable name, e.g. `"Character Explainer with Cast"`. */
  readonly name: string;
  readonly description: string;
  /**
   * The ordered human pick-gate names this Recipe pauses at (zero..many — ADR-0010). The wired
   * *Character Explainer with Cast* Recipe declares exactly one: `"cast"` (CONTEXT.md "Cast"/
   * "Character" — that Recipe's own vocabulary, not a universal step). The *News Carousel* Recipe
   * declares NONE — an empty array renders unattended end-to-end.
   */
  readonly gates: readonly string[];
  readonly space: RecipeSpaceTarget;
  readonly specShape: RecipeSpecShape;
  readonly copyShape: RecipeCopyShape;
  /**
   * The project Skill slug (`.claude/skills/<slug>/SKILL.md`) the thin Producer loads, via the Skill
   * tool, to run this Recipe's shared out-of-canvas copy step (ADR-0012) — mirroring how a Recipe's
   * media-authoring step names its own Skill, but resolved here in the registry rather than hard-coded
   * in `producer.md`'s own prose (issue #111). Both seeded Recipes below point at the SAME Skill,
   * `"write-social-copy"` — ADR-0012 already made the copy step ONE shared step, parameterized by
   * `copyShape`; a future Recipe (or Recipe-specific copywriting need) MAY point this at a different
   * Skill slug without touching any other Recipe's config or this agent's own prose.
   */
  readonly copySkill: string;
  /** This Recipe's canvas's two typed inputs — media slots + prompt node (ADR-0016, issue #81). */
  readonly canvasInputs: RecipeCanvasInputs;
  /**
   * This Recipe's six ordered Phase Contracts — author the prompt -> bind media -> gate -> render ->
   * copy -> save (ADR-0017, issue #85) — each declaring the checklist its output must satisfy.
   * `declaresAllPhasesInOrder` (`phase-contract.ts`) is the shape guard every Recipe here is checked
   * against at import time (see the defensive checks below).
   */
  readonly phases: readonly PhaseContract[];
}

// ---------------------------------------------------------------------------
// The seeded Recipe (issue #54)
// ---------------------------------------------------------------------------

/**
 * The live Space this Recipe drives — "Organic Character Explainer". Verified in
 * `docs/producer-spikes-results.md` (formerly ALSO configured per-Brand at
 * `data/brands/mundotip/brand-profile.yaml`'s now-retired `production.space_id`, issue #88 — this
 * field is the sole source of truth today). Kept as a local constant (not imported from
 * `space-driver/live/replay/transport.ts`, which is a test-only record/replay harness) — this is a
 * stable production fact, not a fixture.
 */
const CHARACTER_EXPLAINER_SPACE_ID = "a1f05d67-1b98-4d10-9251-6603bea3b578";

/**
 * The seeded Recipe's OWN copy-shape params (ADR-0012, issue #58). Before this slice these were the
 * global `MAX_POST_COPY_CHARS`/`MIN_POST_COPY_EMOJIS`/`MAX_POST_COPY_EMOJIS` constants on the
 * Production-Spec contract (`post_copy` was part of the Spec then). Copy now leaves the Spec entirely
 * (`src/copy/`) and its shape moves HERE, onto the Recipe that owns it — a different Recipe declares
 * its own bounds; these are no longer shared globals. The VALUES are unchanged (180 chars, 1-3 emojis)
 * so the wired production path's copy behavior does not change, only where the numbers live.
 */
const CHARACTER_EXPLAINER_COPY_MAX_CHARS = 180;
const CHARACTER_EXPLAINER_COPY_MIN_EMOJIS = 1;
const CHARACTER_EXPLAINER_COPY_MAX_EMOJIS = 3;

/**
 * The Execution Protocol run-point names for the seeded Recipe, read from the SAME
 * `canonicalProtocol()` this Recipe's Space actually runs (`execution-protocol/protocol.ts`) — never
 * re-typed as independent string literals, so the registry can't drift from the real protocol.
 */
const PROTOCOL = canonicalProtocol();
const CAST_RUN_POINT = PROTOCOL.run_points.find((rp) => rp.gate === "cast");
const CLIP_RUN_POINT = PROTOCOL.run_points.find((rp) => rp.gate === null);
if (CAST_RUN_POINT === undefined || CLIP_RUN_POINT === undefined) {
  // Defensive: canonicalProtocol() is a static, committed, tested artifact (protocol.test.ts asserts
  // its shape) — this can only fire if that artifact itself regresses, in which case failing loudly
  // at import time is far better than silently registering a Recipe with an undefined run-point name.
  throw new Error(
    "recipe/registry: canonicalProtocol() no longer has both a cast-gated and a gateless run-point " +
      "— the seeded Character Explainer with Cast Recipe cannot describe its Space nodes.",
  );
}

/**
 * The seeded Recipe's six ordered Phase Contracts (ADR-0017, issue #85). The "author" phase's
 * mechanical items REFERENCE the SAME `specShape.validate`/`specShape.scanBannedWords` this Recipe
 * already declares above (`recipe/phase-contract.ts`'s `auditAuthorPhase` is the generic runner);
 * "bind-media" references `auditBindMediaPhase`; "copy" references `auditCopyPhase`. "gate"/"render"/
 * "save" have no generic auditor yet (driving/saving a second Recipe is issues #57/#87/#88) — their
 * checklists are prose today, a known limit (see this issue's Build Report).
 */
const CHARACTER_EXPLAINER_PHASES: readonly PhaseContract[] = [
  {
    phase: "author",
    description:
      "Author the Production Spec: 3 character_concepts, 3 clips (image_prompt + video_prompt each, " +
      "ending in the 9:16 aspect line), 3 top-level thumbnails.",
    checklist: [
      {
        kind: "mechanical",
        description:
          `Exactly ${REQUIRED_CHARACTER_CONCEPTS} character_concepts, ${REQUIRED_CLIPS} clips, and ` +
          `${REQUIRED_THUMBNAILS} top-level thumbnails; each clip's image_prompt ends with the 9:16 ` +
          "aspect-ratio line and carries a non-empty video_prompt.",
        reference: "production-spec/validate.ts: validate (this Recipe's specShape.validate)",
      },
      {
        kind: "mechanical",
        description: "No banned word in any field — reject-only, never a silent swap.",
        reference:
          "production-spec/brand-safety.ts: scanForBannedWords (this Recipe's specShape.scanBannedWords)",
      },
      {
        kind: "agent-judged",
        description:
          "Each character concept and clip reads as a coherent, on-brief Pixar-3D explainer beat for " +
          "this Idea (not just contract-shaped, but ON-BRIEF).",
      },
    ],
  },
  {
    phase: "bind-media",
    description:
      "Bind the canvas's media slots before render: the 'Selected Character' idea-pick slot must carry " +
      "the Operator's picked Character once the cast gate resolves.",
    checklist: [
      {
        kind: "mechanical",
        description:
          "Every REQUIRED media slot (here: 'Selected Character') has a bound asset before render; a " +
          "missing required slot's asset STOPS the run (ADR-0016) — never bind a half-complete Asset.",
        reference: "recipe/phase-contract.ts: auditBindMediaPhase",
      },
    ],
  },
  {
    phase: "gate",
    description:
      "Pause at the 'cast' gate: render the Cast from character_concepts and wait for the Operator's pick.",
    checklist: [
      {
        kind: "agent-judged",
        description:
          `The rendered Cast has exactly ${REQUIRED_CHARACTER_CONCEPTS} candidates, one per ` +
          "character_concepts entry, and the run does not advance past this gate until the Operator's " +
          'pick is recorded (the ledger\'s pending_gate: "cast" clears only once resumed).',
      },
    ],
  },
  {
    phase: "render",
    description:
      "Drive the Space's clip run-point to render the final clips + thumbnails against the picked " +
      "Character.",
    checklist: [
      {
        kind: "agent-judged",
        description:
          "The driver follows this Recipe's Execution Protocol run-point order exactly (cast, then " +
          "clip) — never skipping or reordering a run-point (execution-protocol/protocol.ts: " +
          "canonicalProtocol).",
      },
      {
        kind: "agent-judged",
        description:
          "Before this Recipe's clip run-point fires, the Brand's watermark_handle is set onto " +
          'this Recipe\'s declared "watermarkNode" (space.nodes.watermarkNode) via ' +
          "setWatermarkHandle — a surgical @handle swap, never touching the rest of the node's " +
          "text (QA-1, issue #88; the real captured Producer Protocol's replace_text step).",
      },
    ],
  },
  {
    phase: "copy",
    description:
      "Compose the Copy out of the Space, separately: a caption of at most 180 chars with 1-3 emojis, " +
      "plus hashtags.",
    checklist: [
      {
        kind: "mechanical",
        description:
          "Caption length/emoji bounds, the required CTA, the required hashtags, and no banned word " +
          "in the caption or any hashtag (reject-only).",
        reference: "recipe/phase-contract.ts: auditCopyPhase (copy/validate.ts's validateCopy, this Recipe's copyShape)",
      },
    ],
  },
  {
    phase: "save",
    description: "Write the produced Asset back to the Brand's ledger.",
    checklist: [
      {
        kind: "agent-judged",
        description:
          'The Asset\'s ledger record carries recipe, status: "produced", spec_path, ' +
          "asset_paths (the downloaded media's durable LOCAL file paths — issue #102 finding #3), " +
          "produced_at, and the composed copy (ledger-as-source-of-truth, always-rule 7).",
      },
    ],
  },
];

/** The seeded Recipe (issue #54): wraps today's wired path unchanged. */
const CHARACTER_EXPLAINER_WITH_CAST: Recipe = {
  slug: "character-explainer-with-cast",
  name: "Character Explainer with Cast",
  description:
    "A Pixar-3D anthropomorphic-character Reel: 3 character concepts rendered to a Cast the " +
    "Operator picks a Character from, then 3 narrative clips + 3 thumbnails rendered against that " +
    "Character (ADR-0002/0003).",
  gates: ["cast"],
  space: {
    id: CHARACTER_EXPLAINER_SPACE_ID,
    name: "Organic Character Explainer",
    nodes: {
      specInput: JSON_MASTER_NODE_NAME,
      pinnedReference: CHARACTER_NODE_NAME,
      castRunPoint: CAST_RUN_POINT.start,
      clipRunPoint: CLIP_RUN_POINT.start,
      watermarkNode: WATERMARK_NODE_NAME,
    },
  },
  specShape: {
    description:
      `Exactly ${REQUIRED_CHARACTER_CONCEPTS} character_concepts; exactly ${REQUIRED_CLIPS} clips ` +
      "(each a Pixar-3D image_prompt ending in the 9:16 aspect-ratio line + a video_prompt); " +
      `${REQUIRED_THUMBNAILS} top-level thumbnails. Media instructions only — no post_copy (ADR-0012).`,
    validate: validateProductionSpec,
    scanBannedWords: scanForBannedWords,
  },
  copyShape: {
    description:
      "Copy is composed OUT of the Space, separately, by the shared copy step (`src/copy/`) — a " +
      "caption of at most 180 chars with 1-3 emojis, plus hashtags (ADR-0012). These are this " +
      "Recipe's OWN params, not global constants.",
    maxChars: CHARACTER_EXPLAINER_COPY_MAX_CHARS,
    minEmojis: CHARACTER_EXPLAINER_COPY_MIN_EMOJIS,
    maxEmojis: CHARACTER_EXPLAINER_COPY_MAX_EMOJIS,
  },
  copySkill: "write-social-copy",
  canvasInputs: {
    mediaSlots: {
      "Selected Character": {
        kind: "idea-pick",
        media: "image",
        required: true,
        gate: "cast",
      },
    },
    // The Producer injects the whole Production Spec (media instructions) into this same node —
    // this Recipe's prompt node IS its Spec-input node (ADR-0016).
    promptNode: JSON_MASTER_NODE_NAME,
  },
  phases: CHARACTER_EXPLAINER_PHASES,
};

if (!declaresAllPhasesInOrder(CHARACTER_EXPLAINER_WITH_CAST.phases)) {
  // Defensive, mirroring the CAST_RUN_POINT/CLIP_RUN_POINT guard above: fail loudly at import time
  // rather than silently registering a Recipe with an incomplete/misordered Phase Contract list.
  throw new Error(
    "recipe/registry: CHARACTER_EXPLAINER_PHASES does not declare all six phases in PHASE_ORDER.",
  );
}

// ---------------------------------------------------------------------------
// The second seeded Recipe: "News Carousel" (issue #81, map ticket #77)
// ---------------------------------------------------------------------------

/**
 * The live Space this Recipe drives — the rebuilt, single-lane "Carrousel" Space. Same Space id as the
 * pre-rebuild "AI News" board (only its canvas shape changed, per-lane -> single-lane; the id is
 * stable). Kept as a local constant, brand-agnostic like the wired Recipe's Space.
 */
const NEWS_CAROUSEL_SPACE_ID = "a2402c48-b688-436b-8cb6-23a4aad7822e";

/**
 * The single node that is BOTH the Producer's injectable prompt node AND the Execution Protocol's
 * sole run-point start (ADR-0016) — the whole downstream chain (Assistant -> List -> Image Generator
 * -> Generated slides) fires off this one node. Verified against the live "Carrousel" Space capture
 * (issue #86, `src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`): the
 * real node is `"JSON Master"` — the earlier placeholder `"Slides Prompts"` named no real canvas node
 * at all. The Operator chose to align the build to the canvas (issue #89). This is a DIFFERENT node,
 * on a DIFFERENT Space, than the wired *Character Explainer with Cast* Recipe's own "JSON Master" —
 * the two share only a name.
 */
const NEWS_CAROUSEL_SLIDES_NODE_NAME = "JSON Master";

/**
 * The News Carousel Recipe's OWN copy-shape params (ADR-0012) — deliberately DIFFERENT from the wired
 * Recipe's 180/1-3 (a Reel caption): Instagram's hard caption cap is 2,200 characters, and a
 * news-carousel caption reads as a short editorial summary + hashtags rather than a punchy Reel hook,
 * so it is given far more room. An editorial/news tone favours few or no emoji (0-2).
 */
const NEWS_CAROUSEL_COPY_MAX_CHARS = 2200;
const NEWS_CAROUSEL_COPY_MIN_EMOJIS = 0;
const NEWS_CAROUSEL_COPY_MAX_EMOJIS = 2;

/**
 * The News Carousel Recipe's run-point name, read from the SAME `canonicalCarouselProtocol()` this
 * Recipe's Space actually runs (`execution-protocol/protocol.ts`) — never re-typed as an independent
 * string literal, so the registry can't drift from the real protocol.
 */
const CAROUSEL_PROTOCOL = canonicalCarouselProtocol();
const CAROUSEL_RUN_POINT = CAROUSEL_PROTOCOL.run_points.find((rp) => rp.gate === null);
if (CAROUSEL_RUN_POINT === undefined) {
  // Defensive: canonicalCarouselProtocol() is a static, committed, tested artifact (protocol.test.ts
  // asserts its shape) — this can only fire if that artifact itself regresses.
  throw new Error(
    "recipe/registry: canonicalCarouselProtocol() no longer has a gateless run-point — the seeded " +
      "News Carousel Recipe cannot describe its Space node.",
  );
}

/**
 * The News Carousel Recipe's six ordered Phase Contracts (ADR-0017, issue #85). Its "author" phase is
 * the SLICE's headline case: 6 of its 8 checklist items are mechanical, graduated from the #77
 * prototype (`production-spec/news-carousel-author-checklist.ts`'s `auditNewsCarouselAuthorPhase`) —
 * two of those (the 7-slides/role-order item and the text-length item) are literally the SAME
 * `validateNewsCarouselSpec` call this Recipe's own `specShape.validate` already runs; the banned-word
 * item is the SAME `scanNewsCarouselForBannedWords` call `specShape.scanBannedWords` already runs;
 * the remaining three (logo reference, pill text + never-all-caps, fixed baseline clauses, card style)
 * are the NEW checks the #77 prototype proved out, parameterized from the Format's Baseline Prompt
 * (ADR-0015) — never hardcoded. The ONE non-mechanical item ("grounded subject") is agent-judged,
 * flagged for review, never auto-failed (ADR-0017). "gate" is an empty checklist — this Recipe
 * declares zero gates, so nothing pauses here.
 */
const NEWS_CAROUSEL_PHASES: readonly PhaseContract[] = [
  {
    phase: "author",
    description:
      "Author the 7-slide Production Spec (one authored image_prompt per slide) from the Idea brief " +
      "and the Format's Baseline Prompt — graduated from the #77 prototype (map ticket #77).",
    checklist: [
      {
        kind: "mechanical",
        description:
          "Exactly 7 slides, in fixed role order hook -> then -> shift -> proof -> different -> next -> cta.",
        reference: "production-spec/news-carousel-validate.ts: validateNewsCarouselSpec",
      },
      {
        kind: "mechanical",
        description: "Each slide's on-card text is at most 140 chars.",
        reference: "production-spec/news-carousel-validate.ts: validateNewsCarouselSpec",
      },
      {
        kind: "mechanical",
        description:
          "Each image_prompt references the connected logo — the Format's Baseline Prompt reference " +
          "name OR its name-free generic reference phrase — and carries its negative guardrail " +
          "against ever rendering that reference name/filename as visible on-image text; the raw " +
          "reference name is never required on its own (parameterized — never a hardcoded literal; " +
          "issue #110).",
        reference: "production-spec/news-carousel-author-checklist.ts: auditNewsCarouselAuthorPhase",
      },
      {
        kind: "mechanical",
        description:
          "Each image_prompt contains the Baseline Prompt's pill text and its never-all-caps " +
          "instruction (parameterized — never a hardcoded literal).",
        reference: "production-spec/news-carousel-author-checklist.ts: auditNewsCarouselAuthorPhase",
      },
      {
        kind: "mechanical",
        description:
          "Each image_prompt keeps every other fixed Baseline Prompt clause (the logo guardrail, the " +
          "card clause, the card-text clause, the closing style line — parameterized).",
        reference: "production-spec/news-carousel-author-checklist.ts: auditNewsCarouselAuthorPhase",
      },
      {
        kind: "agent-judged",
        description:
          "Grounded subject — a real product/logo/action, or an intentional photographic scene; " +
          "never an invented UI shown as a real product's own screen.",
      },
      {
        kind: "mechanical",
        description:
          "card_style is one of the Baseline Prompt's confirmed styles; stat_callout is non-empty.",
        reference: "production-spec/news-carousel-author-checklist.ts: auditNewsCarouselAuthorPhase",
      },
      {
        kind: "mechanical",
        description: "No banned word in any field — reject-only, never a silent swap.",
        reference:
          "production-spec/news-carousel-brand-safety.ts: scanNewsCarouselForBannedWords " +
          "(this Recipe's specShape.scanBannedWords)",
      },
    ],
  },
  {
    phase: "bind-media",
    description:
      "Bind the canvas's media slots before render: the 'Brand_Logo' brand-asset slot must resolve to " +
      "the Brand's stored logo.",
    checklist: [
      {
        kind: "mechanical",
        description:
          "Every REQUIRED media slot (here: 'Brand_Logo') has a bound asset before render; a missing " +
          "required slot's asset STOPS the run (ADR-0016) — never bind a half-complete Asset.",
        reference: "recipe/phase-contract.ts: auditBindMediaPhase",
      },
    ],
  },
  {
    phase: "gate",
    description:
      "This Recipe declares zero gates — nothing pauses here; the run advances straight from bind-media to render.",
    checklist: [],
  },
  {
    phase: "render",
    description: "Drive the Space's sole 'JSON Master' run-point to render all 7 slides.",
    checklist: [
      {
        kind: "agent-judged",
        description:
          "The driver injects the authored 7-slide array and runs the sole run-point exactly once " +
          "(execution-protocol/protocol.ts: canonicalCarouselProtocol) — no per-slide run-point to skip " +
          "or reorder.",
      },
    ],
  },
  {
    phase: "copy",
    description:
      "Compose the Copy out of the Space, separately: a caption of at most 2200 chars with 0-2 " +
      "emojis, plus hashtags.",
    checklist: [
      {
        kind: "mechanical",
        description:
          "Caption length/emoji bounds, the required CTA, the required hashtags, and no banned word " +
          "in the caption or any hashtag (reject-only).",
        reference: "recipe/phase-contract.ts: auditCopyPhase (copy/validate.ts's validateCopy, this Recipe's copyShape)",
      },
    ],
  },
  {
    phase: "save",
    description: "Write the produced Asset back to the Brand's ledger.",
    checklist: [
      {
        kind: "agent-judged",
        description:
          'The Asset\'s ledger record carries recipe, status: "produced", spec_path, ' +
          "asset_paths (the downloaded media's durable LOCAL file paths — issue #102 finding #3), " +
          "produced_at, and the composed copy (ledger-as-source-of-truth, always-rule 7).",
      },
      {
        kind: "agent-judged",
        description:
          "Each downloaded file was matched to its slide by the slide's own unique stat_callout " +
          "read off the rendered card — never by the aggregated creation list's position; that " +
          "list's count/order is flaky mid-run (issue #102 finding #4).",
      },
    ],
  },
];

/**
 * The second seeded Recipe (issue #81): a ZERO-gate Instagram news carousel. Registered
 * DESCRIPTIVELY — its own Spec shape/validator/banned-word scan, its own copy shape, its own Space
 * target, and its own typed canvas inputs (a "Brand_Logo" brand-asset media slot) — proving the
 * registry's per-Recipe shapes generalize to a genuinely different Recipe (a different gate count,
 * spec shape, and media). Driving/binding it end-to-end against the FAKE, rebuilt to the real
 * single-lane canvas shape, is proven in issue #89 (`src/producer/two-recipes-end-to-end.test.ts`).
 */
const NEWS_CAROUSEL: Recipe = {
  slug: "news-carousel",
  name: "News Carousel",
  description:
    "A 7-slide Instagram news carousel in fixed role order (hook -> then -> shift -> proof -> " +
    "different -> next -> cta), rendered from one authored slide-prompt array against the Brand's " +
    "logo (map ticket #77).",
  gates: [],
  space: {
    id: NEWS_CAROUSEL_SPACE_ID,
    name: "Carrousel",
    nodes: {
      specInput: NEWS_CAROUSEL_SLIDES_NODE_NAME,
      clipRunPoint: CAROUSEL_RUN_POINT.start,
    },
  },
  specShape: {
    description:
      "Exactly 7 slides, in fixed role order hook -> then -> shift -> proof -> different -> next -> " +
      "cta; each slide carries slide_index, role, card_style, stat_callout, an on-card text of at " +
      "most 140 chars, and the full authored image_prompt (map ticket #77). Media instructions " +
      "only — no post_copy (ADR-0012).",
    validate: validateNewsCarouselSpec,
    scanBannedWords: scanNewsCarouselForBannedWords,
  },
  copyShape: {
    description:
      "Copy is composed OUT of the Space, separately, by the shared copy step (`src/copy/`) — a " +
      "caption of at most 2200 chars with 0-2 emojis, plus hashtags (ADR-0012). This Recipe's OWN " +
      "params, different from the wired Recipe's 180/1-3.",
    maxChars: NEWS_CAROUSEL_COPY_MAX_CHARS,
    minEmojis: NEWS_CAROUSEL_COPY_MIN_EMOJIS,
    maxEmojis: NEWS_CAROUSEL_COPY_MAX_EMOJIS,
  },
  copySkill: "write-social-copy",
  canvasInputs: {
    mediaSlots: {
      // The slot's map key IS the physical canvas node name (a brand-asset slot has no separate
      // `pinnedReference`-style field — see the `MediaSlotMap` doc above). "Brand_Logo" is the REAL,
      // captured node name (issue #86/#89) — the store KEY (`brandAssetKey: "brand-logo"`) is a
      // separate thing and is unchanged.
      "Brand_Logo": {
        kind: "brand-asset",
        media: "image",
        required: true,
        brandAssetKey: "brand-logo",
      },
    },
    // The Producer authors the whole 7-slide array into this same node — this Recipe's prompt node
    // IS its sole run-point's start node (ADR-0016; see NEWS_CAROUSEL_SLIDES_NODE_NAME above).
    promptNode: NEWS_CAROUSEL_SLIDES_NODE_NAME,
  },
  phases: NEWS_CAROUSEL_PHASES,
};

if (!declaresAllPhasesInOrder(NEWS_CAROUSEL.phases)) {
  // Defensive, mirroring the CHARACTER_EXPLAINER_PHASES guard above.
  throw new Error("recipe/registry: NEWS_CAROUSEL_PHASES does not declare all six phases in PHASE_ORDER.");
}

// ---------------------------------------------------------------------------
// Registry lookups
// ---------------------------------------------------------------------------

/** The full in-repo Recipe registry, keyed by slug. Seeded with two entries (issue #54, issue #81):
 *  the wired *Character Explainer with Cast* Recipe (one gate) and the *News Carousel* Recipe (zero
 *  gates), in registration order. */
const REGISTRY: ReadonlyMap<string, Recipe> = new Map([
  [CHARACTER_EXPLAINER_WITH_CAST.slug, CHARACTER_EXPLAINER_WITH_CAST],
  [NEWS_CAROUSEL.slug, NEWS_CAROUSEL],
]);

/** Look up a Recipe by slug, or `null` if it is not (yet) wired/registered. Never throws. */
export function getRecipe(slug: string): Recipe | null {
  return REGISTRY.get(slug) ?? null;
}

/** Every registered (wired) Recipe, in registration order. */
export function listRecipes(): readonly Recipe[] {
  return [...REGISTRY.values()];
}

/** Every registered (wired) Recipe's slug, in registration order. */
export function listWiredRecipeSlugs(): readonly string[] {
  return [...REGISTRY.keys()];
}

/**
 * Whether `slug` names a wired Recipe — the ONLY gate for "is this Recipe ever offered at Review"
 * (issue #54 AC4: an unwired Recipe is never offered). Pure, never throws.
 */
export function isWiredRecipe(slug: string): boolean {
  return REGISTRY.has(slug);
}
