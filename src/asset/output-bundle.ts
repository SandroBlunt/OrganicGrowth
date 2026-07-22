/**
 * Output bundle — the Asset's self-contained publish + tracking folder (CONTEXT.md "Asset"; issue #112,
 * epic #106 item 13).
 *
 * Before this slice, an Asset's produced media sat in `idea-NN.<recipe>.assets/` while everything else
 * the Operator needs to actually publish and later track it (the composed Copy, the post URL, the
 * metrics/score) lived only inside `data/brands/<slug>/ledger.json`. This module makes the folder
 * self-contained: `idea-NN.<recipe>.output/` now holds the media (unchanged, in post order), a
 * paste-ready `caption.txt`, and `post.json`.
 *
 * **`post.json` is a GENERATED VIEW of the ledger, never a second, hand-maintained store** (always-rule
 * 7 — the ledger is canonical). There is exactly ONE function that assembles it, `generatePostJson`, and
 * it is PURE: given the same `(brand, idea, asset)` it always returns the same result, because it reads
 * nothing but its own arguments — no disk, no clock, no hidden state. That purity IS the idempotence
 * guarantee the acceptance criteria ask for: regenerating `post.json` from an unchanged ledger can never
 * drift, because there is no second input it could drift from. `refreshPostJson` is the ONE shell
 * every lifecycle step (produce, `/log-post`, `/track-performance`) calls to re-run that generator
 * against the ledger's current truth and write the result — never a bespoke write path of its own.
 *
 * **Backward compatible, by construction, with no filesystem migration.** `refreshPostJson` never
 * reconstructs a bundle directory from the Idea/run/Recipe by name — it resolves the directory an
 * Asset's OWN `asset_paths` already point into (`dirname` of the first entry). A brand-new Asset's
 * `asset_paths` point into a freshly-computed `.output/` directory (`outputDirFor` is the ONE call site
 * that picks that new name, used at produce time before any `asset_paths` exist yet); an Asset produced
 * before this slice keeps whatever directory it already has — typically an `.assets/`-named one — and
 * `refreshPostJson` keeps refreshing `post.json` there, in place. No folder is ever renamed and no
 * existing `asset_paths` entry is ever rewritten by this module.
 */

import { basename, dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

import { writeFileAtomic } from "../fs/safe-io.ts";
import { briefShortName } from "../production-spec/store.ts";
import { loadIdeas, findIdea, type LedgerIdea } from "../ledger/ledger.ts";
import { findAsset } from "./asset.ts";
import type { AssetMetrics, LedgerAssetRecord } from "./asset.ts";
import type { Copy } from "../copy/contract.ts";

// ---------------------------------------------------------------------------
// outputDirFor — the ONE place that picks the NEW ".output" name
// ---------------------------------------------------------------------------

/**
 * The on-disk directory a brand-new Asset's output bundle lives in:
 * `<ideasRoot>/<run>/idea-NN.<recipe>.output` — a sibling of the Brief and the Spec, mirroring
 * `src/production-spec/store.ts`'s `specPathFor`/`briefShortName` id/run/recipe convention exactly
 * (reusing `briefShortName` rather than re-deriving it), but with `.output` in place of `.spec.json`/
 * the retired `.assets`.
 *
 * This is the ONLY function in the codebase that picks the `.output` name — every other function here
 * resolves an EXISTING Asset's bundle directory from its own recorded `asset_paths` instead (see
 * `refreshPostJson`), which is what keeps a pre-this-slice Asset's `.assets/`-named folder working
 * with zero migration.
 */
export function outputDirFor(ideaId: string, run: string, ideasRoot: string, recipe: string): string {
  return join(ideasRoot, run, `${briefShortName(ideaId, run)}.${recipe}.output`);
}

// ---------------------------------------------------------------------------
// PostJson — the generated view's shape
// ---------------------------------------------------------------------------

/** `post.json`'s shape: a generated view of one Asset, never a second writable store. Every field not
 *  yet known is explicitly `null` (present as a key, never omitted) — the Operator always sees the full
 *  shape of what this bundle will eventually carry, not a moving set of keys. */
export interface PostJson {
  readonly brand: string;
  readonly idea_id: string;
  readonly recipe: string;
  readonly format: string | null;
  readonly copy: Copy | null;
  /** Ordered media FILENAMES only (never a full path) — the bundle folder is post.json's own sibling
   *  directory, so a bare filename is always enough to find it. Order mirrors `asset_paths` exactly
   *  (post order), never re-sorted. */
  readonly media: readonly string[];
  readonly post_url: string | null;
  readonly posted_at: string | null;
  readonly performance_score: number | null;
  readonly metrics: AssetMetrics | null;
  readonly tracked_at: string | null;
}

/** The narrow Idea shape `generatePostJson` needs — `LedgerIdea` already has exactly this shape, so no
 *  separate type is introduced; kept as a doc anchor for the two fields actually read. */
type PostJsonIdeaRef = Pick<LedgerIdea, "id" | "format">;

// ---------------------------------------------------------------------------
// generatePostJson — the ONE pure ledger -> bundle generator
// ---------------------------------------------------------------------------

/**
 * Build the ENTIRE `PostJson` view from only its three arguments. PURE: no disk, no clock, no hidden
 * state — calling this twice with equal arguments always returns deep-equal (but freshly-allocated,
 * never-shared) results. This is the ONLY function in the codebase that assembles a `PostJson`; no
 * other module constructs one by hand.
 */
export function generatePostJson(
  brand: string,
  idea: PostJsonIdeaRef,
  asset: LedgerAssetRecord,
): PostJson {
  return {
    brand,
    idea_id: idea.id,
    recipe: asset.recipe,
    format: idea.format ?? null,
    copy: asset.copy !== undefined ? { caption: asset.copy.caption, hashtags: [...asset.copy.hashtags] } : null,
    media: (asset.asset_paths ?? []).map((p) => basename(p)),
    post_url: asset.post_url ?? null,
    posted_at: asset.posted_at ?? null,
    performance_score: asset.performance_score ?? null,
    metrics: asset.metrics !== undefined ? { ...asset.metrics } : null,
    tracked_at: asset.tracked_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// captionText — paste-ready caption + hashtags
// ---------------------------------------------------------------------------

/**
 * Render a Copy as paste-ready text for `caption.txt`: the caption body, then — when there is at least
 * one hashtag — a blank line and the hashtags space-joined. Never rewrites the caption text itself.
 */
export function captionText(copy: Copy): string {
  const body = copy.caption.trimEnd();
  const hashtagLine = copy.hashtags.join(" ");
  return hashtagLine.length > 0 ? `${body}\n\n${hashtagLine}\n` : `${body}\n`;
}

// ---------------------------------------------------------------------------
// Shell: write to disk
// ---------------------------------------------------------------------------

/** Write `post.json` (pretty-printed, trailing newline) into `dir`, creating it if absent. Returns the
 *  written path. Uses the shared atomic writer so an interrupted write never leaves a half-written
 *  `post.json` on disk. */
export async function writePostJson(dir: string, postJson: PostJson): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, "post.json");
  await writeFileAtomic(path, JSON.stringify(postJson, null, 2) + "\n");
  return path;
}

/** Write `caption.txt` (`captionText(copy)`) into `dir`, creating it if absent. Returns the written
 *  path. */
export async function writeCaptionText(dir: string, copy: Copy): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, "caption.txt");
  await writeFileAtomic(path, captionText(copy));
  return path;
}

// ---------------------------------------------------------------------------
// Shell: refreshPostJson — the ONE call every lifecycle step makes
// ---------------------------------------------------------------------------

/** Options for `refreshPostJson` — mirrors `AssetStore`'s `AssetStoreOptions` shape (a required
 *  ledger path, no ambient default). */
export interface RefreshPostJsonOptions {
  readonly ledgerPath: string;
}

/** Why `refreshPostJson` could not refresh anything — it never throws for these; it returns one of
 *  these instead, mirroring the codebase's existing never-fabricate posture (`/log-post`'s
 *  `unknown-recipe` refusal, `/track-performance`'s SKIPPED lines). */
export type RefreshPostJsonResult =
  | { readonly ok: true; readonly dir: string; readonly path: string; readonly postJson: PostJson }
  | { readonly ok: false; readonly reason: "unknown-idea" }
  | { readonly ok: false; readonly reason: "unknown-recipe" }
  | { readonly ok: false; readonly reason: "no-local-media" };

/**
 * Load `(ideaId, recipe)`'s Asset fresh from the Brand's ledger, resolve ITS OWN bundle directory (the
 * `dirname` of its first `asset_paths` entry — never a name reconstructed from the Idea/run/recipe),
 * regenerate `post.json` via `generatePostJson`, and write it there.
 *
 * Never throws for an unresolvable target: an unknown Idea, a Recipe the Idea has no Asset for, or an
 * Asset with no `asset_paths` yet (nothing downloaded — there is no known local directory to write
 * into) all return `{ ok: false, reason }` and write no file. This is deliberately safe to call after
 * every ledger write that touches an Asset's record — a legacy or not-yet-produced Asset simply skips.
 */
export async function refreshPostJson(
  brand: string,
  ideaId: string,
  recipe: string,
  options: RefreshPostJsonOptions,
): Promise<RefreshPostJsonResult> {
  const ideas = await loadIdeas(options.ledgerPath, brand);
  const idea = findIdea(ideas, ideaId);
  if (idea === null) return { ok: false, reason: "unknown-idea" };

  const asset = findAsset(idea.assets ?? [], recipe);
  if (asset === null) return { ok: false, reason: "unknown-recipe" };

  const firstPath = asset.asset_paths?.[0];
  if (firstPath === undefined) return { ok: false, reason: "no-local-media" };

  const dir = dirname(firstPath);
  const postJson = generatePostJson(brand, idea, asset);
  const path = await writePostJson(dir, postJson);
  return { ok: true, dir, path, postJson };
}
