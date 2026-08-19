# command-surface Specification

## Purpose
TBD - created by archiving change issue-205-typed-command-surface. Update Purpose after archive.
## Requirements
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

### Requirement: The command surface exposes the Schedule Outbox's reserve/call/confirm operation

`src/command-surface/schedule-outbox.ts` SHALL expose `scheduleViaOutbox(db, input, port, now)` and
`reconcileScheduleOutbox(db, idempotencyKey, port, now)`, composing `src/schedule-outbox/store.ts`'s
`reserveScheduleOutboxEntry`/`confirmScheduleOutboxEntry`/`getScheduleOutboxEntry` and
`src/schedule-outbox/reconcile.ts`'s PURE `findMatchingSchedule` directly — never a store bypassed,
never new business logic duplicated from what those modules already implement, and never a store write
function reachable through a separate deep-orchestration module outside `src/command-surface/`. This is
a NEW capability beyond the eight operations issue #205's own acceptance criteria named, not a companion
to them — the "exactly three deliberate, minimal companions" Requirement (issue #205) is unaffected and
stays exactly as it was. `recordReviewDecision` (`ideas.ts`) already established that a command-surface
function MAY compose more than one store call behind real conditional branching logic — this is that
SAME established shape, not a new one. Both functions SHALL be re-exported from
`src/command-surface/index.ts`.

#### Scenario: scheduleViaOutbox reserves, calls Zoho, and confirms — through the command surface directly

- **GIVEN** a fresh, migrated, throwaway database, a seeded Asset, and a fake `ZohoSchedulePort`
- **WHEN** `scheduleViaOutbox(db, { idempotencyKey, assetId, request }, port)` is called via
  `src/command-surface/index.ts`'s own exported name
- **THEN** `port.createSchedule` is called exactly once, and the `schedule_outbox` entry is readable back
  as `'confirmed'`, with its reference, exactly as `src/schedule-outbox/store.ts`'s own
  `getScheduleOutboxEntry` reports

#### Scenario: reconcileScheduleOutbox is read-only toward Zoho, never calling createSchedule

- **GIVEN** an idempotency key that was never reserved
- **WHEN** `reconcileScheduleOutbox(db, idempotencyKey, port)` is called
- **THEN** it returns `{ status: "unknown-key" }`, and the port receives zero calls of any kind

### Requirement: schedule_outbox's write functions are registered with the store-write boundary guard

`src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS` SHALL name
`src/schedule-outbox/store.ts`'s write-function exports (`reserveScheduleOutboxEntry`,
`confirmScheduleOutboxEntry`), exactly like every other SQL-backed domain store this command surface
sits over. A new module importing either function directly from outside `src/command-surface/**` and
test paths SHALL fail the guard, unless individually audited onto
`src/store-write-boundary/allow-list.ts`'s `STORE_WRITE_BOUNDARY_ALLOW_LIST` with a stated reason — the
SAME governance every other store already has, applied to this ticket's own new store from the moment it
is added, not as a later sweep.

#### Scenario: an un-registered write function is invisible to the guard — the failure mode this Requirement exists to prevent

- **GIVEN** a hypothetical SQL-backed store whose write functions are NOT named in
  `STORE_WRITE_FUNCTIONS`
- **WHEN** a module outside `src/command-surface/**` imports and calls one of its write functions
  directly
- **THEN** the store-write boundary guard does not detect it — proving why registration must happen at
  the same time a store is added, never deferred

#### Scenario: schedule_outbox's write functions ARE registered, and the guard covers them for real

- **GIVEN** `STORE_WRITE_FUNCTIONS`'s entry for `src/schedule-outbox/store.ts`
- **WHEN** `src/schedule-outbox/fixtures/crash-schedule-worker.ts`'s import of
  `reserveScheduleOutboxEntry` is (hypothetically) removed from
  `STORE_WRITE_BOUNDARY_ALLOW_LIST`
- **THEN** `store-write-guard.test.ts` fails, naming exactly that (file, store, function) triple as an
  un-audited violation

### Requirement: The command surface exposes gate resolution, Copy Variant persistence, and the worker's job orchestration

`src/command-surface/gates.ts` SHALL expose `raiseGateRequest(db, input, now)` (a thin wrap of
`gate-request-store.ts`'s `createGateRequest`) and `resolveGate(db, gateRequestId, decision, now)`
(composing `recordGateDecision` with `job-store.ts`'s `createJob` to enqueue the resumed leg — the SAME
"compose more than one store call behind real branching logic" shape `ideas.ts`'s `recordReviewDecision`
already established, and the same shape issue #209 collapsed its own three-layer design into after qa
flagged the alternative). `src/command-surface/copy.ts` SHALL expose `saveCopyVariant(db, input, now)`
(a thin wrap of `copy/store.ts`'s `upsertCopyVariant`). `src/command-surface/worker.ts` SHALL expose
`runOneJob(db, port, jobId, options)` — the worker's own per-job orchestration, composing
`job-store.ts`'s `claimJob`/`releaseJob`/`requeueJob`, `gates.ts`'s `raiseGateRequest`, `assets.ts`'s
`saveAsset`/`attachAssetMedia`, and `copy.ts`'s `saveCopyVariant`, alongside the UNCHANGED deep modules
`driveToNextGate`/`bindMediaSlots`/`auditBindMediaPhase`/`auditCopyPhase`, PLUS
`production-spec/author-at-review.ts`'s `auditAuthoredSpec` for its own author-phase check (issue #273 —
runs a Recipe's own registered, standalone-runnable author-phase refinement when one exists, else the
generic `auditAuthorPhase`, so `runOneJob`'s defense-in-depth check and `accept-idea`'s own self-check
stay the SAME bar, never two independently-drifting ones) — never a store bypassed, never a store write
function reachable through a separate deep-orchestration module outside `src/command-surface/`. This is
additive to issue #205's original eight operations and issue #209's Schedule Outbox pair — the "exactly
three deliberate, minimal companions" Requirement (issue #205) is unaffected and stays exactly as it
was. All three modules SHALL be re-exported from `src/command-surface/index.ts`.

#### Scenario: resolveGate composes recordGateDecision and createJob through the command surface directly

- **GIVEN** a parked job's undecided `gate_request`
- **WHEN** `resolveGate(db, gateRequestId, { decidedBy, choice })` is called via
  `src/command-surface/index.ts`'s own exported name
- **THEN** the gate request is readable back as decided (`decidedBy`/`decidedAt`/`choice`), and a NEW
  `queued` job exists for the same Asset

#### Scenario: runOneJob never imports a store write function outside src/command-surface/

- **GIVEN** the full set of files `src/command-surface/worker.ts` imports, transitively, for its
  WRITE calls
- **WHEN** `src/store-write-boundary/scan.ts`'s guard scans the repository
- **THEN** every store write `runOneJob` performs is attributed to `src/command-surface/worker.ts`
  itself (or another `src/command-surface/**` module it calls) — never to a module under `src/worker/`,
  which imports no store write function at all

#### Scenario: runOneJob's author-phase check runs auditAuthoredSpec, catching the SAME filler pattern accept-idea now rejects (issue #273)

- **GIVEN** a News Carousel Asset whose saved Production Spec sets the exact SAME `card_style` on all 7
  slides (a Spec that would have slipped past the OLD, generic-only `auditAuthorPhase` check)
- **WHEN** `runOneJob(db, port, jobId, options)` is called for a job on that Asset's FIRST leg
- **THEN** the job fails at the author phase, naming the `card-style-distinctness` item, with ZERO calls
  made to the Space port (`port.editGoals`/`port.runs` stay empty)

### Requirement: saveAssetSpec and refreshSpecFile expose the Production Spec's SQL write and its generated file view

`src/command-surface/production-spec.ts` SHALL expose `saveAssetSpec(db, assetId, spec, now?)` — a thin
wrapper over `src/production-spec/store.ts`'s SQL-backed `saveProductionSpec`, giving that function its
first production caller — and `refreshSpecFile(db, assetId, path)`, which reads the Spec back off SQL
via `loadProductionSpec` and writes it to `path` via the file-backed `saveSpec`, so the on-disk per-Idea
Spec file is always a GENERATED VIEW of the SQL row, never a second, independently-authored copy
(mirroring `post.json`'s own relationship to the ledger's Asset, ADR-0028). Both functions live inside
`src/command-surface/`, taking an already-open, already-migrated `DatabaseSync` as their first argument,
matching this surface's existing convention — no store write function is imported directly by any caller
outside this directory.

#### Scenario: saveAssetSpec persists a Spec onto the Asset's SQL row

- **GIVEN** a committed Asset row with no Spec yet
- **WHEN** `saveAssetSpec(db, assetId, spec)` is called
- **THEN** `loadProductionSpec(db, assetId)` returns a value deep-equal to `spec`

#### Scenario: refreshSpecFile writes the file view from the SQL row, never from a separately-held value

- **GIVEN** an Asset row whose Spec was just saved via `saveAssetSpec`
- **WHEN** `refreshSpecFile(db, assetId, path)` is called
- **THEN** the file at `path` contains the SAME Spec `loadProductionSpec(db, assetId)` returns at that
  moment — reading it back from SQL, never writing a value the caller held in memory

