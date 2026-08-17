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
 * `unclassified` (issue #219, Operator decision 2026-08-17) is one such member, not an exception to this
 * module's rule — it is the honest, queryable default `idea.hook_type` gets when no real technique
 * applies (today: the importer, issue #204, meets a Brief with no classifiable Hook concept). Keeping
 * `idea.hook_type` `NOT NULL` and adding this explicit value, rather than making the column nullable,
 * avoids conflating "not yet classified" with "has no hook to classify" — see `docs/adr/0029` and this
 * module's own `HOOK_TYPES` doc comment below for why widening the set is a NEW migration, not an edit
 * to an already-shipped one.
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
 * seeded `hook_type_vocabulary` table list them in). Adding a twelfth term is a real product
 * decision, not a data fix — it touches this array, `CONTEXT.md`'s glossary entry, and a NEW schema
 * migration (the original ten's rows are written by migration 1; `unclassified` — the eleventh — was
 * added by migration 2, issue #219; widening the set again later is a migration 3, never an edit to an
 * already-shipped migration's SQL).
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
  {
    value: "unclassified",
    meaning: "No classifiable Hook concept exists to categorize — the importer's honest default, never a guessed technique.",
  },
] as const satisfies readonly VocabularyTerm[];

/** The stored-value literal union, derived from `HOOK_TYPES` (never hand-duplicated). */
export type HookType = (typeof HOOK_TYPES)[number]["value"];

const HOOK_TYPE_VALUES: ReadonlySet<string> = new Set(HOOK_TYPES.map((t) => t.value));

/** True when `value` is one of the closed Hook Type values. */
export function isHookType(value: string): value is HookType {
  return HOOK_TYPE_VALUES.has(value);
}

/**
 * The sentinel Hook Type value the importer (issue #204) assigns to a Brief with no classifiable Hook
 * concept — an explicit, `NOT NULL`-friendly "not applicable" (never a guess standing in for one of the
 * other ten real techniques, and never conflated with "not yet classified"). Exported as its own named
 * constant, rather than left as a magic string every caller re-types, so #204's importer (and any future
 * caller) references this ONE value (issue #219, Operator decision 2026-08-17).
 */
export const UNCLASSIFIED_HOOK_TYPE: HookType = "unclassified";
