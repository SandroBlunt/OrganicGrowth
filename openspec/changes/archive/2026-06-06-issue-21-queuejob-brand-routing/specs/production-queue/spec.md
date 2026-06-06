## MODIFIED Requirements

### Requirement: Production Queue state file

The Production Queue SHALL be persisted as a plain JSON file at `data/queue.json` containing an
ordered list of jobs and a single-active-run lock. Each job SHALL have the shape
`{ idea_id, brand, phase, status, enqueued_at }` where `brand` is a non-empty string identifying the
Brand the job belongs to, `phase` is one of `cast | render`, `status` is one of
`queued | running | awaiting_cast | done | failed`, and `enqueued_at` is an ISO-8601 timestamp. The
lock SHALL record at most one active job. The ledger (`data/ledger.json`) remains the source of truth;
the queue is derived from accepted Ideas and never the reverse. The queue path is a **global constant**
(shared across all Brands, brand-agnostic) — it is NEVER derived from a Brand slug.

#### Scenario: Enqueued job carries the documented shape including brand

- **GIVEN** an empty queue and a Brand slug
- **WHEN** an accepted Idea for that Brand is enqueued
- **THEN** the resulting job has `phase: cast`, `status: queued`, the Idea's `idea_id`, a non-empty
  `brand` matching the Brand slug, and an ISO-8601 `enqueued_at`

#### Scenario: A missing queue file loads as the empty queue

- **GIVEN** `data/queue.json` does not exist
- **WHEN** the queue is loaded
- **THEN** an empty queue (no jobs, lock free) is returned rather than an error

### Requirement: Accepting an Idea enqueues a cast-phase job

When an Idea is accepted at Review, the system SHALL append exactly one job for that Idea with
`phase: cast`, `status: queued`, and the Brand's slug stamped on `brand`, to the Production Queue
(auto-enqueue per ADR-0004; there is no separate `/produce` kickoff). The `brand` on the enqueued
job SHALL match the Brand the Idea belongs to — derived from the explicit Brand argument passed to
the enqueue call, never from session/active-brand state. Enqueue SHALL be idempotent per `idea_id`.

#### Scenario: Auto-enqueue stamps the correct brand on the cast job

- **GIVEN** an accepted Idea for Brand `"alpha"` and an empty queue
- **WHEN** the Idea is enqueued via auto-enqueue-on-accept with Brand `"alpha"`
- **THEN** the queued job carries `brand: "alpha"` and `phase: cast`
- **AND** no ambient brand pointer is read or written

#### Scenario: Re-accepting the same Idea does not duplicate its job

- **GIVEN** a queue that already contains a job for Idea `idea-X`
- **WHEN** Idea `idea-X` is enqueued again
- **THEN** the queue still contains exactly one job for `idea-X`

### Requirement: Picking a Cast enqueues the render and the worker renders it when the Space is free

`/pick-cast <brand> <idea-id> <n>` SHALL, after recording the chosen Character, enqueue a
`phase: render`, `status: queued` job stamped with the same Brand slug (`enqueueRender`, idempotent
per `idea_id` for a render job) and trigger a drain. The render job's `brand` field SHALL match the
Brand argument passed to the command — derived explicitly, not from session state. When the Space is
free, the worker SHALL start that render; on completion the worker SHALL record the finished **Asset**
and transition the Idea `casting → produced` to the ledger (`writeIdeaAsset` + `writeIdeaStatus("produced")`,
the status derived from the `render → done` queue transition). The worker SHALL render the Asset and
**stop** — it SHALL NOT publish (generate-never-publish; ADR-0002).

#### Scenario: The render job queued by /pick-cast carries the correct brand

- **GIVEN** `/pick-cast` called with Brand `"alpha"`, an Idea id, and a valid pick index
- **WHEN** the Character is picked successfully
- **THEN** the enqueued render job carries `brand: "alpha"` and `phase: render`

#### Scenario: Picking a Cast enqueues a render job

- **GIVEN** an Idea at the Cast gate whose Character the Operator has picked
- **WHEN** `/pick-cast` records the chosen Character
- **THEN** exactly one `phase: render`, `status: queued` job is enqueued for that Idea
- **AND** enqueuing the render again for the same Idea adds no duplicate render job

#### Scenario: The worker renders the enqueued render when the Space is free

- **GIVEN** a render job queued for an Idea and a free Space
- **WHEN** the worker drains and a later tick reaps the completed render
- **THEN** the finished Asset is recorded and the Idea transitions `casting → produced`
- **AND** the worker takes no publish or Facebook action

## ADDED Requirements

### Requirement: parseJob validates the brand field and defensively drops brandless jobs

When loading the Production Queue from disk, `parseJob` SHALL validate that each job carries a
non-empty `brand` string. A job with a missing or empty `brand` field SHALL be dropped (not persisted
into the loaded state) with a logged warning — not thrown as an error — so a single corrupt job does
not crash the drain. Well-formed jobs are unaffected. The brand is validated as a string at parse time
only; resolution against the filesystem happens at the worker level, not at parse time.

#### Scenario: parseJob round-trips the brand field for a well-formed job

- **GIVEN** a raw job object with a valid `brand`, `idea_id`, `phase`, `status`, and `enqueued_at`
- **WHEN** `parseQueueState` loads it
- **THEN** the parsed job carries the same `brand` value

#### Scenario: parseJob drops a job with a missing brand

- **GIVEN** a raw job object missing the `brand` field (all other fields valid)
- **WHEN** `parseQueueState` loads it
- **THEN** the job is dropped from the loaded state (not included in `jobs`)
- **AND** the drain does not crash

#### Scenario: parseJob drops a job with an empty-string brand

- **GIVEN** a raw job object with `brand: ""` (all other fields valid)
- **WHEN** `parseQueueState` loads it
- **THEN** the job is dropped from the loaded state
- **AND** the drain does not crash

### Requirement: The worker reads brand off each job and routes ledger writes via the resolver

The worker and render path SHALL derive the target Brand from `job.brand` for **every** ledger write
and never from session/active-brand state (CONTEXT.md: "There is no global 'active brand' pointer
file"). A `resolveLedger(brand: string): LedgerWrites` factory SHALL be injected into `WorkerDeps`
so the worker can get the brand-scoped ledger writers for each job. If `job.brand` is missing or
unresolvable, the job SHALL be treated as a failure: marked `failed`, the Operator notified, the
lock released, and the queue drain continued — never crashing the entire drain.

#### Scenario: A cast job for Brand A writes to Brand A's ledger only

- **GIVEN** a global queue with a running cast job for Brand `"alpha"`
- **WHEN** the worker reaps the completed cast-gen
- **THEN** the Cast and `casting` status are written to Brand `"alpha"`'s ledger
- **AND** Brand `"beta"`'s ledger is not touched

#### Scenario: A render job for Brand B writes to Brand B's ledger only

- **GIVEN** a global queue with a running render job for Brand `"beta"`
- **WHEN** the worker reaps the completed render
- **THEN** the Asset and `produced` status are written to Brand `"beta"`'s ledger
- **AND** Brand `"alpha"`'s ledger is not touched

#### Scenario: An unresolvable brand causes a defensive failure, not a drain crash

- **GIVEN** a job in the queue whose `brand` cannot be resolved by the ledger factory
- **WHEN** the worker attempts to reap it
- **THEN** the job is marked `failed` and the Operator is notified
- **AND** the drain continues with the next ready job (the queue does not crash)

### Requirement: ADR-0004 gate-never-holds-the-Space is preserved across Brands

The single-Space lock and the gate-never-holds-the-Space behavior (ADR-0004) SHALL be preserved
when several Brands' jobs are in the one global queue. An Idea paused at its Cast gate (`awaiting_cast`)
SHALL NOT hold the Space regardless of its Brand; the next queued job — from any Brand — SHALL
proceed while the gated Idea waits.

#### Scenario: Brand A at the Cast gate does not block Brand B's cast-gen

- **GIVEN** a global queue where Brand `"alpha"`'s cast job is `awaiting_cast` and Brand `"beta"`'s
  cast job is `queued`, with the lock free
- **WHEN** the worker drains
- **THEN** Brand `"beta"`'s cast-gen starts and the Space lock is taken
- **AND** Brand `"alpha"`'s `awaiting_cast` job is not restarted

#### Scenario: Two Brands' cast jobs drain serialized — one completes and the other starts

- **GIVEN** two Brands' cast jobs queued in the global queue, the Space initially free
- **WHEN** the first (earliest enqueued) cast-gen completes and reaches the Cast gate
- **THEN** the first Brand's job moves to `awaiting_cast` and the Space lock releases
- **AND** the second Brand's cast-gen is started with no Operator action
