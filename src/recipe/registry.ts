/**
 * Recipe registry — the brand-agnostic, in-repo definition every downstream slice keys off
 * (CONTEXT.md "Recipe"; ADR-0009, ADR-0010).
 *
 * A **Recipe** is a production plan: how one Idea becomes one Asset — its ordered **gate list**
 * (zero..many human picks), its **Production-Spec shape** (schema + validator), its **copy shape**,
 * and **which Space it drives** (+ the on-canvas node NAMES it touches). Recipes are defined HERE, in
 * the repo — never per-Brand — so every Brand can use any WIRED Recipe (ADR-0013). "Wired" means
 * "present in this registry"; `isWiredRecipe`/`getRecipe` are the ONLY gate for whether a Recipe is
 * ever offered to the Operator (issue #54 AC4) — an unwired Recipe (a slug not in `REGISTRY`, e.g. a
 * stray value in a Format's `default_recipes`) is never surfaced at Review.
 *
 * --- Seeded entry #1: "Character Explainer with Cast", reproducing today's wired path UNCHANGED ---
 *
 * "Character Explainer with Cast" wraps today's existing Production-Spec contract
 * (`production-spec/contract.ts` + `validate.ts`), Execution Protocol (`canonicalProtocol()`), and
 * cast/clip gates BYTE-FOR-BYTE — issue #54 made ZERO behaviour change to the wired production
 * path. The registry entry below does not duplicate any of that logic: it REFERENCES the same
 * exported constants/functions those modules already use (`validateProductionSpec`,
 * `JSON_MASTER_NODE_NAME`, `CHARACTER_NODE_NAME`, `canonicalProtocol()`), so there is no risk of the
 * registry's description drifting from what the driver/validator actually do.
 *
 * The Space `id` this Recipe targets ("Organic Character Explainer") is verified in
 * `docs/producer-spikes-results.md` and the live capture at
 * `src/space-driver/fixtures/live-captures/README.md`; it is also (today) configured per-Brand at
 * `brand-profile.yaml`'s `production.space_id` (read by the attended `producer` agent) — ADR-0013
 * intends the Recipe to become the single source of truth for Space targeting, but re-pointing
 * `producer.md` at the registry is deferred (untestable without the live Space).
 *
 * --- Seeded entry #2: "News Carousel" — the SECOND Recipe, proving the machinery generic (issue #60) ---
 *
 * A zero-gate Instagram news carousel driven by the "AI News" Space's "Viral News Pipeline" cluster: it
 * injects an ordered slide list, renders each present slide's image, and finishes straight through — no
 * pause. It exercises a gate COUNT different from the wired Recipe (zero vs one) and a MEDIA shape
 * different from the wired Recipe (several images vs one Reel) end-to-end against
 * `driveSelectedRunPoints` (`space-driver/driver.ts`). Its Space/node names are the Operator's own
 * canonical naming pass over the real, captured board (issue #60's pre-tidy dump,
 * `space-driver/fixtures/live-captures-ai-news/`).
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
import { validateNewsCarouselSpec } from "../production-spec/news-carousel-validate.ts";
import { TOTAL_SLIDE_PIPELINES, MIN_SLIDES, MAX_SLIDES } from "../production-spec/news-carousel-contract.ts";
import { JSON_MASTER_NODE_NAME, CHARACTER_NODE_NAME } from "../space-driver/driver.ts";
import { canonicalProtocol, canonicalCarouselProtocol } from "../execution-protocol/protocol.ts";

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
 * The on-canvas node names a Recipe's Space steps reference, by name (never a raw node id). Every field
 * beyond `specInput` is OPTIONAL (issue #60): the wired *Character Explainer with Cast* Recipe (one
 * gate, a single-run-point cast leg + a single-run-point render leg) sets `pinnedReference`/
 * `castRunPoint`/`clipRunPoint`; the zero-gate *News Carousel* Recipe (several parallel, Spec-selected
 * run-points, no pick to pin) sets `slideRunPoints` instead. A Recipe sets ONLY the fields its own
 * shape needs — never all of them.
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
  /** The Execution Protocol run-point that renders the final Asset (no gate follows it). Present only
   *  for a Recipe with a SINGLE final-render run-point. */
  readonly clipRunPoint?: string;
  /**
   * The ordered, FULL-BOARD run-point names for a Recipe whose media renders via SEVERAL parallel,
   * Spec-selected run-points (e.g. one image generator per carousel slide — `driveSelectedRunPoints`,
   * `space-driver/driver.ts`). The Recipe/driver drives only the SUBSET a given Idea's Spec needs
   * (`production-spec/news-carousel-contract.ts`'s `slideRunPointNames`), never this full fixed list.
   */
  readonly slideRunPoints?: readonly string[];
}

/** A Recipe's declared Production-Spec shape: a human description plus the validator that enforces it. */
export interface RecipeSpecShape {
  readonly description: string;
  /** Validate a candidate Spec against this Recipe's contract. Never throws on shape (mirrors `validate.ts`). */
  readonly validate: (spec: unknown) => ValidationResult;
}

/** A Recipe's declared copy shape — the constraints its copy step's output must satisfy. */
export interface RecipeCopyShape {
  readonly description: string;
  readonly maxChars: number;
  readonly minEmojis: number;
  readonly maxEmojis: number;
}

/**
 * A production plan: how one Idea becomes one Asset (CONTEXT.md "Recipe"; ADR-0009/0010). Recipes are
 * brand-agnostic and shared — every Brand can use any WIRED one (`isWiredRecipe`).
 */
export interface Recipe {
  /** Stable identifier, e.g. `"character-explainer-with-cast"`. Matches a Format's `default_recipes` entries. */
  readonly slug: string;
  /** Human-readable name, e.g. `"Character Explainer with Cast"`. */
  readonly name: string;
  readonly description: string;
  /**
   * The ordered human pick-gate names this Recipe pauses at (zero..many — ADR-0010). The seeded
   * Recipe declares exactly one: `"cast"` (CONTEXT.md "Cast"/"Character" — that Recipe's own
   * vocabulary, not a universal step). A Recipe with an empty array renders unattended end-to-end.
   */
  readonly gates: readonly string[];
  readonly space: RecipeSpaceTarget;
  readonly specShape: RecipeSpecShape;
  readonly copyShape: RecipeCopyShape;
}

// ---------------------------------------------------------------------------
// The seeded Recipe (issue #54)
// ---------------------------------------------------------------------------

/**
 * The live Space this Recipe drives — "Organic Character Explainer". Verified in
 * `docs/producer-spikes-results.md` and `data/brands/mundotip/brand-profile.yaml`'s
 * `production.space_id`. Kept as a local constant (not imported from `space-driver/live/replay/
 * transport.ts`, which is a test-only record/replay harness) — this is a stable production fact, not
 * a fixture.
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
    },
  },
  specShape: {
    description:
      `Exactly ${REQUIRED_CHARACTER_CONCEPTS} character_concepts; exactly ${REQUIRED_CLIPS} clips ` +
      "(each a Pixar-3D image_prompt ending in the 9:16 aspect-ratio line + a video_prompt); " +
      `${REQUIRED_THUMBNAILS} top-level thumbnails. Media instructions only — no post_copy (ADR-0012).`,
    validate: validateProductionSpec,
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
};

// ---------------------------------------------------------------------------
// The second seeded Recipe: "News Carousel" (issue #60)
// ---------------------------------------------------------------------------

/**
 * The live Space this Recipe drives — "AI News" (its "Viral News Pipeline" cluster). Confirmed by the
 * Operator (HITL pairing, issue #60) and captured pre-tidy at
 * `space-driver/fixtures/live-captures-ai-news/00-spaces_state.pre-tidy.txt`. Brand-agnostic, like the
 * wired Recipe's Space — kept as a local constant, not a fixture.
 */
const NEWS_CAROUSEL_SPACE_ID = "a2402c48-b688-436b-8cb6-23a4aad7822e";

/**
 * The News Carousel Recipe's OWN copy-shape params (ADR-0012), chosen for an Instagram NEWS carousel's
 * editorial voice — deliberately DIFFERENT from the wired Recipe's 180/1-3 (a Reel caption): Instagram's
 * hard caption cap is 2,200 characters, and a news-carousel caption reads as a short editorial summary +
 * hashtags rather than a punchy Reel hook, so it is given far more room (`maxChars: 2200`). An
 * editorial/news tone favours FEW or no emoji (`minEmojis: 0`) but still allows up to 2 — enough for a
 * light editorial flourish without reading like marketing copy (`maxEmojis: 2`). These are proven, in
 * `copy/validate.test.ts`/`copy/draft.test.ts` (issue #58), to be arbitrary caller-supplied bounds, not
 * hard-coded constants — this Recipe simply supplies its OWN different values.
 */
const NEWS_CAROUSEL_COPY_MAX_CHARS = 2200;
const NEWS_CAROUSEL_COPY_MIN_EMOJIS = 0;
const NEWS_CAROUSEL_COPY_MAX_EMOJIS = 2;

/**
 * The News Carousel Recipe's run-point names, read from the SAME `canonicalCarouselProtocol()` this
 * Recipe's Space actually runs (`execution-protocol/protocol.ts`) — never re-typed as independent string
 * literals. This is the FULL seven-slide-pipeline list the canvas carries; `driveSelectedRunPoints`
 * drives only the subset a given Idea's Spec needs (`slideRunPointNames`).
 */
const CAROUSEL_RUN_POINTS = canonicalCarouselProtocol().run_points.map((rp) => rp.start);
if (CAROUSEL_RUN_POINTS.length !== TOTAL_SLIDE_PIPELINES) {
  // Defensive: canonicalCarouselProtocol() is a static, committed, tested artifact — this can only fire
  // if that artifact itself regresses (see the analogous guard above for the wired Recipe).
  throw new Error(
    "recipe/registry: canonicalCarouselProtocol() no longer has exactly TOTAL_SLIDE_PIPELINES " +
      "run-points — the seeded News Carousel Recipe cannot describe its Space nodes.",
  );
}

/**
 * The second seeded Recipe (issue #60): a ZERO-gate Instagram news carousel. Proves the registry/driver
 * machinery generic — a different gate count (zero vs the wired Recipe's one), a different Spec shape
 * (an ordered slide list vs character concepts/clips/thumbnails), a different copy shape, and a
 * different Space, all driven through the SAME generic engine (`driveSelectedRunPoints`, ADR-0010).
 */
const NEWS_CAROUSEL: Recipe = {
  slug: "news-carousel",
  name: "News Carousel",
  description:
    "A zero-gate Instagram news carousel: injects an ordered slide list (5-7 slides), renders each " +
    "present slide's image via the 'AI News' Space's Viral News Pipeline, and finishes straight " +
    "through — no human pick-gate (Operator-confirmed, issue #60).",
  gates: [],
  space: {
    id: NEWS_CAROUSEL_SPACE_ID,
    name: "AI News",
    nodes: {
      specInput: JSON_MASTER_NODE_NAME,
      slideRunPoints: CAROUSEL_RUN_POINTS,
    },
  },
  specShape: {
    description:
      `${MIN_SLIDES}-${MAX_SLIDES} slides, each { slide_index, image_prompt } (slide_index exactly ` +
      "1..N, each once) — media instructions only, no post_copy (ADR-0012). " +
      "See production-spec/news-carousel-contract.ts.",
    validate: validateNewsCarouselSpec,
  },
  copyShape: {
    description:
      "Copy is composed OUT of the Space, separately, by the shared copy step (`src/copy/`) — an " +
      "Instagram editorial caption of at most 2200 chars with 0-2 emojis, plus hashtags (ADR-0012). " +
      "Deliberately DIFFERENT bounds from the wired Recipe's 180/1-3 — this Recipe's OWN params.",
    maxChars: NEWS_CAROUSEL_COPY_MAX_CHARS,
    minEmojis: NEWS_CAROUSEL_COPY_MIN_EMOJIS,
    maxEmojis: NEWS_CAROUSEL_COPY_MAX_EMOJIS,
  },
};

// ---------------------------------------------------------------------------
// Registry lookups
// ---------------------------------------------------------------------------

/** The full in-repo Recipe registry, keyed by slug. Seeded with TWO entries (issue #54, issue #60). */
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
