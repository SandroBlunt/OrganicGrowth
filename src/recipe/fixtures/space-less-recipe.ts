/**
 * A throwaway, NOT-wired Space-less test fixture Recipe (issue #170, ADR-0021:
 * `docs/adr/0021-space-less-recipe-script-assets.md`).
 *
 * ADR-0021 decides a Recipe's Space target becomes OPTIONAL: a Recipe whose Asset is written words (a
 * script) plus collected media drives no Magnific Space at all. This module proves that shape is
 * actually usable end-to-end — a minimal Spec shape (`script` + `shot_list`) with its own validator and
 * banned-word scanner (mirroring how the News Carousel Recipe declares its own per-Recipe shapes), and
 * a full `Recipe` with NO `space`/`canvasInputs` that still declares everything ADR-0021 says stays
 * required: `gates`, `specShape`, `copyShape`, `copySkill`, and all six ordered `phases`.
 *
 * `SPACE_LESS_TEST_RECIPE` is deliberately NEVER added to `src/recipe/registry.ts`'s real `REGISTRY` —
 * `isWiredRecipe`/`getRecipe` never see it, so Review's offered-Recipe set and the Production Queue are
 * completely untouched by this fixture (matching issue #170's stated scope). The REAL News Short Script
 * Recipe — its own Spec contract, Skill, and registry entry — is a follow-up slice; this fixture exists
 * ONLY to prove the generic support, never to represent real production content.
 */

import type { ValidationResult, ValidationError } from "../../production-spec/validate.ts";
import { scanTextFields, type BrandSafetyResult, type TextField } from "../../production-spec/brand-safety.ts";
import { declaresAllPhasesInOrder, type PhaseContract } from "../phase-contract.ts";
import type { Recipe } from "../registry.ts";

// ---------------------------------------------------------------------------
// A minimal Spec shape: a script + a non-empty Shot List of beats
// ---------------------------------------------------------------------------

/** One Shot List beat: what to show on screen for one beat of the script (CONTEXT.md "Shot List"). */
export interface SpaceLessTestSpecBeat {
  readonly beat: string;
  readonly description: string;
}

/** The fixture's minimal Spec shape — a stand-in ONLY, not the real News Short Script contract. */
export interface SpaceLessTestSpec {
  readonly script: string;
  readonly shot_list: readonly SpaceLessTestSpecBeat[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate a candidate `SpaceLessTestSpec`: a non-empty `script`, and a non-empty `shot_list` whose
 * every entry carries non-empty `beat`/`description` strings. Never throws on shape.
 */
export function validateSpaceLessTestSpec(spec: unknown): ValidationResult {
  if (!isObject(spec)) {
    return { ok: false, errors: [{ code: "not_an_object", message: "Spec must be a JSON object." }] };
  }

  const errors: ValidationError[] = [];

  if (!isNonEmptyString(spec.script)) {
    errors.push({ code: "script_missing", message: "script must be a non-empty string." });
  }

  const shotList = spec.shot_list;
  if (!Array.isArray(shotList) || shotList.length === 0) {
    errors.push({ code: "shot_list_missing", message: "shot_list must be a non-empty array." });
  } else {
    shotList.forEach((beat, i) => {
      if (!isObject(beat) || !isNonEmptyString(beat.beat) || !isNonEmptyString(beat.description)) {
        errors.push({
          code: "shot_list_beat_shape",
          message: `shot_list[${i}] must be an object with non-empty "beat" and "description" strings.`,
        });
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/** Collect every `{ field, text }` pair from a candidate Spec's own text-bearing fields. */
function collectSpaceLessTestSpecTextFields(spec: unknown): TextField[] {
  const out: TextField[] = [];
  if (!isObject(spec)) return out;

  if (typeof spec.script === "string") out.push({ field: "script", text: spec.script });

  const shotList = spec.shot_list;
  if (Array.isArray(shotList)) {
    shotList.forEach((beat, i) => {
      if (!isObject(beat)) return;
      if (typeof beat.beat === "string") out.push({ field: `shot_list[${i}].beat`, text: beat.beat });
      if (typeof beat.description === "string") {
        out.push({ field: `shot_list[${i}].description`, text: beat.description });
      }
    });
  }

  return out;
}

/**
 * Scan a candidate `SpaceLessTestSpec` for any of `bannedWords` (case-insensitive, whole-word), reusing
 * `brand-safety.ts`'s shared `scanTextFields` core so the matching rule can never drift from every other
 * Recipe's own scanner.
 */
export function scanSpaceLessTestSpecForBannedWords(
  spec: unknown,
  bannedWords: readonly string[],
): BrandSafetyResult {
  return scanTextFields(collectSpaceLessTestSpecTextFields(spec), bannedWords);
}

/**
 * A well-formed `SpaceLessTestSpec`, for tests. Typed `Record<string, unknown>` (not the narrower
 * `SpaceLessTestSpec` interface) so it feeds `production-spec/store.ts`'s `saveSpec` directly, mirroring
 * `production-spec/fixtures/news-carousel-straw-motion-specs.ts`'s `strawMotionIdeaOneCarouselSpec()`'s
 * own precedent for the exact same reason.
 */
export function validSpaceLessTestSpec(): Record<string, unknown> {
  return {
    script: "Hook: this AI tool just replaced three job roles overnight.",
    shot_list: [
      { beat: "hook", description: "Source page screenshot of the announcement." },
      { beat: "context", description: "Collected clip of the product demo." },
    ],
  };
}

// ---------------------------------------------------------------------------
// The fixture Recipe's six ordered Phase Contracts (ADR-0017) — the Space-bound phases are EMPTY
// ---------------------------------------------------------------------------

const SPACE_LESS_TEST_PHASES: readonly PhaseContract[] = [
  {
    phase: "author",
    description: "Author the Spec: a non-empty script plus a non-empty Shot List of beats.",
    checklist: [
      {
        kind: "mechanical",
        description: "A non-empty script and a non-empty shot_list whose every beat/description is non-empty.",
        reference: "recipe/fixtures/space-less-recipe.ts: validateSpaceLessTestSpec (this Recipe's specShape.validate)",
      },
      {
        kind: "mechanical",
        description: "No banned word in the script or any Shot List beat — reject-only, never a silent swap.",
        reference:
          "recipe/fixtures/space-less-recipe.ts: scanSpaceLessTestSpecForBannedWords (this Recipe's specShape.scanBannedWords)",
      },
    ],
  },
  {
    phase: "bind-media",
    description:
      "This Recipe has no canvas at all (ADR-0021) — there is nothing to bind. The checklist is EMPTY, " +
      "mirroring how any Recipe with zero declared media slots already audits vacuously true.",
    checklist: [],
  },
  {
    phase: "gate",
    description: "This Recipe declares zero gates — nothing pauses here, the same as the News Carousel Recipe.",
    checklist: [],
  },
  {
    phase: "render",
    description:
      "This Recipe has no Space to drive (ADR-0021). Collecting the Shot List's media (best-effort " +
      "download, video preferred, a marked link fallback) is this Recipe's own future build slice — " +
      "this fixture's render step is a deliberate no-op, EMPTY checklist.",
    checklist: [],
  },
  {
    phase: "copy",
    description: "Compose the Copy out of the Space, separately — the SAME shared step every Recipe uses.",
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
    description: "Write the produced Asset to the ledger — spec_path + copy only; no Space ever rendered any media.",
    checklist: [
      {
        kind: "agent-judged",
        description:
          "The Asset's ledger record carries recipe, status: \"produced\", spec_path, and the composed " +
          "copy — and carries NO asset_url/asset_paths, since no Space ever rendered anything for this " +
          "Recipe (ledger-as-source-of-truth, always-rule 7).",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// The fixture Recipe itself — NEVER added to the real REGISTRY
// ---------------------------------------------------------------------------

/**
 * A throwaway, NOT-wired Space-less Recipe (issue #170). Declares NO `space` and NO `canvasInputs` —
 * every other field ADR-0021 says stays required is populated. Used only by this repo's own tests to
 * prove the generic support; never imported by `src/recipe/registry.ts`.
 */
export const SPACE_LESS_TEST_RECIPE: Recipe = {
  slug: "test-space-less-recipe",
  name: "Test Space-less Recipe (ADR-0021 fixture — NOT wired)",
  description:
    "A throwaway fixture proving a Recipe can drive no Magnific Space at all (ADR-0021): its Asset is " +
    "written words (a script) plus collected media. NOT a real production Recipe — never registered.",
  gates: [],
  specShape: {
    description:
      "A non-empty script plus a non-empty Shot List of beats, each carrying a non-empty beat name and " +
      "description. A stand-in shape only — not the real News Short Script Recipe's own contract.",
    validate: validateSpaceLessTestSpec,
    scanBannedWords: scanSpaceLessTestSpecForBannedWords,
  },
  copyShape: {
    description:
      "Copy is composed OUT of the Space, separately, by the shared copy step (`src/copy/`) — a caption " +
      "of at most 500 chars with 0-2 emojis, plus hashtags. This fixture's own params, chosen only to " +
      "differ visibly from both wired Recipes' own copy shapes.",
    maxChars: 500,
    minEmojis: 0,
    maxEmojis: 2,
  },
  copySkill: "write-social-copy",
  phases: SPACE_LESS_TEST_PHASES,
};

if (!declaresAllPhasesInOrder(SPACE_LESS_TEST_RECIPE.phases)) {
  // Defensive, mirroring registry.ts's own CHARACTER_EXPLAINER_PHASES/NEWS_CAROUSEL_PHASES guards:
  // fail loudly at import time rather than silently exposing a Recipe with an incomplete/misordered
  // Phase Contract list — the SAME import-time guard every wired Recipe's own module-load already runs
  // (issue #170 AC1).
  throw new Error(
    "recipe/fixtures/space-less-recipe.ts: SPACE_LESS_TEST_PHASES does not declare all six phases in PHASE_ORDER.",
  );
}
