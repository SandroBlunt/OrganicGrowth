## Why

The prior slices built every *piece* of background production but never wired them together so the
Producer actually runs unattended. Slice 4 (#5) gave the pure **scheduler** (`nextReady`, the `mark*`
lifecycle, the single-Space lock). Slice 5 (#6) and Slice 6 (#7) gave the **Space driver**'s two phases
(`composeAndCast` → Cast at the Cast gate; `pickAndRender` → Asset) and the ledger writers. What is still
missing is the **worker** ADR-0004 calls for: the thing that, on a trigger, pulls `nextReady` jobs and
drives them through the driver under the single-Space lock, releases the Space at the Cast gate, reaps
async renders that finish while the Operator is idle, isolates failures, and tells the Operator when and
why a job failed — all **without an always-on daemon** and **without the Operator babysitting runs**.

ADR-0004 pins the four mechanisms this slice must deliver: **drain-on-trigger** (accepting an Idea or
picking a Cast spawns a background task that drives every Space-ready job until the queue is empty or all
remaining jobs are gate-blocked, then exits — no daemon); **gates do not hold the Space** (an
`awaiting_cast` job releases the lock so the next queued cast-gen proceeds); a **periodic tick that is
required, not optional** (because Space runs are async and can complete while no accept/pick is happening,
a light recurring tick must reap the completed run and start the next job, or throughput stalls); and
**failure isolation** (a failed generation is marked `failed`, surfaced to the Operator, and the queue
continues with the next job).

`docs/producer-spikes-results.md` surfaced one more hard requirement: `spaces_edit`/`spaces_run` are
auto-denied by the permission classifier as "modifying shared infrastructure" and need per-call approval
**even with blanket verbal consent**. A headless worker would stall at the first Space op. So this slice
also delivers an **unattended permission path** — an allowlist config the worker references so it can
drive the Space in the background — as a real, documented config artifact.

This slice **reuses** the prior modules wholesale: the pure scheduler (`nextReady` / `markRunning` /
`markAwaitingCast` / `markDone` / `markFailed` and the single-Space lock), the driver's `composeAndCast`
and `pickAndRender`, the ledger writers (`writeIdeaStatus` / `writeIdeaCast` / `writeIdeaAsset` and the
`ledgerStatusForTransition` mapping), and the **Magnific fake** at the `SpaceMcpPort` boundary. It adds
the orchestration on top of them — the worker — plus the one missing queue primitive (`enqueueRender`)
and the permission config.

**Hermetic build (no live Space).** Everything the worker drives reaches Magnific only through the narrow
injected `SpaceMcpPort` (the prior slices' seam) and through injected deps for the clock, the queue/ledger
I/O, and the Operator notifier. Tests pass the **FAKE** Magnific Space (extended only to model an async
Space op as start-then-poll, so the tick's reap is genuinely exercised) and in-memory/temp-file stand-ins
for the rest. There are **no** live `spaces_*`/`creations_*` calls, **no credits**, **no board mutation**,
and **no network** anywhere in the slice or its tests. The live MCP adapter implementing `SpaceMcpPort`
remains deferred.

## What Changes

- **Add the Producer worker** (`src/production-queue/worker.ts`) — the orchestration deep module that ties
  the scheduler to the driver under the single-Space lock. It exposes:
  - **`drain(deps)`** — the drain-on-trigger task. While the Space is free and `nextReady(queue)` returns
    a job, it `markRunning`s that job (taking the lock), **starts** its Space op through the injected
    `SpaceSession` (a cast-gen or a render — async, non-blocking), and persists. Because the Space is now
    busy, `nextReady` returns nothing and `drain` **exits** (no daemon, no busy-wait). Returns a summary
    of what it started. A `drain` that finds the Space busy or no ready job is a clean no-op.
  - **`tick(deps)`** — the required periodic reap-and-advance. It polls the single in-flight Space op
    through the `SpaceSession`; if it is still running, `tick` returns having done nothing. If it
    completed, `tick` **reaps** it — a cast-gen reaching the Cast gate → `markAwaitingCast` +
    `writeIdeaCast` + `writeIdeaStatus("casting")` (the lock releases, freeing the Space); a render
    completing → `markDone` + `writeIdeaAsset` + `writeIdeaStatus("produced")`; a failed op → `markFailed`
    + an Operator notification of **when and why** — then calls `drain` to start the next ready job. So a
    render that finished while the Operator was idle is reaped and the next job started with **no Operator
    action**.
  - The worker derives every ledger status from the queue transition via the existing
    `ledgerStatusForTransition` (never inferred), keeps `data/queue.json` and `data/ledger.json`
    consistent, and **never publishes** — it renders an Asset and stops (generate-never-publish).
- **Add `enqueueRender`** to the pure queue module (`src/production-queue/queue.ts`) — append a
  `phase: render`, `status: queued` job for an Idea whose Cast the Operator has picked (idempotent per
  `idea_id` for a render job, mirroring `enqueue`). This is the "picking a Cast enqueues the render" step;
  `/pick-cast` calls it after recording the chosen Character. The existing `enqueue` (cast-phase) is
  unchanged.
- **Wire `/pick-cast` to enqueue the render and trigger a drain** (`src/commands/pick-cast.ts`) — after
  the pure `selectCharacter` records the chosen Character, the command enqueues the render job and (in the
  orchestration path) triggers a worker `drain`. The pure selection and the messaging stay testable
  without I/O.
- **Extend the Magnific fake** (`src/space-driver/fixtures/fake-space.ts`) only as needed to model an
  async Space op as **start-then-poll** at the `SpaceSession` level, so a render can be *started* by a
  `drain` and *reaped* by a later `tick` (the "completed while idle" path). No new live calls; no schema
  change to the existing `SpaceMcpPort`.
- **Add the unattended permission path** — a real allowlist config
  (`.claude/permissions/producer-worker.json`) plus documentation
  (`docs/producer-worker-permissions.md`) describing the non-auto permission mode the background worker
  uses so `spaces_edit`/`spaces_run` run without per-call approval. This resolves the spike's flagged
  blocker (`docs/producer-spikes-results.md`).
- **Tests** (`src/production-queue/worker.test.ts`, additions to `src/production-queue/queue.test.ts` and
  `src/commands/pick-cast.test.ts`) — serialized drain (never two Space ops at once); a gate releasing the
  Space so a later-accepted cast-gen proceeds while the gated Idea waits; pick-cast enqueuing the render
  and the worker rendering it when the Space is free; the periodic tick reaping a render completed while
  idle and starting the next job with no Operator action; failure isolation (the failed job is `failed`,
  the queue continues, the Operator is told when + why); and `/queue` reflecting all five statuses.

## Capabilities

### Modified Capabilities

- `production-queue`: **adds the Producer worker** (ADR-0004) on top of the existing scheduler — a
  drain-on-trigger task and a required periodic tick that drive the Space driver under the single-Space
  lock. Accepting an Idea (or picking a Cast) triggers a background `drain` that starts one Space-ready
  job; the lock serializes the Space (never two ops at once); a cast-gen reaching the Cast gate releases
  the lock so the next queued cast-gen proceeds while the gated Idea waits; a periodic `tick` reaps an
  async Space op that completed while the Operator was idle and starts the next job unattended; a failed
  op is isolated (`failed`, the queue continues) and the Operator is told **when and why**; and a
  documented permission allowlist lets the worker drive `spaces_edit`/`spaces_run` without per-call
  approval. Picking a Cast enqueues a `render`-phase job (`enqueueRender`). The pure scheduler, the driver,
  and the ledger writers are reused unchanged.

## Impact

- **New code:** `src/production-queue/worker.ts` and `src/production-queue/worker.test.ts`; additions to
  `src/production-queue/queue.ts` (`enqueueRender`) + `src/production-queue/queue.test.ts`; additions to
  `src/commands/pick-cast.ts` (render enqueue + drain trigger) + `src/commands/pick-cast.test.ts`;
  additions to `src/space-driver/fixtures/fake-space.ts` (a start-then-poll `SpaceSession` over the
  fake). New non-code artifacts: `.claude/permissions/producer-worker.json` and
  `docs/producer-worker-permissions.md`.
- **Reuses, does not duplicate:** the pure scheduler (`nextReady`, `markRunning`, `markAwaitingCast`,
  `markDone`, `markFailed`, the single-Space lock) from Slice 4; the driver's `composeAndCast` and
  `pickAndRender` from Slices 5–6; the ledger writers (`writeIdeaStatus`, `writeIdeaCast`,
  `writeIdeaAsset`) and the `ledgerStatusForTransition` mapping; the queue store (`loadQueue`/`saveQueue`)
  and the `/queue` renderer (which already shows all five statuses); the Magnific fake at the
  `SpaceMcpPort` boundary.
- **No new dependencies.** `data/queue.json`'s on-disk shape is **unchanged** (the in-flight Space op is
  tracked by the worker's injected `SpaceSession`, not persisted as a new queue field). The default
  **periodic-tick host is `/loop`** — a build choice, documented in
  `docs/producer-worker-permissions.md`.
- **Hermetic / no live Space:** no `spaces_*`/`creations_*` calls, no credits, no board mutation, no
  network. The worker drives Magnific only through the injected `SpaceMcpPort` / `SpaceSession`; tests
  supply the **Magnific fake**. The live adapter is deferred.
- **Always-rules upheld:** **generate-never-publish** — the worker drives cast-gens and renders and
  **stops** at the finished Asset; there is **no** publish/Facebook/post action anywhere in the worker or
  the command (publication stays a human act; ADR-0002). **Ledger-as-source-of-truth** — every status
  change (`casting`, `produced`) and the `cast` / `asset` fields are written to `data/ledger.json` from
  the queue transition, derived via `ledgerStatusForTransition`, never inferred; `data/queue.json` is kept
  consistent with it. **Failure is never fabricated** — a failed Space op becomes a `failed` job plus an
  explicit Operator notification, never an invented Cast or Asset. Public-metrics-only,
  relative-not-absolute, and explicit-attribution are n/a in this slice (no metrics, no scoring, no
  Post↔Idea linkage — `post_url` is untouched).
