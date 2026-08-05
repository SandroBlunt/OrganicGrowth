## Why

Issue #140 (Schedule Batch, parent, user stories 25/28) requires the `/export-schedule` export to
refuse a half-broken batch **loudly**, naming the Asset and the problem, for four failure modes: a
bundle missing slides, a targeted platform's Copy variant missing, an Asset with no composed Copy at
all, and an X Copy variant over 280 characters (caption + hashtags combined) — the last one **re-checked
here even though composition already enforces it** (issue #142), as defense in depth. All validation
must run before any media is hosted or any file is written, so a refused export changes nothing on disk,
on S3, or in the ledger.

Issue #145 (the tracer bullet, merged) already built `validateAssetsForExport`
(`src/schedule-batch/plan.ts`) as a pure preflight pass run before any I/O, and it already covers three
of the four failure modes: no composed Copy at all, a missing platform Copy variant, and a wrong slide
count. It does **not** yet re-check a targeted platform's own combined caption+hashtags cap (X's 280
chars) — the export currently trusts that issue #142's composition-time check was never bypassed. Issue
#145's own command-level test suite (`src/commands/export-schedule.test.ts`) also never exercises the
preflight-refusal path end-to-end (only the Zoho-not-configured and the < 1-hour-lead refusals are
covered there) — so the issue's "no partial state" acceptance criterion for a preflight failure was
proven only at the pure-function level (`plan.test.ts`), never through the whole command.

Issue #146 (this slice) closes both gaps: adds the X 280-char defense-in-depth re-check to
`validateAssetsForExport`, and adds an end-to-end command-level test proving that ALL FOUR failure
modes — together, in one refused batch — leave no CSV, no manifest, no hosted media, and no
`scheduled_at` stamp behind. The happy path (already covered by issue #145's own regression test) is
re-confirmed unaffected.

## What Changes

- **`src/schedule-batch/plan.ts`** — `validateAssetsForExport` now ALSO re-checks, for every platform
  any configured Zoho Social Brand targets, that Asset's own Copy variant against that platform's
  combined caption+hashtags cap where one applies (today: X alone, `capIncludesHashtags: true`) — reusing
  `../copy/validate.ts`'s existing, pure `checkCombinedCaptionHashtagsCap` (issue #142), never
  duplicating its logic. A violation is reported as one more `EligibilityProblem`, naming the Idea, the
  platform, and the exact character overage — collected alongside every other problem (never stopping at
  the first, matching the module's existing "collect everything" contract).
- **`src/schedule-batch/plan.test.ts`** — new unit test proving an over-280-combined X variant is
  flagged, naming the Idea, the platform, and 280.
- **`src/commands/export-schedule.test.ts`** — new end-to-end test: a run with four eligible Assets, each
  failing exactly one of the four failure modes (missing slide, no composed Copy, missing platform
  variant, over-280 X variant), asserts the WHOLE export is refused with all four problems named against
  the right Idea, AND that no new file was written into the run folder, the injected `FakeMediaHost`
  recorded zero calls, and no Asset's `scheduled_at` was stamped.

No other module changes: the three already-covered failure modes' logic and messages are untouched
(issue #145's own passing tests for them keep passing byte-for-byte); the happy path
(`buildSchedulePlan`, the CSV/manifest writers, the ledger stamping) is untouched.

## Non-Goals (explicitly deferred / out of scope)

- **Composition-time enforcement of the X 280-char cap** — already built (issue #142,
  `src/copy/validate.ts`'s `checkCombinedCaptionHashtagsCap`, `src/copy/compose.ts`). This slice reuses
  it as a re-check, never re-implements it.
- **The three already-covered preflight failure modes' own logic** — no composed Copy, a missing
  platform variant, a wrong slide count — already built and tested (issue #145). This slice only adds
  the fourth, plus the end-to-end "no partial state" proof across all four together.
- **Any other platform ever gaining a combined-cap re-check** — `checkCombinedCaptionHashtagsCap` only
  ever fires for a platform whose documented `PlatformCopyShape.capIncludesHashtags` is `true` (today: X
  alone) — never fabricated for an undocumented platform.
- **The empty-run and Zoho-not-configured refusal paths, and the ≥1-hour schedule-lead refusal** —
  already built and tested (issue #145); untouched here.

## Capabilities

### Modified Capabilities

- `schedule-batch-export`: the preflight validation pass (`validateAssetsForExport`) additionally
  re-checks a targeted platform's own combined caption+hashtags cap (today: X's 280 chars) as defense in
  depth, and the command-level "no partial state on a refused export" behavior is now proven across all
  four documented failure modes together, not just the schedule-lead and not-configured refusals.

## Impact

- **Added:**
  - `openspec/changes/issue-146-export-fail-loudly/{proposal.md,tasks.md,handoff.md}`
  - `openspec/changes/issue-146-export-fail-loudly/specs/schedule-batch-export/spec.md`
- **Modified:**
  - `src/schedule-batch/plan.ts` (+ tests in `src/schedule-batch/plan.test.ts`) — `validateAssetsForExport`
    gains the X-280 combined-cap re-check.
  - `src/commands/export-schedule.test.ts` — new end-to-end "no partial state across all four failure
    modes" test.
- **Not touched:** `src/copy/*`, `src/schedule-batch/eligibility.ts`, `src/schedule-batch/csv.ts`,
  `src/schedule-batch/manifest.ts`, `src/schedule-batch/schedule.ts`, `src/media-host/*`,
  `src/commands/export-schedule.ts` (the orchestration shell's preflight call site is unchanged — it
  already refuses the whole export on any non-empty `validateAssetsForExport` result, before hosting or
  writing anything).
- **Hermetic:** no Space/MCP call anywhere in this diff — this slice is pure validation logic plus tests
  against `FakeMediaHost` (issue #144's in-memory fake) and temp-dir fixtures. No `spaces_*`/
  `creations_*` call, no credits, no board mutation.
- **Always-rules upheld:** generate-never-publish (this slice makes a bad export refuse EARLIER, never
  publishes anything); public-metrics-only / relative-not-absolute (no metrics/baseline code touched);
  explicit-attribution (no Post/`post_url` code touched); ledger-as-source-of-truth (a refused export
  now provably stamps no `scheduled_at` — the ledger is never partially updated); never-fabricate (the
  new check only ever fires for a platform's own DOCUMENTED cap, reusing the existing, already-reviewed
  `checkCombinedCaptionHashtagsCap` — no new bound is invented here).
