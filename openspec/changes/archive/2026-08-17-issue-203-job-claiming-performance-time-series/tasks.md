## 1. Scope audit — before writing any code

- [x] 1.1 Read the issue's three blockers (#200, #201, #202) — confirm merged/closed.
- [x] 1.2 Read `src/db/schema.ts`'s `job`/`gate_request`/`post`/`metric_snapshot`/`channel_baseline`/
  `performance_score` DDL (frozen from #201) end-to-end; confirm `job` already carries
  `locked_by`/`locked_until`/`attempt`/`idempotency_key` ("issue #203's job, not this ticket's" — #201's
  own comment) and every table already has every column this ticket needs. Conclude NO new migration is
  required — say so loudly (no numbering conflict with sibling slice #226).
- [x] 1.3 Read `src/production-queue/{queue,store,scheduler}.ts` end to end; grep every `.lock`/
  `QueueLock`/`JobRef`/`active_job` reference across `src/**` (including tests) to scope the deletion.
- [x] 1.4 Confirm the live `data/queue.json` currently has NO `lock` key at all, and count its
  `(brand, idea, recipe)` duplicates directly (Python one-liner) — verify the issue's "12 duplicates"
  claim against the actual file.
- [x] 1.5 Prototype the atomic-claim SQL and the two-real-process concurrency-test approach in the
  scratchpad BEFORE writing it into the suite — confirm `RETURNING` works with `node:sqlite`, confirm
  the default `busy_timeout` is `0`, and confirm a naive read-then-write TOCTOU implementation actually
  produces a double-claim under two real spawned processes (so the "genuine" test design is sound before
  committing to it).

## 2. Delete (not port) the file-based Production Queue's lock field

- [x] 2.1 Remove `QueueLock`/`JobRef`/`QueueState.lock` from `queue.ts`; `emptyQueue()` returns
  `{ jobs: [] }`; `enqueue`/`enqueueNextLeg` drop `lock: state.lock` from their returned state. Rewrite
  the module's own doc comment to explain the deletion (issue #203) instead of describing a lock shape.
- [x] 2.2 Rewrite `scheduler.ts`: `spaceBusy` reads `jobs[].status` only; `transition` drops its
  `lockHolder` parameter; every `mark*`/`requeueFailed` transition drops lock bookkeeping.
- [x] 2.3 Rewrite `store.ts`: `parseQueueState` no longer parses/synthesizes/warns about a `lock` key;
  `parseJobRef` is removed.
- [x] 2.4 Update every test file that built a `QueueState` literal with a `lock:` key
  (`queue.test.ts`, `store.test.ts`, `scheduler.test.ts`, `format.test.ts`, `enqueue-on-accept.test.ts`,
  `src/commands/{pick,pick-cast,queue}.test.ts`) — strip the literal; DELETE the tests whose entire
  premise was lock-parsing/phantom-lock behavior (an entire `describe` block in `store.test.ts`, one test
  in `scheduler.test.ts`); ADD tests proving a stray legacy `lock` key is ignored on load and never
  re-written on save.
- [x] 2.5 `npx tsc --noEmit` + run the whole `production-queue`/`commands` test slice — green.

## 3. PRAGMA busy_timeout on every SQLite connection

- [x] 3.1 Add `PRAGMA busy_timeout = 5000` to `src/db/connection.ts`'s `openDatabase`; update its doc
  comment to explain why (a concurrent writer must WAIT, not immediately `SQLITE_BUSY`).
- [x] 3.2 Add a test asserting the pragma's value on a fresh connection (`connection.test.ts`).

## 4. JobStore — real atomic claiming (test-first)

- [x] 4.1 Write failing tests (`src/production-queue/job-store.test.ts`): `createJob` defaults to
  `status: 'queued'`, `attempt: 0`, no lock held; `getJob` null-for-unknown; `listJobsForComposite` is a
  NON-UNIQUE lookup (several jobs can share one composite) via a join through `asset`; `claimJob` claims
  a queued job (status/owner/lease/attempt all update, `startedAt` stamped once via `COALESCE`); a second
  sequential claim of the same job fails once the first has landed; unknown/terminal jobs return `null`;
  an expired lease (deterministic, injected clock) makes a job claimable again by a different owner;
  `releaseJob` atomically ends a claim (`running` → `awaiting_pick`/`done`/`failed`), returning `null`
  when the job is not currently running; `requeueJob` atomically revives a `failed` job to `queued`.
- [x] 4.2 Implement `src/production-queue/job-store.ts`.

## 5. GateRequestStore (test-first)

- [x] 5.1 Write failing tests (`src/production-queue/gate-request-store.test.ts`): `createGateRequest`
  records name + candidates, undecided; `recordGateDecision` records `decidedBy`/`decidedAt`/`choice`
  onto an already-offered gate; a re-decision overwrites in place (no second row); an unknown
  `gateRequestId` throws `GateRequestNotFoundError` before any write; `listGateRequestsForJob` reads
  every gate request for a job back, oldest first.
- [x] 5.2 Implement `src/production-queue/gate-request-store.ts`.

## 6. The three concurrency proofs — GENUINELY concurrent (test-first)

- [x] 6.1 Extract the shared brand/format/run/idea/asset(/channel) seed chain into
  `src/db/fixtures/seed-chain.ts` (used by every store test in this ticket, not hand-copied per file).
- [x] 6.2 Write `src/production-queue/fixtures/claim-worker.ts`: a spawnable fixture (NOT a `.test.ts`)
  that opens its OWN `DatabaseSync` connection, spin-waits to a parent-supplied wall-clock instant, calls
  the REAL `claimJob`, and prints one line of JSON.
- [x] 6.3 Write `src/production-queue/claim-concurrency.test.ts`: (a) two real child processes racing
  the SAME queued job — assert exactly one winner, and that the database's own final state (status,
  `locked_by`, `attempt: 1`) agrees; (b) two real child processes racing on TWO DIFFERENT queued jobs —
  assert BOTH succeed and BOTH survive in the database (a lost update is impossible); (c) a real process
  claims with a short lease and exits without releasing (a simulated crash), then a SEPARATE real
  process, after the lease has genuinely expired, claims the same job (the crashed worker's job does not
  stay stuck).
- [x] 6.4 Run the concurrency suite 15+ times back to back — confirm zero flakes (SQLite's writer
  serialization makes the safety property deterministic, not timing-dependent — record this reasoning,
  not just the pass count).
- [x] 6.5 BREAK the atomicity locally (swap `claimJob`'s single atomic `UPDATE...RETURNING` for a naive
  read-then-delay-then-write) and confirm "exactly one winner" goes RED (`expected 1, actual 2`) 3/3
  times; restore via `git checkout --` and confirm green again. Record this in the Build Report.

## 7. PostStore (test-first)

- [x] 7.1 Write failing tests (`src/post/store.test.ts`): `recordPost` inserts, and re-recording the
  SAME `(assetId, channelId)` updates the one row rather than duplicating; publishing the SAME Asset to a
  SECOND Channel yields a SECOND, independent Post row; reads (`getPost`/`getPostForAssetAndChannel`/
  `listPostsForAsset`) null/`[]`-for-unknown; `updatePostTrackingState` updates in place, throws for an
  unknown id; unknown `assetId`/`channelId` rejected (FOREIGN KEY).
- [x] 7.2 Implement `src/post/store.ts`.

## 8. Performance time-series stores (test-first)

- [x] 8.1 Write failing tests (`src/performance/store.test.ts`): `recordMetricSnapshot` always inserts —
  a second capture for the same Post is a second row, never an overwrite; ordering by `captured_at`;
  `latestMetricSnapshotForPost`; a missing metric is omitted, never fabricated as `0`.
  `recordChannelBaseline` always inserts a fresh row per recompute; `getLatestChannelBaseline`.
  `recordPerformanceScore` always inserts — a re-score is a new row, the earlier score is untouched;
  `latestPerformanceScoreForPost`. Unknown FK ids rejected on every write.
- [x] 8.2 Write the AC11 round-trip test: run the REAL `computePerformanceScore`
  (`src/performance/score.ts`) and `recomputeBaseline` (`src/performance/metrics.ts`) — issue #200's own
  measurement-loop functions — through `recordChannelBaseline`/`recordPerformanceScore`, and assert the
  read-back values are byte-identical to what those real functions produced.
- [x] 8.3 Implement `src/performance/store.ts`.

## 9. OpenSpec + full-suite green + self-review + Build Report

- [x] 9.1 Author spec deltas: `job-claim-store` (ADDED), `post-store` (ADDED),
  `performance-time-series-store` (ADDED), `production-queue` (MODIFIED — lock deletion, titles kept
  byte-identical to the live spec), `sqlite-foundation` (MODIFIED — busy_timeout). Run
  `openspec validate --strict` until green.
- [x] 9.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test` — all green, at/above the 2987/762/0-fail
  baseline.
- [x] 9.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #203
  acceptance criterion maps to a specific test.
- [x] 9.4 Write the Build Report into `handoff.md`.
