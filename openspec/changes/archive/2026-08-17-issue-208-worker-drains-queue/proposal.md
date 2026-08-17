## Why

`src/production-queue/scheduler.ts` and `src/space-driver/driver.ts` are real, typed, and fully tested —
and have no production caller. `data/queue.json` holds 66 jobs whose statuses are only `queued` (3) and
`done` (63): never `running`, never `awaiting_pick`, including for the gated *Character Explainer with
Cast* Recipe, which is not a path the old file scheduler can produce. That is the proof the built engine
has never actually run. Epic #195 phase 03 names the fix: a worker process that drains the Production
Queue by calling the SQL-backed claim primitive (#203), the existing generic driver (`driveToNextGate`),
and the existing per-Recipe Phase Contracts — with no human present, because attended mode was never a
product requirement (two of the three wired Recipes declare zero gates; the one stated reason for running
attended, a permission classifier re-blocking allow-listed Magnific calls, does not apply to a worker
holding its own credentials).

## What Changes

- **A worker process drains the SQL-backed Production Queue.** `src/commands/run-worker.ts`'s
  `drainQueue(db, port, options)` repeatedly finds the oldest `queued` job
  (`job-store.ts`'s new `findNextQueuedJob`, FIFO by `enqueued_at`) and runs it to a terminal-for-this-
  attempt state via `src/command-surface/worker.ts`'s `runOneJob`, until nothing is `queued`. Because one
  worker process drives this loop strictly sequentially — never starting a second job before the current
  one reaches `done` / `awaiting_pick` / `failed` — the Magnific Space's own one-generation-at-a-time
  constraint (ADR-0004/ADR-0008) holds by construction, with no separate "is the Space busy" bookkeeping
  needed on top of the atomic claim.
- **`runOneJob` composes the existing deep modules, not new production logic.** For one claimed job: (1)
  resolve which LEG of the Recipe's Execution Protocol this is — FIRST (no prior gate decision for this
  Asset) or RESUMED (a prior gate request for this Asset is decided) — via the new, pure
  `src/worker/plan-leg.ts`; (2) on a FIRST leg, self-audit the already-authored Production Spec against
  the Recipe's `author` Phase Contract (`recipe/phase-contract.ts`'s `auditAuthorPhase` — unchanged); a
  broken shape or a banned word STOPS the job before any Space call; (3) on a leg about to render
  (`targetGate === null`), resolve + bind the Recipe's media slots (`producer/bind-media.ts`'s
  `bindMediaSlots`, unchanged) and self-audit the `bind-media` Phase Contract
  (`auditBindMediaPhase` — unchanged); a missing REQUIRED slot STOPS the job; (4) drive exactly one leg
  via `space-driver/driver.ts`'s `driveToNextGate` (unchanged) against the injected `SpaceMcpPort`; (5) on
  a PAUSED outcome, raise a `gate_request` and release the job to `awaiting_pick` — the parked job's Space
  is free for the next queued job; (6) on a FINISHED outcome, download the rendered media, compose +
  self-audit Copy (`recipe/phase-contract.ts`'s `auditCopyPhase` — unchanged), save the Asset `produced`,
  attach its media, save its Copy Variant, and release the job `done`.
- **Job identity, not a re-derived state machine.** Whether a leg is FIRST or RESUMED is derived by
  looking at whether the Asset already carries a DECIDED `gate_request` from an earlier job (a new read,
  `gate-request-store.ts`'s `listGateRequestsForAsset`) — never a separate, independently-writable "leg
  cursor" that could drift from the jobs/gate_requests it describes.
- **Resolving a gate resumes the parked job by enqueuing its next leg.** `src/command-surface/gates.ts`'s
  `resolveGate(db, gateRequestId, decision)` composes `gate-request-store.ts`'s `recordGateDecision` with
  `job-store.ts`'s `createJob` — a NEW job row for the SAME Asset, `gate` omitted (targets the final
  render) — mirroring `src/command-surface/ideas.ts`'s `recordReviewDecision` precedent: a command-
  surface function composing more than one store call behind real branching logic is an established shape
  here, not a new one (the same precedent issue #209 cited when it collapsed its own three-layer shape).
  `claimJob`'s own eligibility rule (`queued`, or `running` with an expired lease — never `awaiting_pick`)
  is exactly why a NEW job row is required to resume a parked one, rather than re-claiming the same row;
  this ticket adds no new claiming mechanism.
- **A failed job is retried with a recorded attempt count, then reaches terminal failure.** On any
  phase-audit or drive failure, `runOneJob` releases the job to `failed` and, only while
  `job.attempt < maxAttempts` (default 3, injectable), calls `job-store.ts`'s existing `requeueJob` to
  return it to `queued` for a later claim (which bumps `attempt` again). Once `attempt` reaches
  `maxAttempts`, the job is left `failed` — terminal, never requeued again.
- **Four small, additive reads, no rewritten mechanics:** `asset/store.ts`'s `getAssetById`,
  `production-queue/job-store.ts`'s `findNextQueuedJob`, `production-queue/gate-request-store.ts`'s
  `listGateRequestsForAsset`, and a widened `asset/download.ts`'s `downloadAssetFiles` return shape
  (adds `bytes`/`contentType`, additive — every existing caller destructures only `filename`/`path` and
  is unaffected) so `runOneJob` can turn a rendered creation's URL into a durable local file plus a
  checksum (`media-backup/checksum.ts`'s existing `digestBuffer`, reused, not reimplemented) without
  re-reading the file back off disk.
- **Two new, minimal command-surface modules**, both composing existing store writes only —
  `src/command-surface/gates.ts` (`raiseGateRequest`, `resolveGate`) and `src/command-surface/copy.ts`
  (`saveCopyVariant`) — plus the job-orchestration module `src/command-surface/worker.ts` (`runOneJob`).
  Every SQL write `runOneJob` needs (`claimJob`/`releaseJob`/`requeueJob`, `createGateRequest`/
  `recordGateDecision`, `writeAsset`/`addAssetMediaBatch`, `upsertCopyVariant`) is already registered in
  `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS` from earlier tickets — because every one of
  those writes happens INSIDE `src/command-surface/` (`isCommandSurfacePath`), the guard needs no new
  entries and no allow-list addition. This mirrors issue #209's own Round-2 precedent exactly: rather than
  introduce a fourth `src/worker/` deep module that imports store writes directly (which #209 tried once,
  then collapsed after qa flagged it as an un-audited bypass), the composing logic lives in
  `src/command-surface/worker.ts` from the start. `src/worker/` holds ONLY pure/read-only helpers
  (`plan-leg.ts`, `resolve-media-slots.ts`, `media-kind.ts`) that import no store write function at all.
- **Scope: News Carousel end-to-end, Character Explainer's gate proven, News Short Script deferred.**
  `runOneJob` refuses (a stable, retryable failure) a job whose Recipe has no `space`/`canvasInputs`
  (`usesSpace(recipe) === false`, ADR-0021) — the News Short Script Recipe's Space-less render step
  (`collectShotListMedia`) is genuinely different production logic, out of this ticket's "loop around the
  existing engine, not new production logic" scope. Multi-slide media matching (a News Carousel Asset's 7
  slides, individually matched by `stat_callout`) and multi-Channel Copy fan-out
  (`composeCopyForChannels`, ADR-0025) are likewise deferred — `runOneJob` downloads the ONE representative
  creation `driveToNextGate` returns and saves ONE Copy Variant, for the Brand's primary Channel. Both are
  flagged as known limits, not silently narrowed.
- **The live Magnific Space run is Operator-gated.** This ticket builds and tests `runOneJob`/`drainQueue`
  entirely against `src/space-driver/fixtures/fake-space.ts` and
  `src/producer/fixtures/fake-carousel-space.ts` — THE Magnific fakes already established. The live
  `SpaceMcpPort` adapter (`src/space-driver/live/adapter.ts`, built by issue #207) already satisfies the
  SAME interface `runOneJob`/`drainQueue` are written against; wiring a real `LiveMcpTransport` into it and
  running one real News Carousel Asset through `drainQueue` is documented precisely in this change's
  `handoff.md` for the Operator to run — not executed by this agent, which holds no `magnific` MCP tools.

## Capabilities

### Added Capabilities

- `worker`: `src/commands/run-worker.ts` + `src/command-surface/worker.ts` + `src/worker/` — drains the
  SQL-backed Production Queue to terminal-for-this-attempt job states, self-auditing each phase, parking
  at gates without holding the Space, retrying failures to a terminal state.

### Modified Capabilities

- `command-surface`: gains `raiseGateRequest`/`resolveGate` (`gates.ts`), `saveCopyVariant` (`copy.ts`),
  and `runOneJob` (`worker.ts`) — the worker's own job orchestration, composing existing store writes.
- `job-claim-store`: gains `findNextQueuedJob` (the FIFO-oldest-queued read the drain loop uses) and
  `listGateRequestsForAsset` (the cross-leg read `plan-leg.ts` uses to tell a FIRST leg from a RESUMED
  one).
- `asset-store`: gains `getAssetById` — the by-id read `runOneJob` needs (a `job` row carries only
  `asset_id`, never `(idea, recipe)` directly).
- `docs-conformance` (Round 3): the "Docs-conformance tests pin the CURRENT reality" Requirement's
  `report.docs-test.ts`/`run-pipeline.docs-test.ts` Scenarios are widened to pin BOTH production paths —
  `docs/adr/0030` (this change) partially supersedes `docs/adr/0008`'s "no unattended/background worker"
  decision, so a docs-test (and the live doc it pins: `CLAUDE.md`, `README.md`,
  `.claude/commands/run-pipeline.md`, `.claude/commands/pick-cast.md`, `.claude/agents/producer.md`)
  that still asserted the OLD, now-false, unqualified claim would itself become the thing Priority One
  exists to catch. Two new Scenarios (`CLAUDE.md`, `README.md`) are added for symmetry with the
  existing `pick-cast.md`/`run-pipeline.md`/`producer.md` ones.

## Impact

- **New code:** `src/worker/plan-leg.ts` (+`.test.ts`), `src/worker/resolve-media-slots.ts`
  (+`.test.ts`), `src/worker/media-kind.ts` (+`.test.ts`), `src/command-surface/gates.ts` (+`.test.ts`),
  `src/command-surface/copy.ts` (+`.test.ts`), `src/command-surface/worker.ts` (+`.test.ts`),
  `src/commands/run-worker.ts` (+`.test.ts`), `openspec/changes/issue-208-worker-drains-queue/` (this
  change).
- **Modified code:** `src/asset/store.ts` (+`getAssetById`), `src/asset/download.ts` (widened return
  shape, +test), `src/production-queue/job-store.ts` (+`findNextQueuedJob`, +test),
  `src/production-queue/gate-request-store.ts` (+`listGateRequestsForAsset`, +test),
  `src/command-surface/index.ts` (+re-exports).
- **Governance/documentation (Round 2 + Round 3, no `src/` production-logic change):**
  `docs/adr/0030-worker-drains-the-queue-unattended.md` (new — supersedes, in part, `docs/adr/0008`;
  gained a Round-3 Consequences bullet naming what real-time human oversight is lost on the unattended
  path, and what backstops replace it), `docs/adr/0008-...md` (+forward-pointer blockquote),
  `.claude/rules/always/organicgrowth-rules.md` rule 11 (rewritten), `CLAUDE.md`, `README.md`,
  `.claude/commands/run-pipeline.md`, `.claude/commands/pick.md`, `.claude/commands/pick-cast.md`,
  `.claude/agents/producer.md` (Round 3 — each now names BOTH production paths and cites ADR-0030),
  `src/commands/run-pipeline.docs-test.ts`, `src/commands/report.docs-test.ts`,
  `src/production-spec/producer-agent.docs-test.ts` (Round 3 — re-pinned to the new wording, strengthened
  rather than weakened).
- **Hermetic, no live Magnific/Zoho/Apify call.** Every worker test drives `FakeSpace`/
  `FakeCarouselSpace` (the established Magnific fakes) through a real, throwaway SQLite file
  (`db/test-support.ts`'s `withTempDb`, never `:memory:`) and an injected fake `fetch` for the media
  download step — no `spaces_*`/`creations_*` call, no credits, no board mutation, no network.
- **Always-rules upheld.** Generate-never-publish: `runOneJob` never calls a Zoho/publish tool — it stops
  at `produced`; publication stays the Operator's own act. Public-metrics-only and relative-not-absolute
  are unaffected (no Performance code touched). Explicit-attribution is unaffected (no Post logging here).
  Ledger-as-source-of-truth: every status change (`job.status`, `asset.status`) is written through the
  existing SQL stores via the command surface, the same governed path every other write in this codebase
  now takes.
