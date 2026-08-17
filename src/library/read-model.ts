/**
 * The Library's read model — a thin, impure shell over the existing typed store layer (issue #210,
 * `docs/adr/0029`). Every query here composes an ALREADY-EXISTING (or, where genuinely missing, newly
 * added right beside its siblings — `listAllAssets`/`listAllJobs`/`listAllPosts`) typed store read
 * function — never a raw SQL join written in this file, and never `ledger.json`.
 *
 * This module builds VIEW-MODEL data (`./types.ts`); it never renders HTML (`render/**` does that, from
 * plain data, with no database in scope) and never writes anything — every function here only ever
 * calls a store's READ exports, so this module trips neither the `node:fs` boundary guard nor the
 * store-write boundary guard by construction (both scope to WRITES; see `src/store-write-boundary/
 * scan.ts`'s own doc comment, "Scope: writes only, never reads").
 *
 * Given today's real, imported database, this composes cheaply: 54 Assets, 61 Ideas, 66 Jobs, 7 Posts —
 * the small per-row lookups below (an Idea's Format, a Format's Brand, a Post's latest score) are a
 * deliberate, readable N+1 rather than a hand-rolled SQL join, exactly because the real data is this
 * small (see this ticket's Build Report).
 */

import type { DatabaseSync } from "node:sqlite";

import { listAllAssets, getAssetById, listAssetMedia, type DbAssetRecord } from "../asset/store.ts";
import { getIdea, listAllIdeas, type IdeaRecord } from "../idea/store.ts";
import { getFormatById, type FormatDbRecord } from "../format/store.ts";
import { getBrandById, type BrandRecord } from "../brand/store.ts";
import { getRecipe } from "../recipe/registry.ts";
import { getChannel } from "../channel/store.ts";
import { listPostsForAsset, listAllPosts, type PostRecord } from "../post/store.ts";
import { latestPerformanceScoreForPost, listPerformanceScoresForPost, listMetricSnapshotsForPost } from "../performance/store.ts";
import { listCopyVariants } from "../copy/store.ts";
import { listAllJobs, type JobRecord } from "../production-queue/job-store.ts";
import { classifyQueueRow } from "./queue-classify.ts";
import type {
  LibraryAssetRow,
  LibraryPostSummary,
  AssetDetailView,
  AssetMediaView,
  AssetPostView,
  CopyVariantView,
  QueueRow,
  FitPerformanceData,
  FitPerformancePoint,
} from "./types.ts";

/** A small memoizing lookup so resolving the SAME Idea/Format/Brand id repeatedly (many Assets share one
 *  Idea's Format/Brand) does not re-run the same `SELECT ... WHERE id = ?` on every row. */
class Lookups {
  private readonly ideas = new Map<string, IdeaRecord | null>();
  private readonly formats = new Map<string, FormatDbRecord | null>();
  private readonly brands = new Map<string, BrandRecord | null>();

  constructor(private readonly db: DatabaseSync) {}

  idea(id: string): IdeaRecord | null {
    if (!this.ideas.has(id)) this.ideas.set(id, getIdea(this.db, id));
    return this.ideas.get(id)!;
  }

  format(id: string): FormatDbRecord | null {
    if (!this.formats.has(id)) this.formats.set(id, getFormatById(this.db, id));
    return this.formats.get(id)!;
  }

  brand(id: string): BrandRecord | null {
    if (!this.brands.has(id)) this.brands.set(id, getBrandById(this.db, id));
    return this.brands.get(id)!;
  }
}

/** The best (highest) LATEST Performance Score across every Post an Asset has, or `undefined` when it
 *  has no Post, or every Post it has has never been scored — never fabricated as `0`. */
function bestPerformanceScoreForAsset(db: DatabaseSync, posts: readonly PostRecord[]): number | undefined {
  let best: number | undefined;
  for (const post of posts) {
    const latest = latestPerformanceScoreForPost(db, post.id);
    if (latest !== null && (best === undefined || latest.score > best)) {
      best = latest.score;
    }
  }
  return best;
}

function postSummaries(db: DatabaseSync, posts: readonly PostRecord[]): readonly LibraryPostSummary[] {
  return posts.map((post) => {
    const channel = getChannel(db, post.channelId);
    const latest = latestPerformanceScoreForPost(db, post.id);
    return {
      channelPlatform: channel?.platform ?? "facebook",
      postUrl: post.postUrl,
      ...(latest !== null ? { performanceScore: latest.score } : {}),
    };
  });
}

/** Builds one `LibraryAssetRow` for `asset`, or `null` when its Idea/Format/Brand cannot be resolved
 *  (an orphaned row the schema's own FOREIGN KEYs should make impossible in practice — this function
 *  degrades gracefully rather than throwing and blanking the whole screen for one bad row). */
function toLibraryRow(db: DatabaseSync, asset: DbAssetRecord, lookups: Lookups): LibraryAssetRow | null {
  const idea = lookups.idea(asset.ideaId);
  if (idea === null) return null;
  const format = lookups.format(idea.formatId);
  const brand = lookups.brand(idea.brandId);
  const recipe = getRecipe(asset.recipe);
  const posts = listPostsForAsset(db, asset.id);
  const media = listAssetMedia(db, asset.id);
  const bestScore = bestPerformanceScoreForAsset(db, posts);

  return {
    assetId: asset.id,
    ideaId: idea.id,
    ideaTitle: idea.title,
    hookType: idea.hookType,
    theme: idea.theme,
    ...(idea.fitScore !== undefined ? { fitScore: idea.fitScore } : {}),
    recipeSlug: asset.recipe,
    recipeName: recipe?.name ?? asset.recipe,
    formatSlug: format?.slug ?? idea.formatId,
    formatName: format?.name ?? idea.formatId,
    brandSlug: brand?.slug ?? idea.brandId,
    brandName: brand?.name ?? idea.brandId,
    status: asset.status,
    ...(asset.pending_gate !== undefined ? { pendingGate: asset.pending_gate } : {}),
    ...(asset.produced_at !== undefined ? { producedAt: asset.produced_at } : {}),
    hasSpec: asset.spec !== undefined,
    mediaCount: media.length,
    posts: postSummaries(db, posts),
    ...(bestScore !== undefined ? { bestPerformanceScore: bestScore } : {}),
  };
}

/** Every Asset in the database, as one `LibraryAssetRow` each — the Library screen's whole dataset
 *  (AC2: "lists every Asset"). Filtering/sorting happen AFTER this, in `filter-sort.ts`, on the
 *  already-fetched array — this function's own job is exactly "fetch and join", nothing else. */
export function buildLibraryIndex(db: DatabaseSync): readonly LibraryAssetRow[] {
  const lookups = new Lookups(db);
  const rows: LibraryAssetRow[] = [];
  for (const asset of listAllAssets(db)) {
    const row = toLibraryRow(db, asset, lookups);
    if (row !== null) rows.push(row);
  }
  return rows;
}

/** Everything AC4 asks the Asset page to show TOGETHER, for one Asset — `null` for an unknown id (or an
 *  Asset whose Idea cannot be resolved). */
export function getAssetDetail(db: DatabaseSync, assetId: string): AssetDetailView | null {
  const asset = getAssetById(db, assetId);
  if (asset === null) return null;
  const idea = getIdea(db, asset.ideaId);
  if (idea === null) return null;
  const format = getFormatById(db, idea.formatId);
  const brand = getBrandById(db, idea.brandId);
  const recipe = getRecipe(asset.recipe);

  const media: readonly AssetMediaView[] = listAssetMedia(db, assetId).map((m) => ({
    id: m.id,
    ordinal: m.ordinal,
    kind: m.kind,
    mime: m.mime,
    bytes: m.bytes,
  }));

  const copyVariants: readonly CopyVariantView[] = listCopyVariants(db, assetId).map((c) => {
    const channel = getChannel(db, c.channelId);
    return {
      channelPlatform: channel?.platform ?? "facebook",
      caption: c.caption,
      hashtags: c.hashtags,
      ...(c.unresolvedMentions !== undefined ? { unresolvedMentions: c.unresolvedMentions } : {}),
      ...(c.title !== undefined ? { title: c.title } : {}),
      ...(c.cta !== undefined ? { cta: c.cta } : {}),
    };
  });

  const posts: readonly AssetPostView[] = listPostsForAsset(db, assetId).map((post) => {
    const channel = getChannel(db, post.channelId);
    const metricHistory = listMetricSnapshotsForPost(db, post.id).map((m) => ({
      capturedAt: m.capturedAt,
      ...(m.reactions !== undefined ? { reactions: m.reactions } : {}),
      ...(m.comments !== undefined ? { comments: m.comments } : {}),
      ...(m.shares !== undefined ? { shares: m.shares } : {}),
      ...(m.views !== undefined ? { views: m.views } : {}),
      source: m.source,
    }));
    const scoreHistory = listPerformanceScoresForPost(db, post.id).map((s) => ({ computedAt: s.computedAt, score: s.score }));
    return {
      channelPlatform: channel?.platform ?? "facebook",
      postUrl: post.postUrl,
      postedAt: post.postedAt,
      ...(post.trackingState !== undefined ? { trackingState: post.trackingState } : {}),
      metricHistory,
      scoreHistory,
    };
  });

  return {
    assetId: asset.id,
    recipeSlug: asset.recipe,
    recipeName: recipe?.name ?? asset.recipe,
    status: asset.status,
    ...(asset.pending_gate !== undefined ? { pendingGate: asset.pending_gate } : {}),
    ...(asset.produced_at !== undefined ? { producedAt: asset.produced_at } : {}),
    ...(asset.scheduled_at !== undefined ? { scheduledAt: asset.scheduled_at } : {}),
    idea: {
      id: idea.id,
      title: idea.title,
      brief: idea.brief,
      hookType: idea.hookType,
      theme: idea.theme,
      ...(idea.fitScore !== undefined ? { fitScore: idea.fitScore } : {}),
      ...(idea.relevance !== undefined ? { relevance: idea.relevance } : {}),
      ...(idea.momentum !== undefined ? { momentum: idea.momentum } : {}),
      ...(idea.brandFit !== undefined ? { brandFit: idea.brandFit } : {}),
      sourceUrls: idea.sourceUrls,
    },
    formatSlug: format?.slug ?? idea.formatId,
    formatName: format?.name ?? idea.formatId,
    brandSlug: brand?.slug ?? idea.brandId,
    brandName: brand?.name ?? idea.brandId,
    spec: asset.spec ?? null,
    media,
    copyVariants,
    posts,
  };
}

/** One row per `job`, joined out to its Asset/Idea/Format/Brand and classified into a bucket (AC6). A
 *  Job whose Asset cannot be resolved is skipped (never crashes the whole screen for one bad row —
 *  mirrors `buildLibraryIndex`'s own degrade-gracefully choice). */
export function buildQueueRows(db: DatabaseSync): readonly QueueRow[] {
  const lookups = new Lookups(db);
  const rows: QueueRow[] = [];
  for (const job of listAllJobs(db) as readonly JobRecord[]) {
    const asset = getAssetById(db, job.assetId);
    if (asset === null) continue;
    const idea = lookups.idea(asset.ideaId);
    if (idea === null) continue;
    const format = lookups.format(idea.formatId);
    const brand = lookups.brand(idea.brandId);
    const recipe = getRecipe(asset.recipe);

    rows.push({
      jobId: job.id,
      jobStatus: job.status,
      ...(job.gate !== undefined ? { gate: job.gate } : {}),
      enqueuedAt: job.enqueuedAt,
      ...(job.startedAt !== undefined ? { startedAt: job.startedAt } : {}),
      assetId: asset.id,
      assetStatus: asset.status,
      ...(asset.pending_gate !== undefined ? { pendingGate: asset.pending_gate } : {}),
      ideaTitle: idea.title,
      recipeSlug: asset.recipe,
      recipeName: recipe?.name ?? asset.recipe,
      brandSlug: brand?.slug ?? idea.brandId,
      formatSlug: format?.slug ?? idea.formatId,
      bucket: classifyQueueRow(job.status, asset.status, asset.pending_gate),
    });
  }
  return rows;
}

/**
 * Every Idea carrying a Fit Score, paired with its best Asset's best Performance Score IF it has one —
 * `performanceScore` stays `undefined` (never `0`) for an Idea not yet scored, so the chart/table can
 * count and list it separately rather than silently dropping it (AC5, Question 3).
 */
export function buildFitPerformanceData(db: DatabaseSync): FitPerformanceData {
  const points: FitPerformancePoint[] = [];
  for (const idea of listAllIdeas(db)) {
    if (idea.fitScore === undefined) continue;
    const assets = listAllAssetsForIdea(db, idea.id);
    let best: number | undefined;
    for (const asset of assets) {
      const posts = listPostsForAsset(db, asset.id);
      const assetBest = bestPerformanceScoreForAsset(db, posts);
      if (assetBest !== undefined && (best === undefined || assetBest > best)) best = assetBest;
    }
    points.push({
      ideaId: idea.id,
      ideaTitle: idea.title,
      fitScore: idea.fitScore,
      ...(best !== undefined ? { performanceScore: best } : {}),
    });
  }
  return { points };
}

/** Every Asset belonging to one Idea. `AssetStore.loadIdeaAssets`'s `{ db }` overload already answers
 *  this with a real `WHERE idea_id = ?` query, but it is `async` (mirroring its file-backed sibling's
 *  signature) — this module stays entirely synchronous end to end (`server.ts`'s route handlers call it
 *  with no `await`), so this filters the already-fetched `listAllAssets(db)` array instead. At this
 *  database's real size (54 Assets total) that is a cheap, plain array filter, not a real cost. */
function listAllAssetsForIdea(db: DatabaseSync, ideaId: string): readonly DbAssetRecord[] {
  return listAllAssets(db).filter((a) => a.ideaId === ideaId);
}

/** Every Post in the database — re-exported so callers (the server, tests) never need to reach past
 *  this module into `src/post/store.ts` directly for a whole-database count. */
export function countAllPosts(db: DatabaseSync): number {
  return listAllPosts(db).length;
}
