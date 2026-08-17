## MODIFIED Requirements

### Requirement: Production Queue state file

The Production Queue SHALL be persisted as a plain JSON file at `data/queue.json` containing an
ordered list of jobs. Each job SHALL have the shape
`{ idea_id, brand, recipe, gate, status, enqueued_at, pick? }` where `brand` is a non-empty string
identifying the Brand the job belongs to, `recipe` is a non-empty string naming the chosen Recipe this
job produces (issue #56), `gate` is the generic gate cursor — a non-empty gate-name string or `null` —
`status` is one of `queued | running | awaiting_pick | done | failed`, `enqueued_at` is an ISO-8601
timestamp, and `pick` (present only on a next-leg job) is the Operator's resolved pick from the
PRECEDING gate. There SHALL be no separate `lock` field (issue #203 — DELETED, not ported): the
single-active-run invariant is derived purely from reading `jobs[].status` (see "At most one job runs at
a time" below), so there is no second, independently-writable structure that could drift out of sync
with the jobs it was meant to describe. A stray `lock` key present on a hand-edited or pre-#203
`data/queue.json` SHALL be silently ignored on load and SHALL NEVER be re-written on save. The Brand's
ledger (`data/brands/<slug>/ledger.json`) remains the source of truth; the queue is derived from
accepted Ideas' chosen Recipes and never the reverse. The queue path is a **global constant** (shared
across all Brands, brand-agnostic) — it is NEVER derived from a Brand slug.

#### Scenario: Enqueued job carries the documented shape including brand and recipe

- **GIVEN** an empty queue, a Brand slug, and a chosen Recipe
- **WHEN** a job is enqueued for that Brand/Recipe targeting the Recipe's first gate
- **THEN** the resulting job has that `recipe`, the resolved `gate`, `status: queued`, the Idea's
  `idea_id`, a non-empty `brand` matching the Brand slug, and an ISO-8601 `enqueued_at`

#### Scenario: A missing queue file loads as the empty queue

- **GIVEN** `data/queue.json` does not exist
- **WHEN** the queue is loaded
- **THEN** an empty queue (no jobs) is returned rather than an error

#### Scenario: A stray legacy lock key is ignored on load and never re-written on save (issue #203)

- **GIVEN** a hand-edited or pre-#203 `data/queue.json` carrying a `lock` key alongside its `jobs`
- **WHEN** the queue is loaded, then saved back to disk
- **THEN** the loaded state carries no `lock` field, and the saved file on disk carries no `lock` key
  either

### Requirement: The scheduler returns the next ready job FIFO under single concurrency

The system SHALL provide a pure `nextReady(queue)` function returning the single next job the Producer
should run, honouring the Space's single-concurrency constraint (ADR-0004). When no job is `running`,
it SHALL return the `queued` job with the **earliest `enqueued_at`** (FIFO by acceptance time, not array
position). It SHALL return nothing when there is no eligible `queued` job. `nextReady` SHALL be pure: it
reads `enqueued_at` for ordering and never reads the clock.

#### Scenario: FIFO by acceptance time among multiple queued jobs

- **GIVEN** a queue with multiple `queued` jobs whose `enqueued_at` timestamps differ
- **WHEN** `nextReady(queue)` is called
- **THEN** it returns the job with the earliest `enqueued_at`, regardless of the jobs' array order

#### Scenario: An empty queue has no ready job

- **GIVEN** a queue with no `queued` jobs
- **WHEN** `nextReady(queue)` is called
- **THEN** it returns nothing

### Requirement: At most one job runs at a time (single-Space lock)

The Production Queue SHALL never expose a second runnable job while one is already `running`. This
invariant SHALL be derived PURELY by reading every job's own `status` (issue #203 — no separate lock
structure is kept in step alongside it): when any job is `running`, `nextReady(queue)` SHALL return
nothing, so the Producer starts at most one Space generation at a time. `markRunning` SHALL be refused
(the `space_busy` transition code) whenever another job is already `running`, so the queue SHALL hold at
most one `running` job at any time.

#### Scenario: Nothing is ready while a job is running

- **GIVEN** a queue with one `running` job and one or more `queued` jobs
- **WHEN** `nextReady(queue)` is called
- **THEN** it returns nothing

#### Scenario: Marking a job running bars a second start while it is running

- **GIVEN** a queue with two `queued` jobs
- **WHEN** the first job is marked `running`
- **THEN** exactly one job is `running`
- **AND** attempting to mark the second job `running` is refused (`space_busy`) while the first job is
  still `running`

### Requirement: A failed job does not block its successors

A job marked `failed` SHALL remain in the queue (surfaced to the Operator) but SHALL NOT prevent a later
`queued` job from being returned by `nextReady`, and SHALL NOT count as `running` for the
single-concurrency invariant (ADR-0004: failure is isolated per job — the queue continues with the next
job).

#### Scenario: A failed job is skipped and a later queued job runs

- **GIVEN** a queue whose earliest job is `failed` and a later job is `queued`
- **WHEN** `nextReady(queue)` is called
- **THEN** it returns the later `queued` job

#### Scenario: Marking a job failed frees the Space for the next job

- **GIVEN** a `running` job
- **WHEN** the job is marked `failed`
- **THEN** the job's status is `failed` and it no longer counts as `running` — a later `queued` job now
  becomes ready

### Requirement: A job paused at its gate does not hold the Space

`nextReady(queue)` SHALL skip jobs in status `awaiting_pick` (a leg paused at its gate, generalizing
the old `awaiting_cast`) and never return one as ready. An `awaiting_pick` job SHALL NOT count as
`running` for the single-concurrency invariant, so the next `queued` job — for ANY `(brand, idea,
recipe)` — can proceed while the Operator resolves the pending gate (ADR-0008: gates do not hold the
Space).

#### Scenario: awaiting_pick is skipped, the next queued job is returned

- **GIVEN** a queue whose earliest job is `awaiting_pick` and a later job is `queued`
- **WHEN** `nextReady(queue)` is called
- **THEN** it skips the `awaiting_pick` job and returns the `queued` job

#### Scenario: Reaching a gate frees the Space for the next job

- **GIVEN** a `running` job
- **WHEN** the job is marked `awaiting_pick`
- **THEN** the job's status is `awaiting_pick` and it no longer counts as `running`

### Requirement: mark transitions move a job through its lifecycle and maintain the lock, keyed on the composite triple

The system SHALL provide pure `mark*` transitions that move a job through
`queued → running → (awaiting_pick | done | failed)`, EVERY ONE keyed on `(brand, idea_id, recipe)`
(issue #56). "The lock" this requirement's own title names is NOT a stored field (issue #203 deleted
it) — it is the single-active-run INVARIANT, kept correct purely because every transition writes only
each job's own `status`: `markRunning` SHALL move a job to `running` (refusing `space_busy` if another
job already is); `markAwaitingPick`, `markDone`, and `markFailed` SHALL move a `running` job out of
`running`; `markPickConsumed` SHALL move an `awaiting_pick` job to `done` when the Operator's pick is
recorded (generalizing `markCastConsumed`, C24); `requeueFailed` SHALL revive a `failed` job to
`queued` (C4). Each transition SHALL be pure — it returns a NEW queue state and never mutates the
input, never reads the clock, and keeps at most one `running` job. A transition for an unknown
`(brand, idea_id, recipe)`, or from an invalid prior status, SHALL be refused with an identifiable
reason rather than silently corrupting the queue. A transition targeting one `(brand, idea, recipe)`
triple SHALL NEVER affect a job for a different Brand, a different Idea, or a DIFFERENT RECIPE OF THE
SAME IDEA.

#### Scenario: A queued job advances to running and back to done

- **GIVEN** a queue with one `queued` job
- **WHEN** the job is marked `running` and then marked `done`
- **THEN** after `markRunning` the job is the ONLY `running` job in the queue
- **AND** after `markDone` the job is `done` and no job in the queue is `running`

#### Scenario: Transitions never mutate the input state

- **GIVEN** a queue state passed to any `mark*` transition
- **WHEN** the transition is applied
- **THEN** a new state is returned and the original input state is unchanged

#### Scenario: An invalid transition is refused

- **GIVEN** a queue with no `running` job
- **WHEN** `markDone` is attempted for a job that is not `running`
- **THEN** the transition is refused with an identifiable reason and the queue is unchanged

#### Scenario: A transition for one Recipe never touches a sibling Recipe's job for the same Idea

- **GIVEN** one Idea holding TWO jobs — one per Recipe — both currently `awaiting_pick`
- **WHEN** `markPickConsumed` is called naming ONE specific Recipe
- **THEN** only that Recipe's job moves to `done`
- **AND** the OTHER Recipe's job remains `awaiting_pick`, completely untouched

#### Scenario: A transition is keyed across Brands too (C6)

- **GIVEN** two Brands both holding a `queued` job for the identical `(idea_id, recipe)` pair
- **WHEN** `markRunning` is called naming ONE Brand
- **THEN** only that Brand's job moves to `running`
- **AND** the other Brand's identically-named job remains `queued`, untouched

### Requirement: A failed job is isolated and /queue reflects every status

A Space operation that fails SHALL be marked `failed` for its `(brand, idea_id, recipe)` (the job
REMAINS in the queue as a historical record) and SHALL free the Space for the next ready job, so the
queue continues with the next ready job rather than blocking (ADR-0008: failure is isolated per job). A
failed Idea/Recipe's ledger status SHALL NOT be advanced — no Cast or Asset is fabricated. The
`/queue` listing SHALL reflect all five job statuses — `queued`, `running`, `awaiting_pick`, `done`,
and `failed`.

#### Scenario: A failed job is isolated and the queue continues

- **GIVEN** a `running` job that fails and a later `queued` job (any Brand/Recipe)
- **WHEN** the failure is recorded
- **THEN** the failed job's status is `failed` and no job in the queue is left `running`
- **AND** the failed Idea/Recipe's ledger status is not advanced (no fabricated Cast or Asset)

#### Scenario: /queue reflects all five statuses

- **GIVEN** a queue holding jobs in `queued`, `running`, `awaiting_pick`, `done`, and `failed`
- **WHEN** `/queue` is run
- **THEN** the output shows a job in each of the five statuses

### Requirement: Job identity is keyed on the composite (brand, idea, recipe) — a second Recipe is never dropped

The Production Queue SHALL key every job's identity and dedupe check on the COMPOSITE
`(brand, idea_id, recipe)` triple (ADR-0009, ADR-0011, issue #56) — never on `idea_id` alone or on the
`(brand, idea_id)` pair. With the Operator able to choose 1..N Recipes per Idea, a bare
`(brand, idea_id)` key would collide two Recipes' jobs for the same Idea into one dedupe bucket and
silently drop the second Recipe's job the instant it was enqueued. `enqueue`/`enqueueNextLeg` (the
pure job-append functions) and `hasJobFor`/`hasJobAtGate` (the pure dedupe/lookup predicates) SHALL
all key on this triple.

#### Scenario: A second Recipe on the same accepted Idea is NOT dropped as a duplicate

- **GIVEN** an empty queue and one Idea already holding a LIVE job for Recipe `"character-explainer-with-cast"`
- **WHEN** a job is enqueued for the SAME `(brand, idea)` but a DIFFERENT Recipe (`"carousel"`)
- **THEN** the second Recipe's job is appended — the queue now holds TWO live jobs for that Idea, one
  per Recipe
- **AND** neither job masks or overwrites the other

#### Scenario: The same (brand, idea, recipe) triple enqueued twice is idempotent

- **GIVEN** a queue already holding a LIVE job for `(brand-A, idea-X, recipe-1)`
- **WHEN** a job is enqueued again for the EXACT SAME triple
- **THEN** no second job is added (idempotent no-op)

#### Scenario: A different Brand's identical (idea, recipe) pair is not masked (C6)

- **GIVEN** Brand `"alpha"` already holds a job for `(idea-X, recipe-1)`
- **WHEN** Brand `"beta"` enqueues a job for the SAME `(idea-X, recipe-1)` pair
- **THEN** Brand `"beta"`'s job is appended — it is not treated as a duplicate of Brand `"alpha"`'s
