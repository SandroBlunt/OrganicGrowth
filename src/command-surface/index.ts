/**
 * The typed in-process command surface (issue #205, epic #195's hinge).
 *
 * "The 'API' this rebuild needs is not a server. It is a typed in-process command surface — plain
 * exported TypeScript functions over the stores — and it is the only thing permitted to write.
 * Everything above it (the worker, the viewer, every agent) calls it instead of touching folders."
 * (epic #195, issue #205's own brief.)
 *
 * Every function re-exported here is a thin orchestration shell over one (or, for
 * `ideas.ts`'s `recordReviewDecision` and `schedule-outbox.ts`'s `scheduleViaOutbox`/
 * `reconcileScheduleOutbox`, more than one) of the SQL-backed `{ db }` stores issue #201/#222/#223/#203
 * shipped — never a store bypassed, never raw SQL of its own. Each takes an already-open, already-
 * migrated `node:sqlite` `DatabaseSync` as its first argument (the SAME convention every store already
 * follows) and is tested in-process against a real, throwaway SQLite file (`src/db/test-support.ts`'s
 * `withTempDb`, never `:memory:` — AC3, the highest seam available).
 *
 * Covers the eight operations issue #205's own acceptance criteria name — listing Trends, creating an
 * Idea, recording a Review decision, enqueuing and claiming jobs, saving an Asset, logging a Post, and
 * reading Performance — plus a small number of deliberate, minimal, necessary companions each module's
 * own doc comment justifies individually (`releaseJob`, `attachAssetMedia`,
 * `recordPerformanceSnapshot`/`recordPerformanceScore`): operations no future caller could complete a
 * real pipeline turn without, which a command surface claiming to be "the only thing permitted to
 * write" cannot simply omit. `scheduleViaOutbox`/`reconcileScheduleOutbox` (issue #209) are a NEW
 * capability beyond that original eight, not a companion to them — the Schedule Outbox's own
 * reserve/call/confirm write path.
 *
 * **No production caller is wired onto this surface by this ticket.** The worker (#208), the viewer
 * (#210), and every agent (#211) are later slices; today, nothing above the store layer imports the SQL
 * stores directly EITHER (verified by grep at the time this ticket landed — see its `handoff.md`), so
 * this surface is additive infrastructure, not yet a behavior change to any real command. `ledger.json`
 * stays the source of truth the live pipeline actually reads and writes until issue #204's importer
 * runs (rule 7, `.claude/rules/always/organicgrowth-rules.md`).
 */

export { listTrends, createTrend, type ListTrendsOptions, type TrendInput } from "./trends.ts";
export {
  createBrand,
  createFormat,
  createRun,
  createChannel,
  type BrandInput,
  type BrandRecord,
  type FormatDbInput,
  type FormatDbRecord,
  type RunInput,
  type RunRecord,
  type ChannelInput,
  type ChannelRecord,
} from "./tenancy.ts";
export {
  createIdea,
  recordReviewDecision,
  type IdeaInput,
  type IdeaRecipeSelectionItem,
  type ReviewDecision,
} from "./ideas.ts";
export { enqueueJob, claimJob, releaseJob, type JobInput, type JobRecord, type ReleaseStatus } from "./jobs.ts";
export {
  saveAsset,
  attachAssetMedia,
  getAssetByRecipe,
  type DbAssetPatch,
  type AssetMediaItem,
  type DbAssetRecord,
} from "./assets.ts";
export { logPost, type PostInput } from "./posts.ts";
export {
  readPerformance,
  recordPerformanceSnapshot,
  recordPerformanceScore,
  type PerformanceSummary,
  type MetricSnapshotInput,
  type MetricSnapshotRecord,
  type PerformanceScoreInput,
  type PerformanceScoreRecord,
} from "./performance.ts";
export {
  scheduleViaOutbox,
  reconcileScheduleOutbox,
  type ReconcileScheduleOutboxOutcome,
  type ScheduleViaOutboxInput,
  type ScheduleViaOutboxOutcome,
} from "./schedule-outbox.ts";
export {
  raiseGateRequest,
  resolveGate,
  GateRequestNotFoundError,
  type GateRequestInput,
  type GateRequestRecord,
  type GateDecisionInput,
  type ResolveGateOutcome,
} from "./gates.ts";
export { saveCopyVariant, type CopyVariantInput, type CopyVariantRecord } from "./copy.ts";
export {
  runOneJob,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  type RunOneJobOptions,
  type RunOneJobOutcome,
} from "./worker.ts";
