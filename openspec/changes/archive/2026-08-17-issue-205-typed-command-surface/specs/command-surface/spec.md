## ADDED Requirements

### Requirement: A typed command surface exposes the pipeline's write operations as plain functions over the stores

`src/command-surface/` SHALL expose the operations the pipeline needs — listing Trends, creating an
Idea, recording a Review decision, enqueuing and claiming jobs, saving an Asset, logging a Post, and
reading Performance — as plain exported TypeScript functions, each taking an already-open,
already-migrated `node:sqlite` `DatabaseSync` as its first argument (the SAME convention every
`{ db }`-backed store already follows). Each function SHALL be a thin orchestration shell over one (or,
where the pipeline operation genuinely spans more than one store call, more than one) of the SQL-backed
stores issue #201/#222/#223/#203 shipped — never a store bypassed, and never new business logic
duplicated from what a store already implements.

#### Scenario: listTrends wraps TrendStore without duplicating its logic

- **GIVEN** a Run with two committed Trends, one with higher momentum than the other
- **WHEN** `listTrends(db, runId)` is called with no options
- **THEN** it returns both Trends ordered `momentum DESC`, matching `TrendStore.listTrendsForRun`'s own
  contract exactly

#### Scenario: createIdea wraps IdeaStore, including its validation

- **GIVEN** an `IdeaInput` with an out-of-vocabulary `hookType`
- **WHEN** `createIdea(db, input)` is called
- **THEN** it throws `IdeaValidationError`, naming the invalid value, before any row is written —
  identical to calling `IdeaStore.createIdea` directly

#### Scenario: enqueueJob wraps JobStore.createJob

- **GIVEN** a committed Asset and Brand
- **WHEN** `enqueueJob(db, { assetId, brandId })` is called
- **THEN** a `job` row is inserted at `status: 'queued'`, `attempt: 0`, readable back by `JobStore.getJob`

#### Scenario: saveAsset wraps AssetStore's SQL-backed writeAsset overload

- **GIVEN** an Idea and a Recipe slug
- **WHEN** `saveAsset(db, ideaId, recipe, { status: 'produced', produced_at: <timestamp> })` is called
- **THEN** the Asset's `status` and `produced_at` are updated, readable back through
  `AssetStore.loadIdeaAssets(ideaId, { db })`

#### Scenario: logPost wraps PostStore.recordPost, including its keyed-upsert behavior

- **GIVEN** an Asset already published to one Channel, logged once via `logPost`
- **WHEN** `logPost` is called again for the SAME `(assetId, channelId)` with a corrected `postUrl`
- **THEN** the existing `post` row is updated in place — no second row is created

#### Scenario: readPerformance wraps the Performance time-series stores' reads

- **GIVEN** a Post with two recorded metric snapshots and two computed Performance Scores
- **WHEN** `readPerformance(db, postId)` is called
- **THEN** it returns every recorded snapshot and the MOST RECENTLY computed score — matching
  `listMetricSnapshotsForPost` + `latestPerformanceScoreForPost`'s own combined contract

### Requirement: recordReviewDecision composes acceptance/rejection with Recipe selection as one Operator decision

`recordReviewDecision` SHALL accept a `ReviewDecision` discriminated on `outcome`: `"accepted"` (carrying
`recipes`, a `readonly IdeaRecipeSelectionItem[]`, possibly empty) or `"rejected"` (carrying a required
`rejectionReason`). For `"accepted"`, it SHALL call `IdeaStore.acceptIdea` then
`IdeaStore.selectIdeaRecipes` with the given `recipes` (even when `[]`, recording no Recipe selection
yet). For `"rejected"`, it SHALL call `IdeaStore.rejectIdea` with `rejectionReason`. Every error either
underlying store call throws (an already-decided Idea, a blank `rejectionReason`, a declined Recipe with
no `declineReason`, an unwired Recipe slug) SHALL propagate unchanged, changing nothing already
committed.

#### Scenario: an accepted decision moves the Idea to accepted and records every offered Recipe

- **GIVEN** a `suggested` Idea and two Recipe slugs, one to keep and one to decline with a reason
- **WHEN** `recordReviewDecision(db, ideaId, { outcome: 'accepted', recipes: [...] })` is called
- **THEN** `getIdea` returns `status: 'accepted'`, and `listIdeaRecipes` returns one row per offered
  Recipe — the kept one `chosen: true`, the declined one `chosen: false` with its `declineReason`

#### Scenario: an accepted decision with an empty recipes array is legal

- **GIVEN** a `suggested` Idea
- **WHEN** `recordReviewDecision(db, ideaId, { outcome: 'accepted', recipes: [] })` is called
- **THEN** `getIdea` returns `status: 'accepted'` and `listIdeaRecipes` returns `[]`

#### Scenario: a rejected decision moves the Idea to rejected and records the reason verbatim

- **GIVEN** a `suggested` Idea
- **WHEN** `recordReviewDecision(db, ideaId, { outcome: 'rejected', rejectionReason: 'Too close to last
  week' })` is called
- **THEN** `getIdea` returns `status: 'rejected'` and `rejectionReason: 'Too close to last week'`

#### Scenario: a blank rejectionReason throws before touching the row

- **GIVEN** a `suggested` Idea
- **WHEN** `recordReviewDecision(db, ideaId, { outcome: 'rejected', rejectionReason: '   ' })` is called
- **THEN** it throws `IdeaValidationError`, and `getIdea` still returns `status: 'suggested'`

### Requirement: the command surface carries deliberate, minimal companions beyond the eight named operations, each individually justified

The command surface SHALL expose exactly three deliberate, minimal companions beyond the eight pipeline
operations issue #205's own acceptance criteria name, each because its own domain's write path
would otherwise be impossible to complete through this surface: `releaseJob` (a claimed job must be able
to finish — `done`/`failed`/`awaiting_pick` — or "enqueuing and claiming" alone is a dead end),
`attachAssetMedia` (CONTEXT.md's own "Asset" is "the media ... plus its tailored Copy" — saving an
Asset's status/spec without ever recording its media rows leaves half the entity with no write path),
and `recordPerformanceSnapshot`/`recordPerformanceScore` (AC1 names only the READ side of Performance;
with no write path Performance data could never enter the system through this surface at all). No other
companion operation SHALL be added without the same individual justification.

#### Scenario: releaseJob completes a claimed job's lifecycle

- **GIVEN** a job claimed via `claimJob`, currently `status: 'running'`
- **WHEN** `releaseJob(db, jobId, 'done')` is called
- **THEN** the job's `status` becomes `'done'` and its claim (`lockedBy`/`lockedUntil`) is cleared

#### Scenario: attachAssetMedia records a batch of media rows atomically

- **GIVEN** an Asset with no media rows yet
- **WHEN** `attachAssetMedia(db, assetId, [item0, item1])` is called
- **THEN** both rows are inserted, listed back in ordinal order by `AssetStore.listAssetMedia`

#### Scenario: recordPerformanceSnapshot and recordPerformanceScore are the only legal way to write Performance data through this surface

- **GIVEN** a logged Post with no Performance data yet
- **WHEN** `recordPerformanceSnapshot(db, { postId, capturedAt, reactions: 40, source: 'apify' })` and
  `recordPerformanceScore(db, { postId, score: 0.7, computedAt })` are both called
- **THEN** `readPerformance(db, postId)` returns the recorded snapshot and the recorded score

### Requirement: every command is tested in-process against a real database

Every command SHALL be tested by opening a real, throwaway SQLite file per test
(`src/db/test-support.ts`'s `withTempDb`) — never `:memory:` — matching this epic's own Testing
Decisions ("the highest seam available"). `src/command-surface/index.ts`'s barrel re-exports SHALL be
proven wired correctly by at least one integration test that drives a full pipeline turn (Trend → Idea →
Review → Job → Asset → Post → Performance) entirely through the barrel's own exported names.

#### Scenario: the barrel drives one full pipeline turn through its own exported names only

- **GIVEN** a fresh, migrated, throwaway database
- **WHEN** a test imports only from `src/command-surface/index.ts` and drives Trend creation through
  Post logging and Performance recording, in sequence
- **THEN** every step succeeds and the final `readPerformance` call reflects everything recorded —
  proving the barrel's exports compose correctly end to end
