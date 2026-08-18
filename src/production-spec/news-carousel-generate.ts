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

function buildSlide(role: CarouselRole, index: number, brief: Brief): CarouselSlide {
  const label = ROLE_LABEL[role];
  const title = brief.title;
  const text = truncate(`${title} — ${label}.`, CAROUSEL_TEXT_MAX_CHARS);
  const imagePrompt =
    `A grounded, editorial news-carousel card illustrating "${title}" (${label}). ` +
    (brief.angle !== undefined ? `Angle: ${brief.angle}. ` : "") +
    "Full-bleed 4:5 card, real subject, no invented UI.";

  return {
    slide_index: index,
    role,
    card_style: "full_width",
    stat_callout: `Slide ${index + 1} of ${CAROUSEL_ROLES.length}`,
    companies: brief.companies !== undefined ? [...brief.companies] : [],
    text,
    image_prompt: imagePrompt,
  };
}

/**
 * Compose a contract-conformant News Carousel Production Spec from a minimal Brief. Deterministic and
 * pure — the SAME shape of stand-in `generate.ts`'s `generate` already is for the wired Recipe.
 *
 * @param brief a minimal Brief (`id`, `run`, `title`, optionally `angle`/`companies`)
 */
export function generateNewsCarouselSpec(brief: Brief): NewsCarouselSpec {
  return {
    slides: CAROUSEL_ROLES.map((role, index) => buildSlide(role, index, brief)),
  };
}
