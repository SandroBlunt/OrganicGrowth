# Slice Handoff — issue-146-export-fail-loudly

## Build Report (developer)

### What changed

Issue #145 (the tracer bullet, merged) already built `validateAssetsForExport`
(`src/schedule-batch/plan.ts`) as a pure preflight pass, run before any I/O, covering three of the
issue's four required failure modes: no composed Copy at all, a missing platform Copy variant, and a
wrong slide count. This slice (#146) closes the remaining gap and proves the "no partial state" behavior
end to end:

1. **Added the X 280-char defense-in-depth re-check.** `validateAssetsForExport` now also re-checks,
   for every configured platform whose Copy variant was found, that variant against its own combined
   caption+hashtags cap (today: X alone, `capIncludesHashtags: true`) by reusing the existing, pure
   `checkCombinedCaptionHashtagsCap` from `src/copy/validate.ts` (built for issue #142's
   composition-time enforcement) — no new 280-char logic was written; this is a direct, additive re-use.
   A violation is reported as one more `EligibilityProblem`, naming the Idea, the platform, and the
   exact character overage, collected alongside every other problem (never stopping at the first). A
   missing variant continues to report only the existing "no variant" problem — it never also reports a
   confusing "cap exceeded" problem for a variant that does not exist.
2. **Proved "no partial state" end to end, across all four failure modes together.** Added a
   command-level test to `src/commands/export-schedule.test.ts` with four eligible Assets in one run,
   each failing exactly one of the four documented modes (missing slide / no composed Copy / missing
   platform variant / over-280 X variant). It asserts the whole export is refused, all four problems are
   named against the right Idea, no new file appears in the run folder, the injected `FakeMediaHost`
   records zero calls, and no Asset's `scheduled_at` is stamped.
3. **Regression-confirmed the happy path is unaffected** — issue #145's own happy-path test
   (`exports a happy-path run: ...`) still passes byte-for-byte unchanged; it composes X's default
   `"idea-01 X body."` caption, which is well within the combined cap, so the new check never fires
   there.

### Files touched

- `src/schedule-batch/plan.ts` — `validateAssetsForExport` gains the X-280 combined-cap re-check
  (imports `checkCombinedCaptionHashtagsCap` from `../copy/validate.ts`); docstrings updated.
- `src/schedule-batch/plan.test.ts` — new unit test: an over-280-combined X variant is flagged, naming
  the Idea, the platform, and 280.
- `src/commands/export-schedule.test.ts` — new end-to-end test: all four failure modes together, in one
  refused export, leave no partial state (no files, no media hosted, no `scheduled_at`).
- `openspec/changes/issue-146-export-fail-loudly/{proposal.md,tasks.md,handoff.md,specs/schedule-batch-export/spec.md}` — this OpenSpec change.

No other file was touched. `src/commands/export-schedule.ts` (the orchestration shell) is unchanged —
its preflight call site already refused the whole export on any non-empty `validateAssetsForExport`
result, before hosting or writing anything; that ordering is exactly what made this slice's new
end-to-end test pass with no wiring change at all.

### How to run

```bash
# Type-check + full suite (what qa should run)
npm test

# Just this slice's two changed test files
node --import tsx --test src/schedule-batch/plan.test.ts
node --import tsx --test src/commands/export-schedule.test.ts

# Docs suite (unaffected by this slice — confirms no doc drift)
npm run test:docs

# OpenSpec validation
openspec validate issue-146-export-fail-loudly --strict
```

Baseline before this slice: 1836 passing / 0 failing / 476 suites. After this slice: **1838 passing / 0
failing / 476 suites** (net +2 tests, zero regressions). `npm run test:docs`: 147 passing / 0 failing
(unaffected — this slice touches no `.md` docs).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #146) | Proving test(s) |
|---|---|---|
| 1 | Each failure mode — missing slide, missing platform variant, no composed Copy, over-280 X variant — stops the export with a clear message naming the Asset and the problem. | Unit level (pure function, one mode isolated at a time): `src/schedule-batch/plan.test.ts` — `"flags an Asset that doesn't have exactly 7 downloaded slides"` (missing slide, pre-existing from #145), `"flags a missing platform Copy variant, naming both the Idea and the platform"` (pre-existing from #145), `"flags an Asset with no composed Copy at all, naming the Idea"` (pre-existing from #145), and the NEW `"flags an X variant over the combined caption+hashtags 280-char cap, naming the Idea (issue #146 defense in depth)"`. Command level (all four together, in one refused batch): the NEW test in `src/commands/export-schedule.test.ts`, `"refuses the WHOLE export loudly, writing nothing, hosting nothing, stamping nothing, when eligible Assets fail preflight — a missing slide, no composed Copy, a missing platform variant, and an over-280 X variant (issue #146)"` — asserts the returned message names all four Idea ids alongside their own specific problem text (`"expected exactly 7 downloaded slides, found 3"`, `"no composed Copy"`, `'"tiktok"'`, `"280"`). |
| 2 | A refused export leaves no partial state behind: no files written, no media hosted, no `scheduled_at` stamped. | The same NEW command-level test above additionally asserts: the run folder's directory listing after the refused export contains ONLY the four pre-existing `.news-carousel.output` bundle dirs (no new CSV, no manifest); `mediaHost.convertCalls.length === 0` and `mediaHost.uploadCalls.length === 0` (`FakeMediaHost`, issue #144); and, for all four Ideas, `loadIdeaAssets(...)[0].scheduled_at === undefined` re-read straight through the ledger store. The pre-existing `"refuses the WHOLE export loudly, writing nothing, when a schedule time is less than 1 hour away"` test (issue #145) proves the same "no partial state" shape for the OTHER refusal path (the 1-hour lead check), left untouched by this slice. |
| 3 | A healthy batch still exports exactly as before (regression on the happy path). | `src/commands/export-schedule.test.ts`'s pre-existing `"exports a happy-path run: two CSVs (byte-exact dialect), a manifest, readable scheduled_at, and the expected Media Host calls — original PNGs untouched"` test (issue #145) still passes byte-for-byte unmodified — its fixture's X Copy variant (`"idea-01 X body."` + `#AInews`) is well within the 280-char combined cap, so the new check adds zero problems and the export proceeds exactly as before. Re-ran after this slice's change: still green. |

### Fakes / fixtures used

- **`FakeMediaHost`** (`src/media-host/fixtures/fake-media-host.ts`, issue #144) — the in-memory fake for
  the Media Host port (convert/upload/delete). Used in every `export-schedule.test.ts` test, including
  this slice's new one, to prove zero calls are recorded when the export is refused.
- Temp-dir fixtures (`mkdtemp` + a hand-written ledger JSON + a hand-written `brand-profile.yaml` +
  hand-written `.news-carousel.output/` bundle directories with real PNG bytes) — the same pattern
  `export-schedule.test.ts` already uses, mirroring `/log-post`/`/track-performance`'s own temp-dir +
  store-assertion test style.
- **Magnific fake — NOT APPLICABLE.** This slice touches no Space-driving code at all: no `spaces_*` /
  `creations_*` call appears anywhere in the diff. The Producer, its Execution Protocol, and the fake
  Magnific Space are entirely untouched by this issue — it is pure data validation over already-produced
  Assets' Copy/slide state.

### Self-review notes

- Reused the existing, already-reviewed `checkCombinedCaptionHashtagsCap` directly rather than writing a
  second, parallel 280-char implementation inside `schedule-batch/plan.ts` — one source of truth for the
  combined-cap rule, shared by composition (issue #142) and export (issue #146).
- Placed the new check INSIDE the existing per-platform loop, gated on `variant !== null` with a
  `continue`, rather than as a second pass over `eligible` — keeps the "collect every problem, never
  stop at the first" contract intact with no extra iteration and no risk of double-reporting a missing
  variant as both "missing" and "over cap."
- Considered adding a `plan.test.ts` case asserting a compliant X variant is NOT flagged, but the
  pre-existing `"returns no problems for a fully well-formed eligible Asset"` test already exercises the
  default fixture's compliant X variant through the same code path — added it as redundant coverage
  first, then removed it during the simplify pass to avoid a duplicate assertion of the same fact.
- No dead code introduced or found to remove; no other module needed touching (confirmed via reading
  `src/commands/export-schedule.ts`'s existing preflight call site — the ordering that makes "no partial
  state" true was already correct from issue #145, this slice only needed to prove it and add the
  missing check).

### Known limits

- The combined-cap re-check only ever fires for a platform whose documented `PlatformCopyShape` declares
  `capIncludesHashtags: true` — today, that is X alone (`src/copy/platform-shape.ts`). If a future
  platform gains the same convention, this re-check picks it up automatically (it is not X-specific
  code), but no other platform is affected today — matches the issue's own scope.
- This slice does not touch the empty-run, Zoho-not-configured, or ≥1-hour-schedule-lead refusal paths —
  those were already built, tested, and proven "no partial state" by issue #145; out of scope here.
- As with issue #145, the export remains scoped to the `"news-carousel"` Recipe only (images-only Zoho
  bulk path); a video Asset is skipped with a note at the eligibility stage, before preflight validation
  ever runs — unchanged by this slice.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (type-check via `tsc --noEmit` then the full `node --test` suite): **green**. Actual output:
  `# tests 1838 / # suites 476 / # pass 1838 / # fail 0 / # cancelled 0 / # skipped 0`. Matches the
  Build Report's claimed count exactly (baseline 1836 → 1838, net +2, zero regressions).
- `npm run test:docs`: **green**. `# tests 147 / # suites 37 / # pass 147 / # fail 0`.
- `openspec validate issue-146-export-fail-loudly --strict`: **green** — `Change
  'issue-146-export-fail-loudly' is valid`.
- Also ran the two changed test files directly (`node --import tsx --test src/schedule-batch/plan.test.ts
  src/commands/export-schedule.test.ts`): 26 tests, 4 suites, all passing.

### Per-criterion results (issue #146 acceptance criteria)

| # | Acceptance criterion | Result | Proving test |
|---|---|---|---|
| 1 | Each failure mode — missing slide, missing platform variant, no composed Copy, over-280 X variant — stops the export with a clear message naming the Asset and the problem. | **PASS** | Unit level, `src/schedule-batch/plan.test.ts`: `"flags an Asset that doesn't have exactly 7 downloaded slides"`, `"flags a missing platform Copy variant, naming both the Idea and the platform"`, `"flags an Asset with no composed Copy at all, naming the Idea"`, `"flags an X variant over the combined caption+hashtags 280-char cap, naming the Idea (issue #146 defense in depth)"`. Verified the actual generated message text for the new check directly (`checkCombinedCaptionHashtagsCap`): `"idea-04: caption plus hashtags combined must be at most 280 characters for x (combined length 298, 18 over)."` — names the Idea, the platform (`x`), and the exact overage. Command level, `src/commands/export-schedule.test.ts`: the new all-four-together test asserts the refusal message names all four Idea ids alongside `"expected exactly 7 downloaded slides, found 3"`, `"no composed Copy"`, `'"tiktok"'`, and `"280"`. |
| 2 | A refused export leaves no partial state behind: no files written, no media hosted, no `scheduled_at` stamped. | **PASS** | Same new command-level test: `readdir(fx.runFolder)` after the refused export contains ONLY the four pre-existing `.news-carousel.output` dirs (no new CSV/manifest); `mediaHost.convertCalls.length === 0` and `mediaHost.uploadCalls.length === 0`; `loadIdeaAssets(...)[0].scheduled_at === undefined` for all four Ideas, re-read through the ledger store. Also confirmed by code inspection of `src/commands/export-schedule.ts`: `validateAssetsForExport` (step 3) runs and returns before schedule-slot derivation (step 4), media hosting (step 5), file writes (step 6), and ledger stamping (step 7) — a non-empty problem list returns immediately. |
| 3 | A healthy batch still exports exactly as before (regression on the happy path). | **PASS** | `src/commands/export-schedule.test.ts`'s pre-existing happy-path test (`"exports a happy-path run: ..."`) passes unmodified — its X variant is well within 280 chars, so the new check adds zero problems. Confirmed via `git diff` that this test's source is untouched by the diff. |

### Per-scenario results (spec deltas, `specs/schedule-batch-export/spec.md`)

| Scenario | Result | Covering test |
|---|---|---|
| A fully well-formed eligible Asset has no problems | PASS | `plan.test.ts` — `"returns no problems for a fully well-formed eligible Asset"` |
| An Asset with no composed Copy at all is flagged, naming the Idea | PASS | `plan.test.ts` — `"flags an Asset with no composed Copy at all, naming the Idea"` |
| A missing platform Copy variant is flagged, naming both the Idea and the platform | PASS | `plan.test.ts` — `"flags a missing platform Copy variant, naming both the Idea and the platform"` |
| A wrong slide count is flagged, naming the Idea and the expected count | PASS | `plan.test.ts` — `"flags an Asset that doesn't have exactly 7 downloaded slides"` |
| An X variant over the combined 280-char cap is flagged, naming the Idea, the platform, and the overage (issue #146) | PASS | `plan.test.ts` — `"flags an X variant over the combined caption+hashtags 280-char cap, naming the Idea (issue #146 defense in depth)"` |
| A missing X variant never ALSO reports a combined-cap problem | **PASS, weak coverage (minor observation, not a defect)** | No dedicated test asserts this negative property directly (e.g. asserting `problems.length` or the absence of a `"for x"`/cap-length message when the `x` variant itself is missing). The property is nonetheless true by construction: `validateAssetsForExport`'s per-platform loop does `if (variant === null) { problems.push(...); continue; }` — the `continue` makes the combined-cap check for that platform structurally unreachable when the variant is absent, so it is not a live risk, just thinner-than-ideal test coverage of a self-imposed (non-issue-mandated) spec scenario. Not blocking. |
| A happy-path run writes both CSVs, the manifest, and a readable `scheduled_at` | PASS | `export-schedule.test.ts` — `"exports a happy-path run: ..."` (issue #145, unmodified) |
| An empty run stops with a clear message and writes no files | PASS | `export-schedule.test.ts` (issue #145, unmodified) |
| A Brand with no Zoho Social Brand config refuses and writes nothing | PASS | `export-schedule.test.ts` (issue #145, unmodified) |
| A schedule time inside the 1-hour lead window refuses the WHOLE export | PASS | `export-schedule.test.ts` — `"refuses the WHOLE export loudly, writing nothing, when a schedule time is less than 1 hour away"` (issue #145, unmodified) |
| A preflight validation failure refuses the WHOLE export, leaving no partial state, across all four documented failure modes together (issue #146) | PASS | `export-schedule.test.ts` — the new all-four-together test (see AC1/AC2 above) |
| Re-running the export after a successful one schedules nothing twice | PASS | `export-schedule.test.ts` (issue #145, unmodified) |

### OpenSpec-vs-issue faithfulness check

Read `proposal.md`, `tasks.md`, and the spec delta against issue #146's verbatim text. The proposal
correctly identifies that 3 of the 4 required failure modes (no composed Copy, missing platform variant,
wrong slide count) were already built by the blocking issue #145, and that this slice's job is narrowly
the 4th mode (the X-280 defense-in-depth re-check) plus proving "no partial state" across all four
together at the command level — this matches the issue body's "re-checked here even though composition
also enforces it, as defense in depth" language precisely, and does not silently drop or invent scope.
No misread found: the spec delta's Scenarios trace 1:1 back to the issue's three acceptance criteria, and
the "Non-Goals" section correctly excludes composition-time enforcement (#142), the other three preflight
modes' own logic (#145), and any other platform's cap (not asked for). No contradiction with `CONTEXT.md`
or the ADRs found.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | This slice adds validation only; `exportScheduleCommand` still only writes CSVs/manifest and stamps `scheduled_at` — no Facebook/publish call exists anywhere in the command or its diff. |
| Public-metrics-only | N/A / holds | No metrics code touched by this diff. |
| Relative-not-absolute | N/A / holds | No scoring/baseline code touched by this diff. |
| Explicit-attribution | N/A / holds | No `post_url`/attribution code touched by this diff. |
| Ledger-as-source-of-truth | PASS | `writeAsset` (ledger write for `scheduled_at`) only runs in step 7, after preflight (step 3) passes; the new test proves a refused export never calls it (`scheduled_at` stays `undefined`, re-read through the ledger store) — the ledger is never partially updated. |
| Never-fabricate (data-handling rule 4) | PASS | The new check reuses the existing, already-reviewed `checkCombinedCaptionHashtagsCap` (`src/copy/validate.ts`) rather than inventing a second 280-char bound; it only fires for a platform whose `PlatformCopyShape.capIncludesHashtags` is documented `true` (today: `x` alone). |
| Magnific fake / no live Space calls | PASS | `grep -n "spaces_\|creations_" src/schedule-batch/plan.ts src/schedule-batch/plan.test.ts src/commands/export-schedule.test.ts src/commands/export-schedule.ts` → no matches. `grep -rn "spaces_\|creations_" src/schedule-batch src/media-host` → no matches. This slice is pure Copy/slide-count validation over already-produced Assets; it does not touch Space-driving code at all. The (unrelated) Media Host port used in these tests is always the in-memory `FakeMediaHost` (issue #144) — the runtime default (`DEFAULT_MEDIA_HOST`) throws rather than silently doing anything, and is never exercised in any test. |

### Defect list

None. No blocker/major/minor defects that block this round. (See the one minor test-coverage observation
noted under "Per-scenario results" above — informational only, does not affect an issue acceptance
criterion, does not indicate a live bug, and does not block PASS.)
