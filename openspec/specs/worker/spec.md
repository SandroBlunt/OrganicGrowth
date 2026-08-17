# worker Specification

## Purpose
TBD - created by archiving change issue-208-worker-drains-queue. Update Purpose after archive.
## Requirements
### Requirement: The worker drains the Production Queue by claiming jobs through the atomic claim primitive

`src/commands/run-worker.ts`'s `drainQueue(db, port, options)` SHALL repeatedly find the oldest `queued`
job (`job-claim-store`'s `findNextQueuedJob`, FIFO by `enqueued_at`) and process it via
`src/command-surface/worker.ts`'s `runOneJob(db, port, jobId, options)`, until no job is `queued`.
`runOneJob` SHALL claim its job via `job-claim-store`'s existing `claimJob` — the SAME atomic
`UPDATE ... RETURNING` primitive issue #203 proved against genuinely concurrent OS processes — and SHALL
NOT introduce a second, independent claiming/locking mechanism. A job that cannot be claimed (already
claimed by a live lease, or in a terminal/gated status) SHALL be reported as `{ status: "not-claimed" }`
with no side effect.

#### Scenario: drainQueue processes every queued job until none remain

- **GIVEN** a database with two `queued` jobs and no others
- **WHEN** `drainQueue(db, port)` is called
- **THEN** it processes both, and a subsequent `findNextQueuedJob` call returns `null`

#### Scenario: A job already claimed by a live lease is reported, not double-processed

- **GIVEN** a `job` row already claimed by a different owner, with an unexpired lease
- **WHEN** `runOneJob` is called for that job id
- **THEN** it returns `{ status: "not-claimed" }` and makes no write

### Requirement: Each phase is self-audited against its Phase Contract before advancing

`runOneJob` SHALL self-audit a claimed job's FIRST leg against the Recipe's `author` Phase Contract
(`recipe/phase-contract.ts`'s `auditAuthorPhase`, unchanged) before doing anything else with the Space,
SHALL self-audit a leg about to render (`targetGate === null`) against the `bind-media` Phase Contract
(`auditBindMediaPhase`, unchanged) before driving the Space, and — once a leg FINISHES — SHALL self-audit
the composed Copy against the `copy` Phase Contract (`auditCopyPhase`, unchanged) BEFORE saving the Asset
`produced`. A failing audit at ANY of these three phases — a broken Production-Spec shape or a banned
word, a missing REQUIRED media slot, or an invalid composed Copy — SHALL stop the job (routed through the
retry/terminal-failure path below); an author or bind-media failure stops WITHOUT any call to the
injected `SpaceMcpPort`, and a copy-phase failure stops WITHOUT the Asset ever being saved `produced` or
carrying any media/Copy Variant from that attempt. `gate`/`render`/`save` have no generic mechanical
auditor in this codebase yet (`recipe/phase-contract.ts`'s own documented, pre-existing limit) — this
Requirement covers exactly the three phases (`author`, `bind-media`, `copy`) that do.

#### Scenario: A banned word in the Production Spec stops the job before any Space call

- **GIVEN** a `queued` News Carousel job whose Asset's saved Production Spec contains a banned word
- **WHEN** `runOneJob` claims and processes it
- **THEN** the job is released `failed` (see the retry Requirement below), and the injected fake Space
  records ZERO edit/run calls

#### Scenario: A missing required Brand Asset stops the job before any Space call

- **GIVEN** a `queued` News Carousel job whose Brand has no `brand-logo` Brand Asset committed
- **WHEN** `runOneJob` claims and processes it
- **THEN** the job is released `failed`, and the injected fake Space records ZERO edit/run calls

#### Scenario: An invalid composed Copy stops the job before the Asset is ever saved produced

- **GIVEN** a `queued` News Carousel job that renders successfully, but whose injected drafter returns an
  empty caption (fails `auditCopyPhase`)
- **WHEN** `runOneJob` claims and processes it
- **THEN** the job is released `failed`, and the Asset is never saved `status: 'produced'` and carries no
  `asset_media` row from this attempt

### Requirement: A job whose Recipe declares a gate parks at awaiting_pick without holding the Space

`runOneJob` SHALL, on a `driveToNextGate` outcome of `"paused"`, raise a `gate_request`
(`raiseGateRequest`, carrying the offered candidates, undecided) and release the job to
`awaiting_pick` — clearing its claim. A parked job SHALL NOT be re-selected by `findNextQueuedJob`
(its status is no longer `queued`), so `drainQueue`'s loop SHALL advance to the next queued job while the
Operator's pick is pending — a parked job never blocks a sibling job from being claimed and driven.

#### Scenario: A Character Explainer job pauses at its Cast gate

- **GIVEN** a `queued` Character Explainer job against a healthy fake Space
- **WHEN** `runOneJob` claims and processes it
- **THEN** the job's status is `awaiting_pick`, and a `gate_request` row exists for it, carrying the
  offered Cast candidates, undecided

#### Scenario: A parked job does not block a sibling job from draining

- **GIVEN** a `queued` Character Explainer job (enqueued first) and a `queued` News Carousel job
  (enqueued second), both for the same Brand
- **WHEN** `drainQueue` runs both fakes to completion
- **THEN** the Character Explainer job ends `awaiting_pick` and the News Carousel job ends `done` — the
  parked job never held the Space

### Requirement: Resolving a gate through gate_request resumes the parked job

`src/command-surface/gates.ts`'s `resolveGate(db, gateRequestId, decision)` SHALL record the Operator's
decision (`recordGateDecision`) and enqueue a NEW `job` row for the SAME Asset (`gate` omitted — this new
job targets the final render), so the drain loop's next pass claims and drives the RESUMED leg. Which leg
a claimed job represents SHALL be derived, never separately tracked: `src/worker/plan-leg.ts`'s
`planLeg(recipe, priorDecision)` reads whether the Asset already carries a DECIDED `gate_request` from an
EARLIER job (`job-claim-store`'s `listGateRequestsForAsset`) — no prior decision means a FIRST leg
targeting the Recipe's first declared gate (or `null` for a zero-gate Recipe); a decided prior gate
request means a RESUMED leg targeting `null` (the final render), carrying that decision's `choice` as the
pick.

#### Scenario: resolveGate enqueues the resumed leg, which renders to done

- **GIVEN** a Character Explainer job parked `awaiting_pick` with an undecided `gate_request`
- **WHEN** `resolveGate(db, gateRequestId, { decidedBy: "operator", choice: <a candidate id> })` is
  called, and the returned new job id is then processed by `runOneJob` against a fresh healthy fake Space
- **THEN** the resumed leg pins the chosen candidate (visible in the fake Space's recorded edit goals) and
  the job reaches `done`, with the Asset `produced`

### Requirement: A failed job is retried with a recorded attempt count, then reaches terminal failure

On any phase-audit failure or `driveToNextGate` failure, `runOneJob` SHALL release the job to `failed`
and, only while the just-claimed `JobRecord.attempt` is strictly less than an injectable `maxAttempts`
(default 3), SHALL call `job-claim-store`'s existing `requeueJob` to return it to `queued` for a later
claim (which increments `attempt` again on the next `claimJob`). Once `attempt` reaches `maxAttempts`,
the job SHALL be left `failed` and SHALL NOT be requeued again — a terminal state `drainQueue`'s loop
never re-selects.

#### Scenario: A deterministically-failing drive is retried once, then reaches terminal failure

- **GIVEN** a `queued` News Carousel job whose Spec-inject always fails against the injected fake
  (`FakeCarouselSpace({ injectNoOp: true })`), and `maxAttempts: 2`
- **WHEN** `drainQueue` runs to completion
- **THEN** the job's final `attempt` is `2` and its final `status` is `failed`, and it was never
  requeued a third time

### Requirement: The worker only drives Recipes that use a Magnific Space

`runOneJob` SHALL treat a Space-less Recipe (`recipe.space`/`recipe.canvasInputs` both absent, ADR-0021 —
`producer/uses-space.ts`'s `usesSpace(recipe) === false`) as an ordinary, retryable failure rather than
attempting to drive a Space that does not exist. This is a deliberate scope boundary (the News Short
Script Recipe's Space-less render step is genuinely different production logic), not a silent gap.

#### Scenario: A Space-less Recipe job fails cleanly, never touching a Space port

- **GIVEN** a `queued` job whose Recipe declares no `space`/`canvasInputs`
- **WHEN** `runOneJob` claims and processes it
- **THEN** the job is released `failed` (retried/terminal per the retry Requirement above), and no
  `SpaceMcpPort` method is ever called

