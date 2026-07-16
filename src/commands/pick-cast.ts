/**
 * `/pick-cast <brand> <idea-id> <n>` command — orchestration shell (Gate 2 — Cast pick; ADR-0003
 * Phase B; re-grained onto the Asset in issue #55 / ADR-0011; the queue re-grained onto
 * `(brand, idea, recipe)` in issue #56).
 *
 * Thin: load the Idea's recorded Cast from the Brand's ledger, select the **nth** Cast member (1-based
 * `<n>`, per the issue) as the chosen **Character**, and report it — recording the Operator's pick so
 * production resumes (the attended Phase-B render against the live Space happens when the Producer
 * resumes the job in the Operator's session, ADR-0008; the pure selection + the driver's
 * `pinCharacter`/`pickAndRender` are exercised hermetically here).
 *
 * As of issue #55, the Cast gate lives on the *Character Explainer with Cast* Recipe's own Asset, not
 * on a flat Idea status: an Idea is "at the Cast gate" when one of its Assets is
 * `in_production`/`pending_gate: "cast"` (`ideaAtGate`, `src/asset/asset.ts`), and the Cast candidates
 * to pick from are read off THAT Asset's own `cast` field (`findGateCandidateAsset` below) — the
 * retired top-level `idea.status === "casting"` / `idea.cast` scalars are never read directly here.
 * `ledger.ts`'s `loadIdeas` normalizes an un-migrated ledger transparently on the way in (ADR-0011), so
 * this shell needs no separate legacy-fallback path of its own.
 *
 * This command stays Cast-only scoped (its own doc's "Target" note: generalizing to any Recipe's own
 * pick-gate is issue #57's generic driver, not this slice). What DOES change here (issue #56): the
 * enqueued next-leg job carries the RESOLVED Asset's own `recipe`, never inferred when more than one
 * Asset could be at the gate — `findGateCandidateAsset` REFUSES with an identifiable message (never
 * guesses) when more than one of the Idea's Assets is paused at the Cast gate at once (a future
 * multi-Recipe scenario; today's one wired Recipe means this can only happen via a hand-edited ledger).
 *
 * All logic lives in the deep modules (`ledger.ts` for the read, `asset/asset.ts` for the gate/roll-up
 * folding, the pure `selectCharacter` here for the 1-based pick). No Magnific, no Apify, no network in
 * this shell. An unknown Idea, an Idea with no Cast, or an out-of-range `<n>` returns an identifiable,
 * non-crashing message — it never invents a Character.
 *
 * Brand is always explicit: `<brand>` is a required first argument. The Brand's ledger path is derived
 * via `resolveBrand(brand).ledger`. The Production Queue is the shared global queue (brand-agnostic,
 * ADR-0006/0008). Omitting `<brand>` is a usage error, never a silent MundoTip fallback (issue #20).
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadIdeas, findIdea, type LedgerIdea } from "../ledger/ledger.ts";
import { ideaAtGate, deriveIdeaRollup, type LedgerAssetRecord, type LedgerCastCandidate } from "../asset/asset.ts";
import { getRecipe } from "../recipe/registry.ts";
import { enqueueNextLeg } from "../production-queue/queue.ts";
import { markPickConsumed } from "../production-queue/scheduler.ts";
import { loadQueue, saveQueue, DEFAULT_QUEUE_PATH } from "../production-queue/store.ts";
import { resolveBrand } from "../brand/resolver.ts";

/** The Cast gate's name — this command stays scoped to the *Character Explainer with Cast* Recipe's
 *  own gate (its Target note: generalizing to any Recipe's own gate is issue #57). */
const CAST_GATE = "cast";

/** The result of selecting a Character from a Cast: the chosen identifier, or an identifiable reason. */
export type SelectResult =
  | { readonly ok: true; readonly character: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Select the **nth** Cast member (1-based `<n>`) as the chosen Character. Pure: indexes into the
 * Cast candidate array; the chosen candidate's identifier IS the Character to pin. An out-of-range
 * `n` (or an empty Cast) returns an identifiable reason rather than throwing or inventing a Character.
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

/** Every Asset currently PAUSED at the Cast gate (`in_production`/`pending_gate: "cast"`). Normally at
 *  most one (only one Recipe is wired today); may hold several once a second Cast-gated Recipe exists
 *  (issue #60) — the caller refuses rather than guessing which one when this has more than one entry. */
function assetsAtCastGate(idea: LedgerIdea): readonly LedgerAssetRecord[] {
  return (idea.assets ?? []).filter((a) => a.status === "in_production" && a.pending_gate === CAST_GATE);
}

/**
 * The Asset whose Cast candidates `/pick-cast` should read: prefer the SOLE Asset actually PAUSED at
 * the Cast gate (the correct, current case); fall back to any Asset that still carries `cast`
 * candidates even though production has moved on (mirrors the pre-#55 behavior of reading `idea.cast`
 * regardless of status, so a stale re-pick against a `produced` Idea still names its recorded Cast in
 * the refusal message). Returns `null` when neither exists — never invents a Character. The caller
 * (`pickCastCommand`) refuses BEFORE reaching here when `atGate` holds more than one Asset (never
 * guesses which Recipe's gate the Operator means).
 */
function findGateCandidateAsset(
  idea: LedgerIdea,
  atGate: readonly LedgerAssetRecord[],
): LedgerAssetRecord | null {
  if (atGate.length === 1) return atGate[0]!;
  return (idea.assets ?? []).find((a) => a.cast !== undefined) ?? null;
}

/**
 * The gate a Recipe's job targets AFTER `gate` clears, or `null` when `gate` was the Recipe's LAST
 * gate (the next leg renders the Asset with no further pause). Resolves via the Recipe registry so the
 * queue's generic gate cursor (issue #56) is driven by the Recipe's REAL gate list, not a hard-coded
 * assumption. An unwired/unknown Recipe defensively resolves to `null` — production only ever reaches
 * this point for a wired Recipe, so this is a belt-and-braces fallback, never a live path.
 */
function nextGateAfter(recipe: string, gate: string): string | null {
  const def = getRecipe(recipe);
  if (def === null) return null;
  const index = def.gates.indexOf(gate);
  if (index === -1) return null;
  return def.gates[index + 1] ?? null;
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
  /** Injected clock for the next-leg job's `enqueued_at`; defaults to now. */
  readonly now?: () => string;
}

/**
 * Produce the `/pick-cast` output string for a given Brand, Idea, and pick (testable, no printing).
 *
 * Reads the Brand's ledger (via `resolveBrand(brand).ledger` or `options.ledgerPath` if provided),
 * selects the Character, and — on a valid pick — **enqueues the next leg** for that
 * `(idea, recipe)` (ADR-0008: "picking a Cast enqueues the next leg"; idempotent per next-leg job,
 * issue #56). The Production Queue is the global brand-agnostic queue (ADR-0006/0008). The Producer
 * drives that next leg against the Space in the Operator's own session when it resumes the job (the
 * attended Phase-B render — there is no background worker). Never crashes on an unknown Idea, a
 * missing Cast, or an out-of-range pick — and never enqueues a next leg in those cases (no Character
 * ⇒ no next leg).
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

  const idea = findIdea(await loadIdeas(ledgerPath, brand), ideaId);
  if (idea === null) {
    return `/pick-cast: no Cast recorded for Idea ${ideaId} (is it at the Cast gate?). No Character selected. [Brand: ${brand}]`;
  }

  const atGate = assetsAtCastGate(idea);
  if (atGate.length > 1) {
    // Explicit attribution (always-rules #5): never guess which Recipe's gate the Operator means when
    // several are paused at once. Disambiguating this conversationally is issue #57's generic driver.
    const recipes = atGate.map((a) => a.recipe).join(", ");
    return `/pick-cast ${ideaId}: MULTIPLE Assets are paused at the Cast gate (${recipes}) — refusing to guess which one. [Brand: ${brand}]`;
  }

  const candidateAsset = findGateCandidateAsset(idea, atGate);
  if (candidateAsset === null || candidateAsset.cast === undefined) {
    return `/pick-cast: no Cast recorded for Idea ${ideaId} (is it at the Cast gate?). No Character selected. [Brand: ${brand}]`;
  }
  const cast = candidateAsset.cast;

  // C23: refuse a pick unless the Idea actually has an Asset paused at the Cast gate. An Idea whose
  // Asset has moved on (e.g. `produced`) still carries its recorded `cast`, so without this guard a
  // stale re-pick would happily enqueue a pointless render. The ledger is the source of truth.
  if (!ideaAtGate(idea, CAST_GATE)) {
    const rollup = deriveIdeaRollup(idea.status, idea.assets ?? []);
    return `/pick-cast ${ideaId}: Idea is "${rollup}", not at the Cast gate (casting) — no pick recorded. [Brand: ${brand}]`;
  }

  const selected = selectCharacter(cast, n);
  if (!selected.ok) {
    return `/pick-cast ${ideaId}: ${selected.reason} [Brand: ${brand}]`;
  }

  // The Character is picked. Persist the pick onto the next-leg job (C1, generalized) so it survives to
  // the render, and CLEAR the Cast gate (C24: markPickConsumed → the gated job becomes `done`). Both act
  // on one loaded queue state; the next-leg job is stamped with the Brand (AC6), the RESOLVED Asset's
  // own Recipe (issue #56 — never a different Recipe's job), and the chosen Character. `enqueueNextLeg`
  // returns the SAME reference on an idempotent no-op, so a re-pick is reported honestly rather than
  // claiming work it did not do (C23).
  const recipe = candidateAsset.recipe;
  const nextGate = nextGateAfter(recipe, CAST_GATE);
  const queue = await loadQueue(queuePath);
  const withNextLeg = enqueueNextLeg(queue, ideaId, now, brand, recipe, nextGate, selected.character);
  const newlyQueued = withNextLeg !== queue;
  const consumed = markPickConsumed(withNextLeg, brand, ideaId, recipe);
  await saveQueue(consumed.ok ? consumed.state : withNextLeg, queuePath);

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
