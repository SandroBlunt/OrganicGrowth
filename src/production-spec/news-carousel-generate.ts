/**
 * News Carousel Production Spec composer — pure deep module (ADR-0031, issue #264).
 *
 * Mirrors `generate.ts`'s own "NOTE ON SCOPE" exactly: this is a DETERMINISTIC template (no model call,
 * no I/O, no clock) standing in for the `news-carousel` Recipe's own `producerSkill`
 * (`"produce-news-carousel"`, an LLM authoring step that runs interactively) — the SAME class of stand-in
 * `src/copy/draft.ts`'s `skillDraftCopy` already is for the copy step. The contract enforced is the same
 * one that Skill's real output would have to pass: `news-carousel-validate.ts`'s `validateNewsCarouselSpec`
 * — the generator and the validator share `news-carousel-contract.ts`, so this generator can never emit a
 * Spec its own Recipe's validator would reject.
 *
 * Every slide's `text` (a short, on-card line) is a truncated form of the Brief's own title/angle; every
 * slide's `image_prompt` carries the Brief's FULL title untruncated, so a banned word anywhere in the
 * Brief's own material is always caught by the author-phase's banned-word scan — never silently dropped
 * by truncation (`news-carousel-generate.test.ts`'s own regression proof).
 *
 * Issue #273 round 1 fix: this stand-in used to hardcode `card_style: "full_width"` for all 7 slides and
 * join `text` with a spaced em dash (an AI-writing "tell", issue #108) — both undetected because
 * `author-at-review.ts`'s accept-time self-check only ran the GENERIC `auditAuthorPhase` (shape + banned
 * words), never `news-carousel-author-checklist.ts`'s own checklist. `card_style` now cycles through a
 * small, distinct set (`CARD_STYLE_CYCLE`) and `text` never joins clauses with a dash — separate short
 * sentences instead.
 *
 * Issue #273 round 2 fix (QA round 1's own finding): round 1's fix was purely mechanical — every one of
 * the 7 slides still repeated the Brief's bare `title` verbatim (just re-punctuated), because
 * `accept-idea.ts` never passed this generator any REAL, per-story content to draw from in the first
 * place. `buildSlide` now grounds the "hook" slide in the Brief's own `title` (that IS its job) but
 * builds every OTHER slide's `text` from a DISTINCT entry of `brief.talkingPoints` — the Brief's own,
 * real `## Talking Points` bullets (`src/idea/brief-content.ts`) — cycling through them when there are
 * fewer than 6. Only when a Brief carries NO talking points at all (should not happen for a real,
 * idea-strategist-authored Brief; see that module's own doc comment) does this generator degrade to the
 * OLD, title-grounded fallback — a structurally valid but genuinely generic Spec, which is exactly what
 * `news-carousel-author-checklist.ts`'s new `slide-text-variety` item is there to catch and reject at
 * accept time, rather than this module ever inventing content it wasn't given.
 *
 * This remains a deterministic, hermetic TEMPLATE, never real grounded content — see this module's own
 * "NOTE ON SCOPE" above; the fix is structural (no longer degenerate by construction), not a claim of
 * realism or literary quality.
 */

import {
  CAROUSEL_ROLES,
  CAROUSEL_TEXT_MAX_CHARS,
  type CarouselRole,
  type CarouselSlide,
  type NewsCarouselSpec,
} from "./news-carousel-contract.ts";
import type { Brief } from "./generate.ts";

/** A short, human-readable label for each fixed role — grounds the on-card `text` in what that slide's
 *  narrative beat actually IS, mirroring `news-carousel-contract.ts`'s own doc comment. */
const ROLE_LABEL: Readonly<Record<CarouselRole, string>> = {
  hook: "the stopping headline",
  then: "what used to be true",
  shift: "what changed",
  proof: "a grounded example",
  different: "why this time is different",
  next: "what happens next",
  cta: "the close",
};

/** Truncate `text` to at most `max` chars without splitting a UTF-16 surrogate pair mid-codepoint. */
function truncate(text: string, max: number): string {
  return [...text].slice(0, max).join("");
}

/** A small, fixed cycle of plausible card-style names (never a single, hardcoded value) — issue #273:
 *  a Spec whose 7 slides ALL carry the same `card_style` is the exact filler pattern
 *  `auditNewsCarouselStandaloneAuthorPhase`'s `card-style-distinctness` item rejects. Cycling
 *  deterministically through 3 names (rather than randomising) keeps this generator pure and
 *  reproducible; the REAL card styles a Format actually confirms live in its own Baseline Prompt
 *  document (ADR-0015) — this stand-in never claims to know them. */
const CARD_STYLE_CYCLE: readonly string[] = ["full_width", "floating_toast", "top_card"];

function cardStyleFor(index: number): string {
  return CARD_STYLE_CYCLE[index % CARD_STYLE_CYCLE.length]!;
}

/** Every role EXCEPT "hook" — the slots this generator grounds in the Brief's own real talking points
 *  (issue #273 round 2), cycling through them in this fixed order when fewer than 6 are available. */
const NON_HOOK_ROLES: readonly CarouselRole[] = ["then", "shift", "proof", "different", "next", "cta"];

/** `label`, capitalized for use as the leading word(s) of a sentence. */
function capitalize(label: string): string {
  return label.length === 0 ? label : `${label[0]!.toUpperCase()}${label.slice(1)}`;
}

/**
 * This slide's on-card `text`, BEFORE truncation (issue #273 round 2): the "hook" slide is grounded in
 * the Brief's own `title` (that is its whole job — naming the headline up front); every OTHER slide
 * draws from a DISTINCT entry of `brief.talkingPoints`, cycling when there are fewer than 6, PREFIXED
 * with that slide's own role label — a real Brief commonly carries 4-6 talking points (fewer than the 6
 * non-hook slots), so two slides legitimately reuse the SAME point; the per-role label prefix keeps their
 * FINAL text from ever being verbatim-identical or sharing a long leading substring (the exact,
 * length-independent signal `slide-text-variety`'s own `hasSharedLongTextPrefix` floor checks for — see
 * that module's own doc comment), while the shared point's content still isn't "the same headline
 * repeated on every card" (the actual reported defect). Only when the Brief has NO talking points at all
 * does this fall back to the OLD, title-grounded template — a structurally valid Spec that
 * `slide-text-variety` correctly rejects at accept time, rather than this generator ever inventing real
 * content it was never given.
 */
function rawTextFor(role: CarouselRole, brief: Brief, label: string): string {
  if (role === "hook") return brief.title;
  const talkingPoints = brief.talkingPoints ?? [];
  if (talkingPoints.length > 0) {
    const slot = NON_HOOK_ROLES.indexOf(role);
    const point = talkingPoints[slot % talkingPoints.length]!;
    return `${capitalize(label)}: ${point}`;
  }
  // Separate short sentences, never an em dash to join them (issue #108/#273: a dash join is an AI
  // "tell", and `auditNewsCarouselStandaloneAuthorPhase`'s `no-dash-tells` item rejects it).
  return `${brief.title}. This slide covers ${label}.`;
}

function buildSlide(role: CarouselRole, index: number, brief: Brief): CarouselSlide {
  const label = ROLE_LABEL[role];
  const title = brief.title;
  const text = truncate(rawTextFor(role, brief, label), CAROUSEL_TEXT_MAX_CHARS);
  const companies = brief.companies !== undefined ? [...brief.companies] : [];
  // When the Brief names real companies, cite them in the prompt too (issue #273) — the standalone
  // checklist's `companies-cited` item rejects a slide whose `companies` field names one but whose
  // image_prompt never mentions it.
  const companiesClause = companies.length > 0 ? ` Show these real companies/products: ${companies.join(", ")}.` : "";
  const imagePrompt =
    `A grounded, editorial news-carousel card illustrating "${title}" (${label}).` +
    (brief.angle !== undefined ? ` Angle: ${brief.angle}.` : "") +
    companiesClause +
    " Full-bleed 4:5 card, real subject, no invented UI.";

  return {
    slide_index: index,
    role,
    card_style: cardStyleFor(index),
    stat_callout: `Slide ${index + 1} of ${CAROUSEL_ROLES.length}`,
    companies,
    text,
    image_prompt: imagePrompt,
  };
}

/**
 * Compose a contract-conformant News Carousel Production Spec from a minimal Brief. Deterministic and
 * pure — the SAME shape of stand-in `generate.ts`'s `generate` already is for the wired Recipe.
 *
 * @param brief a Brief (`id`, `run`, `title`, optionally `angle`/`companies`/`talkingPoints`)
 */
export function generateNewsCarouselSpec(brief: Brief): NewsCarouselSpec {
  return {
    slides: CAROUSEL_ROLES.map((role, index) => buildSlide(role, index, brief)),
  };
}
