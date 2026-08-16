/**
 * Theme — the closed vocabulary for an Idea's subject category (CONTEXT.md "Theme"; issue #201, epic
 * #195 story 17).
 *
 * Sits at a level ABOVE any one Brand's niche (MundoTip's "Life hacks, household tips & tricks" vs.
 * Straw Motion's "Unhypped News" AI/tech coverage — each Brand's own `brand-profile.yaml`) so the SAME
 * closed set answers "show me every Idea about X" across every Format and every Brand, rather than
 * needing a fresh vocabulary per Format. Calibrated against a sample of both Brands' real Briefs (under
 * each Brand's own `ideas/` tree) at authoring time — every sampled Hook concept maps onto one of these
 * nine.
 *
 * Mirrors `hook-type.ts`'s shape and single-source-of-truth role: `CONTEXT.md`'s glossary entry and
 * `src/db/schema.ts`'s seeded `theme_vocabulary` reference table are both DERIVED from `THEMES`, never
 * a second hand-copied list.
 *
 * Pure: no disk, no network, no clock.
 */

import type { VocabularyTerm } from "./hook-type.ts";

/**
 * The closed set of Themes, in a fixed, deliberate order. Widening this set is a real product
 * decision (touches `CONTEXT.md` and a NEW schema migration), not a data fix — see `hook-type.ts`'s
 * `HOOK_TYPES` doc comment for the identical reasoning.
 */
export const THEMES = [
  {
    value: "product_or_tool",
    meaning: "A new or updated product, model, app, or device is the subject.",
  },
  {
    value: "pricing_or_cost",
    meaning: "Money is the throughline: a price, a discount, a valuation, or a spend.",
  },
  {
    value: "safety_or_risk",
    meaning: "A danger, a failure, a leak, or a safety finding is the subject.",
  },
  {
    value: "how_to_or_technique",
    meaning: "A concrete method or trick the viewer can copy.",
  },
  {
    value: "industry_or_business",
    meaning: "A company move: funding, a deal, a partnership, a market shift.",
  },
  {
    value: "policy_or_regulation",
    meaning: "A law, a rule, a government action, or an official stance.",
  },
  {
    value: "comparison_or_benchmark",
    meaning: "Two or more things are measured or ranked against each other.",
  },
  {
    value: "lifestyle_or_wellbeing",
    meaning: "A daily-life habit, a routine, or personal wellbeing.",
  },
  {
    value: "culture_or_reaction",
    meaning: "Public sentiment, controversy, irony, or reaction to an event.",
  },
] as const satisfies readonly VocabularyTerm[];

/** The stored-value literal union, derived from `THEMES` (never hand-duplicated). */
export type Theme = (typeof THEMES)[number]["value"];

const THEME_VALUES: ReadonlySet<string> = new Set(THEMES.map((t) => t.value));

/** True when `value` is one of the closed Theme values. */
export function isTheme(value: string): value is Theme {
  return THEME_VALUES.has(value);
}
