# job-claim-store Specification

## Purpose
TBD - created by archiving change issue-203-job-claiming-performance-time-series. Update Purpose after archive.
## Requirements
### Requirement: Job identity is the surrogate id; (brand, idea, recipe) is a non-unique lookup

`src/production-queue/job-store.ts`'s `JobStore` SHALL key every `job` row's identity on its own
surrogate `id` — never on the `(brand, idea, recipe)` composite the file-based Production Queue uses.
`listJobsForComposite(db, brandId, ideaId, recipeSlug)` SHALL look up every `job` row sharing one
`(brand, idea, recipe)` composite (joined through `asset`, since `job` carries only `asset_id`) and
SHALL return an ARRAY — never assume at most one — because several `job` rows (separate legs, separate
attempts, a requeue after a failure) can legitimately share one composite triple.

#### Scenario: Several jobs share one (brand, idea, recipe) composite without collision

- **GIVEN** two `job` rows created against the SAME Asset (hence the same `(brand, idea, recipe)`
  composite)
- **WHEN** `listJobsForComposite` is called for that composite
- **THEN** it returns BOTH jobs, oldest first, neither one masking the other

#### Scenario: An unknown composite returns an empty list, never throws

- **GIVEN** a `(brand, idea, recipe)` composite with no `job` rows
- **WHEN** `listJobsForComposite` is called
- **THEN** it returns `[]`

### Requirement: A job is claimed by an atomic claim-with-owner-and-expiry, not a field inside a contended file

`claimJob(db, jobId, ownerId, leaseMs, now)` SHALL be ONE SQL `UPDATE ... WHERE id = ? AND (eligible)
RETURNING *` statement — SQLite's equivalent of `SELECT ... FOR UPDATE SKIP LOCKED` — using the `job`
table's own `locked_by`/`locked_until`/`attempt` columns. A row SHALL be "eligible" when its `status` is
`queued`, OR `running` with an EXPIRED lease (`locked_until` strictly before `now`). On a successful
claim: `status` becomes `running`, `locked_by` is set to `ownerId`, `locked_until` is set to
`now + leaseMs`, `attempt` increments by exactly one, and `started_at` is stamped ONLY if it was not
already set (`COALESCE`), so a re-claim after an expired lease preserves the job's original start time.
`claimJob` SHALL return the claimed `JobRecord` on success, and `null` when the job does not exist, is
not eligible, or was lost to a concurrent winner — never throw for these cases.

#### Scenario: Claiming an eligible queued job sets status, owner, lease, and increments attempt

- **GIVEN** a `job` row at `status: 'queued'`, `attempt: 0`
- **WHEN** `claimJob(db, jobId, "worker-1", 30000, now)` is called
- **THEN** the returned record has `status: 'running'`, `lockedBy: 'worker-1'`,
  `lockedUntil` equal to `now + 30000ms`, `attempt: 1`, and `startedAt` equal to `now`

#### Scenario: A second sequential claim of an already-claimed job finds nothing eligible

- **GIVEN** a `job` row just claimed by `worker-1` with a live (unexpired) lease
- **WHEN** `claimJob` is called again for the SAME `jobId` with a different owner
- **THEN** it returns `null`, and the row's `locked_by` still reads `worker-1`

#### Scenario: Claiming an unknown or terminal job returns null, never throws

- **GIVEN** a `jobId` that does not exist, and separately a `job` row at `status: 'done'`
- **WHEN** `claimJob` is called on each
- **THEN** both calls return `null`

### Requirement: Two concurrent claims against one queued job yield exactly one winner — proven by genuinely concurrent OS processes

`claimJob`'s atomicity SHALL guarantee that two GENUINELY concurrent callers racing the SAME `jobId`
never both succeed. This SHALL be proven by a test that spawns two REAL, separate OS processes (never
two same-process calls, which `node:sqlite`'s synchronous API can never make actually overlap), each
opening its OWN `DatabaseSync` connection to the SAME on-disk file, synchronized to attempt their claim
at the same wall-clock instant.

#### Scenario: Two real OS processes race the same queued job; exactly one wins

- **GIVEN** one `job` row at `status: 'queued'`, and two separate OS processes each holding their own
  `DatabaseSync` connection to the same database file
- **WHEN** both processes call `claimJob` for the SAME `jobId`, synchronized to the same instant
- **THEN** exactly one process's call returns the claimed record and the other returns `null`
- **AND** the database's own final state agrees: the job is `running`, `locked_by` names only the
  winner, and `attempt` is `1` (the loser's write never landed)

### Requirement: An expired lease makes its job claimable again, so a crashed worker's job does not stay stuck

A `running` job whose `locked_until` has passed SHALL become eligible for `claimJob` again, by ANY
owner — including a different one from whoever held the expired lease. This SHALL be proven both
deterministically (an injected clock, no real waiting) and via a REAL crash scenario: one OS process
claims with a short lease and exits WITHOUT releasing it (exactly what a crashed worker looks like from
the database's point of view), and a SEPARATE real process, after the lease has genuinely expired,
successfully claims the same job.

#### Scenario: A live lease is not yet claimable; an expired one is, by a different owner (deterministic)

- **GIVEN** a job claimed by `worker-crashed` with a 1000ms lease at `now`
- **WHEN** `claimJob` is attempted by `worker-2` at `now + 500ms` (lease still live), then again at
  `now + 2000ms` (lease expired)
- **THEN** the first attempt returns `null`
- **AND** the second attempt succeeds, returning a record with `lockedBy: 'worker-2'`

#### Scenario: A real crashed worker's job is rescued by a separate real process

- **GIVEN** one real OS process that claims a job with a 50ms lease and then exits without releasing it
- **WHEN** a SEPARATE real OS process, after the lease has genuinely elapsed, calls `claimJob` for the
  SAME job
- **THEN** the rescue succeeds — the job's `locked_by` becomes the rescuing process's owner, and
  `attempt` is `2` (a second successful claim on top of the crashed first one)

### Requirement: A lost update is impossible — two concurrent writers cannot silently discard each other's work

Two GENUINELY concurrent writers claiming TWO DIFFERENT jobs SHALL both succeed, and BOTH writes SHALL
survive in the database — proving the atomic, per-row SQL claim replaces the old
read-whole-file-then-write-whole-file model, where a later writer's full-object save could silently
discard an earlier, unrelated writer's change.

#### Scenario: Two real OS processes claim two different jobs concurrently; both writes survive

- **GIVEN** two SEPARATE `job` rows, both `queued`, and two separate OS processes each holding their
  own `DatabaseSync` connection to the same database file
- **WHEN** process A claims job-one and process B claims job-two, synchronized to the same instant
- **THEN** BOTH calls succeed, each returning its own claimed job
- **AND** the database's own final state agrees for BOTH rows independently: job-one is `running` owned
  by process A, job-two is `running` owned by process B — neither claim was discarded by the other's
  concurrent write

### Requirement: releaseJob and requeueJob are the atomic counterparts that end or revive a claim

`releaseJob(db, jobId, toStatus, now)` SHALL atomically move a `running` job to `toStatus`
(`'awaiting_pick' | 'done' | 'failed'`), clearing `locked_by`/`locked_until`, and SHALL return `null`
(changing nothing) when the job is not currently `running`. `requeueJob(db, jobId, now)` SHALL
atomically move a `failed` job back to `queued`, clearing any stale claim, and SHALL return `null`
(changing nothing) when the job is not currently `failed`.

#### Scenario: releaseJob moves a running job to done/awaiting_pick/failed, clearing the claim

- **GIVEN** a job claimed by `worker-1`
- **WHEN** `releaseJob(db, jobId, 'done')` is called
- **THEN** the job's `status` is `'done'` and it carries no `locked_by`/`locked_until`

#### Scenario: releaseJob refuses a job that is not currently running

- **GIVEN** a `job` row at `status: 'queued'` (never claimed)
- **WHEN** `releaseJob(db, jobId, 'done')` is called
- **THEN** it returns `null` and the row is unchanged

#### Scenario: requeueJob revives a failed job to queued, and it becomes claimable again

- **GIVEN** a `job` row at `status: 'failed'`
- **WHEN** `requeueJob(db, jobId)` is called
- **THEN** the job's `status` is `'queued'`, carries no claim, and a subsequent `claimJob` call for it
  succeeds

### Requirement: gate_request records a gate's name, its candidates, who decided, when, and the choice

`src/production-queue/gate-request-store.ts`'s `createGateRequest` SHALL record one gate offer —
`jobId`, `gateName`, and its `candidates` — undecided. `recordGateDecision(db, gateRequestId, {
decidedBy, choice }, now)` SHALL record who decided, a fresh `decidedAt`, and their choice onto an
already-offered gate request, THROWING `GateRequestNotFoundError` (before any write) for an unknown
`gateRequestId`. A re-decision SHALL overwrite the prior decision fields in place, never append a
second row.

#### Scenario: A gate request is created undecided, then decided

- **GIVEN** a job paused at its Cast gate with two candidates
- **WHEN** `createGateRequest` records the offer, and `recordGateDecision` later records the Operator's
  choice
- **THEN** the gate request carries the gate's name, the two candidates, and — after the decision —
  `decidedBy`, `decidedAt`, and `choice`

#### Scenario: Recording a decision for an unknown gate request throws before any write

- **GIVEN** a `gateRequestId` that does not exist
- **WHEN** `recordGateDecision` is called
- **THEN** it throws `GateRequestNotFoundError`

### Requirement: findNextQueuedJob returns the oldest queued job, FIFO by enqueued_at

`src/production-queue/job-store.ts`'s `findNextQueuedJob(db)` SHALL return the `queued` job with the
earliest `enqueued_at`, or `null` when no job is `queued`. A `running`, `awaiting_pick`, `done`, or
`failed` job SHALL never be returned — a parked or already-finished job never blocks the next queued one
from being found.

#### Scenario: The oldest of several queued jobs is returned

- **GIVEN** three `job` rows: two `queued` (different `enqueued_at`) and one `awaiting_pick`
- **WHEN** `findNextQueuedJob(db)` is called
- **THEN** it returns the `queued` job with the earlier `enqueued_at` — never the `awaiting_pick` one

#### Scenario: No queued job returns null

- **GIVEN** a database with no `job` row at `status: 'queued'`
- **WHEN** `findNextQueuedJob(db)` is called
- **THEN** it returns `null`

### Requirement: listGateRequestsForAsset finds every gate request across an Asset's jobs, joined through job

`src/production-queue/gate-request-store.ts`'s `listGateRequestsForAsset(db, assetId)` SHALL return every
`gate_request` row raised by ANY job belonging to `assetId` (joined through `job`, since a `gate_request`
carries only `job_id`, never `asset_id` directly), oldest first. `[]` for an Asset with none (or an
unknown asset id) — never throws.

#### Scenario: A gate request raised by an earlier leg's job is found from the Asset

- **GIVEN** an Asset whose first job raised (and had decided) one `gate_request`, followed by a second,
  resumed job for the SAME Asset
- **WHEN** `listGateRequestsForAsset(db, assetId)` is called
- **THEN** it returns the first job's gate request, decided

#### Scenario: An Asset with no gate requests returns an empty list

- **GIVEN** an Asset whose only job never raised a gate request (a zero-gate Recipe)
- **WHEN** `listGateRequestsForAsset(db, assetId)` is called
- **THEN** it returns `[]`

