/**
 * Attribution write — the ONE way a Post gets linked to an Idea's Recipe Asset and that Asset advances
 * `produced -> posted` (ADR-0011, always-rules #5, issue #162/ADR-0020).
 *
 * Before this slice, that write lived inline inside `src/commands/log-post.ts`'s `logPostCommand` —
 * the Operator's own manual path. ADR-0020 adds a SECOND caller: the confirmed-live auto-log path
 * (`src/schedule-batch/confirmed-live.ts`) that logs a Post automatically once Zoho reports it live,
 * for an Asset scheduled through the MCP path. Both callers must have the EXACT same effect — write
 * `post_url`/`posted_at` (and the advanced status) onto the named `(idea, recipe)` Asset via the typed
 * `AssetStore`, then refresh that Asset's output-bundle `post.json` (issue #112) — so this module is the
 * ONE shared write both go through. There is deliberately no second, subtly different
 * produced -> posted transition anywhere in the codebase.
 */

import { writeAsset } from "./store.ts";
import { refreshPostJson } from "./output-bundle.ts";
import type { AssetStatus } from "./asset.ts";

/**
 * The `AssetStatus` a successful attribution write advances an Asset to. A freshly `produced` Asset
 * becomes `posted`. An Asset already `posted`/`tracking`/`scored` keeps its own status — an attribution
 * write only ever ADVANCES the status forward (via `/track-performance`), never regresses it: a re-log
 * (correcting a URL, or a later confirmed-live check running again) never rewinds progress.
 */
export function nextAttributedStatus(current: AssetStatus): AssetStatus {
  return current === "produced" ? "posted" : current;
}

/** What to write onto the named `(idea, recipe)` Asset. */
export interface AttributedPostWrite {
  readonly ideaId: string;
  readonly recipe: string;
  readonly nextStatus: AssetStatus;
  readonly postUrl: string;
  readonly postedAt: string;
}

/** Options for `writeAttributedPost` — a required ledger path, no ambient default. */
export interface AttributionWriteOptions {
  readonly ledgerPath: string;
}

/**
 * Write `post_url`/`posted_at` (and the advanced status) onto the named `(idea, recipe)` Asset via
 * `AssetStore.writeAsset`, then refresh that Asset's output-bundle `post.json`
 * (`src/asset/output-bundle.ts`'s `refreshPostJson`, issue #112) so it reflects the just-logged URL/time
 * immediately. The refresh is a silent side effect: an Asset with no known local bundle directory yet is
 * skipped cleanly by `refreshPostJson` itself — this function never throws because of that.
 */
export async function writeAttributedPost(
  brand: string,
  write: AttributedPostWrite,
  options: AttributionWriteOptions,
): Promise<void> {
  await writeAsset(
    write.ideaId,
    write.recipe,
    { status: write.nextStatus, post_url: write.postUrl, posted_at: write.postedAt },
    { ledgerPath: options.ledgerPath },
  );

  await refreshPostJson(brand, write.ideaId, write.recipe, { ledgerPath: options.ledgerPath });
}
