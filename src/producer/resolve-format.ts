/**
 * Resolve an Idea's **Format** from its ledger record — pure deep module (issue #88, ADR-0009/0013).
 *
 * The thin, recipe-generic Producer needs to know which Format governs an Idea's production (its
 * voice, its Baseline Prompt document, its `default_recipes`) before it can run a Recipe's Skill. The
 * ledger's `LedgerIdea.format` field (`src/ledger/ledger.ts`) already carries this through read-only;
 * this module is the ONE place that decides what to do when it's missing — a real, expected case for
 * any Idea recorded before multi-format existed (e.g. every real MundoTip Idea today).
 *
 * Never crashes, never guesses/defaults a Format (data-handling rule 4; always-rule 8 "never
 * fabricate"): a missing/blank `format` is an explicit STOP condition the caller (the Producer's
 * conductor, `.claude/agents/producer.md`) reports to the Operator, exactly like a missing required
 * media slot (ADR-0016) or a missing Space.
 */

/** The narrow shape this module needs from a ledger Idea record — avoids importing `LedgerIdea` (and
 *  therefore the whole ledger module) into this small, pure deep module. */
export interface IdeaFormatInput {
  readonly format?: string;
}

/** The result of resolving one Idea's Format: found, or a clear reason it wasn't. */
export type ResolveIdeaFormatResult =
  | { readonly ok: true; readonly format: string }
  | { readonly ok: false; readonly message: string };

/**
 * Resolve `idea`'s Format slug, or a STOP result naming `ideaId` and explaining why (a missing/blank
 * `format` — never a crash, never a fabricated default). Pure: no I/O, no ledger read here — the
 * caller already has the loaded `LedgerIdea` (`src/ledger/ledger.ts`'s `loadIdeas`/`findIdea`).
 */
export function resolveIdeaFormat(idea: IdeaFormatInput, ideaId: string): ResolveIdeaFormatResult {
  const format = idea.format;
  if (typeof format === "string" && format.trim().length > 0) {
    return { ok: true, format: format.trim() };
  }
  return {
    ok: false,
    message:
      `Idea "${ideaId}" carries no Format on its ledger record — expected for an Idea accepted ` +
      "before multi-format existed (ADR-0009/0013). STOP and ask the Operator which Format to " +
      "produce it under; never guess one.",
  };
}
