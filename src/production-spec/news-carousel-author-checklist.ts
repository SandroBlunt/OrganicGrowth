/**
 * News Carousel author-phase checklist — graduated from the map-ticket-#77 prototype
 * (`check-carousel-spec.mjs`), issue #85, ADR-0017, ADR-0015.
 *
 * This is the News Carousel Recipe's FULL author-phase contract, run entirely as CODE (issue #85
 * AC2). It layers the checks the #77 prototype proved out (validated 10/10 on freshly authored
 * prompts) on top of this Recipe's own, ALREADY-REFERENCED structural validator and banned-word
 * scanner — never re-implementing either:
 *
 *   - `validateNewsCarouselSpec` (`news-carousel-validate.ts`) covers "exactly 7 slides, fixed role
 *     order" and "each text at most 140 chars" (plus per-slide shape) — this module reads its
 *     `errors[].code`s to report those TWO checklist items granularly, never re-deriving the count/
 *     order/length rule itself.
 *   - `scanNewsCarouselForBannedWords` (`news-carousel-brand-safety.ts`) covers "no banned word in any
 *     field" — REJECT-ONLY, never a silent swap (always-rule 9).
 *   - The referenced structural validator is the AUTHORITATIVE gate: a malformed/short/mis-ordered
 *     Spec fails this checklist's overall `ok` regardless of what the granular items below say.
 *
 * The genuinely NEW checks (the #77 prototype's contribution) are: does every `image_prompt` cite the
 * Baseline Prompt's logo reference name, carry its pill text + never-all-caps instruction, keep every
 * other fixed clause, and use one of the confirmed card styles?
 *
 * --- Parameterized, never hardcoded (issue #85's core ask) ---
 *
 * The #77 prototype hardcoded the pill text (`"Unhypped News"`) and the logo reference name
 * (`"Brand_Logo"`) as literals. ADR-0015 makes the Format's Baseline Prompt document the SOURCE OF
 * TRUTH for both — a different (Brand x Format) pair has its own pill text and its own logo reference
 * name. This module therefore takes them (plus the never-all-caps instruction, the other fixed
 * clauses, and the confirmed card styles) as a `NewsCarouselBaselineParams` argument — nothing here is
 * a string literal sourced from any one Brand/Format. HOW those params get read out of the actual
 * Baseline Prompt document end-to-end is downstream (issues #87/#88, the producer Skill); this module
 * only ACCEPTS them and checks a candidate Spec against them — tests supply them directly.
 *
 * --- Grounded subject is agent-judged, not code-checked ---
 *
 * "never invent a UI and show it as a real product's own screen" needs judgement a mechanical string
 * check cannot make. It is included in the returned checklist for completeness (`kind: "agent-judged"`,
 * `ok: null`) but is never computed here, and never blocks `ok` (ADR-0017: agent-judged items are
 * flagged for review, never auto-failed).
 */

import { validateNewsCarouselSpec } from "./news-carousel-validate.ts";
import { scanNewsCarouselForBannedWords } from "./news-carousel-brand-safety.ts";
import type { ChecklistItemAudit, PhaseAuditResult } from "../recipe/phase-contract.ts";

/** The Format/Brand-specific strings this checklist checks a candidate Spec against — read from the
 *  Format's Baseline Prompt document (ADR-0015), never hardcoded here. */
export interface NewsCarouselBaselineParams {
  /** The logo reference name every image_prompt must cite (e.g. `"Brand_Logo"`). */
  readonly logoReferenceName: string;
  /** The pill/eyebrow badge text every image_prompt must carry verbatim (e.g. `"Unhypped News"`). */
  readonly pillText: string;
  /** The never-all-caps instruction sentence the Baseline Prompt pairs with the pill text. */
  readonly neverAllCapsInstruction: string;
  /**
   * Every OTHER fixed clause the Baseline Prompt's worked example carries verbatim in each
   * image_prompt (the logo guardrail, the card clause, the card-text clause, the closing style
   * line...). `pillText`/`neverAllCapsInstruction` are checked separately (the issue calls them out
   * by name); this list is everything else.
   */
  readonly fixedClauses: readonly string[];
  /** The Baseline Prompt's own confirmed card styles (e.g. `["full_width", "floating_toast"]`). */
  readonly confirmedCardStyles: readonly string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Best-effort slide extraction for the granular checks below — never throws on a malformed Spec; the
 *  REFERENCED `validateNewsCarouselSpec` call is what actually rejects a malformed shape. */
function extractSlides(spec: unknown): readonly Record<string, unknown>[] {
  if (!isObject(spec)) return [];
  const slides = spec.slides;
  if (!Array.isArray(slides)) return [];
  return slides.filter(isObject);
}

function imagePrompt(slide: Record<string, unknown>): string {
  return typeof slide.image_prompt === "string" ? slide.image_prompt : "";
}

/**
 * Audit a candidate News Carousel Production Spec against its FULL, graduated author-phase checklist
 * (map #77, issue #85). Runs entirely as CODE — every item is either a mechanical check REFERENCING
 * `validateNewsCarouselSpec`/`scanNewsCarouselForBannedWords` (never duplicated) or a NEW mechanical
 * check parameterized from `baseline` (never a hardcoded literal), except the single agent-judged
 * "grounded subject" item, which is flagged for review and never computed. Never throws.
 *
 * @param candidateSpec the candidate News Carousel Production Spec (untrusted shape)
 * @param bannedWords   the Brand's banned words (`production-spec/brand-profile.ts`'s `loadBannedWords`)
 * @param baseline      the (Brand x Format) Baseline Prompt's own strings this Spec is checked against
 */
export function auditNewsCarouselAuthorPhase(
  candidateSpec: unknown,
  bannedWords: readonly string[],
  baseline: NewsCarouselBaselineParams,
): PhaseAuditResult {
  const structural = validateNewsCarouselSpec(candidateSpec);
  const safety = scanNewsCarouselForBannedWords(candidateSpec, bannedWords);
  const slides = extractSlides(candidateSpec);
  const hasSlides = slides.length > 0;

  const hasStructuralCode = (code: string): boolean => structural.errors.some((e) => e.code === code);

  const items: ChecklistItemAudit[] = [
    {
      description:
        "Exactly 7 slides, in fixed role order hook -> then -> shift -> proof -> different -> next -> cta.",
      kind: "mechanical",
      ok: !hasStructuralCode("slides_count") && !hasStructuralCode("slide_role_order"),
    },
    {
      description: "Each slide's on-card text is at most 140 chars.",
      kind: "mechanical",
      ok: !hasStructuralCode("slide_text_too_long"),
    },
    {
      description: `Each image_prompt references the logo reference name (${JSON.stringify(baseline.logoReferenceName)}).`,
      kind: "mechanical",
      ok: hasSlides && slides.every((s) => imagePrompt(s).includes(baseline.logoReferenceName)),
    },
    {
      description:
        `Each image_prompt contains the pill text (${JSON.stringify(baseline.pillText)}) and its ` +
        "never-all-caps instruction.",
      kind: "mechanical",
      ok:
        hasSlides &&
        slides.every(
          (s) =>
            imagePrompt(s).includes(baseline.pillText) &&
            imagePrompt(s).includes(baseline.neverAllCapsInstruction),
        ),
    },
    {
      description:
        "Each image_prompt keeps every other fixed Baseline Prompt clause (logo guardrail, card, " +
        "card-text, closing style line).",
      kind: "mechanical",
      ok:
        hasSlides &&
        slides.every((s) => baseline.fixedClauses.every((clause) => imagePrompt(s).includes(clause))),
    },
    {
      description:
        "Grounded subject — a real product/logo/action, or an intentional photographic scene; never " +
        "an invented UI shown as a real product's own screen.",
      kind: "agent-judged",
      ok: null,
    },
    {
      description: "card_style is one of the Baseline Prompt's confirmed styles; stat_callout is non-empty.",
      kind: "mechanical",
      ok:
        hasSlides &&
        slides.every(
          (s) =>
            baseline.confirmedCardStyles.includes(String(s.card_style)) &&
            typeof s.stat_callout === "string" &&
            s.stat_callout.trim().length > 0,
        ),
    },
    {
      description: "No banned word in any field — reject-only, never a silent swap.",
      kind: "mechanical",
      ok: safety.ok,
      ...(safety.ok ? {} : { detail: safety.hits.map((h) => `"${h.word}" in ${h.field}`).join("; ") }),
    },
  ];

  // The referenced structural validator is the authoritative gate for shape/count/order/length: a
  // malformed Spec fails the whole checklist even if a granular item above couldn't itself tell why.
  const ok = structural.ok && items.every((i) => i.ok !== false);

  return { recipe: "news-carousel", phase: "author", ok, items };
}
