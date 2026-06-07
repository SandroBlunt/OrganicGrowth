# Slice Handoff — issue-22-phase-resolver

## Build Report (developer)

### What changed

This slice adds a new pure deep module `src/phase-resolver/resolve.ts` that, given a Brand's
ledger snapshot and that Brand's slice of the global Production Queue, returns a `PhaseResult`
describing:

- `phase` — the Brand's current loop position in the weekly cycle.
- `pendingGates` — all human gates currently waiting for Operator action (no duplicates).
- `strandedIdeas` — Idea ids that are `accepted` in the ledger but have no live queue job
  (the 2026-W22 case; these need re-enqueue).

No existing modules were modified. The module is fully hermetic: it imports only type definitions
(not runtime I/O) from `src/ledger/ledger.ts` and `src/production-queue/queue.ts`, then uses them
to express the phase/gate logic without ever touching disk, network, Magnific, or Apify.

### Files touched

**Created:**
- `/Users/CaxtonTaylor/Subtext/src/phase-resolver/resolve.ts` — the pure resolver module
- `/Users/CaxtonTaylor/Subtext/src/phase-resolver/resolve.test.ts` — 47 isolation tests
- `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-22-phase-resolver/proposal.md`
- `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-22-phase-resolver/tasks.md`
- `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-22-phase-resolver/specs/phase-resolver/spec.md`
- `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-22-phase-resolver/handoff.md` (this file)

**Modified:** none — this slice adds a new capability; no existing source files were touched.

### How to run

```
# Type-check + full test suite (303 tests: 256 prior + 47 new)
npm test

# Phase-resolver tests only
node --import tsx --test "src/phase-resolver/resolve.test.ts"

# OpenSpec validation
npx openspec validate issue-22-phase-resolver --strict
```

### Acceptance-criteria self-assessment

| AC | Criterion | Test(s) proving it |
|----|-----------|---------------------|
| 1 | `resolvePhase(ledger, queueForBrand)` returns `phase`, `pendingGates`, `strandedIdeas` | `"returns a PhaseResult with phase, pendingGates, and strandedIdeas fields"`, `"phase value is one of the valid Phase strings"`, `"pendingGates contains only valid PendingGate strings"`, `"strandedIdeas is an array of strings"` |
| 2 | Empty ledger → research phase, no stranded work | `"empty ideas array and empty queue → phase: research"`, `"empty ledger → no pending gates"`, `"empty ledger → no stranded ideas"` |
| 3 | Fully-scored Run → done/idle phase | `"all scored → phase: done"`, `"all scored → empty pendingGates"`, `"all scored → empty strandedIdeas"`, `"all rejected → phase: done (no active work)"`, `"mix of scored and rejected → phase: done"` |
| 4 | Stranded `accepted` Ideas surfaced for re-enqueue | `"accepted idea with no queue job → appears in strandedIdeas"`, `"stranded accepted → phase is production"`, `"accepted idea WITH matching queue job → NOT stranded"`, `"two accepted ideas — only the one without a queue job is stranded"`, `"three accepted ideas — two stranded, one in queue"` |
| 5 | `casting`→cast-pick, `produced`→publish, `posted`→track gates | `"one casting idea → pendingGates contains cast-pick"`, `"one casting idea → phase is production"`, `"one produced idea → pendingGates contains publish"`, `"one produced idea → phase is publish"`, `"one posted idea → pendingGates contains track"`, `"one posted idea → phase is tracking"` |
| 6 | Mixed-state ledger resolves deterministically | `"suggested + casting → phase is review (earliest lifecycle position)"`, `"suggested + casting → pendingGates contains both review and cast-pick"`, `"casting + produced → phase is production (earlier than publish)"`, `"produced + posted → phase is publish (earlier than tracking)"`, `"pendingGates has no duplicates even when multiple ideas of same status exist"`, `"same inputs always produce the same result (deterministic)"` |
| 7 | Pure and isolation-tested (no disk, Magnific, Apify) | `"accepts plain literal LedgerIdea objects — no I/O needed"`, `"accepts plain literal QueueJob objects — no I/O needed"`, `"does not mutate the input ideas array"`, `"does not mutate the input queue array"` |

### Fakes / fixtures used

None. This module is pure — inputs are plain in-memory objects (arrays of `LedgerIdea` and
`QueueJob` literals). No Magnific fake, no disk fixture, no network stub was needed.

**No live Magnific Space calls were made at any point in this slice.** The build is hermetic.

### Self-review notes

- **`tracking` status handling added:** The lifecycle includes a `tracking` state between `posted`
  and `scored`. The `posted` status triggers the `"track"` gate (the Operator runs
  `/track-performance`). Once tracking starts (status `tracking`), the Idea is in-flight — it
  contributes `phase: "tracking"` but does NOT add a `"track"` gate (no further Operator action
  needed). This distinction was not explicit in the spec but is correct per the lifecycle. Tests
  cover both cases.
- **Gate deduplication via Set:** Using a `Set<PendingGate>` during the loop ensures no duplicates
  without a second pass. The `Array.from(gateSet)` at return time is a clean O(n) conversion.
- **Stranded detection uses a pre-built Set:** `queuedIdeaIds` is built once before the loop,
  giving O(1) lookup per Idea rather than O(n) per Idea scan.
- **No existing files modified:** This slice is purely additive. All 256 prior tests remain green.
- **`accepted` status produces no human gate:** A stranded `accepted` Idea needs re-enqueue by
  the conductor (automatic), not an Operator action. The test `"stranded accepted ideas do not add
  a gate to pendingGates"` confirms this.

### Known limits

- The `pendingGates` ordering in the returned array is insertion-order (Set iteration). The spec
  does not require a specific order, and the tests use `includes()` checks rather than positional
  assertions. If a canonical order is needed later it can be added without breaking existing tests.
- The `phase` is computed from the entire Brand ledger (all of its Ideas, all runs). If the Brand
  has multiple weekly Runs (e.g. W20 and W22), Ideas from both contribute to the phase. This is
  consistent with the issue's "where that Brand's weekly loop currently stands" framing, but a
  future slice may want to scope to a single Run. The resolver's pure API makes that extension
  straightforward: the caller can filter `ideas` to a single run before passing them in.
- `queueJobs` is expected to already be filtered to the Brand by the caller. The resolver does not
  validate or re-filter by brand — it trusts the caller (consistent with how the issue frames
  `queueForBrand` as the pre-filtered slice).

---

## QA Verdict — Round 1: PASS

**Verified by:** qa (Sonnet 4.6)
**Date:** 2026-06-06

---

### Suite result

Command run: `npm test` (tsc --noEmit + node --import tsx --test "src/**/*.test.ts")

```
tests 303
suites 111
pass  303
fail  0
cancelled 0
skipped 0
todo  0
duration_ms 580.765375
```

Result: GREEN. All 303 tests pass (256 prior + 47 new phase-resolver tests). TypeScript type-check
clean.

Command run: `npx openspec validate issue-22-phase-resolver --strict`

Output: `Change 'issue-22-phase-resolver' is valid`

Result: GREEN.

---

### Per-criterion results

| AC | Criterion | Result | Proving test(s) |
|----|-----------|--------|-----------------|
| 1 | `resolvePhase(ledger, queueForBrand)` returns `phase`, `pendingGates`, `strandedIdeas` | PASS | `"returns a PhaseResult with phase, pendingGates, and strandedIdeas fields"`, `"phase value is one of the valid Phase strings"`, `"pendingGates contains only valid PendingGate strings"`, `"strandedIdeas is an array of strings"` — all four assertions confirmed in `resolve.test.ts` lines 37–63. |
| 2 | Empty ledger → research phase, no stranded work | PASS | `"empty ideas array and empty queue → phase: research"`, `"empty ledger → no pending gates"`, `"empty ledger → no stranded ideas"`, `"empty ideas array with non-empty queue → still research"` — lines 71–91. The early-return at `resolve.ts:113` guarantees `{ phase: "research", pendingGates: [], strandedIdeas: [] }`. |
| 3 | Fully-scored Run → done/idle phase | PASS | `"all scored → phase: done"`, `"all scored → empty pendingGates"`, `"all scored → empty strandedIdeas"`, `"all rejected → phase: done (no active work)"`, `"mix of scored and rejected → phase: done"` — lines 99–131. The `scored`/`rejected` cases fall to the default no-op branch in the switch, leaving `phase` at the pessimistic `"done"` initial value. |
| 4 | Stranded `accepted` Ideas surfaced for re-enqueue | PASS | Seven dedicated tests in lines 139–185. Stranded detection: `!queuedIdeaIds.has(idea.id)` at `resolve.ts:135`. Both directions verified: `"accepted idea with no queue job → appears in strandedIdeas"` and `"accepted idea WITH matching queue job → NOT stranded"`. Correlation is by `idea.id` === `job.idea_id`. The two-accepted / three-accepted tests confirm partial stranding. `"stranded accepted ideas do not add a gate to pendingGates"` confirms no false gate is emitted. |
| 5 | `casting`→cast-pick, `produced`→publish, `posted`→track gates (gate mapping faithful to CLAUDE.md) | PASS | Three separate describe blocks (lines 192–241). `casting` → `cast-pick` (Gate 2 / /pick-cast), `produced` → `publish` (Gate 3 / /log-post), `posted` → `track` (/track-performance). These map exactly to CLAUDE.md's three human gates plus the post-publish track step. No invented gates. Each mapping has a test asserting both the gate and the phase. |
| 6 | Mixed-state ledger resolves deterministically | PASS | Ten tests in lines 274–348. Earliest-lifecycle-wins rule exercised: suggested+casting → review, casting+produced → production, produced+posted → publish. `"pendingGates has no duplicates even when multiple ideas of same status exist"` confirms Set-based deduplication. `"same inputs always produce the same result (deterministic)"` calls `resolvePhase` twice and deepEquals both results. Determinism is structural (Set iteration over a fixed insertion order), not order-dependent on object key iteration. |
| 7 | Pure and isolation-tested: no disk, Magnific, or Apify | PASS | `resolve.ts` imports only `import type { LedgerIdea }` and `import type { QueueJob }` — type-only imports, zero runtime I/O. Grep of `resolve.ts` and `resolve.test.ts` for `spaces_`, `creations_`, `apify`, `fetch`, `readFile`, `readFileSync`, `import.*fs` returns zero hits. The four AC7 tests pass literal JavaScript objects directly; no stub, fake, or fixture is needed. |

---

### Per-scenario results (spec deltas)

All scenarios are under `## ADDED Requirements` in
`openspec/changes/issue-22-phase-resolver/specs/phase-resolver/spec.md`.

| Scenario | Result | Covering test |
|----------|--------|---------------|
| resolvePhase returns a PhaseResult with the three required fields | PASS | `"returns a PhaseResult with phase, pendingGates, and strandedIdeas fields"` |
| Fresh Brand with empty ledger resolves to research phase | PASS | `"empty ideas array and empty queue → phase: research"` + empty pendingGates + empty strandedIdeas tests |
| All Ideas scored resolves to done phase | PASS | `"all scored → phase: done"` + empty pendingGates + empty strandedIdeas |
| All Ideas rejected also resolves to done phase | PASS | `"all rejected → phase: done (no active work)"` |
| Accepted Idea with no queue job is stranded | PASS | `"accepted idea with no queue job → appears in strandedIdeas"` + `"stranded accepted → phase is production"` |
| Accepted Idea with a matching queue job is not stranded | PASS | `"accepted idea WITH matching queue job → NOT stranded"` |
| Multiple accepted Ideas — only those without queue jobs are stranded | PASS | `"two accepted ideas — only the one without a queue job is stranded"` + `"three accepted ideas — two stranded, one in queue"` |
| A casting Idea adds the cast-pick gate | PASS | `"one casting idea → pendingGates contains cast-pick"` + `"one casting idea → phase is production"` |
| A produced Idea adds the publish gate | PASS | `"one produced idea → pendingGates contains publish"` + `"one produced idea → phase is publish"` |
| A posted Idea adds the track gate | PASS | `"one posted idea → pendingGates contains track"` + `"one posted idea → phase is tracking"` |
| Mixed ledger with suggested and casting Ideas | PASS | `"suggested + casting → phase is review (earliest lifecycle position)"` + `"suggested + casting → pendingGates contains both review and cast-pick"` |
| Mixed ledger with casting and produced Ideas | PASS | `"casting + produced → phase is production (earlier than publish)"` + `"casting + produced → pendingGates contains both cast-pick and publish"` |
| Same inputs always return the same result (determinism) | PASS | `"same inputs always produce the same result (deterministic)"` |
| Tests exercise resolvePhase by passing arrays directly | PASS | All 47 tests pass literal arrays; no mocking or I/O system involved |

---

### Always-rules check

| Rule | Result | Evidence |
|------|--------|----------|
| Generate-never-publish | PASS | The resolver is read-only: it takes ledger + queue as inputs and returns a plain object. It has no publish path, no Facebook call, no write to any file. No ADR-0002 violation. |
| Public-metrics-only | PASS | The resolver reads no metrics at all — it reads only ledger statuses and queue job presence. No Apify call, no private Insights path. |
| Relative-not-absolute | PASS | The resolver produces no scores or metrics. Phase/gate/stranded output involves no counts. |
| Explicit-attribution | PASS | The `posted` status is mapped to the `"track"` gate — the resolver surfaces the gate so the Operator runs `/track-performance`, which requires the `post_url` logged via `/log-post`. The resolver does not infer attribution or bypass the explicit URL link. |
| Ledger-as-source-of-truth | PASS | The resolver reads the ledger (Ideas array) as its primary input and treats it as canonical. The queue slice is a secondary index used only to detect stranded `accepted` Ideas. The resolver does not write to or mutate the ledger. |

---

### Magnific fake check

The phase-resolver module has no dependency on the Magnific Space, no MCP tools, and no
`spaces_*`/`creations_*` calls. Grep of `src/phase-resolver/resolve.ts` and
`src/phase-resolver/resolve.test.ts` for `spaces_`, `creations_`, `apify`, `fetch`, `readFile`,
`readFileSync`, and `import.*fs` returns zero hits. No fake was needed — the module is pure and
the tests pass plain in-memory objects directly.

Result: PASS. No live-Space calls. Build is hermetic.

---

### Spec delta archive-cleanliness check

The spec delta at
`openspec/changes/issue-22-phase-resolver/specs/phase-resolver/spec.md` contains:

- One top-level `## ADDED Requirements` section.
- Seven `### Requirement:` headers, all new.
- Zero `## MODIFIED Requirements` entries.

`openspec/specs/phase-resolver/` does not exist in the live specs store — this is a brand-new
capability. Archive will create `openspec/specs/phase-resolver/spec.md` cleanly; no existing
requirement header needs to match. There are no MODIFIED headers that could fail to resolve.

Result: PASS. Archive will succeed cleanly.

---

### Defect list

None.

---

**Overall verdict: PASS.** The slice satisfies all 7 acceptance criteria with real tests. The
OpenSpec spec faithfully encodes the issue. The build is hermetic (no live-Space calls, no live
Apify). All always-rules hold. The spec delta is entirely ADDED and will archive cleanly.
