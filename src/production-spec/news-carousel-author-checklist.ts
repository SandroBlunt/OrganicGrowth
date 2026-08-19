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
 * --- No dash "tells" in on-card copy (issue #108) ---
 *
 * An em dash, an en dash, or a hyphen used as a spaced dash is a well-known AI-writing "tell" that
 * hurts scannability. This module's `no-dash-tells` item scans only the Baseline Prompt document's own
 * "Card text" fields — each slide's `stat_callout` and `text` (`dash-safety.ts`'s
 * `scanTextFieldsForDashes`, reused, never re-implemented) — REJECT-ONLY, exactly like the banned-word
 * item above. It deliberately does NOT scan `image_prompt`: the Baseline Prompt's own FIXED,
 * verbatim-required clauses legitimately contain em dashes, and a media instruction fed to the image
 * model is never itself reader-facing "Copy" (CONTEXT.md "Copy").
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
 *
 * --- Logo consistency via a negative-prompt guardrail, never a forced literal (issue #110) ---
 *
 * Epic #106 item 5's reproduction: forcing the raw, underscored reference name (e.g.
 * "Straw_Motion_Logo") into every `image_prompt` sometimes backfires — the image model prints that odd,
 * filename-like token as literal on-image TEXT (plus draws a wrong, generic icon) instead of treating it
 * as a bare identifier for the canvas-connected reference image. The Operator's decision (issue #110):
 * fix this with a NEGATIVE-PROMPT guardrail, never by compositing the real logo file. The `logo-reference`
 * item below no longer REQUIRES the raw name on its own: a prompt passes as long as it (a) references
 * the connected logo — via the raw reference name OR the Baseline Prompt's own name-free reference
 * phrase (`logoReferencePhrase`) — AND (b) carries the document's own negative guardrail instruction
 * (`logoNameGuardrailInstruction`) forbidding that reference name/filename from ever being rendered as
 * visible text. `logo-name-not-as-text` is a NEW, separate reject-only item (mirroring `no-dash-tells`/
 * `banned-words`): it flags the specific anti-pattern of the reference name appearing QUOTED — this same
 * document's own convention for literal on-image text (e.g. `"Unhypped News"`) — a strong, checkable
 * signal a prompt is telling the model to DRAW the name, not just use it as a reference.
 *
 * No in-repo negative-prompt CANVAS field exists for this Recipe: `recipe/registry.ts`'s
 * `RecipeCanvasInputs`/`RecipeSpaceNodes` has no such typed input, and `space-driver/port.ts`'s
 * `SpaceMcpPort` has no primitive to set a per-node `negativePrompt` attribute distinct from the single
 * injectable prompt-text node (the live Carrousel Space's Image Generator node DOES carry a raw
 * `negativePrompt` field in its captured board JSON, but nothing in this codebase's Recipe/driver
 * abstraction reads or writes it). So the guardrail is authored as an explicit prohibitory CLAUSE inside
 * the `image_prompt` text itself (issue #110's own documented fallback), never a separate canvas
 * parameter.
 *
 * --- Placement variety is mechanical too (issue #106) ---
 *
 * A produced carousel that reuses only one or two `card_style`s — or never once uses a top-region
 * placement — reads as monotone even though every OTHER item above passes clean (straw-motion's
 * idea-01: `full_width`, `floating_toast`, `small_badge`, `full_width_inset`, `floating_toast`,
 * `small_badge_inset`, `full_width` — 5 distinct values, zero top-region cards, and no existing check
 * ever looked at the SPREAD of `card_style` across the 7 slides). This is fully computable from the
 * 7 slides' own `card_style` field, so it is `kind: "mechanical"` (ADR-0017) and participates in the
 * overall `ok`, exactly like the other new checks above. Which styles count as "top region" and how
 * many distinct styles count as "varied" are BOTH read from `NewsCarouselBaselineParams` — never a
 * hardcoded literal (ADR-0015) — mirroring `confirmedCardStyles`'s own precedent.
 */

import { validateNewsCarouselSpec } from "./news-carousel-validate.ts";
import { scanNewsCarouselForBannedWords } from "./news-carousel-brand-safety.ts";
import { scanTextFieldsForDashes } from "./dash-safety.ts";
import type { TextField } from "./brand-safety.ts";
import type { ChecklistItemAudit, PhaseAuditResult } from "../recipe/phase-contract.ts";
import { isCarouselHeroRole } from "./news-carousel-contract.ts";

/** The Format/Brand-specific strings this checklist checks a candidate Spec against — read from the
 *  Format's Baseline Prompt document (ADR-0015), never hardcoded here. */
export interface NewsCarouselBaselineParams {
  /**
   * The logo reference name an image_prompt MAY cite (e.g. `"Brand_Logo"`) — one of two acceptable
   * ways to reference the connected logo (the other is `logoReferencePhrase`). No longer REQUIRED on
   * its own: forcing this raw, underscored, filename-like token into every prompt is exactly what
   * sometimes made the model print it as on-image text instead of using it as a bare reference
   * identifier (issue #110).
   */
  readonly logoReferenceName: string;
  /** The pill/eyebrow badge text every image_prompt must carry verbatim (e.g. `"Unhypped News"`). */
  readonly pillText: string;
  /** The never-all-caps instruction sentence the Baseline Prompt pairs with the pill text. */
  readonly neverAllCapsInstruction: string;
  /**
   * A name-free, generic phrase the Baseline Prompt uses to describe the connected logo (e.g. `"the
   * connected reference image"`) — the OTHER acceptable way (alongside `logoReferenceName`) for an
   * image_prompt to reference the logo, so a prompt need never carry the raw reference name to pass
   * the `logo-reference` item (issue #110).
   */
  readonly logoReferencePhrase: string;
  /**
   * The Baseline Prompt's own negative-prompt guardrail sentence: never render the logo's reference
   * name/filename as visible on-image text. Every image_prompt SHALL carry this verbatim, alongside
   * EITHER `logoReferenceName` or `logoReferencePhrase`, for the `logo-reference` item to pass
   * (issue #110).
   */
  readonly logoNameGuardrailInstruction: string;
  /**
   * Every OTHER fixed clause the Baseline Prompt's worked example carries verbatim in EVERY slide's
   * image_prompt, hero or standard alike (the card clause, the card-text clause, the closing style
   * line...). `pillText`/`neverAllCapsInstruction`/`logoNameGuardrailInstruction` are checked
   * separately (the issue calls them out by name); `heroLogoClauses` below covers the clauses that are
   * ONLY relevant when a logo is actually rendered (issue #188). This list is everything else.
   */
  readonly fixedClauses: readonly string[];
  /**
   * The Baseline Prompt's own fixed clauses that describe the LOGO itself (e.g. "render the logo
   * exactly as provided", the vignette-behind-the-logo clause) — required verbatim ONLY on the two hero
   * slides (hook/cta), alongside `logoNameGuardrailInstruction` (issue #188: since the 5 middle slides
   * carry no logo at all, they carry none of these clauses either). Checked as part of the
   * `logo-reference` item, not `fixedClauses` above (which now applies uniformly to every slide).
   */
  readonly heroLogoClauses: readonly string[];
  /** The Baseline Prompt's own confirmed card styles (e.g. `["full_width", "floating_toast"]`). */
  readonly confirmedCardStyles: readonly string[];
  /**
   * Which of `confirmedCardStyles` sit in the frame's TOP region (e.g. a "top card, photo below"
   * placement) — issue #106. Data straight from the Baseline Prompt document, never a hardcoded
   * literal in the checked module: a different (Brand x Format) names its own top-region style(s). A
   * carousel using zero of these across its 7 slides fails the `placement-variety` item regardless of
   * how many OTHER distinct styles it uses.
   */
  readonly topRegionCardStyles: readonly string[];
  /**
   * The minimum number of DISTINCT `card_style` values the 7 slides must use to count as "spread
   * across the vertical range" rather than monotone (issue #106). Like `confirmedCardStyles`, this is
   * the Format's own call, not a literal reproduced from the document's prose — never verbatim-checked
   * by `verifyBaselineParamsAgainstDocument` (the same exemption `confirmedCardStyles` already has).
   */
  readonly minDistinctCardStyles: number;
  /**
   * The Baseline Prompt's own fixed clause declaring the text card's minimum vertical share on a HERO
   * slide (hook/cta) — `CAROUSEL_HERO_TEXT_CARD_MIN_PCT` (60), stated in prose (e.g. "the text card
   * occupies at least 60% of the frame's vertical height"). Every hero slide's `image_prompt` SHALL
   * carry this verbatim (issue #188).
   */
  readonly heroTextCardMinPctClause: string;
  /**
   * The Baseline Prompt's own fixed clause declaring the text card's minimum vertical share on every
   * OTHER slide (then/shift/proof/different/next) — `CAROUSEL_STANDARD_TEXT_CARD_MIN_PCT` (50). Every
   * standard slide's `image_prompt` SHALL carry this verbatim (issue #188).
   */
  readonly standardTextCardMinPctClause: string;
  /**
   * The Baseline Prompt's own fixed clause instructing the compositor to reserve a frame for a real,
   * fetched photo (ADR-0024) — required verbatim on every `kind: "image"` slide's `image_prompt`
   * (issue #188).
   */
  readonly realImageFrameClause: string;
  /**
   * The Baseline Prompt's own fixed clause instructing the compositor to reserve a window for a real,
   * fetched video AND to keep the rest of the generated background calmer/less busy than a fully
   * generated slide (fewer competing focal elements) — required verbatim on every `kind: "video"`
   * slide's `image_prompt` (ADR-0024, issue #188).
   */
  readonly realVideoWindowClause: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The result of cross-checking a hand-typed `NewsCarouselBaselineParams` against the raw document. */
export interface BaselineParamsVerification {
  readonly ok: boolean;
  /** One entry per fact that could NOT be found, verbatim, in the document text. */
  readonly mismatches: readonly string[];
}

/**
 * Cross-check a hand-typed `NewsCarouselBaselineParams` against the RAW Baseline Prompt document text
 * it was supposedly read from — catches a stale or mistyped hand-copy before the checklist silently
 * checks slides against the wrong facts (issue #102: nothing previously verified this copy step).
 * Checks only the fields meant to be reproduced VERBATIM (ADR-0015): `logoReferenceName`, `pillText`,
 * `neverAllCapsInstruction`, `fixedClauses`, plus the four issue #188 additions
 * (`heroTextCardMinPctClause`, `standardTextCardMinPctClause`, `realImageFrameClause`,
 * `realVideoWindowClause`). `confirmedCardStyles` is deliberately excluded — those
 * are the Skill's own short names for styles the document describes in prose, not literal substrings
 * of it, so a plain-text search would always (wrongly) fail them. `topRegionCardStyles` and
 * `minDistinctCardStyles` (issue #106) are excluded for the SAME reason: short style names and a
 * numeric threshold are the Format's own configuration, never literal document prose.
 */
export function verifyBaselineParamsAgainstDocument(
  params: NewsCarouselBaselineParams,
  documentText: string,
): BaselineParamsVerification {
  const mismatches: string[] = [];
  if (!documentText.includes(params.logoReferenceName)) {
    mismatches.push(`logoReferenceName ${JSON.stringify(params.logoReferenceName)} not found in the document`);
  }
  if (!documentText.includes(params.pillText)) {
    mismatches.push(`pillText ${JSON.stringify(params.pillText)} not found in the document`);
  }
  if (!documentText.includes(params.neverAllCapsInstruction)) {
    mismatches.push("neverAllCapsInstruction not found in the document, verbatim");
  }
  if (!documentText.includes(params.logoReferencePhrase)) {
    mismatches.push(
      `logoReferencePhrase ${JSON.stringify(params.logoReferencePhrase)} not found in the document`,
    );
  }
  if (!documentText.includes(params.logoNameGuardrailInstruction)) {
    mismatches.push("logoNameGuardrailInstruction not found in the document, verbatim");
  }
  for (const clause of params.fixedClauses) {
    if (!documentText.includes(clause)) {
      mismatches.push(`fixed clause not found in the document, verbatim: ${JSON.stringify(clause)}`);
    }
  }
  for (const clause of params.heroLogoClauses) {
    if (!documentText.includes(clause)) {
      mismatches.push(`hero logo clause not found in the document, verbatim: ${JSON.stringify(clause)}`);
    }
  }
  if (!documentText.includes(params.heroTextCardMinPctClause)) {
    mismatches.push(
      `heroTextCardMinPctClause ${JSON.stringify(params.heroTextCardMinPctClause)} not found in the document`,
    );
  }
  if (!documentText.includes(params.standardTextCardMinPctClause)) {
    mismatches.push(
      `standardTextCardMinPctClause ${JSON.stringify(params.standardTextCardMinPctClause)} not found in the document`,
    );
  }
  if (!documentText.includes(params.realImageFrameClause)) {
    mismatches.push(
      `realImageFrameClause ${JSON.stringify(params.realImageFrameClause)} not found in the document`,
    );
  }
  if (!documentText.includes(params.realVideoWindowClause)) {
    mismatches.push(
      `realVideoWindowClause ${JSON.stringify(params.realVideoWindowClause)} not found in the document`,
    );
  }
  return { ok: mismatches.length === 0, mismatches };
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

/** This slide's `role`, defensively narrowed (never throws on a malformed Spec — an unreadable role
 *  simply never matches `isCarouselHeroRole`, so it is treated as a STANDARD slide by the role-aware
 *  items below; `validateNewsCarouselSpec` is what actually rejects a missing/malformed role). */
function slideRole(slide: Record<string, unknown>): string {
  return typeof slide.role === "string" ? slide.role : "";
}

/** This slide's EFFECTIVE media kind (ADR-0024, issue #188) — `slide.kind`, or `"generated"` when
 *  absent/malformed (backward compatible, mirrors `news-carousel-contract.ts`'s own `slideKind`;
 *  duplicated here rather than imported so this module never needs the full `CarouselSlide` shape to
 *  narrow an untrusted candidate). */
function slideKindOf(slide: Record<string, unknown>): "generated" | "image" | "video" {
  return slide.kind === "image" || slide.kind === "video" ? slide.kind : "generated";
}

/** This slide's `companies` field, defensively narrowed (never throws on a malformed Spec). */
function companies(slide: Record<string, unknown>): readonly string[] {
  if (!Array.isArray(slide.companies)) return [];
  return slide.companies.filter((c): c is string => typeof c === "string");
}

/** True when `name` appears in `prompt` as a standalone token — bounded by non-alphanumerics or the
 *  string's edges — so a companies entry can never false-pass as a fragment of a longer word (e.g.
 *  "Meta" must not match inside "Metadata"). */
function citesCompany(prompt: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`).test(prompt);
}

/**
 * A slide with no real company to name (`companies` empty) has nothing to check here — the logo-row
 * clause is omitted entirely for that slide (issue #102 finding #1). A slide that DOES name
 * companies must cite every one of them, verbatim, in its own image_prompt.
 */
function companiesCitedInPrompt(slide: Record<string, unknown>): boolean {
  const named = companies(slide);
  if (named.length === 0) return true;
  const prompt = imagePrompt(slide);
  return named.every((c) => citesCompany(prompt, c));
}

/**
 * Whether `prompt` references the connected logo AT ALL — via the raw reference name OR the Baseline
 * Prompt's own name-free generic phrase. Either is acceptable (issue #110): the raw name is no longer
 * required on its own.
 */
function referencesConnectedLogo(prompt: string, baseline: NewsCarouselBaselineParams): boolean {
  return prompt.includes(baseline.logoReferenceName) || prompt.includes(baseline.logoReferencePhrase);
}

/**
 * The specific anti-pattern issue #110 flags: the logo reference name appearing QUOTED — exactly the
 * convention this same document uses to mark literal on-image text (e.g. `"Unhypped News"`, a stat
 * callout). A reference name inside quotes reads as an instruction to DRAW that string, never as a bare
 * identifier for which connected reference to use.
 */
function quotesLogoReferenceName(prompt: string, logoReferenceName: string): boolean {
  return prompt.includes(`"${logoReferenceName}"`);
}

/**
 * Collect every slide's `stat_callout` + `text` — the Baseline Prompt document's own "Card text"
 * fields ("Card text: stat callout + supporting line, both set in Inter") — the reader-facing on-card
 * copy the dash-tell check applies to (issue #108). Deliberately excludes `image_prompt`: the Baseline
 * Prompt's own FIXED, verbatim-required clauses legitimately contain em dashes, and it is a media
 * instruction to the image model, never itself reader-facing "Copy" (CONTEXT.md "Copy"). Also excludes
 * the structural `role`/`card_style` fields — never reader-facing prose.
 */
function cardTextFields(slides: readonly Record<string, unknown>[]): TextField[] {
  const out: TextField[] = [];
  slides.forEach((slide, i) => {
    if (typeof slide.stat_callout === "string") {
      out.push({ field: `slides[${i}].stat_callout`, text: slide.stat_callout });
    }
    if (typeof slide.text === "string") {
      out.push({ field: `slides[${i}].text`, text: slide.text });
    }
  });
  return out;
}

/**
 * Whether the 7 slides' `card_style` values are spread across the vertical range rather than
 * monotone (issue #106): at least `baseline.minDistinctCardStyles` DISTINCT values are used, AND at
 * least one of them is one of `baseline.topRegionCardStyles`. Both clauses are read from the
 * `NewsCarouselBaselineParams` argument — never a hardcoded literal — so a different (Brand x Format)
 * can set its own bar and its own notion of "top region" (ADR-0015). Reproduces (and rejects) the
 * straw-motion idea-01 pattern: plenty of distinct bottom placements, but zero top-region cards.
 */
function hasPlacementVariety(
  slides: readonly Record<string, unknown>[],
  baseline: NewsCarouselBaselineParams,
): boolean {
  if (slides.length === 0) return false;
  const styles = slides.map((s) => String(s.card_style));
  const distinctCount = new Set(styles).size;
  const hasTopRegionCard = styles.some((s) => baseline.topRegionCardStyles.includes(s));
  return distinctCount >= baseline.minDistinctCardStyles && hasTopRegionCard;
}

/**
 * Audit a candidate News Carousel Production Spec against its FULL, graduated author-phase checklist
 * (map #77, issue #85). Runs entirely as CODE — every item is either a mechanical check REFERENCING
 * `validateNewsCarouselSpec`/`scanNewsCarouselForBannedWords` (never duplicated) or a NEW mechanical
 * check parameterized from `baseline` (never a hardcoded literal), except the single agent-judged
 * "grounded subject" item, which is flagged for review and never computed. Never throws.
 *
 * @param candidateSpec       the candidate News Carousel Production Spec (untrusted shape)
 * @param bannedWords         the Brand's banned words (`production-spec/brand-profile.ts`'s `loadBannedWords`)
 * @param baseline            the (Brand x Format) Baseline Prompt's own strings this Spec is checked against
 * @param baselineDocumentText the RAW Baseline Prompt document text `baseline` was hand-copied from.
 *   Optional (omit only when the raw text genuinely isn't available); when supplied, adds one more
 *   mechanical item verifying the hand-copy against the real document (issue #102).
 */
export function auditNewsCarouselAuthorPhase(
  candidateSpec: unknown,
  bannedWords: readonly string[],
  baseline: NewsCarouselBaselineParams,
  baselineDocumentText?: string,
): PhaseAuditResult {
  const structural = validateNewsCarouselSpec(candidateSpec);
  const safety = scanNewsCarouselForBannedWords(candidateSpec, bannedWords);
  const slides = extractSlides(candidateSpec);
  const hasSlides = slides.length > 0;
  const dashes = scanTextFieldsForDashes(cardTextFields(slides));
  const quotedLogoNameHits = slides
    .map((s, i) => ({ i, prompt: imagePrompt(s) }))
    .filter(({ prompt }) => quotesLogoReferenceName(prompt, baseline.logoReferenceName))
    .map(({ i }) => `slides[${i}].image_prompt`);

  const hasStructuralCode = (code: string): boolean => structural.errors.some((e) => e.code === code);

  const items: ChecklistItemAudit[] = [
    {
      id: "slide-count-role-order",
      description:
        "Exactly 7 slides, in fixed role order hook -> then -> shift -> proof -> different -> next -> cta.",
      kind: "mechanical",
      ok: !hasStructuralCode("slides_count") && !hasStructuralCode("slide_role_order"),
    },
    {
      id: "text-length",
      description: "Each slide's on-card text is at most 140 chars.",
      kind: "mechanical",
      ok: !hasStructuralCode("slide_text_too_long"),
    },
    {
      id: "text-card-size",
      description:
        "Each hero slide's (hook/cta) image_prompt states the text card occupies at least 60% of the " +
        "frame's vertical height; every other slide's image_prompt states at least 50% (issue #188, " +
        "replacing the old, role-blind ~25-30%).",
      kind: "mechanical",
      ok:
        hasSlides &&
        slides.every((s) => {
          const prompt = imagePrompt(s);
          const clause = isCarouselHeroRole(slideRole(s))
            ? baseline.heroTextCardMinPctClause
            : baseline.standardTextCardMinPctClause;
          return prompt.includes(clause);
        }),
    },
    {
      id: "slide-kind-source",
      description:
        "Each slide's kind, when present, is one of generated/image/video, and a source_url is " +
        "present and well-formed exactly when kind is image or video (ADR-0024).",
      kind: "mechanical",
      ok: !hasStructuralCode("slide_kind_invalid") && !hasStructuralCode("slide_source_url_invalid"),
    },
    {
      id: "logo-reference",
      description:
        "A HERO slide's (hook/cta) image_prompt references the connected logo — via the reference " +
        "name or the Baseline Prompt's own name-free reference phrase — and carries its negative " +
        "guardrail plus every heroLogoClauses entry verbatim; every OTHER slide's image_prompt " +
        "references the logo NOWHERE at all — the logo is scoped to the two hero slides only " +
        "(issue #188). The raw underscored reference name is no longer required on its own for a " +
        "hero slide (issue #110).",
      kind: "mechanical",
      ok:
        hasSlides &&
        slides.every((s) => {
          const prompt = imagePrompt(s);
          if (isCarouselHeroRole(slideRole(s))) {
            return (
              referencesConnectedLogo(prompt, baseline) &&
              prompt.includes(baseline.logoNameGuardrailInstruction) &&
              baseline.heroLogoClauses.every((clause) => prompt.includes(clause))
            );
          }
          return !referencesConnectedLogo(prompt, baseline);
        }),
    },
    {
      id: "logo-name-not-as-text",
      description:
        "The logo reference name never appears quoted as literal on-image text — reject-only; it " +
        "identifies which connected reference to use, never a caption to draw (issue #110).",
      kind: "mechanical",
      ok: quotedLogoNameHits.length === 0,
      ...(quotedLogoNameHits.length === 0 ? {} : { detail: quotedLogoNameHits.join("; ") }),
    },
    {
      id: "pill-text-caps",
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
      id: "fixed-clauses",
      description:
        "Each image_prompt keeps every other fixed Baseline Prompt clause (logo guardrail, card, " +
        "card-text, closing style line).",
      kind: "mechanical",
      ok:
        hasSlides &&
        slides.every((s) => baseline.fixedClauses.every((clause) => imagePrompt(s).includes(clause))),
    },
    {
      id: "real-media-composited",
      description:
        "An image-kind slide's image_prompt reserves a frame for the real, fetched photo " +
        "(realImageFrameClause); a video-kind slide's image_prompt reserves a window for the real, " +
        "fetched video AND keeps the generated background calmer/less busy (realVideoWindowClause); a " +
        "generated-kind slide carries neither clause requirement (ADR-0024, issue #188).",
      kind: "mechanical",
      ok:
        hasSlides &&
        slides.every((s) => {
          const prompt = imagePrompt(s);
          switch (slideKindOf(s)) {
            case "image":
              return prompt.includes(baseline.realImageFrameClause);
            case "video":
              return prompt.includes(baseline.realVideoWindowClause);
            case "generated":
              return true;
          }
        }),
    },
    {
      id: "grounded-subject",
      description:
        "Grounded subject — a real product/logo/action, or an intentional photographic scene; never " +
        "an invented UI shown as a real product's own screen.",
      kind: "agent-judged",
      ok: null,
    },
    {
      id: "card-style-stat-callout",
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
      id: "placement-variety",
      description:
        "Card placements are spread across the vertical range: at least " +
        `${baseline.minDistinctCardStyles} distinct card_style values across the 7 slides, including ` +
        `at least one top-region placement (${baseline.topRegionCardStyles.join(", ") || "none declared"}).`,
      kind: "mechanical",
      ok: hasPlacementVariety(slides, baseline),
    },
    {
      id: "companies-cited",
      description:
        "Every company named in a slide's companies field is cited in that slide's own image_prompt " +
        "(a slide naming no real company skips the logo row entirely).",
      kind: "mechanical",
      ok: hasSlides && slides.every((s) => companiesCitedInPrompt(s)),
    },
    {
      id: "banned-words",
      description: "No banned word in any field — reject-only, never a silent swap.",
      kind: "mechanical",
      ok: safety.ok,
      ...(safety.ok ? {} : { detail: safety.hits.map((h) => `"${h.word}" in ${h.field}`).join("; ") }),
    },
    {
      id: "no-dash-tells",
      description:
        "No em dash, en dash, or hyphen used as a sentence dash in any slide's stat_callout/text — " +
        "reject-only; rewrite as separate short sentences instead.",
      kind: "mechanical",
      ok: dashes.ok,
      ...(dashes.ok ? {} : { detail: dashes.hits.map((h) => `"${h.match}" in ${h.field}`).join("; ") }),
    },
  ];

  if (baselineDocumentText !== undefined) {
    const verification = verifyBaselineParamsAgainstDocument(baseline, baselineDocumentText);
    items.push({
      id: "baseline-doc-verified",
      description:
        "The hand-copied baseline facts (logo name, pill text, caps guardrail, fixed clauses) " +
        "actually appear, verbatim, in the Baseline Prompt document just read — catches a stale or " +
        "mistyped copy before it silently becomes what every slide gets checked against.",
      kind: "mechanical",
      ok: verification.ok,
      ...(verification.ok ? {} : { detail: verification.mismatches.join("; ") }),
    });
  }

  // The referenced structural validator is the authoritative gate for shape/count/order/length: a
  // malformed Spec fails the whole checklist even if a granular item above couldn't itself tell why.
  const ok = structural.ok && items.every((i) => i.ok !== false);

  return { recipe: "news-carousel", phase: "author", ok, items };
}

// ---------------------------------------------------------------------------
// auditNewsCarouselStandaloneAuthorPhase — Baseline-Prompt-INDEPENDENT subset (issue #273)
// ---------------------------------------------------------------------------

/**
 * Whether the slides' `card_style` values are spread at all — the weakest possible, universally
 * computable floor beneath `hasPlacementVariety`'s Format-tuned `placement-variety` item above: at
 * least 2 distinct values across the slide set (or every slide when there are fewer than 2). Unlike
 * `placement-variety`, this needs no `NewsCarouselBaselineParams` at all — it is a fact about the
 * candidate Spec alone, so it can run BEFORE a Format's Baseline Prompt document is available (e.g. at
 * Review/accept time, ADR-0031). A single `card_style` repeated on every one of the 7 slides is exactly
 * the pattern issue #273 reproduced live: `production-spec/news-carousel-generate.ts`'s stand-in used to
 * hardcode `"full_width"` for every slide, completely undetected by the (then Baseline-Prompt-only)
 * `placement-variety` item, which never ran at accept time.
 */
function hasMinimalCardStyleVariety(slides: readonly Record<string, unknown>[]): boolean {
  if (slides.length === 0) return false;
  const distinctCount = new Set(slides.map((s) => String(s.card_style))).size;
  return distinctCount >= Math.min(2, slides.length);
}

// ---------------------------------------------------------------------------
// slide-text-variety — no two-plus slides sharing the same repeated headline (issue #273 round 2)
// ---------------------------------------------------------------------------

/** Content words only — length >= 4, letters/digits, lowercased. Short connective words ("a", "the",
 *  "on") are deliberately excluded: they are common to almost any two sentences and would swamp the
 *  signal this check is actually after (does every slide repeat the SAME substantive material). */
const SLIDE_TEXT_MIN_WORD_LENGTH = 4;

/** The MOST content words that may legitimately be common to literally EVERY one of the 7 slides before
 *  this is treated as "the same headline repeated on every card" rather than normal editorial reuse of a
 *  story's own recurring subject name (a company/product mentioned more than once is fine — issue #273
 *  round 2, QA round 1's own repro: the pre-fix stand-in repeated the FULL headline, verbatim, on all 7
 *  slides, sharing far more than a couple of subject words). */
const MAX_COMMON_SLIDE_TEXT_WORDS = 3;

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= SLIDE_TEXT_MIN_WORD_LENGTH),
  );
}

function slideText(slide: Record<string, unknown>): string {
  return typeof slide.text === "string" ? slide.text : "";
}

/**
 * The content words common to EVERY one of `slides`' own `text` field — a Spec whose slides all repeat
 * the same headline/sentence shares most of that sentence's significant words across all of them; a
 * Spec whose slides draw from genuinely different material shares, at most, a story's own recurring
 * subject name. Exported for direct, focused testing (mirrors `checkShotListVariety`'s own convention in
 * the sibling News Short Script checklist).
 */
export function commonSlideTextWords(slides: readonly Record<string, unknown>[]): readonly string[] {
  if (slides.length === 0) return [];
  const wordSets = slides.map((s) => contentWords(slideText(s)));
  let common: ReadonlySet<string> = wordSets[0]!;
  for (const set of wordSets.slice(1)) {
    if (common.size === 0) break;
    common = new Set([...common].filter((w) => set.has(w)));
  }
  return [...common];
}

/**
 * The MINIMUM number of leading characters (case-insensitive) two slides' `text` must share, verbatim,
 * before this is treated as "the same opening sentence, just cut off at a different point" — the
 * `commonSlideTextWords` measure alone under-catches a genuinely SHORT title: e.g. a 4-word title
 * repeated verbatim on every slide, with only 2 of its own words being >= `SLIDE_TEXT_MIN_WORD_LENGTH`
 * chars, stays under `MAX_COMMON_SLIDE_TEXT_WORDS` even though every slide is STILL just that same
 * headline, re-suffixed. A shared 20+-char prefix is a length-independent signal for exactly that
 * pattern; genuinely distinct sentences (even ones opening with a common short word like "The") almost
 * never share a prefix this long.
 */
const SHARED_TEXT_PREFIX_MIN_LENGTH = 20;

/** The length of the longest common (case-insensitive) leading substring of `a` and `b`. */
function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i]!.toLowerCase() === b[i]!.toLowerCase()) i += 1;
  return i;
}

/** `true` when ANY two of `slides`' own `text` fields share a verbatim leading substring of at least
 *  `SHARED_TEXT_PREFIX_MIN_LENGTH` characters — a length-independent floor beneath
 *  `commonSlideTextWords`'s own word-based measure (see `SHARED_TEXT_PREFIX_MIN_LENGTH`'s own doc
 *  comment for why both are needed). */
function hasSharedLongTextPrefix(slides: readonly Record<string, unknown>[]): boolean {
  const texts = slides.map(slideText);
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      if (commonPrefixLength(texts[i]!, texts[j]!) >= SHARED_TEXT_PREFIX_MIN_LENGTH) return true;
    }
  }
  return false;
}

function hasSlideTextVariety(slides: readonly Record<string, unknown>[]): boolean {
  if (slides.length === 0) return false;
  return commonSlideTextWords(slides).length <= MAX_COMMON_SLIDE_TEXT_WORDS && !hasSharedLongTextPrefix(slides);
}

/**
 * Audit a candidate News Carousel Production Spec against the SUBSET of its full author-phase
 * checklist (`auditNewsCarouselAuthorPhase` above) that needs NO `NewsCarouselBaselineParams` — i.e. no
 * Format's Baseline Prompt document has to be read first (issue #273). This is the fullest check
 * mechanically available BEFORE that document is resolved (today: accept time, `author-at-review.ts`'s
 * `authorSpecForRecipe`, and the unattended worker's own defense-in-depth check,
 * `command-surface/worker.ts`'s `runOneJob`, both via `auditAuthoredSpec`). It intentionally omits every
 * item that reads a Format-specific literal (logo reference name, pill text, fixed clauses, the
 * Format-tuned `placement-variety` threshold) — those remain `auditNewsCarouselAuthorPhase`'s job, run
 * later by the interactive `produce-news-carousel` Skill once the Baseline Prompt document is in hand
 * (see this module's own doc comment; a document-parsing step that resolves those params automatically
 * is separate, not-yet-built work, never fabricated here).
 *
 * Reuses the SAME referenced checks the full function does (`validateNewsCarouselSpec`,
 * `scanNewsCarouselForBannedWords`, `scanTextFieldsForDashes`, `companiesCitedInPrompt`) — never a
 * second, re-derived rule — plus two genuinely NEW, Baseline-Prompt-independent items:
 * `card-style-distinctness` (issue #273 round 1) and `slide-text-variety` (issue #273 round 2 — QA
 * round 1's own finding that round 1's fix left every slide repeating the Brief's bare headline
 * verbatim; see `commonSlideTextWords`'s own doc comment).
 *
 * @param candidateSpec the candidate News Carousel Production Spec (untrusted shape)
 * @param bannedWords   the Brand's banned words (`production-spec/brand-profile.ts`'s `loadBannedWords`)
 */
export function auditNewsCarouselStandaloneAuthorPhase(
  candidateSpec: unknown,
  bannedWords: readonly string[],
): PhaseAuditResult {
  const structural = validateNewsCarouselSpec(candidateSpec);
  const safety = scanNewsCarouselForBannedWords(candidateSpec, bannedWords);
  const slides = extractSlides(candidateSpec);
  const hasSlides = slides.length > 0;
  const dashes = scanTextFieldsForDashes(cardTextFields(slides));

  const items: ChecklistItemAudit[] = [
    {
      id: "spec-shape",
      description:
        "Exactly 7 slides, in fixed role order hook -> then -> shift -> proof -> different -> next -> " +
        "cta, each slide well-formed (news-carousel-validate.ts's validateNewsCarouselSpec).",
      kind: "mechanical",
      ok: structural.ok,
      ...(structural.ok ? {} : { detail: structural.errors.map((e) => e.message).join("; ") }),
    },
    {
      id: "banned-words",
      description: "No banned word in any field — reject-only, never a silent swap.",
      kind: "mechanical",
      ok: safety.ok,
      ...(safety.ok ? {} : { detail: safety.hits.map((h) => `"${h.word}" in ${h.field}`).join("; ") }),
    },
    {
      id: "no-dash-tells",
      description:
        "No em dash, en dash, or hyphen used as a sentence dash in any slide's stat_callout/text — " +
        "reject-only; rewrite as separate short sentences instead.",
      kind: "mechanical",
      ok: dashes.ok,
      ...(dashes.ok ? {} : { detail: dashes.hits.map((h) => `"${h.match}" in ${h.field}`).join("; ") }),
    },
    {
      id: "companies-cited",
      description:
        "Every company named in a slide's companies field is cited in that slide's own image_prompt " +
        "(a slide naming no real company skips the logo row entirely).",
      kind: "mechanical",
      ok: hasSlides && slides.every((s) => companiesCitedInPrompt(s)),
    },
    {
      id: "card-style-distinctness",
      description:
        "At least 2 distinct card_style values are used across the slides — a Baseline-Prompt-" +
        "independent floor beneath the Format-tuned placement-variety item above; a single card_style " +
        "repeated on every slide is a strong filler signal (issue #273).",
      kind: "mechanical",
      ok: hasMinimalCardStyleVariety(slides),
    },
    {
      id: "slide-text-variety",
      description:
        `At most ${MAX_COMMON_SLIDE_TEXT_WORDS} content words are common to every one of the 7 slides' ` +
        "own on-card text, AND no two slides share a verbatim leading substring of " +
        `${SHARED_TEXT_PREFIX_MIN_LENGTH}+ characters — a Spec whose slides all repeat the same ` +
        "headline/sentence (just re-worded/re-cut per role) fails one or both; grounding each slide in " +
        "genuinely different material (e.g. a distinct Talking Point per slide) fails neither " +
        "(issue #273 round 2).",
      kind: "mechanical",
      ok: hasSlideTextVariety(slides),
      ...(hasSlideTextVariety(slides)
        ? {}
        : {
            detail:
              `common words: ${commonSlideTextWords(slides).join(", ") || "(none)"}` +
              (hasSharedLongTextPrefix(slides) ? "; two or more slides also share a long leading substring" : ""),
          }),
    },
  ];

  const ok = structural.ok && items.every((i) => i.ok !== false);

  return { recipe: "news-carousel", phase: "author", ok, items };
}
