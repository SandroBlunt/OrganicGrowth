/**
 * `/pick <brand> <idea-id> <recipe> <gate> <pick>` — the GENERIC pick/resume command (ADR-0010,
 * issue #57).
 *
 * A Recipe declares zero, one, or several human pick-gates (`Recipe.gates`, `src/recipe/registry.ts`).
 * This command submits the Operator's RESOLVED pick for any one of them — for ANY wired Recipe, not only
 * the *Character Explainer with Cast* Recipe's Cast gate — and resumes production by enqueueing the
 * queue's generic NEXT LEG (`enqueueNextLeg`, issue #56), keyed on the composite
 * `(brand, idea_id, recipe)`, then clearing the gate (`markPickConsumed`).
 *
 * Unlike `/pick-cast` (`src/commands/pick-cast.ts`), this command takes the RESOLVED pick value
 * DIRECTLY — it never reads a Recipe's own candidate list off the ledger (e.g. the Cast Recipe's
 * `cast` field) to turn a friendlier 1-based index into a candidate identifier. Mapping an index (or any
 * other Recipe-specific selection UX) to a resolved pick is each Recipe's OWN concern; `/pick-cast` is
 * exactly that mapping for the wired Recipe's Cast gate, and it DELEGATES its queue-resume mechanics to
 * `resumeGate` below so the two commands can never drift on how a pick actually resumes production.
 *
 * This module never reads the ledger and never touches the Magnific Space — it only reads/writes the
 * global Production Queue (`data/queue.json`, ADR-0006/0008). No Magnific, no Apify, no network.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { enqueueNextLeg } from "../production-queue/queue.ts";
import { markPickConsumed } from "../production-queue/scheduler.ts";
import { loadQueue, saveQueue, DEFAULT_QUEUE_PATH } from "../production-queue/store.ts";
import { getRecipe } from "../recipe/registry.ts";

/**
 * The gate a Recipe's job targets AFTER `gate` clears, or `null` when `gate` was the Recipe's LAST gate
 * (the next leg renders the Asset with no further pause). Resolved from the Recipe registry so the
 * queue's generic gate cursor (issue #56) is driven by the Recipe's REAL gate list, never a hard-coded
 * assumption. An unwired/unknown Recipe, or a `gate` absent from that Recipe's own list, defensively
 * resolves to `null` — production only ever reaches this for a wired Recipe with a real gate, so this is
 * a belt-and-braces fallback, never a live path.
 */
export function nextGateAfter(recipe: string, gate: string): string | null {
  const def = getRecipe(recipe);
  if (def === null) return null;
  const index = def.gates.indexOf(gate);
  if (index === -1) return null;
  return def.gates[index + 1] ?? null;
}

/** The queue-mechanics outcome of resuming one gate: whether a NEW next-leg job was queued, and which
 *  gate it targets (`null` = the final, Asset-rendering leg). */
export interface ResumeGateResult {
  readonly newlyQueued: boolean;
  readonly nextGate: string | null;
}

/**
 * The GENERIC gate-resume mechanics shared by `/pick-cast` and the generic `/pick` command (ADR-0010):
 * enqueue the queue's next leg for `(brand, idea_id, recipe)` carrying the Operator's resolved `pick`,
 * targeting the gate AFTER `gate` in the Recipe's own declared order (or `null` for the final leg), then
 * clear `gate` (`markPickConsumed` moves its `awaiting_pick` job to `done`, C24). Idempotent: a next-leg
 * job already queued for the resolved target gate is left untouched (`newlyQueued: false`) rather than
 * duplicated. This function never reads the ledger — the CALLER (a Recipe-specific command like
 * `/pick-cast`) owns validating that the pick itself is legitimate (e.g. that the Idea actually has a
 * candidate at this gate); this function only ever performs the QUEUE-side resume.
 */
export async function resumeGate(
  brand: string,
  ideaId: string,
  recipe: string,
  gate: string,
  pick: string,
  queuePath: string,
  now: string,
): Promise<ResumeGateResult> {
  const nextGate = nextGateAfter(recipe, gate);
  const queue = await loadQueue(queuePath);
  const withNextLeg = enqueueNextLeg(queue, ideaId, now, brand, recipe, nextGate, pick);
  const newlyQueued = withNextLeg !== queue;
  const consumed = markPickConsumed(withNextLeg, brand, ideaId, recipe);
  await saveQueue(consumed.ok ? consumed.state : withNextLeg, queuePath);
  return { newlyQueued, nextGate };
}

/** Options for `/pick` (injected paths + clock keep the shell testable without ambient I/O). */
export interface PickOptions {
  readonly queuePath?: string;
  /** Injected clock for the next-leg job's `enqueued_at`; defaults to now. */
  readonly now?: () => string;
}

/**
 * Produce the `/pick` output string for a given Brand/Idea/Recipe/gate/pick (testable, no printing).
 *
 * Submits the Operator's resolved `pick` for `gate` and resumes production by enqueueing the queue's
 * generic next leg (`resumeGate`) — works for ANY wired Recipe's ANY declared gate, keyed on the
 * composite `(brand, idea_id, recipe)` (issue #56). Never reads or writes the ledger; the Brand's
 * ledger stays the source of truth for WHICH candidates a gate actually offered (that check is each
 * Recipe's own command's job, e.g. `/pick-cast`).
 *
 * @param brand   The Brand slug (e.g. `"mundotip"`). Required — restated in the output.
 * @param ideaId  The Idea's ledger id.
 * @param recipe  The chosen Recipe slug this pick resolves (`src/recipe/registry.ts`).
 * @param gate    The gate NAME this pick resolves.
 * @param pick    The Operator's resolved pick — a candidate identifier from that gate.
 * @param options Optional path/clock overrides for testing.
 */
export async function pickCommand(
  brand: string,
  ideaId: string,
  recipe: string,
  gate: string,
  pick: string,
  options: PickOptions = {},
): Promise<string> {
  if (pick.trim() === "") {
    return `/pick ${ideaId}: a pick value is required. [Brand: ${brand}]`;
  }
  const queuePath = options.queuePath ?? DEFAULT_QUEUE_PATH;
  const now = (options.now ?? (() => new Date().toISOString()))();

  const { newlyQueued, nextGate } = await resumeGate(brand, ideaId, recipe, gate, pick, queuePath, now);

  if (!newlyQueued) {
    return `/pick ${ideaId}: a next leg is already queued for gate "${gate}" (recipe "${recipe}") — no change; the earlier pick stands. [Brand: ${brand}]`;
  }
  const target = nextGate === null ? "the final render" : `gate "${nextGate}"`;
  return `/pick ${ideaId}: recorded pick "${pick}" for gate "${gate}" (recipe "${recipe}") — resuming production toward ${target}. [Brand: ${brand}]`;
}

/**
 * CLI entry: print the pick result. Only runs when invoked directly (e.g. `npm run pick`).
 * Usage: `npm run pick <brand> <idea-id> <recipe> <gate> <pick>`.
 *
 * Exported so tests can invoke the usage-error path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const [brand, ideaId, recipe, gate, pick] = process.argv.slice(2);
  if (brand === undefined || ideaId === undefined || recipe === undefined || gate === undefined || pick === undefined) {
    process.stderr.write(
      "usage: npm run pick <brand> <idea-id> <recipe> <gate> <pick>\n  e.g. npm run pick mundotip idea-2026-W22-01 character-explainer-with-cast cast cast-2\n",
    );
    process.exitCode = 1;
    return;
  }
  const output = await pickCommand(brand, ideaId, recipe, gate, pick, {});
  process.stdout.write(output + "\n");
}

// C41: compare resolved paths, not a hand-built `file://` string (the latter breaks on paths with
// spaces, percent-encoded in `import.meta.url`, or symlinks, silently making a direct run a no-op).
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/pick failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
