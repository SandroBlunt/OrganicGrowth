## MODIFIED Requirements

### Requirement: A typed command surface exposes the pipeline's write operations as plain functions over the stores

`src/command-surface/` SHALL expose the operations the pipeline needs — listing Trends, creating an
Idea, recording a Review decision, classifying an Idea's Hook Type/Theme (issue #206), enqueuing and
claiming jobs, saving an Asset, logging a Post, and reading Performance — as plain exported TypeScript
functions, each taking an already-open, already-migrated `node:sqlite` `DatabaseSync` as its first
argument (the SAME convention every `{ db }`-backed store already follows). Each function SHALL be a
thin orchestration shell over one (or, where the pipeline operation genuinely spans more than one store
call, more than one) of the SQL-backed stores issue #201/#222/#223/#203 shipped — never a store bypassed,
and never new business logic duplicated from what a store already implements.

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

#### Scenario: classifyIdea wraps IdeaStore.classifyIdea, including its validation

- **GIVEN** an Idea and a `classifyIdea` call with an out-of-vocabulary `hookType`
- **WHEN** `classifyIdea(db, ideaId, input)` is called
- **THEN** it throws `IdeaValidationError`, naming the invalid value, before any row is written —
  identical to calling `IdeaStore.classifyIdea` directly

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
