## 1. Spec delta (before any code)

- [ ] 1.1 Write the spec delta under
  `openspec/changes/issue-24-run-pipeline-conductor/specs/run-pipeline-conductor/spec.md`
  — ADDED requirements for the `run-pipeline-conductor` capability: Brand threading, readiness gate,
  rename hint, resume-vs-fresh, gate pausing, auto-drain after Review, post-Review auto-drain, Cast
  pick unattended render, post-publish offer, readiness-only-in-conductor guardrail, and reuse
  requirement.
- [ ] 1.2 Run `npx openspec validate issue-24-run-pipeline-conductor --strict` and confirm the spec
  is well-formed.

## 2. Port interfaces (injected in tests)

- [ ] 2.1 Create `src/commands/run-pipeline-ports.ts` with the two narrow port interfaces:
  `MagniticReadinessPort` and `ApifyReadinessPort`.

## 3. Failing tests (test-first)

- [ ] 3.1 Write `src/commands/run-pipeline.test.ts` with failing tests covering all 8 ACs:
  - AC1: Brand resolution + threading — brand appears in every gate output.
  - AC2: Readiness — healthy config is silent; gaps surface findings; phase-scoped blocks stop the
    right phase.
  - AC3: Rename hint — output contains `/rename <brand> · <ISO-week>`.
  - AC4: In-flight work — shows pending gates + stranded count; asks resume-vs-fresh with no default;
    `resume` re-enqueues stranded Ideas; `fresh` starts new run.
  - AC5: Loop pauses at Review, Cast pick, Publish; does not render past gate before Operator acts.
  - AC6: After Review auto-drains to Cast gate; after Cast pick renders unattended and pauses for
    Publish; after log-post offers `/track-performance` and `/report`.
  - AC7: Granular commands have no readiness guard.
  - AC8: No duplicated pipeline logic (conductor calls existing modules, not re-implemented versions).

## 4. Readiness probe orchestrator

- [ ] 4.1 Create `src/commands/run-pipeline-readiness.ts` implementing `runReadiness(brand, paths,
  ports)` → `Finding[]`. Thin shell: reads YAML, calls `checkConfig`, assembles `ReadinessInputs`,
  calls `classify`, merges and deduplicates findings.
- [ ] 4.2 Confirm relevant test cases from 3.1 pass.

## 5. Conductor command

- [ ] 5.1 Create `src/commands/run-pipeline.ts` with `runPipelineCommand(brand, input, options)` →
  generator of turn outputs. The function is async-iterable (or callback-based) so it can be tested
  turn-by-turn without spawning a process.
- [ ] 5.2 Wire: `resolveBrand` → readiness probe → rename hint → phase resolve → resume/fresh prompt
  → loop.
- [ ] 5.3 Wire the loop: Review gate, auto-drain, Cast pick gate, render gate, Publish gate,
  post-publish offers.
- [ ] 5.4 Confirm all tests from step 3.1 pass.

## 6. Command doc

- [ ] 6.1 Create `.claude/commands/run-pipeline.md` documenting the `/run-pipeline <brand>` command
  surface for the Operator.

## 7. Self-review

- [ ] 7.1 `npx openspec validate issue-24-run-pipeline-conductor --strict` green.
- [ ] 7.2 `npm test` green (all prior tests + new tests).
- [ ] 7.3 `npm run build` clean (no TypeScript errors).
- [ ] 7.4 Simplify / dead-code pass: each AC maps to named test(s); no dead branches; module
  boundaries are clean.
- [ ] 7.5 Write the Build Report into `handoff.md`.
