## Why

Two live bugs, both named in the epic #195 audit: the Production Queue silently loses work, and
Performance is measured against a schema that only ever had one slot for it.

**The queue.** Every ledger/queue write today is read-whole-file → mutate-in-memory → write-whole-file.
The Operator runs two concurrent sessions against the same folder as a documented working style, so the
LATER save silently discards the EARLIER one. The `lock` field meant to guard this was itself stored
*inside* the file being raced on — and has separately gone missing from the live `data/queue.json`
entirely; `parseQueueState`'s tolerant parser has been inventing a `{ active_job: null }` replacement on
every read ever since, so the guard has been a no-op for a while without anyone noticing. The live queue
also holds 12 duplicate `(brand, idea, recipe)` triples (verified directly against the repo's
`data/queue.json`), so a status change keyed on that triple can land on the wrong, already-finished job.

**Performance.** CONTEXT.md already states Performance is "a moving number, not a snapshot", but the
file-ledger model (`src/asset/asset.ts`'s `metrics`/`performance_score`/`tracked_at` scalar fields, plus
a `history` array only populated retroactively at re-track time) only ever had one CURRENT slot for it.
ADR-0028 already reshaped the SQL schema for this (`post`, `metric_snapshot`, `channel_baseline`,
`performance_score` all exist since migration 1, issue #201) — but explicitly deferred "the
claiming/write logic that actually populates it" to this ticket.

## What Changes

- **Job identity becomes the surrogate `id`.** A new, genuinely-new `JobStore`
  (`src/production-queue/job-store.ts`, `{ db }`-only) makes `(brand, idea, recipe)` a NON-UNIQUE lookup
  (`listJobsForComposite`, joined through `asset`) rather than an identity — several `job` rows (legs,
  attempts, a requeue after a failure) can legitimately share one composite triple, which is exactly the
  shape the live queue's 12 duplicates need.
- **Real atomic claiming.** `claimJob(db, jobId, ownerId, leaseMs, now)` is ONE SQL
  `UPDATE ... WHERE id = ? AND (eligible) RETURNING *` statement — SQLite's equivalent of
  `SELECT ... FOR UPDATE SKIP LOCKED` — using the `job` table's own `locked_by`/`locked_until`/`attempt`
  columns (already reserved by issue #201/#202, no new migration needed). "Eligible" means `queued`, OR
  `running` with an EXPIRED lease, so a crashed worker's claim does not strand its job forever.
  `releaseJob`/`requeueJob` are the atomic counterparts that end or revive a claim.
- **`GateRequestStore`** (`src/production-queue/gate-request-store.ts`) records a gate's name, its
  candidates, and — once decided — who decided, when, and the choice (`gate_request`, already schema'd).
- **The three concurrency claims are proven, not asserted**, with GENUINELY concurrent tests
  (`claim-concurrency.test.ts`): two REAL, separate OS processes (`node:child_process`), each with its
  own `DatabaseSync` connection to the same on-disk file, synchronized to race at (as near as the OS
  allows) the same wall-clock instant — because `node:sqlite`'s synchronous calls mean two same-process
  calls can never actually overlap. Verified locally by BREAKING `claimJob`'s atomicity (a naive
  read-then-delay-then-write) and confirming "exactly one winner" goes RED (`expected 1, actual 2`)
  before restoring the real implementation — see this change's `handoff.md`.
- **`PRAGMA busy_timeout = 5000`** added to `src/db/connection.ts`'s `openDatabase` (previously `0`,
  `node:sqlite`'s own default): a concurrent writer now WAITS for the SQLite write lock instead of
  failing immediately with `SQLITE_BUSY` — what makes the atomic claim safe under real concurrent
  callers rather than merely correct in isolation.
- **The file-based Production Queue's `lock` field is DELETED, not ported.** `QueueLock`/`JobRef`/
  `QueueState.lock` are removed from `queue.ts`/`store.ts`/`scheduler.ts` entirely — `spaceBusy` (the
  single-concurrency check) is now derived PURELY from reading `jobs[].status`, so there is no second,
  independently-writable structure that could drift out of sync with the jobs it was meant to describe.
  A stray `lock` key on a hand-edited or pre-#203 `data/queue.json` is ignored on load and never
  re-written on save. This is the file-based queue's OWN in-repo model — it is not swapped onto SQL by
  this ticket (see "Known Limits" below).
- **`PostStore`** (`src/post/store.ts`, genuinely new): `recordPost` is a keyed upsert on
  `(asset_id, channel_id)` — one Asset published to more than one Channel gets its own, independent Post
  row, each measured separately (ADR-0028).
- **The Performance time-series stores** (`src/performance/store.ts`, alongside this directory's
  existing pure computation modules, untouched): `recordMetricSnapshot` always INSERTs — there is no
  update path, so history is never overwritten; `recordChannelBaseline` always INSERTs a fresh row per
  recompute; `recordPerformanceScore` always INSERTs, stamped with `computedAt` — a re-score never
  destroys a Post's prior scores. Proven end-to-end (AC11) by running the REAL
  `computePerformanceScore`/`recomputeBaseline` functions issue #200 shipped through these stores and
  reading the values back byte-identical.

## Known Limits (explicitly out of scope, decided not dropped)

- **No SQL table holds real production data.** The one-shot importer is issue #204's job. Every new
  store here is proven against fixtures via `withTempDb`, never the live `data/` corpus — AC11's
  "round-trip unchanged" is about the SHAPES matching, not about migrating live rows.
- **No existing production command is rewired onto any of these new stores.** `data/queue.json` and
  every Brand's `ledger.json` stay the source of truth the live pipeline actually reads/writes — exactly
  the same posture #222/#223 left every other `{ db }` store in.
- **The live `data/queue.json`'s own 12 duplicate `(brand, idea, recipe)` rows are NOT deduplicated by
  this ticket** — that is a live-data cleanup for #204's importer, not a schema/store change.
- **No new migration.** `job`/`gate_request`/`post`/`metric_snapshot`/`channel_baseline`/
  `performance_score` were already fully specified by migration 1 (issue #201) — this ticket adds no
  columns and no new migration, so there is no numbering conflict with any sibling slice.

## Capabilities

### Added Capabilities

- `job-claim-store`: `src/production-queue/job-store.ts` + `gate-request-store.ts` — the SQL-backed
  `job`/`gate_request` CRUD, centered on the atomic claim-with-owner-and-expiry primitive.
- `post-store`: `src/post/store.ts` — the SQL-backed `post` table CRUD (ADR-0028).
- `performance-time-series-store`: `src/performance/store.ts` — the SQL-backed `metric_snapshot`/
  `channel_baseline`/`performance_score` CRUD.

### Modified Capabilities

- `production-queue`: the file-based Production Queue's `lock` field is deleted, not ported; the
  single-concurrency invariant is now derived from job status alone.
- `sqlite-foundation`: `openDatabase` now sets `PRAGMA busy_timeout = 5000` on every connection.

## Impact

- **New code:** `src/production-queue/job-store.ts` (+`.test.ts`),
  `src/production-queue/gate-request-store.ts` (+`.test.ts`),
  `src/production-queue/claim-concurrency.test.ts`,
  `src/production-queue/fixtures/claim-worker.ts`, `src/db/fixtures/seed-chain.ts`,
  `src/post/store.ts` (+`.test.ts`), `src/performance/store.ts` (+`.test.ts`),
  `openspec/changes/issue-203-job-claiming-performance-time-series/` (this change).
- **Modified code:** `src/db/connection.ts` (+`.test.ts`, `busy_timeout`),
  `src/production-queue/queue.ts`, `store.ts`, `scheduler.ts` (+ their `.test.ts` files, and
  `src/commands/pick.test.ts`/`pick-cast.test.ts`/`queue.test.ts` — the `lock` field removal).
- **Untouched (deliberately):** `src/db/schema.ts`, `src/db/migrate.ts` (byte-for-byte frozen, no new
  migration), `src/ledger/ledger.ts`, `src/asset/asset.ts`, every real production module that reads/
  writes `ledger.json`/`data/queue.json` today, `src/commands/queue.ts`/`pick.ts`/`pick-cast.ts` (their
  own logic — only their tests' `lock:` literals changed).
- **Hermetic, no live Space or Zoho MCP calls.** Every new test opens a REAL, empty, throwaway SQLite
  file per test (`withTempDb`, never `:memory:`), mirroring #201/#222/#223's own Testing Decisions. No
  `magnific`/Zoho MCP tool is imported or called by anything this slice touches.
- **Always-rules upheld:** this slice touches no content-generation or publication code
  (generate-never-publish is untouched by construction). Public-metrics-only and relative-not-absolute
  are unaffected — this ticket persists whatever metrics/scores a caller already computed, it does not
  compute new ones or change the formula. Explicit-attribution is REINFORCED: `post` is explicitly keyed
  `(asset_id, channel_id)`, never inferred. Ledger-as-source-of-truth is explicitly PRESERVED:
  `ledger.json`/`data/queue.json` stay what every real production command actually reads/writes; every
  store this ticket adds is additive and unused by any of them until #204.
