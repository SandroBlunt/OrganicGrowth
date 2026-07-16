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
 * --- Seeded with exactly ONE entry, reproducing today's wired path UNCHANGED ---
 *
 * "Character Explainer with Cast" wraps today's existing Production-Spec contract
 * (`production-spec/contract.ts` + `validate.ts`), Execution Protocol (`canonicalProtocol()`), and
 * cast/clip gates BYTE-FOR-BYTE — this slice makes ZERO behaviour change to the wired production
 * path. The registry entry below does not duplicate any of that logic: it REFERENCES the same
 * exported constants/functions those modules already use (`validateProductionSpec`,
 * `JSON_MASTER_NODE_NAME`, `CHARACTER_NODE_NAME`, `canonicalProtocol()`), so there is no risk of the
 * registry's description drifting from what the driver/validator actually do. `driver.ts`,
 * `contract.ts`, `validate.ts`, `protocol.ts`, and `parse.ts` are NOT modified by this slice — the
 * generic run-until-gate driver that would actually SOURCE its behavior from a Recipe (rather than
 * merely being describable by one) is issue #57.
 *
 * The Space `id` this Recipe targets ("Organic Character Explainer") is verified in
 * `docs/producer-spikes-results.md` and the live capture at
 * `src/space-driver/fixtures/live-captures/README.md`; it is also (today) configured per-Brand at
 * `brand-profile.yaml`'s `production.space_id` (read by the attended `producer` agent) — ADR-0013
 * intends the Recipe to become the single source of truth for Space targeting, but re-pointing
 * `producer.md` at the registry is deferred (untestable without the live Space; not part of this
 * slice's zero-behaviour-change bar).
 */

import {
  validate as validateProductionSpec,
  type ValidationResult,
} from "../production-spec/validate.ts";
import {
  MAX_POST_COPY_CHARS,
  MIN_POST_COPY_EMOJIS,
  MAX_POST_COPY_EMOJIS,
  REQUIRED_CHARACTER_CONCEPTS,
  REQUIRED_CLIPS,
  REQUIRED_THUMBNAILS,
} from "../production-spec/contract.ts";
import { JSON_MASTER_NODE_NAME, CHARACTER_NODE_NAME } from "../space-driver/driver.ts";
import { canonicalProtocol } from "../execution-protocol/protocol.ts";

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

/** The on-canvas node names a Recipe's Space steps reference, by name (never a raw node id). */
export interface RecipeSpaceNodes {
  /** The Spec-input text node the Producer injects the Production Spec into (Fallback Protocol). */
  readonly specInput: string;
  /** The pinned-reference creation node the Operator's gate pick is re-pinned to. */
  readonly pinnedReference: string;
  /** The Execution Protocol run-point that renders this Recipe's FIRST gate's candidates. */
  readonly castRunPoint: string;
  /** The Execution Protocol run-point that renders the final Asset (no gate follows it). */
  readonly clipRunPoint: string;
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
      `${REQUIRED_THUMBNAILS} top-level thumbnails; a top-level post_copy.`,
    validate: validateProductionSpec,
  },
  copyShape: {
    description:
      "Today's copy is the Production Spec's own top-level post_copy field (ADR-0012 moves copy out " +
      "of the Spec entirely in a later slice; this Recipe's copy shape is unchanged here).",
    maxChars: MAX_POST_COPY_CHARS,
    minEmojis: MIN_POST_COPY_EMOJIS,
    maxEmojis: MAX_POST_COPY_EMOJIS,
  },
};

// ---------------------------------------------------------------------------
// Registry lookups
// ---------------------------------------------------------------------------

/** The full in-repo Recipe registry, keyed by slug. Seeded with exactly one entry (issue #54). */
const REGISTRY: ReadonlyMap<string, Recipe> = new Map([
  [CHARACTER_EXPLAINER_WITH_CAST.slug, CHARACTER_EXPLAINER_WITH_CAST],
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
