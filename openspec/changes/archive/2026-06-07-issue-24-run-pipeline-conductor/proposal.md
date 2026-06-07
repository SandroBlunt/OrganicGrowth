## Why

The multi-brand system now has every granular building block (brand resolver, phase resolver,
readiness classifier, production queue with brand routing, commands with `<brand>` threading), but
there is no single entry point that conducts the full weekly loop for an Operator. Without a
conductor, the Operator must know which phase they are in, remember to run readiness before starting,
detect and handle in-flight work manually, and advance the pipeline step-by-step through commands
they must invoke themselves. This is error-prone and obscures the three human gates (Review, Cast
pick, Publish) that the pipeline pauses at.

This slice adds the `/run-pipeline <brand>` conductor: a single command that starts and drives the
whole weekly loop for an existing Brand, pausing exactly at the three human gates and resuming across
turns and days. The conductor owns the readiness gate (the granular commands remain unguarded
power-tools) and reuses all existing logic — no pipeline logic is duplicated.

## What Changes

### New command `src/commands/run-pipeline.ts`

The orchestration shell for the weekly loop conductor. Thin: it wires the existing deep modules
together and owns the loop's control flow. Every substantive computation (brand resolution, phase
resolution, readiness classification, config sanity) is delegated to the existing modules.

The conductor follows this sequence at each launch:

1. **Brand resolution.** Resolve the brand slug via `resolveBrand` (from `src/brand/resolver.ts`).
   Report the Brand in every gate prompt so the Operator is never in doubt.

2. **Readiness check (never cached, runs every launch).** The conductor performs the probes and feeds
   their results to `classify` (from `src/readiness/classify.ts`) and `checkConfig` (from
   `src/readiness/check-config.ts`). The two probe ports that must be injected for testing are:
   - `MagniticReadinessPort` — `{ probeSpace(): Promise<{accessible, creditsOk}> }` — models live
     Magnific + balance probes; injected with a fake in tests, wired to live Magnific tools at
     runtime.
   - `ApifyReadinessPort` — `{ probeToken(): Promise<boolean> }` — models an Apify token ping;
     injected with a fake in tests.
   On a healthy result (no block findings for the phases still ahead), the check is silent. On gaps,
   the conductor surfaces only the blocking/advisory findings and — if a phase-`block` finding exists
   for the next required phase — stops with an actionable message. Phase-scoped: a `block` on
   `production` does not stop research; a `block` on `research` stops the launch.

3. **Session-rename hint.** Print a `/rename <brand> · <ISO-week>` line (e.g.
   `rename mundotip · 2026-W23`) so the Operator can paste it into their terminal to rename the
   session. The conductor does NOT attempt to rename the session itself.

4. **In-flight detection.** Call `resolvePhase` with the Brand's ledger and its slice of the global
   queue. If `phase` is not `research` and not `done` (i.e., in-flight work exists), display the
   pending gates and stranded idea count, then ask: "resume or fresh?" — with **no default** answer.
   The Operator must type `resume` or `fresh` explicitly.
   - `resume`: re-enqueue stranded `accepted` Ideas (call `enqueueOnAccept` for each), then walk
     the loop from the current phase.
   - `fresh`: start a new weekly Run (i.e., proceed to run trends as if the loop is at `research`).

5. **Loop execution.** Drive the loop, pausing at the three human gates:
   - **Gate 1 — Review.** Invoke the `review-ideas` command logic. After Review, auto-drain
     production: call the production worker to drain the queue to the Cast gate. If any Ideas are
     at the Cast gate, pause for the Operator.
   - **Gate 2 — Cast pick.** For each Idea at the Cast gate, invoke `/pick-cast <brand>`. After a
     Character is picked, the worker renders the Asset unattended. Pause for Publish once `produced`.
   - **Gate 3 — Publish.** For each produced Idea, pause for the Operator to publish and
     `/log-post`. After all posts are logged, offer `/track-performance <brand>` and `/report <brand>`.

The conductor is the **only** place the readiness gate lives. The granular commands (`/run-trends`,
`/review-ideas`, `/pick-cast`, `/log-post`, `/queue`, `/report`, `/track-performance`) remain
unguarded power-tools — they do not call readiness themselves.

### New pure module `src/commands/run-pipeline-readiness.ts`

The readiness probe orchestrator: performs the live probes via the two injected ports (`MagniticReadinessPort`
and `ApifyReadinessPort`), reads the brand config from disk, runs `checkConfig` + `classify`, and
returns a combined `Finding[]`. This module is the I/O-ful thin shell that feeds the pure
`classify`/`checkConfig` functions. It owns:
- Probing the Magnific Space for accessibility and credit balance.
- Probing the Apify token validity.
- Reading and parsing the brand profile and seeds YAML.
- Computing `offNicheSeedCount` (count of seeds prefixed with `OFF_NICHE:`).
- Computing `bannedWordsEmpty`.
- Assembling `ReadinessInputs` and calling `classify`.
- Merging `checkConfig` results.

### New port interfaces (injected in tests)

Two narrow ports model the live probes at the MCP boundary:

```typescript
interface MagniticReadinessPort {
  probeSpace(): Promise<{ accessible: boolean; creditsOk: boolean }>;
}

interface ApifyReadinessPort {
  probeToken(): Promise<boolean>;
}
```

Tests inject fakes implementing these interfaces (following the existing `SpaceMcpPort` + fake
pattern from `src/space-driver/port.ts`).

### New test file `src/commands/run-pipeline.test.ts`

Isolation tests for the conductor's orchestration logic and the readiness-probe orchestrator.
Tests inject fake ports and temp ledger/queue files. All tests are hermetic: no live Magnific, no
live Apify, no credits, no board mutation. The Magnific fake is flagged explicitly in the Build Report.

### New command file `.claude/commands/run-pipeline.md`

The Operator-facing command spec for `/run-pipeline <brand>`, documenting the full weekly loop
sequence, the readiness gate, the rename hint, the resume-vs-fresh choice, the three human gates,
and the post-publish offers.

## Capabilities

### Added Capabilities

- `run-pipeline-conductor`: A conductor command (`/run-pipeline <brand>`) that starts and drives the
  whole weekly loop for an existing Brand, pausing at the three human gates (Review, Cast pick,
  Publish). Owns the readiness gate (the only place in the codebase that gates on readiness). Reuses
  all existing granular logic with the Brand threaded through — no pipeline logic duplicated.
