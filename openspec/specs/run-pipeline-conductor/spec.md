# run-pipeline-conductor Specification

## Purpose
TBD - created by archiving change issue-24-run-pipeline-conductor. Update Purpose after archive.
## Requirements
### Requirement: The conductor resolves an existing Brand and threads it through the entire run

The system SHALL expose a `/run-pipeline <brand>` conductor command that accepts a Brand slug,
resolves the Brand via `resolveBrand`, and threads the Brand identity through every step of the
weekly loop. The Brand slug SHALL be restated in every gate prompt so the Operator is never in doubt
about which Brand the loop is running for. An unresolvable or missing Brand SHALL produce an
identifiable error message naming the Brand slug and SHALL NOT fall back to a default Brand.

#### Scenario: Brand is resolved and threaded through the loop

- **GIVEN** a Brand slug `"mundotip"` that exists on disk
- **WHEN** `/run-pipeline mundotip` is invoked
- **THEN** the conductor output identifies the Brand as `"mundotip"`
- **AND** every gate prompt restates the Brand slug

#### Scenario: Unknown Brand produces an identifiable error

- **GIVEN** a Brand slug `"no-such-brand"` that does NOT exist on disk
- **WHEN** `/run-pipeline no-such-brand` is invoked
- **THEN** the conductor outputs an error naming `"no-such-brand"`
- **AND** the loop does not proceed past Brand resolution

---

### Requirement: Readiness runs every launch, is silent when healthy, and surfaces gaps with phase-scoped blocking

The conductor SHALL run a readiness check at every launch. The check SHALL NEVER be cached. It SHALL:
- Live-probe the Magnific Space for accessibility and credit balance.
- Live-ping the Apify token for validity.
- Sanity-check the Brand config (via `checkConfig`).
- Feed all probe results to `classify` and combine the findings.

When all findings are advisory-only or there are no findings, the readiness output SHALL be silent
(no output to the Operator). When blocking findings exist, the conductor SHALL surface them and apply
phase-scoped blocking: a `block` on `research` stops the launch; a `block` on `production` allows
research to proceed but stops production; a `block` on `publish` allows research and production to
proceed but stops publication. The conductor SHALL list only the blocking/advisory findings for the
current and upcoming phases — it SHALL NOT surface findings for phases already complete.

The live probes SHALL be modelled behind injectable port interfaces (`MagniticReadinessPort` and
`ApifyReadinessPort`) so that tests can inject fakes and the build remains hermetic (no live
`spaces_*`/`creations_*` calls, no credits, no board mutation).

#### Scenario: Healthy readiness produces no output

- **GIVEN** a Brand with valid config, accessible Space, sufficient credits, and a valid Apify token
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** no readiness output is shown to the Operator
- **AND** the conductor proceeds to the rename hint

#### Scenario: Research block stops the launch

- **GIVEN** a Brand whose Apify token is invalid (probe returns false)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** a finding with `severity: 'block'` and `phase: 'research'` is surfaced
- **AND** the conductor stops and does not proceed to the loop

#### Scenario: Production block allows research but stops production

- **GIVEN** a Brand whose Magnific Space is inaccessible (`accessible: false`)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** a finding with `severity: 'block'` and `phase: 'production'` is surfaced
- **AND** the conductor proceeds through research and review but stops before production

#### Scenario: Advisory-only findings do not stop the loop

- **GIVEN** a Brand with `banned_words` empty (advisory finding only)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** the advisory finding MAY be surfaced as a warning
- **AND** the conductor proceeds to the loop (the advisory does NOT block any phase)

---

### Requirement: The conductor prints a rename hint but does not rename the session itself

The conductor SHALL print exactly one line formatted as `/rename <brand> · <ISO-week>` (e.g.
`/rename mundotip · 2026-W23`). This line is a hint for the Operator to paste into their terminal.
The conductor SHALL NOT attempt to rename the session or call any system rename function.

#### Scenario: Rename hint appears in the conductor output

- **GIVEN** a valid Brand `"mundotip"` and a weekly Run in ISO week `2026-W23`
- **WHEN** `/run-pipeline mundotip` runs (healthy readiness)
- **THEN** the output contains a line matching `/rename mundotip · 2026-W\d+`
- **AND** no session rename is performed by the conductor

---

### Requirement: When in-flight work exists, the conductor shows it and asks resume-vs-fresh with no default

The conductor SHALL call `resolvePhase` with the Brand's ledger and its slice of the global Production
Queue. If the resolved `phase` is neither `"research"` nor `"done"`, in-flight work exists. In that
case the conductor SHALL:
1. Display the pending gates and the count of stranded Ideas.
2. Ask the Operator: `"resume or fresh? (type 'resume' or 'fresh')"` with NO default value — the
   Operator MUST type their choice explicitly.
3. If the Operator types `"resume"`: re-enqueue each stranded `accepted` Idea via `enqueueOnAccept`,
   then resume the loop from the current phase.
4. If the Operator types `"fresh"`: start a new weekly Run (proceed to research from scratch, ignoring
   the in-flight state for this session).

Any response that is neither `"resume"` nor `"fresh"` SHALL prompt the Operator again (re-ask with
the same no-default prompt). The conductor SHALL never proceed without an explicit choice.

#### Scenario: No in-flight work proceeds directly to the loop

- **GIVEN** a Brand whose ledger is empty (phase = `"research"`)
- **WHEN** `/run-pipeline <brand>` resolves the phase
- **THEN** the conductor does NOT ask resume-or-fresh
- **AND** it proceeds directly to starting a new Run

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

#### Scenario: Fresh starts a new weekly Run regardless of in-flight state

- **GIVEN** a Brand with `casting` Ideas in the ledger (in-flight work)
- **AND** the Operator types `"fresh"`
- **WHEN** the conductor processes the fresh choice
- **THEN** the loop starts from research (as if the phase were `"research"`)

---

### Requirement: The loop pauses only at the three human gates and never renders past a gate

The conductor SHALL pause the loop exclusively at the three human gates: Review (Gate 1), Cast pick
(Gate 2), and Publish (Gate 3). It SHALL NOT render an Asset before the Operator picks a Character,
and it SHALL NOT auto-publish. Between gates, it SHALL drive the loop autonomously. The loop STATE
(current phase, pending gates, queue) SHALL be recoverable from `ledger.json` + `queue.json` across
turns and days — the Operator can re-invoke `/run-pipeline <brand>` and it will resume from the
correct gate.

#### Scenario: Loop pauses at Gate 1 (Review) and waits for the Operator

- **GIVEN** a Brand in the `"review"` phase (suggested Ideas exist)
- **WHEN** the conductor reaches Gate 1
- **THEN** it invokes review-ideas and pauses for the Operator's accept/reject decisions
- **AND** it does NOT auto-drain production before the Operator acts

#### Scenario: Loop pauses at Gate 2 (Cast pick) and waits for the Operator

- **GIVEN** a Brand with `casting` Ideas (Cast generated, Character not yet picked)
- **WHEN** the conductor reaches Gate 2
- **THEN** it presents the Cast and pauses for the Operator's Character pick
- **AND** it does NOT render the Asset before the pick

#### Scenario: Loop pauses at Gate 3 (Publish) and waits for the Operator

- **GIVEN** a Brand with `produced` Ideas (Asset generated, not yet published)
- **WHEN** the conductor reaches Gate 3
- **THEN** it displays the Asset for review and pauses for the Operator to publish and `/log-post`
- **AND** it does NOT publish automatically

#### Scenario: Loop resumes correctly from ledger+queue state across invocations

- **GIVEN** a Brand that previously reached Gate 2 (phase = `"production"`, gate = `"cast-pick"`)
- **WHEN** `/run-pipeline <brand>` is invoked in a new session
- **THEN** the conductor detects the in-flight work, offers resume, and resumes at Gate 2
- **AND** does NOT restart from research

---

### Requirement: Auto-drain and gate-progression rules are enforced

After Review (Gate 1), the conductor SHALL auto-drain the Production Queue to the Cast gate:
- Invoke the producer to drain all accepted Ideas from `queued` through the cast run-point, stopping
  each at `awaiting_cast` (`casting` in the ledger).
- After draining, the conductor pauses at Gate 2 for each `casting` Idea.

After Cast pick (Gate 2), the conductor SHALL render the Asset unattended:
- Invoke the producer to render the picked Character to a finished Asset (`produced` in the ledger).
- After rendering, the conductor pauses at Gate 3 (Publish).

After `/log-post` (Gate 3), the conductor SHALL offer (not auto-invoke) `/track-performance <brand>`
and `/report <brand>` to the Operator.

#### Scenario: After Review, production auto-drains to the Cast gate

- **GIVEN** the Operator accepted Ideas at Gate 1 (Review)
- **WHEN** the conductor processes the accepted Ideas
- **THEN** it invokes the producer to drain the queue to the Cast gate
- **AND** it pauses at Gate 2 once Ideas are at `casting` status

#### Scenario: After Cast pick, the Asset renders unattended and the conductor pauses for Publish

- **GIVEN** the Operator picked a Character at Gate 2
- **WHEN** the conductor processes the cast pick
- **THEN** it invokes the producer to render the Asset
- **AND** it pauses at Gate 3 once the Asset is `produced`
- **AND** it does NOT pause between picking the Character and completing the render

#### Scenario: After log-post, the conductor offers track-performance and report

- **GIVEN** the Operator logged a Post URL at Gate 3
- **WHEN** the conductor processes the post log
- **THEN** it outputs a message offering `/track-performance <brand>` and `/report <brand>`
- **AND** it does NOT auto-invoke either command

---

### Requirement: The readiness gate exists only in the conductor; granular commands are unguarded

The readiness check (`classify` + `checkConfig` + live probes) SHALL be invoked ONLY by
`/run-pipeline`. The granular commands (`/run-trends`, `/review-ideas`, `/pick-cast`, `/log-post`,
`/queue`, `/report`, `/track-performance`) SHALL NOT call readiness logic. They are power-tools for
Operators who know what they are doing.

#### Scenario: Granular commands do not invoke readiness

- **GIVEN** the `run-pipeline-readiness.ts` module
- **WHEN** the source of any granular command file is inspected
- **THEN** none of them import or call the readiness module

---

### Requirement: The conductor reuses existing granular logic with no duplicated pipeline logic

The conductor SHALL delegate all substantive computation to existing modules:
- Brand resolution → `resolveBrand` (from `src/brand/resolver.ts`)
- Phase resolution → `resolvePhase` (from `src/phase-resolver/resolve.ts`)
- Readiness classification → `classify` (from `src/readiness/classify.ts`)
- Config sanity → `checkConfig` (from `src/readiness/check-config.ts`)
- Re-enqueue → `enqueueOnAccept` (from `src/production-queue/enqueue-on-accept.ts`)
- Review → `/review-ideas` command logic
- Cast/render → production queue worker
- Report → `reportCommand` (from `src/commands/report.ts`)

The conductor SHALL NOT re-implement any of the above logic inline. Its role is orchestration only.

#### Scenario: Conductor delegates to existing modules

- **GIVEN** the `run-pipeline.ts` source file
- **WHEN** it is inspected
- **THEN** brand resolution uses `resolveBrand` (not a reimplementation)
- **AND** phase resolution uses `resolvePhase` (not a reimplementation)
- **AND** readiness uses `classify` and `checkConfig` (not inline logic)
- **AND** re-enqueue uses `enqueueOnAccept` (not a reimplementation)

