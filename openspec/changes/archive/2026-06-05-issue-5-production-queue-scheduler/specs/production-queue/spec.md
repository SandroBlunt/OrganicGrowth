## ADDED Requirements

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
