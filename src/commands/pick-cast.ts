/**
 * `/pick-cast <brand> <idea-id> <n>` command — orchestration shell (Gate 2 — Cast pick; ADR-0003 Phase B).
 *
 * Thin: load the Idea's recorded Cast from the Brand's ledger, select the **nth** Cast member (1-based
 * `<n>`, per the issue) as the chosen **Character**, and report it — recording the Operator's pick so
 * production resumes (the unattended Phase-B render against the live Space is the deferred worker slice;
 * the pure selection + the driver's `pinCharacter`/`pickAndRender` are exercised hermetically).
 *
 * All logic lives in the deep modules (`ledger.ts` for the read, the pure `selectCharacter` here for the
 * 1-based pick). No Magnific, no Apify, no network in this shell. An unknown Idea, an Idea with no Cast,
 * or an out-of-range `<n>` returns an identifiable, non-crashing message — it never invents a Character.
 *
 * Brand is always explicit: `<brand>` is a required first argument. The Brand's ledger path is derived
 * via `resolveBrand(brand).ledger`. The Production Queue is the shared global queue (brand-agnostic,
 * ADR-0004). Omitting `<brand>` is a usage error, never a silent MundoTip fallback (issue #20).
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadIdeaCast, loadIdeas, findIdea, type LedgerCastCandidate } from "../ledger/ledger.ts";
import { enqueueRender } from "../production-queue/queue.ts";
import { markCastConsumed } from "../production-queue/scheduler.ts";
import { loadQueue, saveQueue, DEFAULT_QUEUE_PATH } from "../production-queue/store.ts";
import { resolveBrand } from "../brand/resolver.ts";

/** The result of selecting a Character from a Cast: the chosen identifier, or an identifiable reason. */
export type SelectResult =
  | { readonly ok: true; readonly character: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Select the **nth** Cast member (1-based `<n>`) as the chosen Character. Pure: indexes into the Idea's
 * `cast` array; the chosen candidate's identifier IS the Character to pin. An out-of-range `n` (or an
 * empty Cast) returns an identifiable reason rather than throwing or inventing a Character.
 */
export function selectCharacter(cast: readonly LedgerCastCandidate[], n: number): SelectResult {
  if (!Number.isInteger(n) || n < 1 || n > cast.length) {
    return {
      ok: false,
      reason: `pick <n> must be between 1 and ${cast.length} (got ${n}); no Character selected.`,
    };
  }
  return { ok: true, character: cast[n - 1]!.identifier };
}

/** Options for `/pick-cast` (injected paths + clock keep the shell testable without ambient I/O). */
export interface PickCastOptions {
  readonly ledgerPath?: string;
  readonly queuePath?: string;
  /**
   * Optional override for the brands root directory; defaults to `data/brands`.
   * Primarily for testing: lets tests inject a temp directory so the resolver fallback
   * (`options.ledgerPath ?? resolveBrand(brand, brandsRoot).ledger`) is exercised without
   * touching real state. Only used when `ledgerPath` is not provided.
   */
  readonly brandsRoot?: string;
  /** Injected clock for the render job's `enqueued_at`; defaults to now. */
  readonly now?: () => string;
}

/**
 * Produce the `/pick-cast` output string for a given Brand, Idea, and pick (testable, no printing).
 *
 * Reads the Brand's ledger (via `resolveBrand(brand).ledger` or `options.ledgerPath` if provided),
 * selects the Character, and — on a valid pick — **enqueues the render** for that Idea (ADR-0004:
 * "picking a Cast enqueues the render"; idempotent per render job). The Production Queue is the global
 * brand-agnostic queue (ADR-0004, ADR-0006). The Producer worker drains that render against the Space
 * when it is free (the unattended Phase-B render). Never crashes on an unknown Idea, a missing Cast, or
 * an out-of-range pick — and never enqueues a render in those cases (no Character ⇒ no render).
 *
 * Brand is restated in the output so the Operator can see which Brand this pick applies to (Gate 2:
 * Cast pick, issue #20).
 *
 * @param brand   The Brand slug (e.g. `"mundotip"`). Required. The ledger path is derived from
 *                `resolveBrand(brand).ledger` unless `options.ledgerPath` overrides it.
 * @param ideaId  The Idea's ledger id.
 * @param n       1-based index of the Cast member to pick.
 * @param options Optional path/clock overrides for testing.
 */
export async function pickCastCommand(
  brand: string,
  ideaId: string,
  n: number,
  options: PickCastOptions = {},
): Promise<string> {
  const brandPaths = resolveBrand(brand, options.brandsRoot);
  const ledgerPath = options.ledgerPath ?? brandPaths.ledger;
  const queuePath = options.queuePath ?? DEFAULT_QUEUE_PATH;
  const now = (options.now ?? (() => new Date().toISOString()))();

  const cast = await loadIdeaCast(ideaId, ledgerPath);
  if (cast === null) {
    return `/pick-cast: no Cast recorded for Idea ${ideaId} (is it at the Cast gate?). No Character selected. [Brand: ${brand}]`;
  }

  // C23: refuse a pick unless the Idea is actually at the Cast gate (ledger status `casting`). A
  // `produced`/`posted` Idea still carries its `cast` on the ledger, so without this guard a stale
  // re-pick would happily enqueue a pointless render. The ledger is the source of truth for status.
  const idea = findIdea(await loadIdeas(ledgerPath, brand), ideaId);
  const status = idea?.status ?? "unknown";
  if (status !== "casting") {
    return `/pick-cast ${ideaId}: Idea is "${status}", not at the Cast gate (casting) — no pick recorded. [Brand: ${brand}]`;
  }

  const selected = selectCharacter(cast, n);
  if (!selected.ok) {
    return `/pick-cast ${ideaId}: ${selected.reason} [Brand: ${brand}]`;
  }

  // The Character is picked. Persist the pick onto the render job (C1) so it survives to the render,
  // and CLEAR the Cast gate (C24: markCastConsumed → the cast job becomes `done`). Both act on one
  // loaded queue state; the render job is stamped with the Brand (from the `brand` arg — AC6) and the
  // chosen Character. `enqueueRender` returns the SAME reference on an idempotent no-op, so a re-pick is
  // reported honestly rather than claiming work it did not do (C23).
  const queue = await loadQueue(queuePath);
  const withRender = enqueueRender(queue, ideaId, now, brand, selected.character);
  const newlyQueued = withRender !== queue;
  const consumed = markCastConsumed(withRender, brand, ideaId);
  await saveQueue(consumed.ok ? consumed.state : withRender, queuePath);

  if (!newlyQueued) {
    // Idempotent no-op: a render is already queued for this Idea, so this pick changed nothing. Report
    // the truth instead of claiming a fresh render was queued (C23) — the earlier pick still governs.
    return `/pick-cast ${ideaId}: a render is already queued for this Idea — no change; the earlier Character pick stands. [Brand: ${brand}]`;
  }
  return `/pick-cast ${ideaId}: picked Cast member ${n} — Character ${selected.character}. Resuming production (render queued). [Brand: ${brand}]`;
}

/**
 * CLI entry: print the pick result. Only runs when invoked directly (e.g. `npm run pick-cast`).
 * Usage: `npm run pick-cast <brand> <idea-id> <n>`.
 * Brand is required — omitting it is a usage error, never a silent MundoTip fallback (issue #20).
 *
 * Exported so tests can invoke the usage-error path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const [brand, ideaId, nRaw] = process.argv.slice(2);
  if (brand === undefined || ideaId === undefined || nRaw === undefined) {
    process.stderr.write("usage: npm run pick-cast <brand> <idea-id> <n>\n  e.g. npm run pick-cast mundotip idea-2026-W22-01 2\n");
    process.exitCode = 1;
    return;
  }
  const output = await pickCastCommand(brand, ideaId, Number(nRaw), {});
  process.stdout.write(output + "\n");
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/pick-cast failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
