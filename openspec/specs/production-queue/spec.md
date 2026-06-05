# production-queue Specification

## Purpose
TBD - created by archiving change issue-2-runtime-harness-enqueue. Update Purpose after archive.
## Requirements
### Requirement: Production Queue state file

The Production Queue SHALL be persisted as a plain JSON file at `data/queue.json` containing an
ordered list of jobs and a single-active-run lock. Each job SHALL have the shape
`{ idea_id, phase, status, enqueued_at }` where `phase` is one of `cast | render`, `status` is one of
`queued | running | awaiting_cast | done | failed`, and `enqueued_at` is an ISO-8601 timestamp. The
lock SHALL record at most one active job. The ledger (`data/ledger.json`) remains the source of truth;
the queue is derived from accepted Ideas and never the reverse.

#### Scenario: Empty queue is well-formed

- **GIVEN** a freshly seeded `data/queue.json`
- **WHEN** the queue is loaded
- **THEN** it has an empty `jobs` list and a lock with no active job

#### Scenario: A missing queue file loads as the empty queue

- **GIVEN** `data/queue.json` does not exist
- **WHEN** the queue is loaded
- **THEN** an empty queue (no jobs, lock free) is returned rather than an error

#### Scenario: Enqueued job carries the documented shape with an ISO-8601 timestamp

- **GIVEN** an empty queue
- **WHEN** an accepted Idea is enqueued
- **THEN** the resulting job has `phase: cast`, `status: queued`, the Idea's `idea_id`, and an
  ISO-8601 `enqueued_at`

### Requirement: Accepting an Idea enqueues a cast-phase job

When an Idea is accepted at Review, the system SHALL append exactly one job for that Idea with
`phase: cast` and `status: queued` to the Production Queue (auto-enqueue per ADR-0004; there is no
separate `/produce` kickoff). Enqueue SHALL be idempotent per `idea_id`: re-accepting an Idea that
already has a job MUST NOT add a second job.

#### Scenario: Accepting an Idea appends one queued cast job

- **GIVEN** a queue with no job for Idea `idea-X`
- **WHEN** Idea `idea-X` is accepted and enqueued
- **THEN** the queue contains exactly one job for `idea-X` with `phase: cast` and `status: queued`

#### Scenario: Re-accepting the same Idea does not duplicate its job

- **GIVEN** a queue that already contains a job for Idea `idea-X`
- **WHEN** Idea `idea-X` is enqueued again
- **THEN** the queue still contains exactly one job for `idea-X`

### Requirement: Only accepted Ideas enter the queue

The Production Queue SHALL contain jobs only for Ideas whose ledger status is `accepted`. Enqueue of an
Idea that is not `accepted` (e.g. `rejected` or `suggested`) SHALL be refused and MUST NOT add a job,
so rejected Ideas never incur a production job (credits are spent only on accepted Ideas).

#### Scenario: A rejected Idea produces no job

- **GIVEN** Idea `idea-Y` has ledger status `rejected`
- **WHEN** enqueue is attempted for `idea-Y`
- **THEN** no job is added to the queue and the attempt is refused

### Requirement: Queue listing shows each job

The `/queue` command SHALL render every job in the Production Queue, showing each job's `idea_id`,
`phase`, and `status`. When the queue is empty it SHALL report that there are no jobs.

#### Scenario: Listing renders idea_id, phase, and status for each job

- **GIVEN** a queue containing jobs for `idea-A` (`cast`/`queued`) and `idea-B` (`render`/`running`)
- **WHEN** `/queue` is run
- **THEN** the output includes `idea-A` with its phase and status and `idea-B` with its phase and
  status

#### Scenario: Empty queue reports no jobs

- **GIVEN** an empty queue
- **WHEN** `/queue` is run
- **THEN** the output states that the queue has no jobs

### Requirement: The scheduler returns the next ready job FIFO under single concurrency

The system SHALL provide a pure `nextReady(queue)` function returning the single next job the Producer
should run, honouring the Space's single-concurrency constraint (ADR-0004). When no job is `running` and
the lock is free, it SHALL return the `queued` job with the **earliest `enqueued_at`** (FIFO by
acceptance time, not array position). It SHALL return nothing when there is no eligible `queued` job.
`nextReady` SHALL be pure: it reads `enqueued_at` for ordering and never reads the clock.

#### Scenario: FIFO by acceptance time among multiple queued jobs

- **GIVEN** a queue with multiple `queued` jobs whose `enqueued_at` timestamps differ
- **WHEN** `nextReady(queue)` is called
- **THEN** it returns the job with the earliest `enqueued_at`, regardless of the jobs' array order

#### Scenario: An empty queue has no ready job

- **GIVEN** a queue with no `queued` jobs
- **WHEN** `nextReady(queue)` is called
- **THEN** it returns nothing

### Requirement: At most one job runs at a time (single-Space lock)

The Production Queue SHALL never expose a second runnable job while one is already `running`. When any job
is `running` (or the lock's `active_job` is set), `nextReady(queue)` SHALL return nothing, so the Producer
starts at most one Space generation at a time. Marking a job `running` SHALL set the lock to that job, and
the queue SHALL hold at most one `running` job at any time.

#### Scenario: Nothing is ready while a job is running

- **GIVEN** a queue with one `running` job and one or more `queued` jobs
- **WHEN** `nextReady(queue)` is called
- **THEN** it returns nothing

#### Scenario: Marking a job running sets the lock and bars a second start

- **GIVEN** a queue with two `queued` jobs and a free lock
- **WHEN** the first job is marked `running`
- **THEN** the lock's `active_job` is that job and exactly one job is `running`
- **AND** attempting to mark the second job `running` is refused while the lock is held

### Requirement: A job paused at the Cast gate does not hold the Space

`nextReady(queue)` SHALL skip jobs in status `awaiting_cast` (an Idea paused at its **Cast** gate) and
never return one as ready. An `awaiting_cast` job SHALL NOT hold the single-Space lock, so the next
`queued` job can proceed while the Operator decides the Character (ADR-0004: gates do not hold the Space).

#### Scenario: awaiting_cast is skipped, the next queued job is returned

- **GIVEN** a queue whose earliest job is `awaiting_cast` and a later job is `queued`, with the lock free
- **WHEN** `nextReady(queue)` is called
- **THEN** it skips the `awaiting_cast` job and returns the `queued` job

#### Scenario: Reaching the Cast gate releases the lock

- **GIVEN** a `running` cast job holding the lock
- **WHEN** the job is marked `awaiting_cast`
- **THEN** the job's status is `awaiting_cast` and the lock is released (`active_job` is null)

### Requirement: A failed job does not block its successors

A job marked `failed` SHALL remain in the queue (surfaced to the Operator) but SHALL NOT prevent a later
`queued` job from being returned by `nextReady`, and SHALL NOT hold the single-Space lock (ADR-0004:
failure is isolated per job — the queue continues with the next job).

#### Scenario: A failed job is skipped and a later queued job runs

- **GIVEN** a queue whose earliest job is `failed` and a later job is `queued`, with the lock free
- **WHEN** `nextReady(queue)` is called
- **THEN** it returns the later `queued` job

#### Scenario: Marking a job failed releases the lock

- **GIVEN** a `running` job holding the lock
- **WHEN** the job is marked `failed`
- **THEN** the job's status is `failed` and the lock is released (`active_job` is null)

### Requirement: mark transitions move a job through its lifecycle and maintain the lock

The system SHALL provide pure `mark*` transitions that move a job through
`queued → running → (awaiting_cast | done | failed)` and keep the single-active-run lock in step:
`markRunning` SHALL set the lock; `markAwaitingCast`, `markDone`, and `markFailed` SHALL release it. Each
transition SHALL be pure — it returns a NEW queue state and never mutates the input, never reads the
clock, and keeps at most one `running` job. A transition for an unknown Idea, or from an invalid prior
status, SHALL be refused with an identifiable reason rather than silently corrupting the queue.

#### Scenario: A queued job advances to running and back to done

- **GIVEN** a queue with one `queued` job and a free lock
- **WHEN** the job is marked `running` and then marked `done`
- **THEN** after `markRunning` the job is `running` and the lock holds it
- **AND** after `markDone` the job is `done` and the lock is released

#### Scenario: Transitions never mutate the input state

- **GIVEN** a queue state passed to any `mark*` transition
- **WHEN** the transition is applied
- **THEN** a new state is returned and the original input state is unchanged

#### Scenario: An invalid transition is refused

- **GIVEN** a queue with no `running` job
- **WHEN** `markDone` is attempted for a job that is not `running`
- **THEN** the transition is refused with an identifiable reason and the queue is unchanged

### Requirement: Queue transitions reflect Idea status into the ledger

Queue transitions that complete a production phase SHALL reflect the implied Idea status into
`data/ledger.json`, which remains the source of truth (the status is derived from the queue transition,
never inferred from anything else). A pure mapping SHALL define the two reflection points and only those:
a **cast** job reaching `awaiting_cast` implies the Idea moves `accepted → casting`; a **render** job
reaching `done` implies the Idea moves `casting → produced`. Transitions that do not complete a phase
(e.g. a job entering `running`, or any job failing) SHALL imply no ledger change. A thin write shell SHALL
apply the implied status to the ledger record so queue and ledger stay consistent.

#### Scenario: A cast job reaching its gate maps to ledger casting

- **GIVEN** a cast-phase job transitioning to `awaiting_cast`
- **WHEN** the queue→ledger status mapping is evaluated
- **THEN** the implied Idea status is `casting`

#### Scenario: A render job completing maps to ledger produced

- **GIVEN** a render-phase job transitioning to `done`
- **WHEN** the queue→ledger status mapping is evaluated
- **THEN** the implied Idea status is `produced`

#### Scenario: A transition with no phase completion implies no ledger change

- **GIVEN** a job transitioning to `running`, or any job transitioning to `failed`
- **WHEN** the queue→ledger status mapping is evaluated
- **THEN** it implies no ledger status change

#### Scenario: The write shell keeps the ledger in step

- **GIVEN** a ledger whose Idea is `accepted`
- **WHEN** the write shell applies the `casting` status implied by that Idea's cast job reaching its gate
- **THEN** the ledger record for that Idea reads `casting` and no other Idea is changed

### Requirement: Accepting an Idea triggers a drain that runs ready cast-gens serialized

Accepting an Idea (which auto-enqueues a cast job) SHALL trigger a background **drain-on-trigger** task
that starts the next Space-ready job and exits — there SHALL be **no always-on daemon** (ADR-0004). The
drain SHALL honour the Space's single-concurrency constraint: it SHALL start **at most one** Space
operation at a time, even when several jobs are ready, so two Space operations are **never** in flight at
once. The next job started SHALL be the `nextReady` job (FIFO by `enqueued_at`), marked `running` under
the single-Space lock before its Space op is started. A drain that finds the Space busy, or finds no ready
job, SHALL be a clean no-op. The worker SHALL drive the Space only through the narrow injected Magnific
port, never the live Space.

#### Scenario: A drain starts exactly one ready cast-gen and exits

- **GIVEN** a free Space and a queue with one or more ready `queued` cast jobs
- **WHEN** the worker drains
- **THEN** it marks the earliest-`enqueued_at` job `running` and takes the single-Space lock
- **AND** it starts exactly one Space operation through the injected port and then exits (no daemon)

#### Scenario: A drain never starts a second Space operation while one is running

- **GIVEN** a queue with one `running` job holding the lock and other `queued` jobs
- **WHEN** the worker drains
- **THEN** it starts no further Space operation (at most one Space op is ever in flight)

#### Scenario: A drain with nothing ready is a clean no-op

- **GIVEN** a free Space and a queue with no `queued` job (all `awaiting_cast` / `done` / `failed`)
- **WHEN** the worker drains
- **THEN** it starts no Space operation and changes no state

### Requirement: A job at the Cast gate releases the Space so a later cast-gen proceeds

When a cast-gen reaches the Cast gate, the worker SHALL transition its job to `awaiting_cast`, which
RELEASES the single-Space lock (ADR-0004: gates do not hold the Space). With the lock free, the next
queued cast-gen — including a **later-accepted** Idea's — SHALL be started while the gated Idea waits at
its gate. The gated Idea SHALL NOT be re-run, and exactly one Space operation SHALL ever be in flight. The
worker SHALL record the Cast and the `accepted → casting` status to the ledger (`writeIdeaCast` +
`writeIdeaStatus`, the status derived from the queue transition via `ledgerStatusForTransition`).

#### Scenario: Reaching the Cast gate frees the Space and the next cast-gen runs

- **GIVEN** two accepted Ideas whose cast jobs are queued, with the earliest started and at the Cast gate
- **WHEN** the worker reaps the first to `awaiting_cast` and then advances the queue
- **THEN** the first Idea's job is `awaiting_cast` and the single-Space lock is released
- **AND** the second (later-accepted) Idea's cast-gen is started while the first waits at its gate
- **AND** the gated Idea is not re-run; exactly one Space operation is in flight at any time

### Requirement: Picking a Cast enqueues the render and the worker renders it when the Space is free

Picking a Cast (`/pick-cast <idea-id> <n>`) SHALL, after recording the chosen Character, enqueue a
`phase: render`, `status: queued` job for that Idea (`enqueueRender`, idempotent per `idea_id` for a
render job) and trigger a drain. When the Space is free, the worker SHALL start that render; on completion
the worker SHALL record the finished **Asset** and transition the Idea `casting → produced` to the ledger
(`writeIdeaAsset` + `writeIdeaStatus("produced")`, the status derived from the `render → done` queue
transition). The worker SHALL render the Asset and **stop** — it SHALL NOT publish (generate-never-
publish; ADR-0002).

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

### Requirement: A periodic tick reaps a completed run and starts the next job unattended

The worker SHALL provide a **required** periodic **tick** that reaps a completed Space operation and
advances the queue with **no Operator action** (ADR-0004) — necessary because Space operations are async
and can complete while the Operator is idle, with no accept or pick to trigger a drain. The tick SHALL poll the single
in-flight Space operation: if it is still running, the tick SHALL do nothing; if it has completed, the
tick SHALL reap it (a cast-gen → `awaiting_cast` + Cast/casting ledger writes; a render → `done` +
Asset/produced ledger writes; a failure → `failed` + Operator notification), then start the next ready
job. The default host for the periodic tick SHALL be `/loop` (a documented build choice).

#### Scenario: A tick reaps a render that completed while idle and starts the next job

- **GIVEN** a render that was started and has completed while the Operator was idle, with a later job queued
- **WHEN** the periodic tick runs with no Operator action
- **THEN** it reaps the completed render (records the Asset, transitions `casting → produced`, releases
  the lock)
- **AND** it starts the next ready job

#### Scenario: A tick on a still-running operation does nothing

- **GIVEN** a Space operation that is started but still in flight
- **WHEN** the periodic tick runs
- **THEN** it reaps nothing and starts no new operation (it polls `running` and returns)

### Requirement: A permission path lets the worker drive the Space unattended

The build SHALL provide an **allowlist / non-auto permission path** so the background worker can drive
`spaces_edit`/`spaces_run` without per-call approval — necessary because `spaces_edit`/`spaces_run` are
auto-denied by the permission classifier as "modifying shared infrastructure" and need per-call approval
even with verbal consent (`docs/producer-spikes-results.md`). This permission
path SHALL be a real, documented configuration artifact, referenced from the worker so it is discoverable.

#### Scenario: An allowlist config grants the worker non-auto Space permission

- **GIVEN** the background worker that must call `spaces_edit`/`spaces_run` unattended
- **WHEN** the permission allowlist config is in place
- **THEN** `spaces_edit`/`spaces_run` are permitted for the worker without per-call approval
- **AND** the permission path is documented (including the default `/loop` tick host) and referenced from
  the worker

### Requirement: A failed job is isolated and surfaced to the Operator with when and why

A Space operation that fails SHALL be marked `failed` (the job REMAINS in the queue for the Operator to
see) and SHALL RELEASE the single-Space lock, so the queue continues with the next job rather than
blocking (ADR-0004: failure is isolated per job). On failure the worker SHALL notify the Operator with
**when** (an injected ISO-8601 timestamp) and **why** (the driver's failure reason — its stable code and
message). A failed Idea's ledger status SHALL NOT be advanced — no Cast or Asset is fabricated. The
`/queue` listing SHALL reflect all five job statuses — `queued`, `running`, `awaiting_cast`, `done`, and
`failed`.

#### Scenario: A failed Space op is isolated and the queue continues

- **GIVEN** a started Space op that fails and a later `queued` job
- **WHEN** the tick reaps the failure
- **THEN** the failed job's status is `failed` and the single-Space lock is released
- **AND** the next `queued` job is started (the failure does not block its successors)

#### Scenario: A failure notifies the Operator with when and why

- **GIVEN** a Space op that fails with an identifiable reason
- **WHEN** the worker reaps the failure
- **THEN** the Operator is notified with an ISO-8601 timestamp (when) and the failure's code/message (why)
- **AND** the failed Idea's ledger status is not advanced (no fabricated Cast or Asset)

#### Scenario: /queue reflects all five statuses

- **GIVEN** a queue holding jobs in `queued`, `running`, `awaiting_cast`, `done`, and `failed`
- **WHEN** `/queue` is run
- **THEN** the output shows a job in each of the five statuses

