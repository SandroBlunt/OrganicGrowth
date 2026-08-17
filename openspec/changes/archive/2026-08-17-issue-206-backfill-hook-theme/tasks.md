## 1. Schema — migration 4, additive only (test-first)

- [x] 1.1 Write failing tests (`migrate.test.ts`): `CURRENT_SCHEMA_VERSION` becomes `4`; a pre-#206
  database (migrations 1+2+3 applied) migrates forward to 4, gaining `idea.hook_type_source`/
  `idea.theme_source` and touching no other table/column/row.
- [x] 1.2 Write failing tests (`schema.test.ts`): both columns default to `NULL`; `'heading'`/`'inferred'`
  round-trip independently per column; a value outside `NULL`/`'heading'`/`'inferred'` is rejected by the
  `CHECK`.
- [x] 1.3 Implement `MIGRATION_4` in `src/db/schema.ts`: two `ALTER TABLE idea ADD COLUMN` statements,
  each with its own `CHECK`. Append to `MIGRATIONS`. No edit to migrations 1–3.

## 2. IdeaStore — classifyIdea, listAllIdeas, listIdeasByHookType (test-first)

- [x] 2.1 Write failing tests (`idea/store.test.ts`): `classifyIdea` updates hook_type/theme/provenance,
  readable back; overwrites in place on a second call; rejects an out-of-vocabulary `hookType`/`theme`/
  `hookTypeSource`/`themeSource` before any write; throws naming an unknown `ideaId`. `listAllIdeas`
  returns every Idea across multiple Runs in creation order. `listIdeasByHookType` returns exactly the
  Ideas currently at a given hook type, `[]` for one none carry.
- [x] 2.2 Implement `classifyIdea`/`listAllIdeas`/`listIdeasByHookType` in `src/idea/store.ts`, plus the
  new `ClassificationSource` type and its own validator, and extend `IdeaRecord`/`toIdeaRecord` with
  optional `hookTypeSource`/`themeSource`.

## 3. Command surface + guards (test-first)

- [x] 3.1 Write a failing test (`command-surface/ideas.test.ts`): `classifyIdea` wraps
  `IdeaStore.classifyIdea`, including its validation.
- [x] 3.2 Implement `classifyIdea` in `src/command-surface/ideas.ts`, export from
  `src/command-surface/index.ts`.
- [x] 3.3 Add `classifyIdea` to `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS["src/idea/store.ts"]`;
  update the two hardcoded expectations in `scan.test.ts` that enumerate that store's write functions.
  Confirm `store-write-guard.test.ts` still passes (no un-audited direct import appears).

## 4. The classification data — read all 51 Briefs, hand-classify, never guess (test-first)

- [x] 4.1 Confirm the measured split (51 with a hook heading — 39 `Hook concept` + 12 `Hook Concept`; 10
  MundoTip Briefs with neither a heading nor a `format` field) against the real files under
  `data/brands/**` — matches the issue's own stated numbers exactly.
- [x] 4.2 Read every one of the 51 Briefs' hook text (plus surrounding Angle/title context where the
  heading alone is ambiguous) and assign one Hook Type and one Theme each, recording for each field
  whether it was parsed directly from the heading (`"heading"`) or inferred from the Brief as a whole
  (`"inferred"`), plus a plain-English rationale.
- [x] 4.3 Write `classifications.test.ts` FIRST: exactly 51 entries; every `briefSha256` unique; every
  classified entry's hash matches the real file on disk (the drift-detection test); every hookType/theme
  is real and never `"unclassified"`; every source is `"heading"`/`"inferred"`; every classified entry
  carries a rationale; none of the 10 headingless Briefs are classified; this batch reports zero
  out-of-vocabulary Briefs; per-hook-type/per-theme counts sum to 51.
- [x] 4.4 Implement `src/hook-theme-backfill/classifications.ts`: the `ClassifiedBrief`/`ReportedBrief`
  types and the `BRIEF_CLASSIFICATIONS` array (generated from the hand-made decisions in 4.2, each
  entry's `briefSha256` computed from the real file).

## 5. planBackfill — the pure decision core (test-first)

- [x] 5.1 Write `backfill.test.ts` FIRST, with synthetic Briefs/entries (never depending on the real 51):
  a matching unclassified Idea is planned as `toUpdate`; matching is by content hash, never title/id; an
  Idea already at the desired state is `alreadyCorrect`, not `toUpdate`; a `"reported"`-matching Idea is
  surfaced as `reported`, never `toUpdate`; an Idea matching nothing is `noEntry`; an empty
  `existingIdeas` list produces an empty plan; the function is pure.
- [x] 5.2 Implement `planBackfill` in `src/hook-theme-backfill/backfill.ts`.

## 6. The report (test-first)

- [x] 6.1 Write `report.test.ts` FIRST: `countClassifications` tallies per-hook-type/per-theme over a
  given final-state list; `formatBackfillReport` states the four bucket counts, lists every updated
  Idea's before -> after and every reported Idea's reason, and includes the count tables.
- [x] 6.2 Implement `countClassifications`/`formatBackfillReport` in `src/hook-theme-backfill/report.ts`.

## 7. The orchestration shell (test-first)

- [x] 7.1 Write `backfill-hook-theme.test.ts` FIRST (`withTempDb`, never `:memory:`): a matching Idea is
  classified through `classifyIdea` (never a direct store write); a non-matching Idea is left untouched
  and reported `noEntry`; a second run against an already-backfilled database updates nothing; the
  default (no override) wiring runs against the real `BRIEF_CLASSIFICATIONS` without throwing.
- [x] 7.2 Implement `backfillHookTheme` + CLI entry in `src/commands/backfill-hook-theme.ts`; add the
  `backfill-hook-theme` npm script.

## 8. OpenSpec + full-suite green + self-review + Build Report

- [x] 8.1 Author spec deltas: `specs/sqlite-foundation` (ADDED — migration 4), `specs/idea-store` (ADDED
  — `classifyIdea`/`listAllIdeas`/`listIdeasByHookType`), `specs/command-surface` (MODIFIED — adds
  `classifyIdea`), `specs/hook-theme-backfill` (ADDED — new capability). Run `openspec validate --strict`
  until green.
- [x] 8.2 Run `npm test` (type-check + full suite) — green, above the `3373 / 890 / 0 fail` baseline.
- [x] 8.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #206
  acceptance criterion maps to a specific test.
- [x] 8.4 Post the per-hook-type and per-theme counts (from a real `backfillHookTheme` run against the
  61-Idea test fixture, or computed directly from `BRIEF_CLASSIFICATIONS`) on issue #206, and write the
  Build Report — including the Operator's requested sample table — into `handoff.md`.
