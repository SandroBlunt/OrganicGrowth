## Why

Slice 1 stood up the runtime and **auto-enqueues** accepted Ideas; Slice 2 turns a Brief into a strict
**Production Spec**; Slice 3 gave the Producer a parsed **Execution Protocol** so it knows *how* to drive
a Space. What is still missing is the **brain that decides which queued job runs next** under the Space's
single-concurrency constraint — the pure decision logic of the **Production Queue** (ADR-0004). This is
the richest test target in the feature and the logic the background worker (a later slice) will drive.

The Magnific Space runs **one generation at a time** (no parallelism). With several Ideas accepted in a
Run, their cast-gens and renders must be serialized. ADR-0004 decided the `producer` owns this as a
**Production Queue** with four load-bearing rules this slice encodes:

- **FIFO by acceptance order.** When several jobs are ready, the earliest-accepted (`enqueued_at`) goes
  first. (Fit Score priority was considered and deferred.)
- **Single Space concurrency.** Only **one** Space-busy operation runs at a time; the Producer holds a
  lock around runs, so at most one job is ever `running`.
- **Gates do not hold the Space.** An Idea paused at its **Cast** gate (`awaiting_cast`) releases the
  Space; the next queued cast-gen proceeds meanwhile. So `nextReady` **skips** `awaiting_cast` jobs.
- **Failure is isolated per job.** A failed generation is marked `failed`; the queue continues with the
  next job rather than blocking. So a `failed` job never blocks its successors.

This slice also keeps the **ledger and queue consistent**: ADR-0004 states "`casting`/`produced`
transitions are written as jobs complete." Per CLAUDE.md's pipeline, the **cast** job reaching its Cast
gate (`awaiting_cast`) implies the Idea moves `accepted → casting` (it is "casting" while awaiting the
Operator's Character pick), and the **render** job completing (`done`) implies `casting → produced`.
Those two trigger points are the only queue→ledger reflections in the lifecycle, and the ledger stays the
source of truth (the queue is derived from it, never the reverse — always-rules #7).

**Scope (pure logic only).** This is pure decision logic over `data/queue.json` states plus a pure
queue→ledger status mapping, with a thin, separately-tested ledger-write shell. There is **no MCP, no
Space, no background scheduling, no periodic tick, and no actual queue drain** here — those are the
worker slice. Everything is deterministic: timestamps are injected, never read from the clock; FIFO
orders by `enqueued_at`, proven against fixtures with distinct timestamps (not insertion order).

**Hermetic build (no live Space).** There is **no Magnific interaction at all** in this slice — no
`spaces_*`/`creations_*` calls, no credits, no board mutation. All logic is exercised through pure
in-memory queue-state fixtures.

## What Changes

- **Add a pure scheduler deep module** (`src/production-queue/scheduler.ts`):
  - **`nextReady(state) → QueueJob | null`** — returns the single next job to run under single
    concurrency: `null` if any job is already `running` (or the lock is held); otherwise the
    earliest-`enqueued_at` `queued` job. It **skips** `awaiting_cast`/`done`/`failed` jobs, so a paused
    Cast gate does not hold the Space and a `failed` job does not block its successors. FIFO is by
    `enqueued_at`, not array position.
  - **`markRunning(state, ideaId)`** — moves the named job `queued → running` and sets the lock
    (`active_job = ideaId`). Refuses to start a second run while the lock is held or another job is
    `running` (returns a `{ ok: false, code }` result, mirroring `production-spec/validate.ts`).
  - **`markAwaitingCast(state, ideaId)`** — moves a `running` **cast** job `running → awaiting_cast` and
    **releases** the lock (the gate does not hold the Space).
  - **`markDone(state, ideaId)`** — moves a `running` job `running → done` and releases the lock.
  - **`markFailed(state, ideaId)`** — moves a `running` job `running → failed` and releases the lock; the
    job stays in the queue (surfaced to the Operator) but no longer blocks successors.
  - All transitions are **pure**: they return a NEW `QueueState`, never mutate the input, never read the
    clock, and keep the single-active-run lock in step with job status (≤1 `running`).
- **Add a pure queue→ledger status mapper + thin write shell** (`src/ledger/ledger.ts`):
  - **`ledgerStatusForTransition(job, toStatus) → IdeaStatus | null`** — pure: returns the implied Idea
    status for a queue transition, or `null` when the transition implies no ledger change. The only two
    reflections are: a **cast** job → `awaiting_cast` ⇒ `casting`; a **render** job → `done` ⇒
    `produced`. (`render`→`failed`, `cast`→`running`, etc. imply no ledger change.)
  - **`applyIdeaStatus(ideas, ideaId, status)`** — pure: returns a NEW ideas array with that Idea's
    `status` set (the ledger stays canonical; nothing is inferred).
  - **`writeIdeaStatus(ideaId, status, options)`** — a thin, separately-tested shell that loads
    `data/ledger.json`, applies the pure status set, and saves — so a completed queue transition keeps
    the ledger in step. This shell adds a minimal ledger writer/loader of the full record (the prior
    reader only projected `{id,status}`); it does NOT drive the background worker.
- **Tests** (`scheduler.test.ts`, ledger tests in `ledger.test.ts`) — FIFO readiness by timestamp,
  single-Space lock (≤1 `running`, `null` while one runs), gate-skipping (`awaiting_cast` skipped),
  failure isolation (`failed` does not block a later `queued`), each `mark*` transition + lock
  maintenance, the queue→ledger mapping (`casting`/`produced`) and a round-trip through the write shell,
  plus purity assertions (input unmutated via `JSON.stringify` snapshot).

This slice decides and transitions queue state and reflects two completions into the ledger. It does
**no** Space I/O, no background scheduling, and no periodic tick — that is the worker slice.

## Capabilities

### Modified Capabilities

- `production-queue`: extends the existing capability (state file + auto-enqueue from Slice 1) with the
  **scheduler decision logic** — single-Space-aware readiness (FIFO by acceptance time), the `mark*`
  lifecycle transitions that maintain the single-active-run lock, gate-skipping so an `awaiting_cast`
  Idea does not hold the Space, failure isolation so a `failed` job does not block successors, and the
  queue→ledger status reflection (`accepted→casting` when a cast job reaches its gate; `casting→produced`
  when a render job completes) that keeps `data/ledger.json` the source of truth.

## Impact

- **New code:** `src/production-queue/scheduler.ts` + `scheduler.test.ts`; additions to
  `src/ledger/ledger.ts` (pure mapper + pure status set + thin write shell) + `src/ledger/ledger.test.ts`.
- **No new dependencies.** No new state files — works over the existing `data/queue.json` and
  `data/ledger.json`. `data/queue.json`'s shape (job + lock) is unchanged from Slice 1.
- **No external calls:** no Magnific (no fake needed — pure queue-state fixtures only) and no Apify; the
  build stays hermetic.
- **Always-rules upheld:** **ledger-as-source-of-truth** is directly relevant — the queue is derived from
  the ledger; this slice writes ledger status faithfully from a queue transition and never *infers* it,
  and the ledger remains canonical. Generate-never-publish holds (nothing here publishes or renders to a
  Space). Public-metrics-only / relative-not-absolute / explicit-attribution are n/a (no metrics, no
  scoring, no Post↔Idea linkage in this slice). Nothing is fabricated.
