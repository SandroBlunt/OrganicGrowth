## ADDED Requirements

### Requirement: The command surface exposes gate resolution, Copy Variant persistence, and the worker's job orchestration

`src/command-surface/gates.ts` SHALL expose `raiseGateRequest(db, input, now)` (a thin wrap of
`gate-request-store.ts`'s `createGateRequest`) and `resolveGate(db, gateRequestId, decision, now)`
(composing `recordGateDecision` with `job-store.ts`'s `createJob` to enqueue the resumed leg — the SAME
"compose more than one store call behind real branching logic" shape `ideas.ts`'s `recordReviewDecision`
already established, and the same shape issue #209 collapsed its own three-layer design into after qa
flagged the alternative). `src/command-surface/copy.ts` SHALL expose `saveCopyVariant(db, input, now)`
(a thin wrap of `copy/store.ts`'s `upsertCopyVariant`). `src/command-surface/worker.ts` SHALL expose
`runOneJob(db, port, jobId, options)` — the worker's own per-job orchestration, composing
`job-store.ts`'s `claimJob`/`releaseJob`/`requeueJob`, `gates.ts`'s `raiseGateRequest`, `assets.ts`'s
`saveAsset`/`attachAssetMedia`, and `copy.ts`'s `saveCopyVariant`, alongside the UNCHANGED deep modules
(`driveToNextGate`, `bindMediaSlots`, `auditAuthorPhase`/`auditBindMediaPhase`/`auditCopyPhase`) — never
a store bypassed, never a store write function reachable through a separate deep-orchestration module
outside `src/command-surface/`. This is additive to issue #205's original eight operations and issue
#209's Schedule Outbox pair — the "exactly three deliberate, minimal companions" Requirement (issue #205)
is unaffected and stays exactly as it was. All three modules SHALL be re-exported from
`src/command-surface/index.ts`.

#### Scenario: resolveGate composes recordGateDecision and createJob through the command surface directly

- **GIVEN** a parked job's undecided `gate_request`
- **WHEN** `resolveGate(db, gateRequestId, { decidedBy, choice })` is called via
  `src/command-surface/index.ts`'s own exported name
- **THEN** the gate request is readable back as decided (`decidedBy`/`decidedAt`/`choice`), and a NEW
  `queued` job exists for the same Asset

#### Scenario: runOneJob never imports a store write function outside src/command-surface/

- **GIVEN** the full set of files `src/command-surface/worker.ts` imports, transitively, for its
  WRITE calls
- **WHEN** `src/store-write-boundary/scan.ts`'s guard scans the repository
- **THEN** every store write `runOneJob` performs is attributed to `src/command-surface/worker.ts`
  itself (or another `src/command-surface/**` module it calls) — never to a module under `src/worker/`,
  which imports no store write function at all
