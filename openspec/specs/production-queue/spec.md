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

