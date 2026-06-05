## ADDED Requirements

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
