## MODIFIED Requirements

### Requirement: When in-flight work exists, the conductor shows it and asks resume-vs-fresh with no default

The conductor SHALL call `resolvePhase` with the Brand's ledger and its slice of the global Production
Queue. In-flight work exists when the resolved `phase` is one of `"production"`, `"publish"`, or
`"tracking"` (genuine production work is under way). A `"review"` phase — only un-reviewed `suggested`
Ideas exist — is NOT in-flight (the Operator simply has not started yet), and neither is `"research"`
nor `"done"`. When in-flight work exists the conductor SHALL:
1. Display the pending gates and the count of stranded Ideas.
2. Ask the Operator: `"resume or fresh? (type 'resume' or 'fresh')"` with NO default value — the
   Operator MUST type their choice explicitly.
3. If the Operator types `"resume"` AND stranded Ideas exist: open and migrate the local SQLite database
   (`options.dbPath`, defaulting to `data/organicgrowth.db` at runtime — the SAME file `/run-worker`
   drains) BY DEFAULT, before re-enqueueing anything — never depending on an Operator or agent following a
   separate instruction (issue #254, QA round-1 Defect 2: the production path passes `db` by default, not
   as a documentation-only step). Then, for EACH stranded `accepted` Idea, call `enqueueOnAccept` with that
   database attached, so the SAME call that appends to `data/queue.json` ALSO syncs the Idea into the SQL
   `job` table the unattended worker reads. If opening/migrating the database itself fails, the conductor
   SHALL continue re-enqueueing against the file queue alone, surfacing that failure plainly rather than
   aborting. If a PER-IDEA SQL sync fails (the file-queue write for that Idea has already succeeded, since
   `enqueueOnAccept` always writes the file queue before attempting the SQL sync), the conductor SHALL
   surface that Idea's error message verbatim in the resume summary, SHALL NOT retry it silently, and
   SHALL continue re-enqueueing the REMAINING stranded Ideas rather than aborting the whole resume. Then
   resume the loop from the current phase.
4. If the Operator types `"fresh"`: start a new weekly Run (proceed to research from scratch, ignoring
   the in-flight state for this session).

Any response that is neither `"resume"` nor `"fresh"` SHALL prompt the Operator again (re-ask with
the same no-default prompt). The conductor SHALL never proceed without an explicit choice.

#### Scenario: No in-flight work proceeds directly to the loop

- **GIVEN** a Brand whose ledger is empty (phase = `"research"`)
- **WHEN** `/run-pipeline <brand>` resolves the phase
- **THEN** the conductor does NOT ask resume-or-fresh
- **AND** it proceeds directly to starting a new Run

#### Scenario: Un-reviewed Ideas (review phase) are not treated as in-flight

- **GIVEN** a Brand with only `suggested` Ideas and no queue jobs (phase = `"review"`)
- **WHEN** `/run-pipeline <brand>` resolves the phase
- **THEN** the conductor does NOT ask resume-or-fresh
- **AND** it proceeds into the loop at Gate 1 (Review)

#### Scenario: In-flight work triggers the resume-or-fresh prompt with no default

- **GIVEN** a Brand with `casting` Ideas in the ledger (phase = `"production"`)
- **WHEN** `/run-pipeline <brand>` resolves the phase
- **THEN** the conductor shows the pending gates and asks `"resume or fresh?"`
- **AND** the prompt has no default — no choice is made without explicit Operator input

#### Scenario: Resume re-enqueues stranded Ideas and walks the loop from the current phase

- **GIVEN** a Brand with `accepted` Ideas in the ledger and no queue jobs (stranded)
- **AND** the Operator types `"resume"`
- **WHEN** the conductor processes the resume choice
- **THEN** each stranded Idea is re-enqueued (a new `cast`-phase `queued` job appears in the queue)
- **AND** the loop resumes from the `"production"` phase

#### Scenario: Resume ALSO writes the SQL job table by default, never depending on a documentation-only step

- **GIVEN** a Brand with one stranded `accepted` Idea whose ledger record carries a resolvable `run`,
  `format`, `title`, and Brief, and whose Brand/Format rows already exist in `options.dbPath`
- **AND** the Operator types `"resume"`
- **WHEN** the conductor processes the resume choice
- **THEN** `data/queue.json` gains the re-enqueued job exactly as before this Requirement was modified
- **AND** the SQL `job` table at `options.dbPath` ALSO gains a real, `queued` row for that Idea — found
  by `findNextQueuedJob` — proving the REAL, compiled code path reaches SQL, not a markdown paragraph an
  agent must remember to follow

#### Scenario: A per-Idea SQL sync failure during resume is surfaced plainly and does not abort the remaining stranded Ideas

- **GIVEN** two stranded `accepted` Ideas, where the FIRST cannot be SQL-synced (e.g. its ledger record
  carries no resolvable `run`) and the SECOND can
- **AND** the Operator types `"resume"`
- **WHEN** the conductor processes the resume choice
- **THEN** both Ideas are re-enqueued into `data/queue.json` (the file write is unaffected by the first
  Idea's SQL failure)
- **AND** the resume summary names the first Idea's SQL failure verbatim, without retrying it silently
- **AND** the SECOND Idea's SQL sync still completes — one Idea's SQL failure never blocks another's

#### Scenario: Fresh starts a new weekly Run regardless of in-flight state

- **GIVEN** a Brand with `casting` Ideas in the ledger (in-flight work)
- **AND** the Operator types `"fresh"`
- **WHEN** the conductor processes the fresh choice
- **THEN** the loop starts from research (as if the phase were `"research"`)
