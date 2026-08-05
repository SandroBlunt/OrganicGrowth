## 1. Ground the decision + map today's shape

- [x] 1.1 Read issue #146 in full, plus parent issue #140 (Schedule Batch spec, user stories 25/28)
  and confirmed the one blocker, #145 (tracer bullet), is closed/merged.
- [x] 1.2 Read `src/schedule-batch/plan.ts` (`validateAssetsForExport`/`buildSchedulePlan`),
  `src/schedule-batch/eligibility.ts`, `src/commands/export-schedule.ts`, and both their test files in
  full — confirmed issue #145 already built and tested three of the four required preflight failure
  modes (no composed Copy, missing platform variant, wrong slide count), all running BEFORE any I/O in
  `exportScheduleCommand`. Confirmed the fourth (over-280 X variant) is not yet re-checked at export
  time, and confirmed no existing test exercises the command-level preflight-refusal path (only unit
  tests in `plan.test.ts`).
- [x] 1.3 Read `src/copy/validate.ts`'s `checkCombinedCaptionHashtagsCap` and `src/copy/platform-shape.ts`
  (issue #142) — confirmed it is pure, already exported, and exactly the check the export needs to
  re-run as defense in depth (same message shape: names the platform and the exact overage).
  Confirmed `src/media-host/fixtures/fake-media-host.ts` (`FakeMediaHost`) is the correct fake for
  proving "no media hosted" — no Magnific interaction anywhere in this slice.
  Ran `npm test` to capture the exact baseline pass count (1836 passing, 0 failing, 476 suites) before
  any change.

## 2. `validateAssetsForExport` — re-check the X 280-char combined cap (test-first)

- [x] 2.1 Added a test to `src/schedule-batch/plan.test.ts` FIRST (failing): an eligible Asset whose X
  Copy variant's caption alone plus its hashtags combined exceeds 280 chars is flagged, naming the
  Idea, the platform, and 280.
- [x] 2.2 Wired `checkCombinedCaptionHashtagsCap` (imported from `../copy/validate.ts`) into
  `validateAssetsForExport`'s existing per-platform loop — only after a variant is FOUND (a missing
  variant keeps reporting only the existing `composed Copy has no variant` problem, never a second,
  confusing "cap" problem for a variant that doesn't exist). Every problem is still collected, never
  stopping at the first. Run 2.1: green.

## 3. Command-level proof: no partial state across all four failure modes together

- [x] 3.1 Added a test to `src/commands/export-schedule.test.ts`: a run with four eligible Assets, each
  failing exactly one of the four documented failure modes, asserts the whole export is REFUSED with
  all four problems named against the right Idea, no new file is written into the run folder beyond the
  pre-existing output bundles, the injected `FakeMediaHost` records zero `convertToJpg`/`upload` calls,
  and no Asset's `scheduled_at` is stamped (re-read through the ledger store).
- [x] 3.2 Confirmed the pre-existing happy-path test (`exports a happy-path run: ...`) still passes
  unchanged — the regression the issue's AC3 asks for.

## 4. OpenSpec

- [x] 4.1 Authored `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this
  `tasks.md`, and a `schedule-batch-export` spec delta (MODIFIED Requirement covering the X-280 re-check
  and the command-level no-partial-state proof).
- [x] 4.2 `openspec validate issue-146-export-fail-loudly --strict` green.

## 5. Self-review

- [x] 5.1 `npm test` green (type-check + full suite; grew from the 1836 baseline to 1838 passing, zero
  regressions, zero failures).
- [x] 5.2 `npm run test:docs` green (unaffected — this slice touches no docs).
- [x] 5.3 Simplify pass: confirmed all three issue ACs map to named, passing tests (see the Build
  Report); confirmed the three already-built failure modes' logic/messages are byte-for-byte unchanged;
  confirmed no `spaces_*`/`creations_*` call anywhere in the diff (no Space-driving code touched at
  all); kept the new check as a direct reuse of the existing `checkCombinedCaptionHashtagsCap`, never a
  second, duplicated 280-char implementation.
- [x] 5.4 Wrote the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (the Magnific fake is
  explicitly flagged as NOT APPLICABLE — no Space/MCP interaction anywhere in this slice), self-review
  notes, known limits.
