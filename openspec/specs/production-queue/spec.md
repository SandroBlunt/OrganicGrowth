# production-queue Specification

## Purpose
TBD - created by archiving change issue-2-runtime-harness-enqueue. Update Purpose after archive.
## Requirements
### Requirement: Production Queue state file

The Production Queue SHALL be persisted as a plain JSON file at `data/queue.json` containing an
ordered list of jobs and a single-active-run lock. Each job SHALL have the shape
`{ idea_id, brand, recipe, gate, status, enqueued_at, pick? }` where `brand` is a non-empty string
identifying the Brand the job belongs to, `recipe` is a non-empty string naming the chosen Recipe this
job produces (issue #56), `gate` is the generic gate cursor — a non-empty gate-name string or `null` —
`status` is one of `queued | running | awaiting_pick | done | failed`, `enqueued_at` is an ISO-8601
timestamp, and `pick` (present only on a next-leg job) is the Operator's resolved pick from the
PRECEDING gate. The lock SHALL record at most one active job, referenced by the composite
`(brand, idea_id, recipe)`. The Brand's ledger (`data/brands/<slug>/ledger.json`) remains the source
of truth; the queue is derived from accepted Ideas' chosen Recipes and never the reverse. The queue
path is a **global constant** (shared across all Brands, brand-agnostic) — it is NEVER derived from a
Brand slug.

#### Scenario: Enqueued job carries the documented shape including brand and recipe

- **GIVEN** an empty queue, a Brand slug, and a chosen Recipe
- **WHEN** a job is enqueued for that Brand/Recipe targeting the Recipe's first gate
- **THEN** the resulting job has that `recipe`, the resolved `gate`, `status: queued`, the Idea's
  `idea_id`, a non-empty `brand` matching the Brand slug, and an ISO-8601 `enqueued_at`

#### Scenario: A missing queue file loads as the empty queue

- **GIVEN** `data/queue.json` does not exist
- **WHEN** the queue is loaded
- **THEN** an empty queue (no jobs, lock free) is returned rather than an error

### Requirement: Only accepted Ideas enter the queue

The Production Queue SHALL contain jobs only for Ideas whose ledger status is `accepted`. Enqueue of an
Idea that is not `accepted` (e.g. `rejected` or `suggested`) SHALL be refused and MUST NOT add a job,
so rejected Ideas never incur a production job (credits are spent only on accepted Ideas).

#### Scenario: A rejected Idea produces no job

- **GIVEN** Idea `idea-Y` has ledger status `rejected`
- **WHEN** enqueue is attempted for `idea-Y`
- **THEN** no job is added to the queue and the attempt is refused

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

### Requirement: Queue listing shows each job's Brand, Recipe, gate cursor, and status

The `/queue` command SHALL render every job in the Production Queue, showing each job's `idea_id`,
`recipe`, its generic `gate` cursor (rendered as `final` when `gate` is `null`), and `status`. Two
Recipes of the same Idea SHALL render as two DISTINCT lines, never collapsed into one. When the queue
is empty it SHALL report that there are no jobs.

#### Scenario: Listing renders idea_id, recipe, gate cursor, and status for each job

- **GIVEN** a queue containing jobs for `idea-A` (`character-explainer-with-cast`/gate `cast`/`queued`)
  and `idea-B` (`character-explainer-with-cast`/gate `null` (final)/`running`)
- **WHEN** `/queue` is run
- **THEN** the output includes `idea-A` with its recipe, gate cursor, and status, and `idea-B` with
  its recipe, `final` gate label, and status

#### Scenario: Two Recipes of one Idea show as two distinct lines

- **GIVEN** a queue holding jobs for the SAME `(brand, idea)` but two DIFFERENT Recipes
- **WHEN** `/queue` is run
- **THEN** both Recipes' jobs appear as separate lines, each naming its own Recipe

#### Scenario: Empty queue reports no jobs

- **GIVEN** an empty queue
- **WHEN** `/queue` is run
- **THEN** the output states that the queue has no jobs

### Requirement: A job paused at its gate does not hold the Space

`nextReady(queue)` SHALL skip jobs in status `awaiting_pick` (a leg paused at its gate, generalizing
the old `awaiting_cast`) and never return one as ready. An `awaiting_pick` job SHALL NOT hold the
single-Space lock, so the next `queued` job — for ANY `(brand, idea, recipe)` — can proceed while the
Operator resolves the pending gate (ADR-0008: gates do not hold the Space).

#### Scenario: awaiting_pick is skipped, the next queued job is returned

- **GIVEN** a queue whose earliest job is `awaiting_pick` and a later job is `queued`, with the lock
  free
- **WHEN** `nextReady(queue)` is called
- **THEN** it skips the `awaiting_pick` job and returns the `queued` job

#### Scenario: Reaching a gate releases the lock

- **GIVEN** a `running` job holding the lock
- **WHEN** the job is marked `awaiting_pick`
- **THEN** the job's status is `awaiting_pick` and the lock is released (`active_job` is null)

### Requirement: mark transitions move a job through its lifecycle and maintain the lock, keyed on the composite triple

The system SHALL provide pure `mark*` transitions that move a job through
`queued → running → (awaiting_pick | done | failed)` and keep the single-active-run lock in step,
EVERY ONE keyed on `(brand, idea_id, recipe)` (issue #56): `markRunning` SHALL set the lock (recording
the composite triple); `markAwaitingPick`, `markDone`, and `markFailed` SHALL release it;
`markPickConsumed` SHALL move an `awaiting_pick` job to `done` when the Operator's pick is recorded,
without touching the lock (generalizing `markCastConsumed`, C24); `requeueFailed` SHALL revive a
`failed` job to `queued` without touching the lock (C4). Each transition SHALL be pure — it returns a
NEW queue state and never mutates the input, never reads the clock, and keeps at most one `running`
job. A transition for an unknown `(brand, idea_id, recipe)`, or from an invalid prior status, SHALL be
refused with an identifiable reason rather than silently corrupting the queue. A transition targeting
one `(brand, idea, recipe)` triple SHALL NEVER affect a job for a different Brand, a different Idea, or
a DIFFERENT RECIPE OF THE SAME IDEA.

#### Scenario: A queued job advances to running and back to done

- **GIVEN** a queue with one `queued` job and a free lock
- **WHEN** the job is marked `running` and then marked `done`
- **THEN** after `markRunning` the job is `running` and the lock holds its composite
  `(brand, idea_id, recipe)` ref
- **AND** after `markDone` the job is `done` and the lock is released

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
- **THEN** only that Brand's job moves to `running` and the lock names that Brand
- **AND** the other Brand's identically-named job remains `queued`, untouched

### Requirement: Picking a Cast enqueues the next leg

`/pick-cast <brand> <idea-id> <n>` SHALL, after recording the chosen Character, enqueue the queue's
GENERIC next leg (`enqueueNextLeg`, issue #56) stamped with the Brand argument and the RESOLVED Asset's
own Recipe (idempotent per `(brand, idea_id, recipe, gate)` — a re-pick with an unchanged gate adds no
duplicate job). The next leg's `gate` SHALL be resolved from that Recipe's OWN gate list (the entry
after the Cast gate, or `null` when the Cast gate was the Recipe's last gate — today's only wired
case). The enqueued job's `brand` field SHALL match the Brand argument passed to the command — derived
explicitly, not from session state.

#### Scenario: The next-leg job queued by /pick-cast carries the correct brand and recipe

- **GIVEN** `/pick-cast` called with Brand `"alpha"`, an Idea id, and a valid pick index
- **WHEN** the Character is picked successfully
- **THEN** the enqueued next-leg job carries `brand: "alpha"` and the RESOLVED Asset's own `recipe`

#### Scenario: Picking a Cast enqueues exactly one next-leg job

- **GIVEN** an Idea at the Cast gate whose Character the Operator has picked
- **WHEN** `/pick-cast` records the chosen Character
- **THEN** exactly one `status: queued` next-leg job is enqueued for that `(idea, recipe)`
- **AND** enqueuing the next leg again for the same Idea/Recipe adds no duplicate job

### Requirement: A failed job is isolated and /queue reflects every status

A Space operation that fails SHALL be marked `failed` for its `(brand, idea_id, recipe)` (the job
REMAINS in the queue as a historical record) and SHALL RELEASE the single-Space lock, so the queue
continues with the next ready job rather than blocking (ADR-0008: failure is isolated per job). A
failed Idea/Recipe's ledger status SHALL NOT be advanced — no Cast or Asset is fabricated. The
`/queue` listing SHALL reflect all five job statuses — `queued`, `running`, `awaiting_pick`, `done`,
and `failed`.

#### Scenario: A failed job is isolated and the queue continues

- **GIVEN** a `running` job that fails and a later `queued` job (any Brand/Recipe)
- **WHEN** the failure is recorded
- **THEN** the failed job's status is `failed` and the single-Space lock is released
- **AND** the failed Idea/Recipe's ledger status is not advanced (no fabricated Cast or Asset)

#### Scenario: /queue reflects all five statuses

- **GIVEN** a queue holding jobs in `queued`, `running`, `awaiting_pick`, `done`, and `failed`
- **WHEN** `/queue` is run
- **THEN** the output shows a job in each of the five statuses

### Requirement: parseJob validates brand + recipe + gate and defensively drops malformed jobs

When loading the Production Queue from disk, `parseJob` SHALL validate that each job carries a
non-empty `brand` string, a non-empty `recipe` string, and a well-formed `gate` (a non-empty string or
`null`). A job missing or failing any of these SHALL be dropped (not persisted into the loaded state)
with a logged warning — not thrown as an error — so a single corrupt job does not crash the drain.
Well-formed jobs are unaffected. These fields are validated as plain values at parse time only;
resolution against the filesystem or the Recipe registry happens at the orchestration level, not at
parse time.

#### Scenario: parseJob round-trips the brand and recipe fields for a well-formed job

- **GIVEN** a raw job object with a valid `brand`, `recipe`, `idea_id`, `gate`, `status`, and
  `enqueued_at`
- **WHEN** `parseQueueState` loads it
- **THEN** the parsed job carries the same `brand` and `recipe` values

#### Scenario: parseJob drops a job with a missing brand

- **GIVEN** a raw job object missing the `brand` field (all other fields valid)
- **WHEN** `parseQueueState` loads it
- **THEN** the job is dropped from the loaded state (not included in `jobs`), with a warning
- **AND** the drain does not crash

#### Scenario: parseJob drops a job with a missing or empty recipe (issue #56)

- **GIVEN** a raw job object missing the `recipe` field, or with `recipe: ""` (all other fields valid)
- **WHEN** `parseQueueState` loads it
- **THEN** the job is dropped from the loaded state, with a warning naming the missing recipe
- **AND** the drain does not crash

#### Scenario: parseJob drops a job with an invalid gate

- **GIVEN** a raw job object whose `gate` is neither `null` nor a non-empty string (e.g. a number)
- **WHEN** `parseQueueState` loads it
- **THEN** the job is dropped from the loaded state, with a warning

### Requirement: Job identity is keyed on the composite (brand, idea, recipe) — a second Recipe is never dropped

The Production Queue SHALL key every job's identity, dedupe check, and lock on the COMPOSITE
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

### Requirement: enqueueOnAccept enqueues one job per chosen Recipe, resolving each Recipe's first gate

`enqueueOnAccept(ideaId, brand, recipes, options)` SHALL take the Operator's CHOSEN Recipe set (the
Review-time selection, issue #54) as an explicit parameter and, for an `accepted` Idea, enqueue ONE
job per Recipe in that set — each keyed on `(brand, idea_id, recipe)`. For each Recipe it SHALL
resolve that Recipe's FIRST gate from the in-repo Recipe registry (`Recipe.gates[0]`, or `null` for a
gateless Recipe that renders unattended end-to-end) and stamp it as the enqueued job's `gate` cursor.
An unwired Recipe slug (not present in the registry) SHALL be skipped defensively — never fabricating
a gate for a Recipe the system cannot describe. An Idea that is not `accepted`, or an unknown Idea,
SHALL produce no job for ANY requested Recipe. An empty `recipes` list SHALL enqueue nothing.

#### Scenario: Two chosen Recipes enqueue two jobs, each resolving its own first gate

- **GIVEN** an accepted Idea and a chosen-Recipe list of two WIRED Recipes
- **WHEN** `enqueueOnAccept` is called with that list
- **THEN** two jobs are appended, one per Recipe, each `gate`-stamped with that Recipe's own first
  gate from the registry

#### Scenario: An unwired Recipe slug is skipped, never fabricating a gate

- **GIVEN** an accepted Idea and a chosen-Recipe list containing one WIRED Recipe and one UNWIRED slug
- **WHEN** `enqueueOnAccept` is called with that list
- **THEN** only the wired Recipe's job is enqueued; the unwired slug produces no job and no error that
  crashes the call

#### Scenario: A rejected or unknown Idea enqueues nothing for any requested Recipe

- **GIVEN** an Idea that is `rejected` (or an id that does not exist in the ledger) and a non-empty
  chosen-Recipe list
- **WHEN** `enqueueOnAccept` is called
- **THEN** no job is enqueued for any Recipe in the list

### Requirement: The gate cursor is generic, driven by a Recipe's own ordered gate list

A queue job's `gate` field SHALL be a GENERIC cursor — the gate NAME a leg's Space run works toward, or
`null` when the leg is the FINAL one (it renders the Asset; no further gate follows) — replacing the
old hard-coded `phase: "cast" | "render"` distinction (issue #56). `enqueueNextLeg(state, ideaId, now,
brand, recipe, nextGate, pick)` SHALL enqueue the leg that follows a resolved gate, carrying the
Operator's resolved `pick` (generalizing the old render-job `character` field, C1) and targeting
`nextGate` — the Recipe's OWN gate list entry AFTER the one just resolved, or `null` when that was the
Recipe's last gate. This generalizes cleanly to a Recipe with several gates, or none at all
(`gate: null` from the very first leg — an unattended end-to-end render), without hard-coding
"cast"/"render" anywhere in the pure queue module.

#### Scenario: The seeded one-gate Recipe's next leg targets the final (gate: null) leg

- **GIVEN** the wired *Character Explainer with Cast* Recipe (`gates: ["cast"]`) and its Cast gate
  just resolved
- **WHEN** the next leg is enqueued
- **THEN** its `gate` is `null` (this leg renders the Asset; the Recipe has no further gate)

#### Scenario: enqueueNextLeg carries the Operator's resolved pick onto the next leg

- **GIVEN** a gate whose pick the Operator just resolved (e.g. a chosen Character identifier)
- **WHEN** the next leg is enqueued via `enqueueNextLeg`
- **THEN** the new job's `pick` field carries that resolved value
- **AND** the EARLIER (now-resolved) gate's own job carries no `pick` (the field is next-leg-only)

