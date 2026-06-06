# Slice Handoff — issue-21-queuejob-brand-routing

## Build Report (developer)

### What changed

This slice adds a required `brand: string` field to `QueueJob` so the single shared global Production
Queue can route each job's Cast/Asset writes to the correct Brand's ledger. The queue path itself stays
a global constant (ADR-0004, ADR-0006); only jobs carry a Brand. Key changes:

1. **`QueueJob` type** — `brand: string` added as a required field (with JSDoc explaining its routing role).
2. **`enqueue` / `enqueueRender`** — each gains a `brand` parameter and stamps it on the created job.
3. **`parseJob`** — validates the `brand` field (non-empty string); drops + `console.warn`s any job with a missing or empty brand without crashing the drain.
4. **`planEnqueue` / `enqueueOnAccept`** — gain a `brand` parameter threaded through to `enqueue`.
5. **`WorkerDeps`** — the single `ledger: LedgerWrites` is replaced by `resolveLedger: (brand: string) => LedgerWrites`; the worker calls `resolveLedger(job.brand)` on each reap — never ambient state.
6. **`reap` / `reapCast` / `reapRender`** — resolve the brand-scoped ledger writers via `resolveLedger(job.brand)`; an unresolvable brand triggers `reapBrandFailure` (job marked `failed`, Operator notified, drain continues).
7. **`renderQueue`** — includes the brand in each job line; gains an optional `brandFilter` parameter.
8. **`/queue` command** — passes the `<brand>` arg to `renderQueue` as a filter (or shows all when absent/`--all`).
9. **`/pick-cast` command** — passes `brand` to `enqueueRender` so the render job is brand-stamped.

The Production Spec contract, validator, brand-safety scan, generator, space-driver, execution protocol, and all related modules are untouched (AC5).

### Files touched

**Modified:**
- `/Users/CaxtonTaylor/Subtext/src/production-queue/queue.ts` — `QueueJob.brand` field, `enqueue`/`enqueueRender` brand param
- `/Users/CaxtonTaylor/Subtext/src/production-queue/store.ts` — `parseJob` brand validation + defensive drop
- `/Users/CaxtonTaylor/Subtext/src/production-queue/enqueue-on-accept.ts` — `planEnqueue`/`enqueueOnAccept` brand param
- `/Users/CaxtonTaylor/Subtext/src/production-queue/worker.ts` — `ResolveLedger` type, `WorkerDeps.resolveLedger`, brand-routed `reap*` helpers, `reapBrandFailure`
- `/Users/CaxtonTaylor/Subtext/src/production-queue/render.ts` — brand label per job, `brandFilter` param
- `/Users/CaxtonTaylor/Subtext/src/commands/queue.ts` — pass brand arg as filter
- `/Users/CaxtonTaylor/Subtext/src/commands/pick-cast.ts` — pass brand to `enqueueRender`
- `/Users/CaxtonTaylor/Subtext/src/production-queue/queue.test.ts` — brand stamp tests
- `/Users/CaxtonTaylor/Subtext/src/production-queue/store.test.ts` — brand round-trip + drop tests
- `/Users/CaxtonTaylor/Subtext/src/production-queue/enqueue-on-accept.test.ts` — brand stamp tests
- `/Users/CaxtonTaylor/Subtext/src/production-queue/worker.test.ts` — brand-routed ledger + gate-across-Brands tests
- `/Users/CaxtonTaylor/Subtext/src/production-queue/render.test.ts` — brand label + filter tests
- `/Users/CaxtonTaylor/Subtext/src/commands/pick-cast.test.ts` — render job brand test
- `/Users/CaxtonTaylor/Subtext/src/production-queue/scheduler.test.ts` — added `brand` default to `job()` fixture helper
- `/Users/CaxtonTaylor/Subtext/src/ledger/ledger.test.ts` — added `brand` default to `job()` fixture helper

**Created:**
- `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-21-queuejob-brand-routing/proposal.md`
- `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-21-queuejob-brand-routing/tasks.md`
- `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-21-queuejob-brand-routing/specs/production-queue/spec.md`
- `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-21-queuejob-brand-routing/specs/brand-commands/spec.md`
- `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-21-queuejob-brand-routing/handoff.md` (this file)

### How to run

```
# TypeScript type-check only
npx tsc -p tsconfig.json --noEmit

# Full test suite (type-check + run)
npm test

# Build (production compilation)
npm run build

# OpenSpec validation
npx openspec validate issue-21-queuejob-brand-routing --strict
```

### Acceptance-criteria self-assessment

| AC | Criterion | Test(s) that prove it |
|----|-----------|----------------------|
| 1 | `QueueJob` carries a required `brand`; `parseJob` round-trips it; drops/logs a job with missing or unresolvable Brand without crashing | `store.test.ts`: "round-trips the brand field for a well-formed job", "drops a job with a missing brand", "drops a job with an empty-string brand"; `worker.test.ts`: "marks the unresolvable-brand job failed, notifies, releases lock, and continues with next job" |
| 2 | Auto-enqueue-on-accept takes the Brand and stamps it on the enqueued job | `enqueue-on-accept.test.ts`: "stamps the correct brand on the enqueued job (AC2)", "persists exactly one job with the brand when an accepted Idea is enqueued (AC2)"; `queue.test.ts`: "stamps brand on the enqueued cast job (AC1, AC2)" |
| 3 | The worker and render path derive the Brand from `job.brand` and write Cast/Character/Asset back to that Brand's ledger via the resolver — never from session/active-brand state | `worker.test.ts`: "a cast job for Brand A writes to Brand A's ledger only — Brand B is not touched", "a render job for Brand B writes to Brand B's ledger only — Brand A is not touched", "two Brands' casts in one queue each write to the correct Brand's ledger (AC3, AC4)" |
| 4 | With several Brands' jobs in the one global queue, each job writes to the right ledger; an Idea at Cast gate does not hold the Space, another Brand's generation proceeds (ADR-0004 preserved) | `worker.test.ts`: "two Brands' casts in one queue each write to the correct Brand's ledger (AC3, AC4)", "reaps the first cast-gen to awaiting_cast and starts the second while the first waits" (multi-brand variant with BRAND_A/BRAND_B) |
| 5 | The Production Spec contract, validator, brand-safety scan, generator, and space-driver are unchanged | All 241 pre-existing tests continue to pass (now 256 total: 15 new). No file in `production-spec/`, `space-driver/`, or `execution-protocol/` was modified. |
| 6 | The `/queue` command labels each job with its Brand and can filter the global queue to one Brand | `render.test.ts`: "lists each job with its brand, idea_id, phase, and status", "filtered to one Brand shows only that Brand's jobs (AC6)", "no filter shows all jobs (AC6)", "filtered to a Brand with no jobs reports an empty-for-brand message (AC6)" |
| 7 | Unit tests cover `parseJob` brand round-trip + defensive drop, brand-routed ledger writes from worker/render, and the gate-doesn't-hold-Space behavior across Brands — all against the fake Magnific Space | AC1, AC3, AC4 tests above; all worker tests use `FakeSpaceSession` (the Magnific fake — see below) |

### Fakes / fixtures used

**Magnific fake (explicitly flagged):** All worker tests use `FakeSpaceSession` from
`src/space-driver/fixtures/fake-space.ts`. This is the fake Magnific Space at the `SpaceSession`
boundary — it runs real driver logic (`composeAndCast` / `pickAndRender`) over `FakeSpace` (which
implements `SpaceMcpPort`) with entirely in-memory state. **No live `spaces_*` or `creations_*`
calls were made. No credits were spent. No board was mutated. No network was accessed.**

Other fakes/fixtures:
- `memQueue()` helper — in-memory `QueuePersistence` (no disk I/O in worker tests)
- `brandCaptures()` — in-memory brand-aware `LedgerWrites` factory (captures writes per-brand for assertions)
- `makeNotifier()` — capturing notifier for notification assertion
- Temp-file helpers (`withTempDir`, `withTempFiles`, `withLedger`, `withTwoBrandLedgers`) — used in store/enqueue-on-accept/pick-cast tests for real-file round-trips; isolated to `os.tmpdir()`

### Self-review notes

- **Simplify pass:** Removed the `LedgerWrites` ambient field from `WorkerDeps` entirely rather than keeping it alongside `resolveLedger` — the factory makes the per-job ambient one redundant. This keeps the interface minimal and enforces the invariant that there is no ambient ledger to accidentally use.
- **`reapBrandFailure` vs `reapFailure`:** Kept them separate to avoid coupling `DriverError.code` (a specific string union from the driver) to a brand-resolution failure. This avoids widening `DriverErrorCode` for a non-driver concern.
- **`renderQueue` filter behavior:** When the queue is globally empty, reports "empty"; when the queue has jobs but none for the filter Brand, reports "no jobs for brand X" — distinct messages so the Operator knows whether the global queue is empty or just filtered.
- **Pick-cast test:** Added a focused test ("render job carries the Brand from the pickCastCommand brand argument") to make AC6's render-brand-stamp assertion explicit, beyond the existing brand-routing tests.

### Known limits

- **`resolveLedger` factory in production wiring:** This slice adds the `resolveLedger: ResolveLedger` injection point to `WorkerDeps` but does NOT wire up a production implementation that calls `resolveBrand(brand).ledger` and wraps the real `writeIdeaCast` / `writeIdeaAsset` / `writeIdeaStatus` functions. That wiring lives in the worker orchestration shell (the deferred live-Space adapter slice). The interface is correct and tested; the production factory is out of scope per ADR-0003.
- **`/queue` command test coverage:** `src/commands/queue.ts` has no dedicated test file. The rendering logic is fully covered in `render.test.ts`; the command shell is thin (load + render + print). This is consistent with the pre-existing test coverage pattern for this file.
- **`parseJob` brand resolution:** Brand is validated as a non-empty string at parse time only. Filesystem resolution (does `data/brands/<slug>/` actually exist?) happens at the worker level via `resolveLedger`. A job with a syntactically valid but non-existent brand slug will reach the worker and only be caught there (via the defensive throw → `reapBrandFailure` path). This is correct per the issue spec and consistent with how the resolver works.

---
*qa appends its Verdict below this line.*

---

## QA Verdict — Round 1: PASS

**Date:** 2026-06-06
**Command run:** `npm test` (tsc --noEmit + node --import tsx --test "src/**/*.test.ts")
**OpenSpec validation:** `npx openspec validate issue-21-queuejob-brand-routing --strict`

---

### Suite result

`openspec validate --strict`: PASS — "Change 'issue-21-queuejob-brand-routing' is valid"

`npm test`: PASS — 256 tests, 100 suites, 0 failures, 0 skipped, 0 todo. Duration 664ms.
TypeScript type-check (`tsc --noEmit`) passed with zero errors as part of the same `npm test` run.

---

### Per-criterion results

**AC1 — `QueueJob` carries a required `brand`; `parseJob` accepts and round-trips it; drops/logs a job with a missing or unresolvable Brand without crashing the drain: PASS**

- `QueueJob` in `src/production-queue/queue.ts` declares `readonly brand: string` as a required field with a JSDoc comment stating the routing contract.
- `parseJob` in `src/production-queue/store.ts` validates `typeof brand !== "string" || brand.length === 0` and returns `null` with `console.warn` on failure; the `parseQueueState` caller filters out nulls, so a bad job is silently dropped.
- Tests proving it:
  - `store.test.ts` "round-trips the brand field for a well-formed job (AC1)" — parseQueueState preserves the brand value.
  - `store.test.ts` "drops a job with a missing brand field — does not crash the drain (AC1)" — the bad job is absent from `state.jobs`; the well-formed sibling job survives.
  - `store.test.ts` "drops a job with an empty-string brand — does not crash the drain (AC1)" — same pattern for `brand: ""`.
  - `worker.test.ts` "marks the unresolvable-brand job failed, notifies, releases lock, and continues with next job" — a syntactically valid brand that `resolveLedger` cannot resolve causes `reapBrandFailure`; the next queued job runs; the drain does not crash.

**AC2 — Auto-enqueue-on-accept takes the Brand and stamps it on the enqueued job: PASS**

- `planEnqueue` in `src/production-queue/enqueue-on-accept.ts` receives `brand` as a required argument and threads it to `enqueue(queue, ideaId, now, brand)`. There is no fallback to any ambient or default brand.
- `enqueueOnAccept` passes its `brand` argument straight to `planEnqueue`.
- Tests proving it:
  - `enqueue-on-accept.test.ts` "stamps the correct brand on the enqueued job (AC2)" — `planEnqueue` called with `BRAND_B`; asserts `state.jobs[0].brand === BRAND_B`.
  - `enqueue-on-accept.test.ts` "persists exactly one job with the brand when an accepted Idea is enqueued (AC2)" — real file round-trip; asserts `onDisk.jobs[0].brand === BRAND`.
  - `queue.test.ts` "stamps brand on the enqueued cast job (AC1, AC2)" — `enqueue` called with brand `"mundotip"`; asserts the persisted job carries it.

**AC3 — Worker and render path derive Brand from `job.brand` and write Cast/Character/Asset to that Brand's ledger via the resolver; never from session/active-brand state: PASS**

- `WorkerDeps` in `src/production-queue/worker.ts` carries `resolveLedger: ResolveLedger` with no ambient `LedgerWrites` field. The `reap` function calls `deps.resolveLedger(job.brand)` before any ledger write; `reapCast` and `reapRender` receive the resolved ledger as a parameter.
- Grep for `active.brand`, `active_brand`, `session.*brand`, `global.*brand` in product code: no matches.
- Tests proving it (all use `brandCaptures()` — a per-brand capturing factory — against `FakeSpaceSession`):
  - `worker.test.ts` "a cast job for Brand A writes to Brand A's ledger only — Brand B is not touched" — `cap.casts[0].brand === BRAND_A`; no `BRAND_B` entries.
  - `worker.test.ts` "a render job for Brand B writes to Brand B's ledger only — Brand A is not touched" — `cap.assets[0].brand === BRAND_B`; no `BRAND_A` entries.
  - `worker.test.ts` "two Brands' casts in one queue each write to the correct Brand's ledger (AC3, AC4)" — Brand A's cast write appears only under `BRAND_A`; Brand B's appears only under `BRAND_B`; no cross-contamination.

**AC4 — With several Brands' jobs in the global queue, each job's writes land in the right Brand's ledger; an Idea paused at its Cast gate does not hold the Space, and another Brand's queued generation proceeds (ADR-0004 preserved across Brands): PASS**

- `nextReady` in `src/production-queue/scheduler.ts` skips `awaiting_cast` jobs by design; this is unchanged from prior slices and continues to work across Brands (brand is irrelevant to the scheduler's ready check).
- Tests proving it:
  - `worker.test.ts` "reaps the first cast-gen to awaiting_cast and starts the second while the first waits" — Brand A (`"alpha"`) reaches `awaiting_cast`; Brand B (`"beta"`) immediately moves to `running`; `session.started` records both `idea-1` and `idea-2` in order; only one op is ever in flight.
  - `worker.test.ts` "two Brands' casts in one queue each write to the correct Brand's ledger (AC3, AC4)" — same multi-brand drain sequence; `r1.drain.started.idea_id === "idea-B1"` confirms the second Brand's cast starts automatically.

**AC5 — The Production Spec contract, validator, brand-safety scan, generator, and space-driver are UNCHANGED: PASS**

- `git diff main --stat -- src/production-spec/ src/space-driver/ src/execution-protocol/` produced no output (zero diff).
- `git diff main --name-only` lists exactly the 15 files stated in the Build Report. No file under `production-spec/`, `space-driver/`, or `execution-protocol/` appears.
- All previously passing tests for these modules continue to pass (validate, composeSpec, generate, composeAndCast, pickAndRender, injectSpec, pinCharacter, runRunPoint, fetchCast, fetchAsset — all green in the run above).

**AC6 — The `/queue` command labels each job with its Brand and can filter the global queue to one Brand: PASS**

- `renderQueue` in `src/production-queue/render.ts` formats each job line as `[brand] idea_id  [phase]  status`. The optional `brandFilter` parameter filters `state.jobs` before rendering; if the global queue is non-empty but the filter matches nothing, the message is "no jobs for brand X" (not the empty-queue message).
- `queueCommand` in `src/commands/queue.ts` passes the `<brand>` arg (or `undefined` for `--all` / no arg) directly to `renderQueue`. No logic other than the arg parse.
- Tests proving it:
  - `render.test.ts` "lists each job with its brand, idea_id, phase, and status" — both `alpha` and `beta` brands appear in unfiltered output alongside their idea_ids, phases, and statuses.
  - `render.test.ts` "filtered to one Brand shows only that Brand's jobs (AC6)" — `idea-A1` and `idea-A2` present; `idea-B1` absent.
  - `render.test.ts` "filtered to Brand B shows only Brand B's jobs (AC6)" — `idea-B1` present; `idea-A1` absent.
  - `render.test.ts` "no filter shows all jobs (AC6)" — all three jobs visible.
  - `render.test.ts` "filtered to a Brand with no jobs reports an empty-for-brand message (AC6)" — output matches `/no jobs for brand/i`; no other Brand's jobs appear.

**AC7 — Unit tests cover `parseJob` brand round-trip + defensive drop, brand-routed ledger writes from worker/render, and the gate-doesn't-hold-Space behavior across Brands — all against the fake Magnific Space: PASS**

- All AC1, AC3, AC4 tests confirmed above.
- `worker.test.ts` imports `FakeSpaceSession` from `src/space-driver/fixtures/fake-space.ts` at line 11–13 and constructs it via `new FakeSpaceSession(sessionOpts)` in `makeDeps`. Every worker test goes through this fake. Confirmed by direct code inspection.

---

### Per-scenario results (spec deltas)

**production-queue/spec.md:**

Scenario: Enqueued job carries the documented shape including brand — PASS
- Covered by `queue.test.ts` "stamps brand on the enqueued cast job (AC1, AC2)" and `store.test.ts` "writes valid JSON with the documented shape including brand". Both assert `phase: cast`, `status: queued`, `brand` matching the arg, and ISO-8601 `enqueued_at`.

Scenario: A missing queue file loads as the empty queue — PASS
- Pre-existing behavior; `store.test.ts` "loads a missing file as the empty queue (fresh repo)" remains green.

Scenario: parseJob round-trips the brand field for a well-formed job — PASS
- `store.test.ts` "round-trips the brand field for a well-formed job (AC1)" exactly.

Scenario: parseJob drops a job with a missing brand — PASS
- `store.test.ts` "drops a job with a missing brand field — does not crash the drain (AC1)" exactly.

Scenario: parseJob drops a job with an empty-string brand — PASS
- `store.test.ts` "drops a job with an empty-string brand — does not crash the drain (AC1)" exactly.

Scenario: Auto-enqueue stamps the correct brand on the cast job — PASS
- `enqueue-on-accept.test.ts` "stamps the correct brand on the enqueued job (AC2)". No ambient brand pointer read or written (confirmed by grep; `planEnqueue` and `enqueueOnAccept` have no fallback to any global state).

Scenario: Re-accepting the same Idea does not duplicate its job — PASS
- `enqueue-on-accept.test.ts` "is idempotent on re-accept: a second call adds no job". Pre-existing behavior unchanged.

Scenario: A cast job for Brand A writes to Brand A's ledger only — PASS
- `worker.test.ts` "a cast job for Brand A writes to Brand A's ledger only — Brand B is not touched" exactly.

Scenario: A render job for Brand B writes to Brand B's ledger only — PASS
- `worker.test.ts` "a render job for Brand B writes to Brand B's ledger only — Brand A is not touched" exactly.

Scenario: An unresolvable brand causes a defensive failure, not a drain crash — PASS
- `worker.test.ts` "marks the unresolvable-brand job failed, notifies, releases lock, and continues with next job" exactly. Job becomes `failed`; next job moves to `running`; notification includes `when`, idea id, and bad brand slug.

Scenario: Brand A at the Cast gate does not block Brand B's cast-gen — PASS
- `worker.test.ts` "reaps the first cast-gen to awaiting_cast and starts the second while the first waits". `j1.status === "awaiting_cast"`, `j2.status === "running"`, `session.started.map(o => o.ideaId)` is `["idea-1", "idea-2"]`.

Scenario: Two Brands' cast jobs drain serialized — one completes and the other starts — PASS
- Same test above plus `worker.test.ts` "two Brands' casts in one queue each write to the correct Brand's ledger (AC3, AC4)". `r1.drain.started.idea_id === "idea-B1"` after Brand A reaches `awaiting_cast`; no Operator action required.

**production-queue/spec.md (ADDED requirement):**

Scenario: The render job queued by /pick-cast carries the correct brand — PASS
- `pick-cast.test.ts` "render job carries the Brand from the pickCastCommand brand argument (AC6)". Confirmed by direct code inspection: `pickCastCommand` calls `enqueueRender(queue, ideaId, now, brand)` where `brand` is the explicit argument, never ambient state.

**brand-commands/spec.md:**

Scenario: /queue labels each job with its brand — PASS
- `render.test.ts` "lists each job with its brand, idea_id, phase, and status". Both brand labels appear in the unfiltered output.

Scenario: /queue filtered to one Brand shows only that Brand's jobs — PASS
- `render.test.ts` "filtered to one Brand shows only that Brand's jobs (AC6)" and "filtered to Brand B shows only Brand B's jobs (AC6)".

Scenario: /queue filtered to a Brand with no jobs reports an empty result — PASS
- `render.test.ts` "filtered to a Brand with no jobs reports an empty-for-brand message (AC6)". Output matches `/no jobs for brand/i`; no other Brand's jobs appear.

---

### Magnific fake check: PASS

No live `spaces_*` or `creations_*` calls exist in the product code or tests. All references to those identifiers in `src/` are in:
- Comment/documentation strings (describing the interface or the hermetic contract).
- The `SpaceMcpPort` interface type definition in `src/space-driver/port.ts` (the narrow port that the live adapter would implement — never called directly).
- The fake fixture files themselves (`src/space-driver/fixtures/fake-space.ts`, `src/execution-protocol/fixtures/space-state.ts`) which are the in-memory stand-ins.

All worker tests construct `FakeSpaceSession` from `src/space-driver/fixtures/fake-space.ts` via `makeDeps`. No network access, no credits, no board mutation. Build loop is hermetic.

---

### Always-rules checks

**generate-never-publish: PASS**
`src/production-queue/worker.ts` contains no publish, post, or Facebook path. `reapRender` writes the asset to the ledger and stops (`produced` status). No `post_url`, no platform call, no publish notification. The docstring explicitly states "the worker never publishes." No publish path exists anywhere in the 15 changed files.

**public-metrics-only: PASS**
This slice touches only the Production Queue, worker, and `/queue`/`/pick-cast` commands. No Apify calls, no metrics reads, no performance data are introduced or modified. Not applicable to this slice; no violation possible.

**relative-not-absolute: PASS**
No scoring, baseline, or metric comparison is introduced in this slice. Not applicable; no violation possible.

**explicit-attribution: PASS**
The `/pick-cast` command records a character pick against an explicit `ideaId` argument. The render job is stamped with `brand` and `idea_id` — both explicit. No Post-to-Idea link is inferred anywhere. The `post_url` / `log-post` path is not touched by this slice.

**ledger-as-source-of-truth: PASS**
`reapCast` writes `cast` + `casting` status to the ledger before saving the queue state. `reapRender` writes `asset` + `produced` status to the ledger before saving the queue state. The queue file is kept in step with the ledger transition on every reap. The `enqueueOnAccept` shell checks the ledger before enqueuing; the queue is derived from the ledger, never the reverse. `reapBrandFailure` saves the `failed` queue state without touching the ledger (correct: no Cast/Asset is fabricated).

---

### Defect list

None.

---

**QA Verdict — Round 1: PASS**
