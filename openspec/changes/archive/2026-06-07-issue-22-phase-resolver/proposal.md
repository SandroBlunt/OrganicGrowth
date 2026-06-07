## Why

The conductor needs to resume a Brand's weekly loop at the right place — not always restart at
trends. Without a phase resolver, the conductor has to infer loop position from raw ledger statuses
and a queue snapshot ad-hoc, scattering this policy across every command. The real 2026-W22 case
exposed the gap: `accepted` Ideas in the ledger with no live queue job (stranded) — there was no
single, testable place to detect them and trigger re-enqueue. This slice extracts that resume logic
as a pure, isolation-tested deep module: given a Brand's ledger and its slice of the one global
queue, return the current phase, all pending human gates, and any stranded work.

## What Changes

### New deep module `src/phase-resolver/resolve.ts`

A pure function `resolvePhase(ideas, queueJobs)` — no disk, no network, no Magnific. Inputs are an
array of `LedgerIdea` objects and an array of `QueueJob` objects already filtered to the Brand.
Output is a `PhaseResult` with three fields:

- `phase` — the Brand's current loop position (`"research"` | `"review"` | `"production"` |
  `"publish"` | `"tracking"` | `"done"`).
- `pendingGates` — the set of human gates currently waiting for Operator action
  (`"review"` | `"cast-pick"` | `"publish"` | `"track"`).
- `strandedIdeas` — Idea ids that are `accepted` in the ledger but have no live queue job (the
  W22 case: they should be re-enqueued).

Phase and gate assignment follows the Idea lifecycle from CLAUDE.md:
`suggested → accepted → casting → produced → posted → tracking → scored` (or `rejected`).

- Empty ledger → phase `"research"`, no stranded work, no pending gates.
- All Ideas `scored` → phase `"done"`, no stranded work, no pending gates.
- Any `suggested` Ideas → `"review"` gate pending.
- Any `accepted` Idea with no live queue job → stranded (surfaced for re-enqueue); phase
  `"production"` (the queue needs to be drained).
- Any `accepted` Idea with a live queue job → production is in progress; phase `"production"`.
- Any `casting` Idea → `"cast-pick"` gate pending; phase `"production"`.
- Any `produced` Idea → `"publish"` gate pending; phase `"publish"`.
- Any `posted` Idea → `"track"` gate pending; phase `"tracking"`.
- Mixed ledger resolves deterministically: the earliest lifecycle phase wins for `phase`; all
  pending gates from all Ideas are collected.

The module exports `resolvePhase`, `PhaseResult`, `Phase`, and `PendingGate` types only. It has no
dependency on disk I/O, ledger file reading, queue store, space-driver, or any MCP tool.

### Tests `src/phase-resolver/resolve.test.ts`

Pure unit tests. Each test passes literal arrays — no disk, no Magnific, no Apify. Every acceptance
criterion maps to one or more named `it()` blocks.

## Capabilities

### Added Capabilities

- `phase-resolver`: A pure deep module that resolves a Brand's current loop phase, pending human
  gates, and stranded `accepted` Ideas from a ledger snapshot + queue slice. No I/O. Isolation-tested.
