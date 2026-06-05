# Slice Handoff — issue #8: Producer worker (drain-on-trigger, periodic tick, unattended permission path)

> One bidirectional doc. The **developer** writes the Build Report; **qa** appends a QA Verdict below.
> Retries append `Round-N` blocks; nothing is overwritten.

---

## Build Report (developer)

### What changed

This slice adds the **Producer worker** ADR-0004 calls for — the orchestration that finally ties the
prior slices together so background production actually runs unattended, one Space generation at a time,
without the Operator babysitting. It reuses (does not reinvent) the pure scheduler (Slice 4), the Space
driver's two phases (Slices 5–6), the ledger writers, the queue store, the `/queue` renderer, and the
**Magnific fake** at the `SpaceMcpPort` boundary.

The worker (`src/production-queue/worker.ts`) exposes two entry points over injected dependencies:

- **`drain(deps)`** — the drain-on-trigger task. While the Space is free and `nextReady(queue)` returns a
  job, it `markRunning`s that job (taking the single-Space lock), persists, and **starts** the job's Space
  op asynchronously through the injected `SpaceSession`. Because the Space is then busy, `nextReady`
  returns null and `drain` **exits** — no always-on daemon, no busy-wait. It starts **at most one** Space
  op, so two Space ops never run at once.
- **`tick(deps)`** — the required periodic reap-and-advance. It polls the single in-flight op: if still
  running, it does nothing; if completed, it **reaps** it (cast-gen → `awaiting_cast` + Cast/casting
  ledger writes, releasing the lock; render → `done` + Asset/produced ledger writes; failure → `failed` +
  an Operator notification of **when + why**) and then calls `drain` to start the next ready job with no
  Operator action.

Supporting changes: `enqueueRender` (picking a Cast enqueues a render job; `/pick-cast` now calls it);
a `FakeSpaceSession` modelling an async op as **start-then-poll** (so a render can complete "while idle"
and be reaped by a later tick); a scheduler fix so transitions target the right job when an Idea holds
**two** jobs at once (a gated cast job + a queued render job); and the unattended permission path
(allowlist config + docs).

### Files touched

**New code**
- `src/production-queue/worker.ts` — the worker (`drain`, `tick`, the reap-by-phase logic, the injected
  `SpaceSession` / `QueuePersistence` / `LedgerWrites` / `Notifier` seams).
- `src/production-queue/worker.test.ts` — worker tests (8).

**Modified code**
- `src/production-queue/queue.ts` — added `enqueueRender` (render-phase enqueue, idempotent per render
  job) and `hasJobOfPhase`. `enqueue` (cast) unchanged.
- `src/production-queue/queue.test.ts` — tests for `enqueueRender`, `hasJobOfPhase`, and the `/queue`
  five-status coverage assertion.
- `src/production-queue/scheduler.ts` — `markRunning` now targets the Idea's `queued` job and the
  lock-releasing transitions target the Idea's `running` job (via `indexOfJobInStatus`), so an Idea
  holding both a gated cast job and a queued render job transitions the correct one. **Backward-compatible:
  single-job Ideas resolve identically; all prior scheduler tests still pass.**
- `src/space-driver/fixtures/fake-space.ts` — added `FakeSpaceSession` (the start-then-poll Magnific fake
  at the worker seam; drives the real driver over `FakeSpace`).
- `src/commands/pick-cast.ts` — on a valid pick, enqueues the render via `enqueueRender` (injected
  ledger/queue paths + clock keep it testable). Signature changed from a positional `ledgerPath` to a
  `PickCastOptions` object.
- `src/commands/pick-cast.test.ts` — updated to the options signature; added render-enqueue tests
  (enqueued on valid pick; not enqueued on out-of-range / unknown Idea; no duplicate).

**New non-code artifacts**
- `.claude/permissions/producer-worker.json` — the allowlist / non-auto permission mode for the worker.
- `docs/producer-worker-permissions.md` — documents the permission path and the `/loop` tick host.

**OpenSpec change**
- `openspec/changes/issue-8-producer-worker-drain-tick/{proposal.md,tasks.md,handoff.md}`
- `openspec/changes/issue-8-producer-worker-drain-tick/specs/production-queue/spec.md` — ADDED
  Requirements for the worker (drain, gate-release, render enqueue, periodic tick, permission path,
  failure isolation + `/queue` five statuses).

### How to run

```
npm test          # tsc --noEmit typecheck + node --test over src/**/*.test.ts  → 177 pass / 0 fail
npm run build     # tsc -p tsconfig.build.json                                   → exit 0
npx openspec validate issue-8-producer-worker-drain-tick --strict                → valid
```

Real results (this build): `npm test` → **tests 177, pass 177, fail 0** (worker.test.ts: 8/8).
`npm run build` → **exit 0**. `openspec validate --strict` → **Change is valid**.

### Acceptance-criteria self-assessment (each AC → the test that proves it)

1. **Accepting an Idea triggers a background drain that runs ready cast-gens serialized (never two Space
   ops at once).**
   → `worker.test.ts` › *"drain — serialized, at most one Space op (AC1)"*: "starts exactly one ready
   cast-gen, takes the lock, and exits"; "never starts a second op while one is running (FIFO picks the
   earliest)"; "is a clean no-op when nothing is ready". (`drain` is what an accept triggers; the
   `FakeSpaceSession` throws if a second op starts while one is in flight.)

2. **A job at the Cast gate releases the Space; a later-accepted Idea's cast-gen proceeds while the gated
   Idea waits.**
   → `worker.test.ts` › *"gate releases the Space … (AC2)"*: "reaps the first cast-gen to awaiting_cast
   and starts the second while the first waits" (asserts j1 `awaiting_cast`, j2 `running`, the gated Idea
   is never re-started, exactly one op in flight).

3. **Picking a Cast enqueues the render and the worker renders it when the Space is free.**
   → `pick-cast.test.ts` › *"picking a Cast enqueues the render"*: "enqueues exactly one queued
   render-phase job …" (plus the no-render-on-invalid-pick / no-duplicate cases); and `worker.test.ts` ›
   *"pick-cast enqueues the render … (AC3)"*: "a render job queued after a cast gate is started and reaped
   to produced".

4. **A periodic tick reaps a render that completed while idle and starts the next queued job with no
   Operator action.**
   → `worker.test.ts` › *"tick — reap a completed op … (AC4)"*: "does nothing while the op is still in
   flight" and "reaps a render that completed while idle and STARTS the next queued job, no Operator
   action" (asserts the render → `done` + `produced` + Asset, and that the *next* queued job (`idea-B`) is
   started by the tick's drain).

5. **A permission path exists so `spaces_edit`/`spaces_run` run without per-call approval in the worker
   (documented).**
   → `.claude/permissions/producer-worker.json` (the allowlist / non-auto permission mode) +
   `docs/producer-worker-permissions.md` (documents it + the `/loop` tick host + how it resolves the
   spike blocker). Referenced from the `worker.ts` module doc-comment. *(Config/docs deliverable — not a
   unit test; it is a real artifact, scoped to the two Space-mutating tools on the Producer's Space.)*

6. **A failed job is isolated (queue continues) and surfaced to the Operator with when + why; `/queue`
   reflects all five statuses.**
   → `worker.test.ts` › *"failure isolation + notification (AC6)"*: "marks a failed op failed, releases
   the lock, notifies when+why, and continues" (asserts the failed job is `failed`, the next job runs, the
   notification contains the injected timestamp + the driver's failure code, and the failed Idea's ledger
   status is **not** advanced). The five-status `/queue` coverage is proven by `queue.test.ts` › *"/queue
   renderer reflects all five worker statuses"*.

### Fakes / fixtures used (Magnific fake explicitly flagged)

- **`FakeSpaceSession`** (`src/space-driver/fixtures/fake-space.ts`) — **THE MAGNIFIC FAKE at the worker
  seam.** Models one in-flight async Space op as start-then-poll; each op runs entirely through the
  existing `FakeSpace` and the **real driver** (`composeAndCast` / `pickAndRender`) at the `SpaceMcpPort`
  boundary. **No live `spaces_*`/`creations_*`, no credits, no board mutation, no network.** `start(job)`
  latches the terminal result; `poll()` returns `running` until the test calls `advance()` — that is what
  lets a render "complete while idle" and be reaped by a later `tick`.
- **`FakeSpace`** (same file, prior slices) — the underlying fake `SpaceMcpPort`; reused unchanged.
- **In-memory `QueuePersistence` + capturing `LedgerWrites`/`Notifier`** (`worker.test.ts`) — exercise the
  worker with zero disk I/O.
- **Temp-file queue + ledger** (`pick-cast.test.ts`, via `mkdtemp`) — so the command never touches real
  `data/` state. **Confirmed: `git status` shows no `data/` mutations.**
- `validSpec()` (`production-spec/fixtures/specs.ts`) and `fakeSpaceState()`
  (`execution-protocol/fixtures/space-state.ts`) — reused to drive the fake cast-gen/render.

### Self-review notes

- **Simplify pass:** the worker holds no business logic of its own — every decision (FIFO, the lock, the
  ledger status mapping) is delegated to the existing deep modules (`nextReady` / `mark*` /
  `ledgerStatusForTransition`). The in-flight op is tracked by the injected `SpaceSession`, **not** by a
  new `data/queue.json` field — so the queue's on-disk shape is unchanged and prior slices are untouched.
- **Scheduler fix (the one behavioral change to a prior module):** `markRunning` / the lock-releasing
  transitions now resolve the job by `(idea_id, expected status)` instead of `(idea_id)` alone, because an
  Idea can now legitimately hold two jobs (a gated cast job + a queued render job). This is the minimal
  correct fix; it is backward-compatible (single-job Ideas resolve identically) and all 177 tests
  (including every prior scheduler test) pass.
- **Always-rules verified in code:** generate-never-publish — the worker reaps a render to a finished
  Asset and stops; there is no publish/Facebook/post path anywhere (a test asserts zero notifications on a
  successful render). ledger-as-source-of-truth — every `casting`/`produced` status and the `cast`/`asset`
  fields are written from the queue transition, derived via `ledgerStatusForTransition`, never inferred; a
  failed Idea's status is never advanced. Public-metrics-only / relative-not-absolute /
  explicit-attribution are n/a (no metrics, no scoring, `post_url` untouched).

### Known limits

- **Live Magnific adapter still deferred.** The real `SpaceMcpPort` / `SpaceSession` implementation that
  calls live `spaces_*`/`creations_*` is intentionally not built here (hermetic build). The permission
  allowlist is shipped now so the deferred live adapter has the path ready; it has no effect on CI.
- **`/loop` host is documented, not scheduled here.** The default periodic-tick host is `/loop`
  (`docs/producer-worker-permissions.md`); wiring an actual recurring scheduler/cron is a runtime/ops
  concern outside this code slice. `tick(deps)` is the unit the host calls and is fully tested.
- **One in-flight op by design.** The worker models a single in-flight Space op (the Space has no
  parallelism). This is the ADR-0004 constraint, not a limitation.

---

## QA Verdict (qa appends below — do not overwrite)

### QA Verdict — Round 1: ✅ PASS

**Reviewer:** qa (the single non-human gate). Read-run-report only; no product code, tests, specs, or
docs were edited. Sole write is this verdict block (appended).

#### Suite result — all green, run by qa

| Check | Command | Result |
|---|---|---|
| OpenSpec strict validate | `npx openspec validate issue-8-producer-worker-drain-tick --strict` | **Change is valid** (exit 0) |
| Full test suite | `npm test` (tsc --noEmit + node --test over src/**/*.test.ts) | **tests 177 · pass 177 · fail 0** (worker.test.ts 8/8) |
| Build | `npm run build` (tsc -p tsconfig.build.json) | **exit 0** |
| Hermetic (no disk writes) | md5 of `data/ledger.json` + `data/queue.json` before/after the suite | **unchanged**; `git status --porcelain data/` empty |
| Blockers closed | #5, #6, #7 | all **CLOSED** |

#### Per-criterion results (each AC → the test/file that proves it)

1. **Accepting an Idea triggers a background drain; ready cast-gens serialized, never two Space ops at once** — ✅
   `worker.test.ts` › "drain — serialized, at most one Space op (AC1)" (3 cases: starts exactly one + takes
   lock + exits; never a second while running, FIFO by `enqueued_at`; clean no-op when nothing ready).
   Serialization is *enforced*, not asserted in prose: `FakeSpaceSession.start` **throws** if a second op
   starts while one is in flight, and `drain` guards on `space.inFlight()` then `markRunning`'s `space_busy`.

2. **A job at the Cast gate releases the Space; a later-accepted Idea's cast-gen proceeds while the gated
   Idea waits** — ✅ `worker.test.ts` › "gate releases the Space … (AC2)": after reap, j1 `awaiting_cast`,
   j2 `running`; `session.started` is exactly `["idea-1","idea-2"]` (gated Idea never re-run); exactly one op
   in flight. Backed by `scheduler.markAwaitingCast` releasing the lock (`release` → `lock.active_job: null`).

3. **Picking a Cast enqueues the render and the worker renders it when the Space is free** — ✅
   `pick-cast.test.ts` › "picking a Cast enqueues the render" (enqueues exactly one queued render on a valid
   pick; NOT on out-of-range / unknown Idea / no-cast; no duplicate) + `worker.test.ts` › "AC3" (a queued
   render after a cast gate is drained to `running`, then ticked to `done` + `produced` + Asset). `pickCastCommand`
   enqueues only after a successful `selectCharacter`.

4. **A periodic tick reaps a render that completed while idle and starts the next queued job with no
   Operator action** — ✅ `worker.test.ts` › "tick … (AC4)": "does nothing while in flight" (poll → running);
   "reaps a render that completed while idle and STARTS the next queued job" — render → `done`/`produced`/Asset,
   then `idea-B` started by the tick's own `drain` (no Operator call). `produced_at` is the injected clock.

5. **A documented permission path lets the worker run `spaces_edit`/`spaces_run` without per-call approval** —
   ✅ Config/docs deliverable, both artifacts verified to exist and be adequate (not just prose):
   `.claude/permissions/producer-worker.json` — `mode: allowlist`, `auto_approve: true`, allow-list contains
   `magnific:spaces_edit` + `magnific:spaces_run` (plus the read/poll tools), scoped to the single Producer
   Space; `docs/producer-worker-permissions.md` (49 lines) documents the path + the `/loop` tick host + the
   spike blocker it resolves; referenced from the `worker.ts` module doc-comment.

6. **A failed job is isolated (queue continues) + surfaced with when + why; `/queue` reflects all five
   statuses** — ✅ `worker.test.ts` › "failure isolation + notification (AC6)": failed job → `failed` (stays in
   queue), lock released, next job (`idea-good`) `running`; notification contains the **injected timestamp
   (when)** + the **driver failure code (why)** + the Idea id; the failed Idea's ledger status is **not**
   advanced (no fabricated Cast/Asset). Five-status `/queue` proven by `queue.test.ts` › "/queue renderer
   reflects all five worker statuses" — asserts `renderQueue` output includes queued/running/awaiting_cast/
   done/failed.

#### Per-scenario results (spec deltas → covering test)

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| Drain starts exactly one ready cast-gen and exits | ✅ | drain AC1 "starts exactly one…" |
| Drain never starts a second op while one running | ✅ | drain AC1 "never starts a second…" + FakeSpaceSession throw-guard |
| Drain with nothing ready is a clean no-op | ✅ | drain AC1 "clean no-op when nothing is ready" |
| Reaching the Cast gate frees the Space, next cast-gen runs | ✅ | gate-release AC2 |
| Picking a Cast enqueues a render job (idempotent) | ✅ | pick-cast + queue.test "enqueueRender" |
| Worker renders the enqueued render when free; no publish | ✅ | worker AC3 + AC4; grep: no publish/fb path |
| Tick reaps a render completed while idle, starts next job | ✅ | tick AC4 "reaps … STARTS the next…" |
| Tick on a still-running op does nothing | ✅ | tick AC4 "does nothing while in flight" |
| Allowlist config grants worker non-auto Space permission, documented | ✅ | producer-worker.json + producer-worker-permissions.md |
| Failed Space op isolated, queue continues | ✅ | failure AC6 |
| Failure notifies Operator with when + why; status not advanced | ✅ | failure AC6 |
| `/queue` reflects all five statuses | ✅ | queue.test "all five worker statuses" |

#### Always-rules + Magnific-fake checks

| Check | Result | Evidence |
|---|---|---|
| Generate-never-publish | ✅ | `grep -niE 'publish|facebook|post_url' worker.ts pick-cast.ts` → only doc-comments stating none exists; worker reaps render → `done` and stops; AC4 asserts 0 notifications on success |
| Ledger-as-source-of-truth | ✅ | every `casting`/`produced` status + `cast`/`asset` fields written via injected `LedgerWrites` on the queue transition; a `failed` Idea's status is never advanced (AC6) |
| Public-metrics-only / relative-not-absolute / explicit-attribution | ✅ n/a | no metrics/scoring/Post↔Idea path in this slice (`grep` → NONE); `post_url` untouched |
| Magnific fake used, no live Space | ✅ | `grep -rE 'spaces_(edit|run)\(|creations_(get|show|wait)\(' src` → only doc-comments + fake fixtures; `FakeSpaceSession` runs the **real driver** over `FakeSpace` at the `SpaceMcpPort` seam — no credits, no board mutation, no network |
| Hermetic (no `data/` writes) | ✅ | md5 of ledger.json + queue.json identical before/after suite; in-memory + `mkdtemp` stand-ins |

#### Scrutiny of the flagged load-bearing change (`scheduler.ts`)

The developer flagged that `markRunning` / the lock-releasing transitions now resolve the job by
`(idea_id, expected status)` via `indexOfJobInStatus`, so an Idea can hold a gated cast job + a queued
render job at once. Reviewed and **correct + non-regressing**:
- `markRunning` keeps the `indexOfJob == -1 → unknown_job` and `spaceBusy → space_busy` guards, then targets
  the Idea's **`queued`** job; absent → `invalid_transition`.
- `release` (awaiting_cast/done/failed) keeps the `unknown_job` guard, then targets the Idea's **`running`**
  job (the lock holder); absent → `invalid_transition`.
- For a single-job Idea the status-scoped lookup resolves identically to `indexOfJob`, so the prior
  semantics and error codes are preserved. All prior scheduler tests pass within the green 177.
- The AC2/AC3 tests exercise the two-jobs-per-Idea path end-to-end (idea-A holds a gated cast job + a queued
  render job and the right one transitions). No regression observed.

#### Defects

None. All six acceptance criteria, all twelve spec scenarios, all always-rules, the Magnific-fake
hermeticity, and the hermetic-disk check pass on real output. The OpenSpec spec deltas faithfully match
issue #8 (no misread, no self-consistent-but-wrong requirement; every Requirement traces back to an AC and
to ADR-0002/0004).

**Gate decision: PASS — clear to open the branch/PR for Operator merge approval.**
