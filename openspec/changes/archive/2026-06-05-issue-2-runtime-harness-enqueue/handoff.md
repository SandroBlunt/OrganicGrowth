# Slice Handoff — issue-2-runtime-harness-enqueue

> Bidirectional developer ⇄ qa channel for this slice. The developer writes the Build Report; qa
> appends a QA Verdict below it. Retries append Round-N blocks — nothing is overwritten.

---

## Build Report (developer)

### What changed

Stood up the **first application-code layer** in OrganicGrowth (the repo had none) and delivered the
thinnest live path through it: per ADR-0004, accepting an Idea **auto-enqueues** a `cast`-phase job to
the **Production Queue**, and a new `/queue` command shows the backlog.

- **Runtime:** Node + TypeScript (per `openspec/project.md`). `package.json` + `tsconfig.json` +
  `tsconfig.build.json`, strict TS, ESM/NodeNext. Test runner = Node's built-in `node:test` driven via
  `tsx` (no heavyweight test framework, keeps the dependency surface and the build hermetic).
  `@fission-ai/openspec` wired in as a dev dependency (this is the package that provides the `openspec`
  CLI the repo already uses; the bare `openspec` npm name is an unrelated 0.0.0 placeholder).
- **State:** seeded `data/queue.json` = `{ "jobs": [], "lock": { "active_job": null } }`. Job shape and
  lock are documented in `src/production-queue/queue.ts` and in the spec delta.
- **Deep modules (pure):** `queue.ts` (shape + `enqueue` append/no-duplicate + `hasJobFor`),
  `render.ts` (the `/queue` formatter), `store.ts` (defensive load/save of `data/queue.json`),
  `ledger/ledger.ts` (read-only ledger view for the accepted-only guard), and `planEnqueue` (pure
  accepted-only + no-duplicate policy).
- **Orchestration shells (thin):** `enqueue-on-accept.ts` (`enqueueOnAccept` = load → guard → enqueue
  → save) and `commands/queue.ts` (`queueCommand` = load → render → print).
- **Commands:** `/review-ideas` accept step now auto-enqueues; new `/queue` command doc.

This is queue **plumbing only**. The `producer` agent, the Magnific Space integration, and the
readiness / single-Space-concurrency drain logic are explicitly out of scope (later slices).

### Files touched

Added:
- `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`
- `data/queue.json` (seeded empty)
- `src/production-queue/queue.ts`, `src/production-queue/store.ts`,
  `src/production-queue/enqueue-on-accept.ts`, `src/production-queue/render.ts`
- `src/ledger/ledger.ts`
- `src/commands/queue.ts`
- `src/harness.test.ts`
- `src/production-queue/queue.test.ts`, `src/production-queue/store.test.ts`,
  `src/production-queue/enqueue-on-accept.test.ts`, `src/production-queue/render.test.ts`
- `.claude/commands/queue.md`
- `openspec/changes/issue-2-runtime-harness-enqueue/` (proposal, tasks, spec delta, this handoff)

Edited:
- `.claude/commands/review-ideas.md` (accept step auto-enqueues; guardrail wording)
- `.gitignore` (added `node_modules/`, `dist/`, `*.tsbuildinfo`)

Untouched: `.env`, `.env.example` (no secret handling changed).

### How to run

```
npm install              # one-time; installs dev deps (typescript, tsx, @types/node, @fission-ai/openspec)
npm test                 # type-checks (tsc --noEmit) then runs the full suite via node:test + tsx
npm run build            # tsc emit to dist/ (excludes *.test.ts via tsconfig.build.json)
npm run queue            # runs the /queue command against data/queue.json

openspec validate issue-2-runtime-harness-enqueue --strict   # spec validation
```

Current results: `openspec validate --strict` → **valid**. `npm test` → **24 tests, 24 pass, 0 fail**
(9 suites). `npm run build` → **exit 0**, `dist/` contains only product `.js` (no test files).

### Acceptance-criteria self-assessment (each criterion → the test that proves it)

| Acceptance criterion | Proven by |
|---|---|
| Node+TS project builds and runs; test runner wired; test command green on an initial unit test | `src/harness.test.ts` ("runs TypeScript tests under the Node test runner"); `npm test` runs `tsc --noEmit` + the suite green; `npm run build` exits 0 |
| `data/queue.json` exists with documented job shape + single-active-run lock; timestamps ISO-8601 | `data/queue.json` seeded; shape documented in `queue.ts`/spec; `store.test.ts` "writes valid JSON with the documented shape" + "round-trips a queue state through disk"; `queue.test.ts` "stamps enqueued_at as the injected ISO-8601 timestamp" (asserts `^…Z$` ISO-8601 regex) |
| Accepting an Idea appends exactly one `queued` `cast`-phase job; re-accept does not duplicate | `queue.test.ts` "appends exactly one queued cast-phase job", "does NOT duplicate … same idea_id"; `enqueue-on-accept.test.ts` "persists exactly one job when an accepted Idea is enqueued" + "is idempotent on re-accept: a second call adds no job" |
| Rejected Ideas never produce a queue job | `enqueue-on-accept.test.ts` "refuses a rejected Idea — no job is produced" + "never writes a queue file for a rejected Idea"; `planEnqueue` returns `reason: "not-accepted"` (also covers `suggested`/unknown) |
| `/queue` lists every job with `idea_id`, `phase`, `status` | `render.test.ts` "lists each job with its idea_id, phase, and status" + "reports an empty queue when there are no jobs" |
| A unit test covers enqueue (append + no-duplicate) against a fixture queue state | `queue.test.ts` `describe("enqueue (append + no-duplicate)")` uses `fixtureWithOneJob()` and proves append, no-duplicate, purity, idempotence |
| No secrets committed; `.env` handling unchanged | No `.env`/`.env.example` edits (not in `git status`); no `fetch`/`http`/token reads in `src/`; `node_modules`/`dist` gitignored |

### Fakes / fixtures used

- **In-memory fixtures:** `fixtureWithOneJob()` (queue with one existing job) and a static `IDEAS`
  ledger array (`accepted` / `rejected` / `suggested`) for the policy tests.
- **Temp-file fixtures:** `store.test.ts` and `enqueue-on-accept.test.ts` write a real ledger + queue
  to an `os.tmpdir()` scratch dir and clean it up, exercising the I/O boundary without touching the
  repo's `data/`.
- **Injected clock:** timestamps are passed in (`now()`), never read from the wall clock in tests, so
  ISO-8601 assertions are deterministic.
- **No Magnific fake — and why:** this slice has **zero** Magnific Space interaction (no `spaces_*` /
  `creations_*`, no MCP tools, no network). There is nothing at the Space boundary to fake yet, so no
  fake was built. The build is hermetic: a repo-wide grep of `src/` for `spaces_`/`creations_`/
  `magnific`/`apify`/`fetch`/`http` finds only comment lines that explicitly state this slice does NOT
  call them. The Space-driver fake arrives with the Space-driver slice.

### Self-review notes

- Split the build into `tsconfig.json` (type-checks everything incl. tests) vs `tsconfig.build.json`
  (emits only product code) so `dist/` carries no test files.
- Kept the enqueue policy pure and separately testable as `planEnqueue` (accepted-only + no-duplicate),
  with `enqueueOnAccept` reduced to load/guard/save sequencing.
- `enqueue` returns the **same state reference** on a duplicate (no allocation) and never mutates its
  input — both asserted by tests, so the always-rule "queue derived from ledger, ledger canonical"
  holds and re-accept is provably a no-op.
- Defensive `store.ts` parsing drops malformed job records rather than crashing a Run (data-handling
  rule #4); missing file → empty queue.
- Trimmed unused imports flagged by `noUnusedLocals`; strict + `noUncheckedIndexedAccess` are on.

### Known limits (in scope, intentional)

- The scheduler is `enqueue` + `list` only. **No drain, no FIFO `nextReady`, no single-Space
  concurrency enforcement, no failure isolation** — deferred to a later slice (the `lock.active_job`
  field is seeded and persisted but not yet consumed).
- No ledger **writer** in this slice — `ledger/ledger.ts` is read-only (used for the accepted-only
  guard). The `casting`/`produced` status transitions and the `cast`/`character`/`asset_url` fields
  arrive with the cast-render slice.
- `/review-ideas` is a Markdown command doc; the wiring to actually invoke `enqueueOnAccept` at accept
  time is documented there. No automated end-to-end test drives the Markdown command itself (that is a
  prompt, not code) — the shell it calls (`enqueueOnAccept`) is fully unit-tested.
- The periodic-tick host (ADR-0004) is not built here — also a later slice.

---
<!-- qa appends the QA Verdict below this line. Do not overwrite the Build Report. -->

## QA Verdict — Round 1: PASS

Verified independently — read, ran, and reported. No product code, tests, specs, the OpenSpec change,
or the ledger were edited. Environment: Node v25.8.1, npm 11.12.1.

### Suite result — actually green

| Command (run verbatim) | Result |
|---|---|
| `npm install` | OK — 88 packages audited, 0 vulnerabilities |
| `npm test` (`tsc -p tsconfig.json --noEmit` then `node --import tsx --test "src/**/*.test.ts"`) | **GREEN — tests 24, suites 9, pass 24, fail 0, cancelled 0, skipped 0, todo 0** |
| `npm run build` (`tsc -p tsconfig.build.json`) | **exit 0**; `dist/` holds only 6 product `.js` files, no `*.test.*` (verified `find dist -name '*.test.*'` → none) |
| `npm run queue` (`tsx src/commands/queue.ts`) | Printed `Production Queue\n(no jobs — the queue is empty)`; did **not** mutate `data/queue.json` (git status clean for it after run) |
| `openspec validate issue-2-runtime-harness-enqueue --strict` | **`Change 'issue-2-runtime-harness-enqueue' is valid`** (exit 0) |

The Build Report's claimed counts (24/24, 9 suites, build exit 0, validate valid) reproduced exactly.

### Per-criterion results (issue #2 acceptance criteria)

| # | Acceptance criterion | Verdict | Proven by (test/code actually exercised + passed) |
|---|---|---|---|
| 1 | Node+TS builds and runs; test runner wired; test command green on an initial unit test | **PASS** | `npm test` ran `tsc --noEmit` (type-checks clean) + the runner; `src/harness.test.ts` "runs TypeScript tests under the Node test runner" passed; `npm run build` exit 0 |
| 2 | `data/queue.json` exists with documented job shape + single-active-run lock; ISO-8601 timestamps | **PASS** | `data/queue.json` present & well-formed (`{jobs:[], lock:{active_job:null}}`); shape/lock documented in `queue.ts` and the spec; `store.test.ts` "writes valid JSON with the documented shape" + "round-trips" passed; `queue.test.ts` "stamps enqueued_at as the injected ISO-8601 timestamp" asserts `^\d{4}-…Z$` and passed |
| 3 | Accepting an Idea appends exactly one `queued` `cast`-phase job; re-accept does not duplicate | **PASS** | `queue.test.ts` "appends exactly one queued cast-phase job…" + "does NOT duplicate…" passed; `enqueue-on-accept.test.ts` "persists exactly one job…" + "is idempotent on re-accept: a second call adds no job" passed (real temp-file I/O, asserts on-disk job count = 1) |
| 4 | Rejected Ideas never produce a queue job | **PASS** | `enqueue-on-accept.test.ts` "refuses a rejected Idea — no job is produced" + "never writes a queue file for a rejected Idea" passed; `planEnqueue` guard checks `idea.status !== "accepted"` → `reason:"not-accepted"`; also covers `suggested` and unknown Ideas |
| 5 | `/queue` lists every job with `idea_id`, `phase`, `status` | **PASS** | `render.test.ts` "lists each job with its idea_id, phase, and status" asserts `idea-A.*cast.*queued` and `idea-B.*render.*running`; live `npm run queue` rendered correctly; empty-queue case covered |
| 6 | A unit test covers enqueue (append + no-duplicate) against a fixture queue state | **PASS** | `queue.test.ts` `describe("enqueue (append + no-duplicate)")` uses `fixtureWithOneJob()` and proves append-to-existing, no-duplicate, purity (no input mutation), and same-reference idempotence |
| 7 | No secrets committed; `.env` handling unchanged | **PASS** | `.env`/`.env.example` not in working-tree changes; `.env`/`.env.local` git-ignored; only `.env.example` is tracked and untouched; no `process.env`/token/`fetch`/`http` reads in `src/` (grep below); `node_modules/` + `dist/` added to `.gitignore` |

All 7 acceptance criteria satisfied by a real, passing test (not merely claimed).

### Per-scenario results (spec deltas — `specs/production-queue/spec.md`)

| Requirement → Scenario | Verdict | Covering test |
|---|---|---|
| Production Queue state file → Empty queue is well-formed | **PASS** | `queue.test.ts` `emptyQueue` "is well-formed: no jobs, lock free"; live seeded `data/queue.json` |
| Production Queue state file → A missing queue file loads as the empty queue | **PASS** | `store.test.ts` "loads a missing file as the empty queue (fresh repo)" |
| Production Queue state file → Enqueued job carries the documented shape with ISO-8601 timestamp | **PASS** | `queue.test.ts` "appends exactly one queued cast-phase job…" + "stamps enqueued_at as the injected ISO-8601 timestamp" |
| Accepting an Idea enqueues a cast-phase job → Accepting an Idea appends one queued cast job | **PASS** | `enqueue-on-accept.test.ts` "persists exactly one job when an accepted Idea is enqueued"; `queue.test.ts` append test |
| Accepting an Idea enqueues a cast-phase job → Re-accepting the same Idea does not duplicate its job | **PASS** | `enqueue-on-accept.test.ts` "is idempotent on re-accept…"; `queue.test.ts` "does NOT duplicate…" + same-reference idempotence |
| Only accepted Ideas enter the queue → A rejected Idea produces no job | **PASS** | `enqueue-on-accept.test.ts` "refuses a rejected Idea…" + "never writes a queue file for a rejected Idea"; `planEnqueue` "refuses a rejected Idea" |
| Queue listing shows each job → Listing renders idea_id, phase, and status for each job | **PASS** | `render.test.ts` "lists each job with its idea_id, phase, and status" |
| Queue listing shows each job → Empty queue reports no jobs | **PASS** | `render.test.ts` "reports an empty queue when there are no jobs"; live `npm run queue` output |

Every Requirement Scenario traces back to an issue acceptance criterion and to ADR-0004 (auto-enqueue,
single-active-run lock, ledger-canonical). No scenario encodes behavior the issue did not ask for; the
spec correctly defers drain / FIFO / single-Space concurrency to later slices, matching the issue's
explicit out-of-scope statement.

### Spec-faithfulness (job (c)) — green on the *issue*, not just on itself

- `proposal.md` / `tasks.md` / spec delta match the issue body verbatim on runtime (Node+TS, per
  `openspec/project.md` line 22), job shape `{idea_id, phase: cast|render, status: queued|running|
  awaiting_cast|done|failed, enqueued_at}`, single-active-run lock, auto-enqueue on accept with no
  `/produce`, accepted-only, no-duplicate, and `/queue` visibility.
- Consistent with ADR-0004 (auto-enqueue on accept; `data/queue.json` with lock; drain/FIFO/concurrency
  deferred) and ADR-0002 (generate-never-publish). No contradiction with CONTEXT.md or PRD #1.
- No misread / self-consistent-but-wrong spec detected: nothing dropped, nothing extra.

### Always-rules + Magnific-fake / hermetic checks

| Check | Verdict | Evidence |
|---|---|---|
| Generate-never-publish | **PASS** | `grep -rniE 'publish\|post\(\|facebook\|graph\.facebook\|/feed' src/` → no matches. No code path publishes to Facebook; accepting only enqueues |
| Ledger-as-source-of-truth | **PASS** | `ledger/ledger.ts` is read-only; the queue is *derived* from the ledger (enqueue refused unless ledger status is `accepted`), never the reverse. Queue-only slice does not violate the ledger model; `data/ledger.json` exists and is untouched |
| Public-metrics-only | **N/A** | No metrics path in this queue-plumbing slice — not exercised |
| Relative-not-absolute | **N/A** | No scoring/comparison in this slice — not exercised |
| Explicit-attribution | **N/A** | No Post↔Idea linking in this slice — not exercised |
| Magnific fake / hermetic (HARD) | **PASS** | `grep -rniE 'spaces_\|creations_\|magnific\|apify\|fetch\(\|https?://\|node:https?\|axios\|got\(\|process\.env\|api[_-]?key\|token' src/` → only 3 hits, all **comment lines** in `queue.ts` and `commands/queue.ts` stating the slice does NOT call them. Tests/fixtures grep → no matches. No `spaces_*`/`creations_*` MCP calls, no network, no credits, no board mutation. Developer's "no fake needed — zero Space interaction" claim independently verified. QA made no live-Space call. |

### Defect list

None. All 7 acceptance criteria pass with real tests, all 8 spec scenarios pass, the suite is actually
green (24/24), `openspec validate --strict` is valid, the build is hermetic with no live-Space reach,
and the always-rules hold.

**Verdict: PASS — Round 1. Clear to proceed to branch + PR.**
