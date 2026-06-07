## 1. Spec delta (before any code)

- [x] 1.1 Write the spec delta under `openspec/changes/issue-22-phase-resolver/specs/phase-resolver/spec.md`
  — ADDED requirements for the `phase-resolver` capability: `resolvePhase` signature + return type,
  empty-ledger case, fully-scored case, stranded-accepted detection, casting/produced/posted gate
  mapping, mixed-state determinism, pure isolation guarantee.
- [x] 1.2 Run `npx openspec validate issue-22-phase-resolver --strict` and make it green.

## 2. Failing tests (test-first)

- [x] 2.1 Write `src/phase-resolver/resolve.test.ts` with failing tests covering ALL 7 ACs:
  - AC1: `resolvePhase` returns `phase`, `pendingGates`, `strandedIdeas` for a simple input.
  - AC2: Empty ledger → `phase: "research"`, no stranded ideas, no pending gates.
  - AC3: All Ideas `scored` → `phase: "done"`, no stranded, no gates.
  - AC4: `accepted` idea with no queue job → id appears in `strandedIdeas`; `phase: "production"`.
  - AC5a: `casting` idea → `"cast-pick"` in `pendingGates`; `phase: "production"`.
  - AC5b: `produced` idea → `"publish"` in `pendingGates`; `phase: "publish"`.
  - AC5c: `posted` idea → `"track"` in `pendingGates`; `phase: "tracking"`.
  - AC6: Mixed ledger (suggested + casting + produced) → deterministic phase (earliest wins);
    all relevant gates collected.
  - AC7: Tests accept raw objects — no disk, no Magnific, no Apify calls anywhere.
  All tests failed as expected before implementation.

## 3. Implement `src/phase-resolver/resolve.ts`

- [x] 3.1 Create `src/phase-resolver/resolve.ts` with `Phase`, `PendingGate`, `PhaseResult` types.
- [x] 3.2 Implement `resolvePhase(ideas, queueJobs)` — pure, deterministic; reuse `LedgerIdea` and
  `QueueJob` types from the existing modules (no forked shapes).
- [x] 3.3 Confirm all tests from step 2.1 now pass (47/47 green).

## 4. Self-review

- [x] 4.1 `npx openspec validate issue-22-phase-resolver --strict` green.
- [x] 4.2 `npm test` green (303/303 — 256 prior + 47 new tests pass).
- [x] 4.3 Simplify / dead-code pass: confirmed each AC maps to named test(s); no dead branches.
- [x] 4.4 Write the Build Report into `handoff.md`.
