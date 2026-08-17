/**
 * Hook Type — the closed vocabulary for an Idea's storytelling technique (CONTEXT.md "Hook Type";
 * issue #201, epic #195 story 17).
 *
 * Today hook type exists only as free prose inside a Brief markdown file's "## Hook concept" heading
 * (spelled two different ways across the two Brands — "Hook concept" and "Hook Concept" — issue #195's
 * problem statement). An open text field on `idea.hook_type` would just move that same free-prose
 * problem into the database. This module is the SINGLE source of truth for the closed set: both
 * `CONTEXT.md`'s glossary entry (asserted verbatim, term-for-term, by `context-md.docs-test.ts`) and
 * `src/db/schema.ts`'s `hook_type_vocabulary` reference table (seeded from `HOOK_TYPES` at migration
 * time, then enforced by a real foreign key — never a second, hand-copied list) are DERIVED from this
 * one array, so the vocabulary cannot drift between the domain doc, the database, and this module.
 *
 * Pure: no disk, no network, no clock.
 */

/** One closed-vocabulary term: its stored value and its one-line meaning. */
export interface VocabularyTerm {
  readonly value: string;
  readonly meaning: string;
}

/**
 * The closed set of Hook Types, in a fixed, deliberate order (also the order `CONTEXT.md` and the
 * seeded `hook_type_vocabulary` table list them in). Adding an eleventh term is a real product
 * decision, not a data fix — it touches this array, `CONTEXT.md`'s glossary entry, and a NEW schema
 * migration (the seeded reference table's rows are written by migration 1; widening the set later is a
 * migration 2, not an edit to migration 1's SQL).
 */
export const HOOK_TYPES = [
  {
    value: "counter_intuitive",
    meaning: "The outcome runs against what you'd expect, and that gap is the hook.",
  },
  {
    value: "surprising_number",
    meaning: "One stark figure — a price, a count, a stat — carries the whole open.",
  },
  {
    value: "reframe",
    meaning: "A familiar thing is recast as something categorically different.",
  },
  {
    value: "contradiction",
    meaning: "Two facts that seem to conflict are placed side by side.",
  },
  {
    value: "underdog_upset",
    meaning: "A lesser-known challenger beats the established name at its own game.",
  },
  {
    value: "reversal",
    meaning: "Something assumed settled or safe is undone, walked back, or removed.",
  },
  {
    value: "skeptics_question",
    meaning: "Opens on doubt and promises an honest verdict, not the marketing.",
  },
  {
    value: "collision",
    meaning: "Two unrelated events landing in the same moment force a comparison.",
  },
  {
    value: "oddity",
    meaning: "One specific strange detail, out of pattern, demands an explanation.",
  },
  {
    value: "irony",
    meaning: "An actor's own action undercuts the thing they claim to stand for.",
  },
] as const satisfies readonly VocabularyTerm[];

/** The stored-value literal union, derived from `HOOK_TYPES` (never hand-duplicated). */
export type HookType = (typeof HOOK_TYPES)[number]["value"];

const HOOK_TYPE_VALUES: ReadonlySet<string> = new Set(HOOK_TYPES.map((t) => t.value));

/** True when `value` is one of the closed Hook Type values. */
export function isHookType(value: string): value is HookType {
  return HOOK_TYPE_VALUES.has(value);
}
