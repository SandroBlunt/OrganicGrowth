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
`strandedIdeas` array when all of the Brand's Ideas are in a terminal lifecycle state
(`scored` or `rejected`) and no Idea is in any active or pending state. An `ideas` array containing only
`scored` and `rejected` entries satisfies this condition. A Brand with only rejected Ideas (no
scored ones) also satisfies it — the loop has nothing active.

#### Scenario: All Ideas scored resolves to done phase

- **GIVEN** a ledger where every Idea has `status: "scored"` and an empty queue slice
- **WHEN** `resolvePhase` is called
- **THEN** the result has `phase: "done"`, empty `pendingGates`, and empty `strandedIdeas`

#### Scenario: All Ideas rejected also resolves to done phase

- **GIVEN** a ledger where every Idea has `status: "rejected"` and an empty queue slice
- **WHEN** `resolvePhase` is called
- **THEN** the result has `phase: "done"`, empty `pendingGates`, and empty `strandedIdeas`

### Requirement: Stranded accepted Ideas SHALL be surfaced for re-enqueue

`resolvePhase` SHALL include in `strandedIdeas` every `accepted` Idea that has no corresponding
live queue job (`job.idea_id === idea.id`) in the Brand's queue slice. This is the 2026-W22 case:
an Idea was accepted but the queue was not updated (e.g. crash or manual edit). An `accepted` Idea
that DOES have a matching queue job is NOT stranded. The phase for a Brand with any stranded (or
actively-queued) `accepted` Ideas SHALL be `"production"`.

#### Scenario: Accepted Idea with no queue job is stranded

- **GIVEN** a ledger with one Idea (`status: "accepted"`) and an empty queue slice
- **WHEN** `resolvePhase` is called
- **THEN** the Idea's id appears in `strandedIdeas`
- **AND** `phase` is `"production"`

#### Scenario: Accepted Idea with a matching queue job is not stranded

- **GIVEN** a ledger with one Idea (`status: "accepted"`) and a queue slice containing a job for
  that Idea's id
- **WHEN** `resolvePhase` is called
- **THEN** `strandedIdeas` is empty
- **AND** `phase` is `"production"`

#### Scenario: Multiple accepted Ideas — only those without queue jobs are stranded

- **GIVEN** a ledger with two `accepted` Ideas (`idea-A`, `idea-B`) and a queue slice containing
  a job only for `idea-A`
- **WHEN** `resolvePhase` is called
- **THEN** `strandedIdeas` contains `"idea-B"` and does not contain `"idea-A"`

### Requirement: casting, produced, and posted Ideas SHALL each resolve to their correct pending gate

`resolvePhase` SHALL include each human gate in `pendingGates` when at least one Idea of the
corresponding status exists. Each active Idea status maps to exactly one pending human gate:
- `casting` → the Operator must pick the Character → gate `"cast-pick"`
- `produced` → the Operator must publish the Asset → gate `"publish"`
- `posted` → the tracker must run `/track-performance` → gate `"track"`

`pendingGates` SHALL contain no duplicates. The phase for a Brand with any `casting` Idea SHALL be
`"production"`. The phase for a Brand with any `produced` Idea (and no earlier-lifecycle active
Ideas) SHALL be `"publish"`. The phase for a Brand with any `posted` Idea (and no
earlier-lifecycle active Ideas) SHALL be `"tracking"`.

#### Scenario: A casting Idea adds the cast-pick gate

- **GIVEN** a ledger with one Idea (`status: "casting"`) and any queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `pendingGates` contains `"cast-pick"`
- **AND** `phase` is `"production"`

#### Scenario: A produced Idea adds the publish gate

- **GIVEN** a ledger with one Idea (`status: "produced"`) and any queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `pendingGates` contains `"publish"`
- **AND** `phase` is `"publish"`

#### Scenario: A posted Idea adds the track gate

- **GIVEN** a ledger with one Idea (`status: "posted"`) and any queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `pendingGates` contains `"track"`
- **AND** `phase` is `"tracking"`

### Requirement: A mixed-state ledger SHALL resolve deterministically

When the Brand's ledger contains Ideas in multiple lifecycle states, `resolvePhase` SHALL:
- Set `phase` to the earliest-in-lifecycle active phase (e.g. `"review"` before `"production"`
  before `"publish"` before `"tracking"`).
- Collect ALL relevant pending gates from ALL Ideas (no gate is silently dropped).
- Return `strandedIdeas` for every `accepted` Idea that has no matching queue job.
- Return deterministically — the same inputs always produce the same output.

The lifecycle priority order (earliest wins) is:
`research < review < production < publish < tracking < done`.

A `suggested` Idea contributes `"review"` to gates and sets phase to at most `"review"`.
A `casting` Idea contributes `"cast-pick"` and phase `"production"` (earlier than `"publish"`).
A `produced` Idea contributes `"publish"` and phase `"publish"` (earlier than `"tracking"`).

#### Scenario: Mixed ledger with suggested and casting Ideas

- **GIVEN** a ledger with one `suggested` Idea and one `casting` Idea, and any queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `phase` is `"review"` (earliest)
- **AND** `pendingGates` contains both `"review"` and `"cast-pick"`

#### Scenario: Mixed ledger with casting and produced Ideas

- **GIVEN** a ledger with one `casting` Idea and one `produced` Idea, and any queue slice
- **WHEN** `resolvePhase` is called
- **THEN** `phase` is `"production"` (earlier than `"publish"`)
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

