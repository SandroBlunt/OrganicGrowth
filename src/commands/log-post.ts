/**
 * `/log-post <brand> <idea-id> <recipe> <facebook-url> [posted-at]` command — orchestration shell
 * (Gate 3 — Publish; ADR-0011, issue #56).
 *
 * Attribution is keyed **(Idea, Recipe)** — a Post is linked to an Idea's Asset ONLY via the Operator
 * explicitly naming both the Idea and the Recipe; this command NEVER infers which of an Idea's Assets a
 * Post belongs to (always-rules #5). If `<recipe>` does not name one of the Idea's recorded Assets, the
 * command REFUSES and lists the Idea's actual Assets so the Operator can correct the call — it never
 * guesses "the only one" or "the most recent one".
 *
 * Thin: load the Idea's Assets from the Brand's ledger (`ledger.ts`'s already per-Asset `loadIdeas`),
 * apply the pure `planLogPost` decision, and — on success — write `post_url`/`posted_at` (and the
 * Asset's advanced status) onto THAT Asset via `AssetStore.writeAsset`. No Magnific, no Apify, no
 * network in this shell; it never touches the Space and never publishes anything itself (the Operator
 * already published — this command only logs the URL, ADR-0002).
 *
 * Brand is always explicit: `<brand>` is a required first argument. The Brand's ledger path is derived
 * via `resolveBrand(brand).ledger`. Omitting `<brand>` is a usage error, never a silent MundoTip
 * fallback (issue #20).
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadIdeas, findIdea, type LedgerIdea } from "../ledger/ledger.ts";
import { findAsset, type AssetStatus, type LedgerAssetRecord } from "../asset/asset.ts";
import { writeAsset } from "../asset/store.ts";
import { resolveBrand } from "../brand/resolver.ts";

/** Why a `/log-post` attempt was refused. */
export type LogPostRefusalReason = "unknown-idea" | "invalid-url" | "unknown-recipe" | "not-yet-produced";

/** The pure decision `/log-post` makes, given the Idea's own recorded Assets. Never infers. */
export type LogPostPlan =
  | { readonly ok: true; readonly asset: LedgerAssetRecord; readonly nextStatus: AssetStatus }
  | { readonly ok: false; readonly reason: "unknown-idea" }
  | { readonly ok: false; readonly reason: "invalid-url" }
  | { readonly ok: false; readonly reason: "unknown-recipe"; readonly assets: readonly LedgerAssetRecord[] }
  | { readonly ok: false; readonly reason: "not-yet-produced"; readonly asset: LedgerAssetRecord };

/**
 * Pure predicate: is `url` a `facebook.com` (or `*.facebook.com`) permalink? Rejects anything that does
 * not parse as an absolute http(s) URL. Mirrors `.claude/commands/log-post.md`'s guardrail — the
 * Operator states the URL; this command never accepts a guess.
 */
export function isFacebookPermalink(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return host === "facebook.com" || host.endsWith(".facebook.com");
}

/**
 * The AssetStatus a successful `/log-post` advances an Asset to. A freshly `produced` Asset becomes
 * `posted` (Gate 3 clears). An Asset already `posted`/`tracking`/`scored` keeps its own status — this
 * command only ever ADVANCES the status forward via `/track-performance`, never regresses it; a re-log
 * (e.g. correcting a typo'd URL) still updates `post_url`/`posted_at` without rewinding progress.
 */
function nextAssetStatus(current: AssetStatus): AssetStatus {
  return current === "produced" ? "posted" : current;
}

/**
 * Decide what `/log-post <recipe> <url>` should do against one Idea's own recorded Assets. Pure: no
 * I/O. `recipe` is matched EXACTLY against the Idea's Assets (`findAsset`) — never inferred, never
 * defaulted to "the only Asset" even when there is exactly one (explicit attribution, always-rules #5).
 *
 * @param idea    the Idea to log a Post against, or `null` if unknown
 * @param recipe  the Recipe slug naming WHICH Asset to attribute the Post to (required, explicit)
 * @param url     the Facebook permalink the Operator is logging
 */
export function planLogPost(idea: LedgerIdea | null, recipe: string, url: string): LogPostPlan {
  if (idea === null) return { ok: false, reason: "unknown-idea" };
  if (!isFacebookPermalink(url)) return { ok: false, reason: "invalid-url" };

  const assets = idea.assets ?? [];
  const asset = findAsset(assets, recipe);
  if (asset === null) {
    return { ok: false, reason: "unknown-recipe", assets };
  }
  if (asset.status === "queued" || asset.status === "in_production") {
    // No asset_url exists yet — there is nothing to publish, so nothing to log a Post against.
    return { ok: false, reason: "not-yet-produced", asset };
  }
  return { ok: true, asset, nextStatus: nextAssetStatus(asset.status) };
}

/** Format the Idea's recorded Assets for a refusal message — lists what IS available, never guesses. */
function describeAssets(assets: readonly LedgerAssetRecord[]): string {
  if (assets.length === 0) return "This Idea has no recorded Assets yet.";
  const list = assets.map((a) => `${a.recipe} (${a.status})`).join(", ");
  return `This Idea's Assets: ${list}.`;
}

/** Options for `/log-post` (injected paths + clock keep the shell testable without ambient I/O). */
export interface LogPostOptions {
  readonly ledgerPath?: string;
  /** Optional override for the brands root directory; defaults to `data/brands` (primarily testing). */
  readonly brandsRoot?: string;
  /** Injected clock for the default `posted_at`; defaults to now. */
  readonly now?: () => string;
}

/**
 * Produce the `/log-post` output string for a given Brand, Idea, Recipe, and Post URL (testable, no
 * printing). Writes `post_url`/`posted_at` (and the advanced Asset status) onto the NAMED Recipe's
 * Asset via `AssetStore.writeAsset` — never onto any other Asset the Idea might carry.
 *
 * @param brand      The Brand slug (e.g. `"mundotip"`). Required.
 * @param ideaId     The Idea's ledger id.
 * @param recipe     The Recipe slug naming WHICH of the Idea's Assets this Post belongs to. Required —
 *                   never inferred, never defaulted.
 * @param url        The Facebook permalink the Operator published to.
 * @param postedAt   Optional ISO-8601 override for `posted_at`; defaults to the injected/real clock.
 * @param options    Optional path/clock overrides for testing.
 */
export async function logPostCommand(
  brand: string,
  ideaId: string,
  recipe: string,
  url: string,
  postedAt: string | undefined,
  options: LogPostOptions = {},
): Promise<string> {
  const brandPaths = resolveBrand(brand, options.brandsRoot);
  const ledgerPath = options.ledgerPath ?? brandPaths.ledger;
  const now = (options.now ?? (() => new Date().toISOString()))();
  const resolvedPostedAt = postedAt ?? now;

  const idea = findIdea(await loadIdeas(ledgerPath, brand), ideaId);
  const plan = planLogPost(idea, recipe, url);

  if (!plan.ok) {
    switch (plan.reason) {
      case "unknown-idea":
        return `/log-post: unknown Idea ${ideaId} — no Post logged. [Brand: ${brand}]`;
      case "invalid-url":
        return `/log-post ${ideaId}: "${url}" is not a facebook.com permalink — no Post logged. [Brand: ${brand}]`;
      case "unknown-recipe":
        return `/log-post ${ideaId}: recipe "${recipe}" is not one of this Idea's Assets — refusing rather than guessing which Post it belongs to. ${describeAssets(plan.assets)} [Brand: ${brand}]`;
      case "not-yet-produced":
        return `/log-post ${ideaId}: the "${recipe}" Asset is not yet produced (status: ${plan.asset.status}) — nothing to publish yet. [Brand: ${brand}]`;
    }
  }

  await writeAsset(
    ideaId,
    recipe,
    { status: plan.nextStatus, post_url: url, posted_at: resolvedPostedAt },
    { ledgerPath },
  );

  return `/log-post ${ideaId}: linked Post ◀ Recipe "${recipe}" for Brand ${brand}. Run /track-performance ${brand} once engagement has accrued (give it a few days).`;
}

/**
 * CLI entry: print the log result. Only runs when invoked directly (e.g. `npm run log-post`).
 * Usage: `npm run log-post <brand> <idea-id> <recipe> <facebook-url> [posted-at]`.
 * Brand is required — omitting it is a usage error, never a silent MundoTip fallback (issue #20).
 *
 * Exported so tests can invoke the usage-error path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const [brand, ideaId, recipe, url, postedAt] = process.argv.slice(2);
  if (brand === undefined || ideaId === undefined || recipe === undefined || url === undefined) {
    process.stderr.write(
      "usage: npm run log-post <brand> <idea-id> <recipe> <facebook-url> [posted-at]\n" +
        "  e.g. npm run log-post mundotip idea-2026-W22-01 character-explainer-with-cast https://facebook.com/permalink/123\n",
    );
    process.exitCode = 1;
    return;
  }
  const output = await logPostCommand(brand, ideaId, recipe, url, postedAt, {});
  process.stdout.write(output + "\n");
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/log-post failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
