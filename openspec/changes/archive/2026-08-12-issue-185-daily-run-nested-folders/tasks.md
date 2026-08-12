## 1. The deep function: runPathSegments / isDailyRunIdShape / runIdeasDirFor (test-first)

- [x] 1.1 Write failing tests (`src/format/run-id.test.ts`): `isDailyRunIdShape` accepts every real
  `YYYY-MM-DD` calendar date and rejects a weekly Run id, a syntactically-date-shaped-but-invalid date
  (`2026-02-30`, `2026-13-01`), and hand-typed/garbled ids; `runPathSegments` returns `[runId]`
  UNCHANGED for `"weekly"` cadence regardless of shape, and `[isoWeek, weekday-DD-month]` for
  `"daily"` cadence — proving the exact ADR-0023 worked examples (`2026-08-11` -> `["2026-W33",
  "tuesday-11-august"]`, `2026-08-12` -> `["2026-W33", "wednesday-12-august"]`), zero-padded single
  digit days, and every month spelled out in lowercase English; a hand-typed non-date daily run id
  degrades to `[runId]` without throwing; `runIdeasDirFor` joins `formatIdeasRoot(...)` with those
  segments, byte-identical to the pre-existing flat shape for weekly, nested for daily, and rejects a
  path-traversal run id before any join.
- [x] 1.2 Implement `runPathSegments`, `isDailyRunIdShape`, `runIdeasDirFor` in `src/format/run-id.ts`.
  Confirm all tests from 1.1 pass.

## 2. Wire cadence-aware nesting into every Run-scoped path builder (test-first)

- [x] 2.1 Write failing tests: `specPathFor` (`src/production-spec/store.test.ts`), `outputDirFor`
  (`src/asset/output-bundle.test.ts`), `castCandidatesDirFor` (`src/asset/cast-candidates.test.ts`)
  each — with an explicit `cadence: "daily"` 5th argument — return the nested week+weekday path;
  omitting the argument (or passing `"weekly"` explicitly) is byte-identical to the pre-existing call
  with no cadence argument at all.
- [x] 2.2 Implement: each function gains an optional `cadence: FormatCadence = "weekly"` parameter and
  joins via `runPathSegments(run, cadence)` in place of the bare `run` segment. Confirm 2.1's tests
  pass and every pre-existing test in each file still passes unmodified (proof the default is truly
  byte-identical).

## 3. resolveBriefPathCandidates gains the nested-daily candidate (test-first)

- [x] 3.1 Write failing tests (`src/format/brief-path.test.ts`): a daily-SHAPED run with a valid
  `format` and no `brief_path` returns `[nestedDaily, flatNamespaced, legacy]` in that order; a
  weekly-SHAPED run's candidate list is UNCHANGED (`[flatNamespaced, legacy]`, still exactly what it
  was before this slice — proof weekly Formats are byte-identical); a recorded `brief_path` still wins
  EXCLUSIVELY even for a daily-shaped run (the real 2026-08-11 launch run's own shape); a
  syntactically-date-shaped-but-calendar-invalid run (`2026-02-30`) never gets a nested candidate.
- [x] 3.2 Implement: `resolveBriefPathCandidates` checks `isDailyRunIdShape(idea.run)` right after
  computing the Format-namespaced flat path and, when true, prepends the nested candidate (built from
  the already-resolved Format root + `runPathSegments(idea.run, "daily")`). Confirm 3.1's tests pass
  and the file's existing real-straw-motion-2026-W29 regression tests still pass unmodified.

## 4. /export-schedule resolves runFolder via runIdeasDirFor (test-first)

- [x] 4.1 Write failing tests (`src/commands/export-schedule.test.ts`), using the REAL (non-override)
  path — no `options.ideasRoot` — against a real Format file on disk: a `cadence: daily` Format's
  export writes its CSVs + manifest under the nested week+weekday folder (never the old flat shape);
  a `cadence: weekly` Format's export stays flat, byte-identical to before.
- [x] 4.2 Implement: `exportScheduleCommand` computes `runFolder` via
  `runIdeasDirFor(brand, format, run, (await loadFormat(brand, format, options.brandsRoot)).cadence,
  options.brandsRoot)` when `options.ideasRoot` is not given; the `options.ideasRoot`-override branch
  is UNCHANGED (still `join(options.ideasRoot, run)`, flat) — every existing fixture-based test in this
  file keeps passing unmodified. Confirm 4.1's new tests pass.

## 5. /log-post regression proof + cleanup-runner doc note (no production code change expected)

- [x] 5.1 Write a new test (`src/commands/log-post.test.ts`): a Recipe's Asset whose `asset_paths`
  point into a NESTED daily-Run bundle directory (`ideas/<format>/<ISO-week>/<weekday>-DD-month/
  idea-NN.<recipe>.output/`) logs successfully and refreshes `post.json` there, via the SAME
  `refreshOutputBundle` codepath — proving no code change was needed (it already resolves an Asset's
  bundle directory from its own `asset_paths`, never a reconstructed format/run path).
- [x] 5.2 Update `src/schedule-batch/cleanup-runner.ts`'s module doc comment to name the nested daily
  shape explicitly (no code change — the recursive walk already covers it).

## 6. Prose docs: name runIdeasDirFor as the actual path-derivation function (docs-test conformance)

- [x] 6.1 Update `.claude/commands/run-trends.md` (Steps 1–2), `.claude/agents/trend-scout.md`
  (Output section), `.claude/agents/idea-strategist.md` (step 8), `.claude/agents/producer.md` (the
  Format-resolution pre-flight step), and `.claude/commands/review-ideas.md` (the brief-path
  resolution step) to name `runIdeasDirFor` and ADR-0023's nested shape, WITHOUT breaking any existing
  pinned substring in `src/format/format-docs.test.ts` / `src/production-spec/producer-agent.docs-
  test.ts` / `src/commands/export-schedule.docs-test.ts` (verified by re-running `npm run test:docs`
  after each edit — every pinned literal substring, e.g. `ideas/<format>/<run>/idea-NN.md`, stays
  present verbatim somewhere in the doc).
- [x] 6.2 Update `CLAUDE.md`'s State section and `.claude/rules/always/organicgrowth-rules.md` rule 7
  to name the nested daily shape and ADR-0023, alongside the existing legacy-layout note. Confirm
  `npm run test:docs` stays green (224/224, unchanged count) after both edits.

## 7. Full-suite green + self-review + Build Report

- [x] 7.1 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --strict` for this change; all green (noting the one PRE-EXISTING, unrelated
  `listFormatSlugs` count failure already present on a clean `main` before this slice, left
  untouched — out of scope).
- [x] 7.2 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #185
  acceptance criterion maps to a specific test.
- [x] 7.3 Write the Build Report into `handoff.md`.
