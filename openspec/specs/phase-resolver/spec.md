# phase-resolver Specification

## Purpose
TBD - created by archiving change issue-22-phase-resolver. Update Purpose after archive.
## Requirements
### Requirement: resolvePhase returns the Brand's current phase, pending human gates, and stranded Ideas

The system SHALL expose a pure function `resolvePhase(ideas, queueJobs)` that accepts an array of
`LedgerIdea` objects (a Brand's ledger snapshot) and an array of `QueueJob` objects already filtered
to that Brand, and returns a `PhaseResult` with three fields:

- `phase` — the Brand's current loop position, one of `"research" | "review" | "production" |
  "publish" | "tracking" | "done"`.
- `pendingGates` — a readonly array of human gates currently waiting for Operator action, each one
  of `"review" | "cast-pick" | "publish" | "track"`, with no duplicates.
- `strandedIdeas` — a readonly array of Idea ids (strings) that are `accepted` in the ledger but
  have no live queue job — the 2026-W22 case, flagged for re-enqueue.

The function SHALL be pure and deterministic: given the same inputs it always returns the same
output, with no side effects, no disk reads, no network calls, no Magnific Space calls, and no
Apify calls. It reuses the existing `LedgerIdea` type from `src/ledger/ledger.ts` and the existing
`QueueJob` type from `src/production-queue/queue.ts` — no parallel type shapes are invented.

#### Scenario: resolvePhase returns a PhaseResult with the three required fields

- **GIVEN** a ledger with at least one Idea and a queue slice (possibly empty)
- **WHEN** `resolvePhase(ideas, queueJobs)` is called
- **THEN** the returned value has fields `phase` (a string), `pendingGates` (an array), and
  `strandedIdeas` (an array)
- **AND** no disk, Magnific, or Apify call is made

### Requirement: An empty ledger resolves to the research phase with no stranded work

When the Brand has no Ideas in its ledger (a fresh Brand), `resolvePhase` SHALL return
`phase: "research"`, an empty `pendingGates` array, and an empty `strandedIdeas` array. This
represents the start of the weekly loop — no trends have been run yet.

#### Scenario: Fresh Brand with empty ledger resolves to research phase

- **GIVEN** an empty Ideas array and an empty queue slice
- **WHEN** `resolvePhase([], [])` is called
- **THEN** the result is `{ phase: "research", pendingGates: [], strandedIdeas: [] }`

### Requirement: A fully-scored Run SHALL resolve to a done/idle phase

`resolvePhase` SHALL return `phase: "done"`, an empty `pendingGates` array, and an empty
`strandedIdeas` array when every Idea is either `rejected`, or `accepted` with every one of its
Assets at `scored` (ADR-0011: `scored` is now an Asset stage, folded via the Idea's roll-up — it is
no longer a flat Idea status). An Idea with no Assets is NOT "done" by this rule — it is `accepted`
and either stranded or in-queue (see "Stranded accepted Ideas"). A Brand with only `rejected` Ideas
(no scored Assets) also satisfies "done" — the loop has nothing active.

#### Scenario: All Ideas' Assets scored resolves to done phase

- **GIVEN** a ledger where every Idea is `accepted` with a single Asset at `status: "scored"`, and an
  empty queue slice
- **WHEN** `resolvePhase` is called
- **THEN** the result has `phase: "done"`, empty `pendingGates`, and empty `strandedIdeas`

#### Scenario: All Ideas rejected also resolves to done phase

- **GIVEN** a ledger where every Idea has `status: "rejected"` and an empty queue slice
- **WHEN** `resolvePhase` is called
- **THEN** the result has `phase: "done"`, empty `pendingGates`, and empty `strandedIdeas`

### Requirement: Stranded accepted Ideas SHALL be surfaced for re-enqueue

`resolvePhase` SHALL include in `strandedIdeas` every `accepted` Idea that has **no Assets recorded
yet** AND no corresponding live queue job (`job.idea_id === idea.id`) in the Brand's queue slice —
this is the 2026-W22 case: an Idea was accepted but the queue was not updated (e.g. crash or manual
edit). An `accepted` Idea that DOES have a matching queue job is NOT stranded. An `accepted` Idea that
already has at least one Asset (any stage) is NEVER stranded by this check — re-keying the queue's
liveness check to `(brand, idea, recipe)` is a later slice (ADR-0011's own "Consequences"); until
then, an Idea with an Asset in flight is simply excluded from this check rather than mis-evaluated
against it. The phase for a Brand with any stranded (or actively-queued, or Asset-bearing) `accepted`
Idea SHALL be `"production"`.

#### Scenario: Accepted Idea with no Assets and no queue job is stranded

- **GIVEN** a ledger with one Idea (`status: "accepted"`, no Assets) and an empty queue slice
- **WHEN** `resolvePhase` is called
- **THEN** the Idea's id appears in `strandedIdeas`
- **AND** `phase` is `"production"`

#### Scenario: Accepted Idea with a matching queue job is not stranded

- **GIVEN** a ledger with one Idea (`status: "accepted"`, no Assets) and a queue slice containing a
  job for that Idea's id
- **WHEN** `resolvePhase` is called
- **THEN** `strandedIdeas` is empty
- **AND** `phase` is `"production"`

#### Scenario: An accepted Idea with an Asset (even just queued) is never stranded

- **GIVEN** a ledger with one Idea (`status: "accepted"`) carrying one Asset (`status: "queued"`)
  and an empty queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `strandedIdeas` is empty (the Asset-bearing check bypasses the queue-liveness test)
- **AND** `phase` is `"production"`

#### Scenario: Multiple accepted Ideas — only those without Assets and without queue jobs are stranded

- **GIVEN** a ledger with two `accepted` Ideas with no Assets (`idea-A`, `idea-B`) and a queue slice
  containing a job only for `idea-A`
- **WHEN** `resolvePhase` is called
- **THEN** `strandedIdeas` contains `"idea-B"` and does not contain `"idea-A"`

### Requirement: A mixed-state ledger SHALL resolve deterministically

When the Brand's ledger contains Ideas in multiple lifecycle states, `resolvePhase` SHALL:
- Set `phase` to the earliest-in-lifecycle active phase (e.g. `"review"` before `"production"`
  before `"publish"` before `"tracking"`).
- Collect ALL relevant pending gates from ALL Ideas AND from every one of an Idea's Assets (no gate
  is silently dropped, even one belonging to a Recipe whose Asset is not at the Idea's rolled-up
  earliest stage).
- Return `strandedIdeas` for every `accepted` Idea with no Assets yet and no matching queue job.
- Return deterministically — the same inputs always produce the same output.

The lifecycle priority order (earliest wins) is:
`research < review < production < publish < tracking < done`.

A `suggested` Idea contributes `"review"` to gates and sets phase to at most `"review"`. An `accepted`
Idea with an Asset `in_production`/`pending_gate: "cast"` contributes `"cast-pick"` and phase
`"production"` (earlier than `"publish"`). An `accepted` Idea with an Asset `produced` contributes
`"publish"` and phase `"publish"` (earlier than `"tracking"`). One Idea with TWO Assets at different
stages contributes gates from BOTH — the phase is the earlier of the two Assets' stages.

#### Scenario: Mixed ledger with suggested and an Asset paused at the Cast gate

- **GIVEN** a ledger with one `suggested` Idea and one `accepted` Idea whose Asset is
  `in_production`/`pending_gate: "cast"`, and any queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `phase` is `"review"` (earliest)
- **AND** `pendingGates` contains both `"review"` and `"cast-pick"`

#### Scenario: Mixed ledger with an Asset at the Cast gate and a produced Asset

- **GIVEN** a ledger with one `accepted` Idea whose Asset is `in_production`/`pending_gate: "cast"`
  and a second `accepted` Idea whose Asset is `produced`, and any queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `phase` is `"production"` (earlier than `"publish"`)
- **AND** `pendingGates` contains both `"cast-pick"` and `"publish"`

#### Scenario: One Idea with two Assets at different stages surfaces both gates and the earlier phase

- **GIVEN** one `accepted` Idea with two Assets — one `in_production`/`pending_gate: "cast"` (a
  second Recipe still mid-production) and one `produced` (a first Recipe ready to publish)
- **WHEN** `resolvePhase` is called
- **THEN** `phase` is `"production"` (the earlier of the two Asset stages)
- **AND** `pendingGates` contains both `"cast-pick"` and `"publish"`

#### Scenario: Same inputs always return the same result (determinism)

- **GIVEN** the same ledger snapshot and queue slice passed twice
- **WHEN** `resolvePhase` is called twice with those inputs
- **THEN** both results are deeply equal

### Requirement: resolvePhase is pure and isolation-tested with no external dependencies

`resolvePhase` SHALL be testable by passing literal JavaScript arrays — no filesystem reads, no
Magnific Space calls, no Apify calls, no clock access. The module SHALL have no imports that
perform I/O (no `readFile`, no `fetch`, no MCP tool calls). Every test assertion SHALL operate
entirely on the function's return value.

#### Scenario: Tests exercise resolvePhase by passing arrays directly

- **GIVEN** a test that constructs `LedgerIdea` and `QueueJob` objects as plain literals
- **WHEN** `resolvePhase(ideas, queueJobs)` is called in the test
- **THEN** the test can assert the result without mocking any I/O system
- **AND** no filesystem, network, or Magnific path is exercised

### Requirement: An Asset paused at a gate, produced, or posted resolves to its correct pending gate

`resolvePhase` SHALL include each human gate in `pendingGates` when at least one of an `accepted`
Idea's Assets is at the corresponding stage (ADR-0011: these are now Asset stages, not flat Idea
statuses — `casting` is retired). Each active Asset stage maps to exactly one pending human gate:
- `in_production` with `pending_gate: "cast"` → the Operator must pick the Character → gate
  `"cast-pick"`
- `produced` → the Operator must publish the Asset → gate `"publish"`
- `posted` → the tracker must run `/track-performance` → gate `"track"`

`pendingGates` SHALL contain no duplicates, even when several Ideas (or several Assets of one Idea)
are at the same stage. The phase for a Brand with any Asset `in_production`/`pending_gate: "cast"`
SHALL be `"production"`. The phase for a Brand with any Asset `produced` (and no earlier-lifecycle
active work) SHALL be `"publish"`. The phase for a Brand with any Asset `posted` (and no
earlier-lifecycle active work) SHALL be `"tracking"`.

#### Scenario: An Asset paused at the Cast gate adds the cast-pick gate

- **GIVEN** a ledger with one `accepted` Idea whose Asset is `in_production` with
  `pending_gate: "cast"`, and any queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `pendingGates` contains `"cast-pick"`
- **AND** `phase` is `"production"`

#### Scenario: An in_production Asset with no pending_gate adds no gate

- **GIVEN** a ledger with one `accepted` Idea whose Asset is `in_production` with NO `pending_gate`
  (still running, not paused)
- **WHEN** `resolvePhase` is called
- **THEN** `pendingGates` does not contain `"cast-pick"`
- **AND** `phase` is `"production"`

#### Scenario: A produced Asset adds the publish gate

- **GIVEN** a ledger with one `accepted` Idea whose Asset is `produced`, and any queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `pendingGates` contains `"publish"`
- **AND** `phase` is `"publish"`

#### Scenario: A posted Asset adds the track gate

- **GIVEN** a ledger with one `accepted` Idea whose Asset is `posted`, and any queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `pendingGates` contains `"track"`
- **AND** `phase` is `"tracking"`

#### Scenario: pendingGates has no duplicates even when several Ideas are at the same gate

- **GIVEN** three `accepted` Ideas, each with one Asset `in_production`/`pending_gate: "cast"`
- **WHEN** `resolvePhase` is called
- **THEN** `"cast-pick"` appears at most once in `pendingGates`

