## ADDED Requirements

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
