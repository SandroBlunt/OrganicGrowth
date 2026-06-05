# Slice Handoff — issue-5-production-queue-scheduler

> Bidirectional developer ⇄ qa channel for this slice. The developer writes the Build Report; qa appends
> a Verdict; retries append Round-N blocks. Nothing is overwritten.

## Build Report (developer)

### What changed

Delivered the pure decision logic of the **Production Queue** — the "brain" the background worker (a
later slice) will drive (ADR-0004) — plus the queue→ledger status reflection that keeps
`data/ledger.json` the source of truth. No Magnific, no Space, no background scheduling, no periodic
tick, no actual queue drain: all of that is the worker slice. This slice is pure logic over
`QueueState` and a thin ledger-write shell.

- **Scheduler deep module** (`src/production-queue/scheduler.ts`):
  - **`nextReady(state) → QueueJob | null`** — pure. Returns `null` while the Space is busy (the lock is
    held or any job is `running`), enforcing single concurrency (≤1 `running` ever). Otherwise it returns
    the `queued` job with the earliest `enqueued_at` — **FIFO by acceptance time, not array position**.
    It considers only `queued` jobs, so it **skips `awaiting_cast`** (a Cast-gate pause does not hold the
    Space) and **skips `failed`** (a failure does not block its successors).
  - **`markRunning` / `markAwaitingCast` / `markDone` / `markFailed`** — pure transitions over
    `queued → running → (awaiting_cast | done | failed)`. `markRunning` sets the single-active-run lock;
    the three terminal/gate transitions release it. Each returns a NEW state and never mutates the input,
    never reads the clock. Refusals carry a stable `code` (`unknown_job` / `space_busy` /
    `invalid_transition`) mirroring `production-spec/validate.ts`, leaving the queue unchanged on refusal.
- **Queue→ledger reflection** (`src/ledger/ledger.ts`, extended):
  - **`ledgerStatusForTransition(job, to) → IdeaStatus | null`** — pure. The single place the queue's
    vocabulary maps to the ledger's. Exactly two reflection points: a **cast** job → `awaiting_cast`
    ⇒ `casting`; a **render** job → `done` ⇒ `produced`. Everything else (a job entering `running`, any
    job `failed`, a cast job reaching `done`, a render reaching `awaiting_cast`) ⇒ `null` (no change).
  - **`applyIdeaStatus(ideas, id, status)`** — pure: returns a NEW ideas array with one Idea's status
    set; unknown id → array unchanged.
  - **`writeIdeaStatus(id, status, options)`** — a thin shell (load → set one record's status → save)
    that preserves the file's other fields (baseline, the Idea's metadata) by editing the raw record in
    place. Status is reflected *from the queue transition*, never inferred; the ledger stays canonical.

**Chosen queue→ledger trigger points (please scrutinise):** confirmed against ADR-0004 ("`casting`/
`produced` transitions are written as jobs complete") and CLAUDE.md's pipeline ("the cast run-point
pauses the Idea at the Cast gate with status `accepted → casting`"; "after the Character is picked the
render runs to completion with `casting → produced`"). So the **cast** job reaching its gate
(`awaiting_cast`) is the `casting` trigger, and the **render** job completing (`done`) is the `produced`
trigger. A cast job's `done` and any `failed` deliberately imply no ledger change.

### Files touched (all under `/Users/CaxtonTaylor/Subtext`)

- `src/production-queue/scheduler.ts` — **new.** Pure scheduler: `nextReady` + the four `mark*` transitions + the lock.
- `src/production-queue/scheduler.test.ts` — **new.** Scheduler unit tests.
- `src/ledger/ledger.ts` — **edited.** Added `ledgerStatusForTransition` (pure mapper), `applyIdeaStatus` (pure set), `writeIdeaStatus` (thin shell); imports the queue job types.
- `src/ledger/ledger.test.ts` — **new.** Reflection mapper, pure-set, and write-shell round-trip tests.
- `openspec/changes/issue-5-production-queue-scheduler/proposal.md` — **new.**
- `openspec/changes/issue-5-production-queue-scheduler/tasks.md` — **new.**
- `openspec/changes/issue-5-production-queue-scheduler/specs/production-queue/spec.md` — **new** (spec deltas).
- `openspec/changes/issue-5-production-queue-scheduler/handoff.md` — **new** (this file).

No changes to `queue.ts`, `store.ts`, `enqueue-on-accept.ts`, `render.ts`, or the `/queue` command — the
`data/queue.json` job + lock shape from Slice 1 is unchanged and reused as-is.

### How to run

```
npm test          # tsc -p tsconfig.json --noEmit (type-check) + node --import tsx --test src/**/*.test.ts  (116 pass)
npm run build     # tsc -p tsconfig.build.json   (exit 0)
npx openspec validate issue-5-production-queue-scheduler --strict   # valid
```

### Acceptance-criteria self-assessment

1. **Given multiple `queued` jobs, `nextReady` returns the earliest-accepted (FIFO).**
   → `scheduler.test.ts` › "nextReady — FIFO by acceptance time" › "returns the earliest-enqueued queued
   job, not the array-first one". The fixture's **array order is deliberately late/early/mid while the
   timestamps are early/mid/late**, so it proves ordering is by `enqueued_at`, not insertion order.

2. **When a job is `running`, `nextReady` returns nothing (≤1 job ever `running`).**
   → `scheduler.test.ts` › "nextReady — single-Space lock (≤1 running)" › "returns nothing while a job is
   running" (and the companion "returns nothing when the lock is held even if no job is marked running",
   which guards the lock alone). The ≤1-running invariant is also asserted in `markRunning` › "moves a
   queued job to running and sets the lock" (`jobs.filter(status==="running").length === 1`).

3. **`awaiting_cast` jobs are skipped by `nextReady`, not returned as ready.**
   → `scheduler.test.ts` › "nextReady — gate does not hold the Space" › "skips an awaiting_cast job and
   returns the next queued job" (the `awaiting_cast` job is the *earliest* by timestamp, yet the later
   `queued` job is returned). Lock release at the gate is proven by `markAwaitingCast` › "moves a running
   cast job to awaiting_cast and releases the lock".

4. **A `failed` job does not prevent a later `queued` job from being returned.**
   → `scheduler.test.ts` › "nextReady — failure isolation" › "skips a failed job and returns a later
   queued job" (the `failed` job is earliest by timestamp). End-to-end isolation is proven by `markFailed`
   › "frees the Space so a later queued job becomes ready" (mark a running job failed, then `nextReady`
   returns the next).

5. **`mark*` transitions update status + lock correctly and keep ledger status in step
   (`casting` / `produced`).**
   → Queue side: `scheduler.test.ts` `markRunning` / `markAwaitingCast` / `markDone` / `markFailed`
   suites (status + lock set/release, refusals, purity) and "lifecycle integration — queued → running →
   done". Ledger side: `ledger.test.ts` › "ledgerStatusForTransition — queue→ledger reflection points"
   (`cast`→`awaiting_cast` ⇒ `casting`; `render`→`done` ⇒ `produced`; everything else ⇒ `null`) and
   "writeIdeaStatus — thin shell keeps the ledger in step" (an `accepted` Idea reads `casting` after the
   cast-gate reflection, touching only that Idea; a `casting` Idea reads `produced` after the render
   completes).

6. **Unit tests cover each rule above against fixture queue states.**
   → `scheduler.test.ts` (20 tests) + `ledger.test.ts` (11 tests) — all over pure in-memory queue-state /
   ledger fixtures. Full suite: 116 pass (was 85; this slice adds 31).

### Fakes / fixtures used

- **NO MAGNIFIC — none needed.** This slice has **zero Space interaction**: it is pure logic over
  `QueueState` and a thin ledger-file shell. There is no Magnific fake because nothing in the code path
  reads or drives a Space. **No `spaces_*`/`creations_*`/`mcp__magnific__*` calls, no credits, no board
  mutation.** The `magnific` MCP tools happen to be present in this environment but were **NOT used**.
- **Pure queue-state fixtures only:** small in-test factory functions (`job()`, `queue()`) build
  `QueueJob` / `QueueState` objects with **distinct `enqueued_at` timestamps and scrambled array order**
  to prove FIFO is by timestamp.
- **Temp-dir ledger fixture:** the `writeIdeaStatus` round-trip tests seed a JSON ledger in an OS
  temp dir (`mkdtemp`), write, read back, and clean up — they never touch the repo's `data/ledger.json`.

### Self-review notes

- Single-concurrency is enforced two ways that agree: `nextReady` returns `null` when `spaceBusy` (lock
  held OR any `running`), and `markRunning` refuses with `space_busy` under the same condition — belt and
  suspenders on the ≤1-running invariant.
- The three lock-releasing transitions (`markAwaitingCast` / `markDone` / `markFailed`) share one private
  `release()` body and one private `transition()` state-builder, so there is no copy-pasted lock logic;
  `markRunning` is the only setter of the lock.
- `markRunning` checks `unknown_job` before `space_busy` deliberately: a request for a non-existent Idea
  is a caller error regardless of Space state, and tests pin that ordering.
- Reflection is centralised in `ledgerStatusForTransition` — the queue↔ledger vocabulary map lives in one
  pure function, so the two trigger points are obvious and testable in isolation; `writeIdeaStatus` never
  re-derives a status, it only persists what it is handed.
- `writeIdeaStatus` edits the raw record (spread over the parsed object) rather than rewriting from the
  projected `{id,status}` view, so unrelated ledger fields (baseline, titles, fit scores) are preserved.
- No `Date.now()` / `new Date()` anywhere in the new code (verified by grep; the only "Date.now" string is
  a comment stating we never call it). No dead code, no new dependencies, no new state files.

### Known limits

- **The background worker is the next slice.** This slice is the pure *decision* logic only — the actual
  queue drain (loop `nextReady` → `markRunning` → run the Space → `markDone`/`markAwaitingCast`/
  `markFailed` → `writeIdeaStatus`), the drain-on-trigger task, and the **periodic tick** that reaps
  completed async renders (ADR-0004) are all deferred to the worker slice. Nothing here spawns a task or
  ticks.
- **No Space driver is wired.** `mark*` transitions are state moves; nothing here actually starts or
  reaps a Magnific generation. The Space-driver shell (ADR-0003) that calls these around real run-points
  is a later slice.
- **Ledger-write scope is intentionally minimal.** `writeIdeaStatus` writes only the `status` field
  (plus the implied `IdeaStatus` mapping). The richer Producer ledger fields from CLAUDE.md (`cast`,
  `character`, `asset_url`, `produced_at`, `updated_at`) are written by the slices that produce those
  values; this slice does not stamp `updated_at` (no clock by design — that belongs to the shell that
  performs the real transition with an injected timestamp).
- **`writeIdeaStatus` is unconditional on prior status.** It sets whatever it is handed; it does not
  re-validate that the Idea was `accepted` before `casting` or `casting` before `produced`. The lifecycle
  guard lives upstream in the queue transition (`markAwaitingCast`/`markDone` only fire from `running`),
  which is what produces the status to write. Adding a ledger-side guard is a reasonable enhancement for
  the worker slice if defence-in-depth is wanted; flagged for qa to weigh.

---

## QA Verdict (qa)

### QA Verdict — Round 1: PASS

The slice is genuinely green (suite + build + openspec all verified by direct execution, not taken on
faith), every one of the six acceptance criteria is proven by a real test whose assertions actually
exercise the rule (FIFO proven by `enqueued_at` against scrambled array order; the single-Space lock
proven to bar a second start and expose nothing while one runs; gate-skipping and failure-isolation each
proven with the skipped job placed as the *earliest* by timestamp so it cannot pass by accident), the six
spec-delta Requirements faithfully extend the existing `production-queue` capability and trace back to the
issue and to ADR-0004 / CLAUDE.md's pipeline, the build is fully hermetic (zero Magnific interaction —
this slice makes no `spaces_*`/`creations_*` calls at all, by design), and the applicable always-rules
hold, with **ledger-as-source-of-truth** (the most relevant here) upheld: status is reflected *from* the
queue transition through one pure mapper, never inferred or fabricated, and the write shell preserves the
ledger's other fields.

I scrutinised the load-bearing AC#5 trigger-point decision (the developer asked for this explicitly) and
find it correct, not self-consistent-but-wrong: a **cast** job reaching `awaiting_cast` ⇒ ledger
`casting` matches CLAUDE.md pipeline step 3 (`accepted → casting` while the Idea awaits the Operator's
Character pick) and CONTEXT.md's gloss of the Cast gate; a **render** job reaching `done` ⇒ `produced`
matches step 4 (`casting → produced`); and `cast`→`done`, any `failed`, and `render`→`awaiting_cast` all
correctly imply no ledger change. This is exactly the two reflection points ADR-0004 calls for
("`casting`/`produced` transitions are written as jobs complete") and respects the ledger lifecycle
`suggested → accepted → casting → produced → posted → tracking → scored`. No misread.

Two developer-flagged risks were weighed and judged **non-gating** for this slice's stated scope (pure
decision logic; the worker/drain is explicitly a later slice) — see observations O-1 and O-2 below.

### Suite result

- **Command run:** `npm test` → `tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`.
  Type-check clean; **tests 116, suites 50, pass 116, fail 0, cancelled 0, skipped 0, todo 0**
  (duration ~344 ms). Actually green — observed directly. Prior baseline was 85; this slice adds 31
  (scheduler.test.ts = 20, ledger.test.ts = 11), matching the developer's claim.
- **Build:** `npm run build` (`tsc -p tsconfig.build.json`) → **exit 0**.
- **OpenSpec:** `npx openspec validate issue-5-production-queue-scheduler --strict` →
  `Change 'issue-5-production-queue-scheduler' is valid` (exit 0).

### Per-criterion results

1. **Given multiple `queued` jobs, `nextReady` returns the earliest-accepted (FIFO) — PASS.**
   `scheduler.test.ts` › "nextReady — FIFO by acceptance time" › "returns the earliest-enqueued queued
   job, not the array-first one". Array order is `late (12:00) / early (09:00) / mid (10:30)` while the
   assertion expects `idea-early` — so ordering is provably by `enqueued_at`, **not** array insertion
   order. Confirmed in `scheduler.ts` `nextReady` (line 66): `job.enqueued_at < best.enqueued_at`. The
   "empty queue" and "all terminal/gated" companions assert `null`.
2. **When a job is `running`, `nextReady` returns nothing (≤1 ever running) — PASS.**
   `scheduler.test.ts` › "nextReady — single-Space lock (≤1 running)" › "returns nothing while a job is
   running" (asserts `null`) and the defensive "returns nothing when the lock is held even if no job is
   marked running" (lock alone bars a start). The ≤1-running invariant is positively asserted in
   `markRunning` › "moves a queued job to running and sets the lock"
   (`after.jobs.filter(status==="running").length === 1`). Confirmed by `spaceBusy` (scheduler.ts:45–47)
   gating both `nextReady` and `markRunning`.
3. **`awaiting_cast` jobs are skipped by `nextReady` — PASS.**
   `scheduler.test.ts` › "nextReady — gate does not hold the Space" › "skips an awaiting_cast job and
   returns the next queued job". The `awaiting_cast` job is the **earliest** (09:00) and the returned job
   is the later `queued` one (10:00) — so the gate is passed over in favour of a strictly-later queued
   job, not merely absent. Lock release at the gate is proven by `markAwaitingCast` › "moves a running
   cast job to awaiting_cast and releases the lock" (`active_job === null`).
4. **A `failed` job does not prevent a later `queued` job from being returned — PASS.**
   `scheduler.test.ts` › "nextReady — failure isolation" › "skips a failed job and returns a later queued
   job" (the `failed` job is the **earliest** at 09:00; the later `queued` job at 10:00 is returned).
   End-to-end isolation is proven by `markFailed` › "frees the Space so a later queued job becomes ready"
   — a running job is marked `failed`, then `nextReady(result.state)` returns the next queued job.
5. **`mark*` transitions update status + lock and keep ledger status in step (`casting`/`produced`) — PASS.**
   Queue side: `markRunning` (status + lock set; refuses `space_busy` / `unknown_job` / `invalid_transition`
   with queue unchanged on refusal; purity snapshot), `markAwaitingCast` / `markDone` / `markFailed`
   (status set + `active_job` released; invalid-prior-status refusal), and "lifecycle integration —
   queued → running → done". Ledger side: `ledger.test.ts` › "ledgerStatusForTransition — queue→ledger
   reflection points" (cast→awaiting_cast ⇒ `casting`; render→done ⇒ `produced`; running / failed /
   cast→done / render→awaiting_cast ⇒ `null`) and "writeIdeaStatus — thin shell keeps the ledger in step"
   (an `accepted` Idea reads `casting` after the cast-gate reflection, only that Idea touched, unrelated
   fields `title`/`baseline.note` preserved; a `casting` Idea reads `produced` after a render completes).
6. **Unit tests cover each rule above against fixture queue states — PASS.**
   31 new tests (`scheduler.test.ts` 20 + `ledger.test.ts` 11), all over pure in-memory `QueueState` /
   ledger fixtures with distinct timestamps + scrambled array order; ledger write-shell tests use an OS
   temp-dir ledger (`mkdtemp`), never the repo's `data/ledger.json`.

### Per-scenario results (spec deltas)

Requirement: *The scheduler returns the next ready job FIFO under single concurrency*
- "FIFO by acceptance time among multiple queued jobs" — **PASS** (FIFO test, scrambled array order).
- "An empty queue has no ready job" — **PASS** ("returns nothing for an empty queue").

Requirement: *At most one job runs at a time (single-Space lock)*
- "Nothing is ready while a job is running" — **PASS** ("returns nothing while a job is running").
- "Marking a job running sets the lock and bars a second start" — **PASS** (`markRunning` sets lock +
  exactly-one-running; "refuses to start a second run while the lock is held" → `space_busy`, queue
  unchanged).

Requirement: *A job paused at the Cast gate does not hold the Space*
- "awaiting_cast is skipped, the next queued job is returned" — **PASS** (gate-skip test).
- "Reaching the Cast gate releases the lock" — **PASS** (`markAwaitingCast` releases `active_job`).

Requirement: *A failed job does not block its successors*
- "A failed job is skipped and a later queued job runs" — **PASS** (failure-isolation `nextReady` test).
- "Marking a job failed releases the lock" — **PASS** (`markFailed` releases `active_job`).

Requirement: *mark transitions move a job through its lifecycle and maintain the lock*
- "A queued job advances to running and back to done" — **PASS** (lifecycle integration test).
- "Transitions never mutate the input state" — **PASS** (`JSON.stringify` purity snapshots on
  `nextReady` and `markRunning`; refusal paths assert `state` equals the input).
- "An invalid transition is refused" — **PASS** (`markDone`/`markAwaitingCast` on a non-`running` job →
  `invalid_transition`, queue unchanged).

Requirement: *Queue transitions reflect Idea status into the ledger*
- "A cast job reaching its gate maps to ledger casting" — **PASS**.
- "A render job completing maps to ledger produced" — **PASS**.
- "A transition with no phase completion implies no ledger change" — **PASS** (running / failed both
  → `null`; plus cast→done and render→awaiting_cast covered).
- "The write shell keeps the ledger in step" — **PASS** (temp-dir round-trip: only the target Idea
  changes, unrelated fields preserved).

All six spec-delta Requirements are `ADDED` and their names do not clash with the four existing
`production-queue` requirements (`Production Queue state file`, `Accepting an Idea enqueues a cast-phase
job`, `Only accepted Ideas enter the queue`, `Queue listing shows each job`) — clean extension of the
existing capability, consistent with the Slice-1 `data/queue.json` job + lock shape.

### Always-rules + hermetic / Magnific-fake checks

- **Hermetic build / no live Space — PASS (critical check).**
  `grep -rn "spaces_\|creations_\|mcp__magnific\|images_generate\|video_generate\|magnific" src/` returns
  hits **only** in *other* slices' files (`execution-protocol/*`, `production-spec/contract.ts`) and only
  as comments, JSDoc shape references, fixture names, and `describe(...)` test titles — never an executed
  MCP call. **This slice's four files contain no Magnific/MCP/network/publish surface whatsoever**: a
  targeted grep of `scheduler.ts` / `scheduler.test.ts` / `ledger.ts` / `ledger.test.ts` for
  `magnific|spaces_|creations_|mcp__|fetch|http|apify|facebook|publish|credits|board` returns only two
  prose doc-comment lines in `scheduler.ts` that *describe* the single-concurrency constraint without
  calling anything. Imports are pure: `scheduler.ts` imports a type from `./queue.ts`; `ledger.ts`
  imports `node:fs/promises` (local file I/O on the ledger only) + types. No credits, no board mutation
  possible. The `magnific` MCP tools present in the environment were not used by me or by the code.
- **Ledger-as-source-of-truth — PASS (most relevant).** The queue is derived from the ledger; this slice
  writes ledger status *from* a queue transition via one pure mapper (`ledgerStatusForTransition`) and a
  thin shell (`writeIdeaStatus`) that persists only what it is handed — never inferring or fabricating a
  status, and preserving all other ledger fields by editing the raw record. Unknown id → file untouched;
  non-object / missing `ideas` → no write. The ledger stays canonical.
- **Generate-never-publish — PASS.** Nothing in the code path renders to a Space or publishes to
  Facebook; `mark*` are pure in-memory state moves. Publication remains a human gate.
- **Public-metrics-only — PASS (n/a).** No metrics path, no Apify, no Insights in this slice.
- **Relative-not-absolute — PASS (n/a).** No scoring or comparison in this slice.
- **Explicit-attribution — PASS (n/a).** No Post↔Idea linkage in this slice.
- **Determinism / purity — PASS.** No `Date.now()` / `new Date()` in the new code (the only "Date.now"
  string is a comment stating it is never called); `nextReady` orders by injected `enqueued_at`. Purity
  is asserted by `JSON.stringify` snapshots.

### Defect list

No gating defects. Two non-gating observations, both correctly flagged by the developer and judged
acceptable deferrals for **this** slice's pure-decision-logic scope (the worker/drain is explicitly a
later slice):

- **O-1 (low, non-gating) — `writeIdeaStatus` is unconditional on the prior ledger status.** The shell
  sets whatever status it is handed; it does not re-validate that the Idea was `accepted` before
  `casting` or `casting` before `produced`. For this slice this is acceptable: the lifecycle guard lives
  upstream in the queue transitions (`markAwaitingCast` / `markDone` only fire from `running`), which is
  what produces the status that gets written, and `ledgerStatusForTransition` only emits `casting` /
  `produced` for the two legitimate phase completions. No status is fabricated. **Recommendation for the
  worker slice:** consider a ledger-side defence-in-depth guard (refuse a backwards/illegal status jump)
  when the real transition is wired with an injected timestamp; out of scope here. Not gating.
- **O-2 (low, non-gating) — `markRunning` checks `unknown_job` before `space_busy`.** A start request for
  a non-existent Idea returns `unknown_job` even when the Space is also busy. This ordering is deliberate
  (a caller error is reported regardless of Space state), is pinned by tests, and matches the refusal-code
  vocabulary used elsewhere (`production-spec/validate.ts`). Behaviourally correct; flagged only as a
  documented design choice. Not gating.

**Verdict: PASS.** `/build-issue` may open the branch `issue-5-production-queue-scheduler` and PR,
attach this verdict, and ask the Operator to approve the merge.
