/**
 * The live `spaces_edit` WRITE-limit guard — pure deep module, no I/O. Mirrors `text-truncation.ts`'s
 * READ-side guard exactly (issue #207: "the read-side cap is already handled properly and is the
 * pattern to copy"), on the write side.
 *
 * --- WHY THIS EXISTS (issue #207, load-bearing) ---
 *
 * The MCP `spaces_edit` tool caps its `goal` query at a measured ~4,000 characters — established across
 * prior live Producer sessions (recorded operational knowledge; see this slice's Build Report for the
 * citation and the note that a FRESH live re-measurement + issue comment remains a separate, Operator-run
 * task — the `developer` build agent has no live Magnific MCP tools and cannot re-verify this itself,
 * CLAUDE.md). This is a SEPARATE cap from, and must never be confused with, the ~1,900-char READ
 * truncation `text-truncation.ts` guards (`READ_API_TRUNCATION_CAP`, `execution-protocol/protocol.ts`) —
 * one caps what you can WRITE in one call, the other caps what you can READ back from one node.
 *
 * A goal over the write cap is the failure mode this project has already been bitten by once live: a
 * spec that LOOKED injected but silently lost its tail. This guard makes that impossible by construction:
 * `LiveSpaceAdapter.edit()` (`./adapter.ts`) calls `assertWithinWriteLimit` on EVERY goal BEFORE it ever
 * reaches the transport (and therefore before any live MCP call, any credit, any board mutation) — a goal
 * that would exceed the cap is refused with a clear, typed error, never silently sent, never truncated.
 */

/** The measured live `spaces_edit` query cap, in characters (issue #207). */
export const SPACES_EDIT_WRITE_LIMIT_CHARS = 4000;

/**
 * Thrown by `assertWithinWriteLimit` when a goal exceeds the modelled write limit. Carries the exact
 * `length`/`limit` so a caller (or a test) can assert on the specific numbers, not just the fact of a
 * throw — "fail clearly", not just "fail".
 */
export class WriteLimitExceededError extends Error {
  public readonly length: number;
  public readonly limit: number;

  constructor(length: number, limit: number, context: string) {
    super(
      `spaces_edit write limit exceeded: ${context} is ${length} chars, over the modelled ${limit}-char ` +
        "cap (issue #207) — refusing to send it live rather than silently truncating it.",
    );
    this.name = "WriteLimitExceededError";
    this.length = length;
    this.limit = limit;
  }
}

/** Whether `goal` exceeds `limit` (default {@link SPACES_EDIT_WRITE_LIMIT_CHARS}). At-the-limit is OK. */
export function exceedsWriteLimit(goal: string, limit: number = SPACES_EDIT_WRITE_LIMIT_CHARS): boolean {
  return goal.length > limit;
}

/**
 * Throws {@link WriteLimitExceededError} when `goal` exceeds `limit`; a no-op otherwise. `context`
 * names WHAT is being checked (e.g. `"edit() goal"`, or a specific chunk's description) so the thrown
 * message is actionable, never a bare number.
 */
export function assertWithinWriteLimit(
  goal: string,
  context: string,
  limit: number = SPACES_EDIT_WRITE_LIMIT_CHARS,
): void {
  if (exceedsWriteLimit(goal, limit)) {
    throw new WriteLimitExceededError(goal.length, limit, context);
  }
}
