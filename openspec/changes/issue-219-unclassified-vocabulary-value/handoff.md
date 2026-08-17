# Slice Handoff — issue #219: An explicit 'unclassified' value in the hook_type and theme vocabularies

## Build Report (developer, Round 1)

### What changed

Issue #201 made `idea.hook_type`/`idea.theme` `NOT NULL` foreign keys into two closed vocabularies, but
no real Brief carries a value for either. The classifier that would fill them in (#206) runs AFTER the
importer (#204) and is the agreed drop candidate. The Operator decided (2026-08-17) to add an explicit
`unclassified` member to both vocabularies — never make the columns nullable — so `idea.hook_type`/
`idea.theme` stay `NOT NULL`, stay queryable, and the 10 of 61 Briefs with no classifiable hook/subject
get an honest, permanent value rather than a guess.

This slice does exactly that, and nothing more:

1. **`unclassified` becomes the eleventh Hook Type / tenth Theme.** Appended to
   `src/vocabulary/hook-type.ts`'s `HOOK_TYPES` and `src/vocabulary/theme.ts`'s `THEMES` — the single
   source of truth `CONTEXT.md` and the seeded database tables both derive from. Each module also
   exports a named sentinel constant (`UNCLASSIFIED_HOOK_TYPE`/`UNCLASSIFIED_THEME`) so #204's importer
   never hand-types the literal string.
2. **`CONTEXT.md`'s Hook Type and Theme entries** list the new value, correct the stated counts
   ("ten"→"eleven", "nine"→"ten"), and add a sentence naming the importer (#204) and stating
   `unclassified` is distinguishable, in any query, from a real classified value — the doc records WHY
   the value exists, not merely THAT it exists.
3. **A second schema migration** (`src/db/schema.ts`'s `MIGRATION_2`) seeds ONLY the new `unclassified`
   row into `hook_type_vocabulary`/`theme_vocabulary`. Migration 1's own seed list is now filtered
   (`MIGRATION_1_HOOK_TYPES`/`MIGRATION_1_THEMES`, excluding `unclassified`) so its generated SQL is
   byte-for-byte what it already shipped — the schema module's own established rule ("widening a
   vocabulary is a NEW migration, never an edit to an already-shipped one") is exercised here for the
   first time.
4. **A real found-and-fixed regression**, surfaced by running the full suite after adding the first-ever
   migration 2: a #201 test asserted a freshly-written entity row's `schema_version` always equals
   `CURRENT_SCHEMA_VERSION`. That was only ever true by coincidence while exactly one migration existed
   — SQLite has no `ALTER COLUMN ... SET DEFAULT`, so a migration that seeds vocabulary rows without
   touching any entity table's DDL (migration 2) cannot retroactively bump that table's baked-in
   default. Corrected the test (and documented in `schema.ts`) to the honest invariant: a row's
   `schema_version` defaults to the version of the migration that defined that table's own DDL.

The 61 real Briefs, `data/brands/**`, and any part of #206's backfill are untouched — confirmed via
`git status --porcelain data/` returning empty before and after this slice's work.

### Files touched

**Modified:**
- `src/vocabulary/hook-type.ts` (+`unclassified` entry, `UNCLASSIFIED_HOOK_TYPE` export, doc comments)
- `src/vocabulary/hook-type.test.ts` (count 10→11; new 'unclassified'/`UNCLASSIFIED_HOOK_TYPE` assertions)
- `src/vocabulary/theme.ts` (+`unclassified` entry, `UNCLASSIFIED_THEME` export, doc comments)
- `src/vocabulary/theme.test.ts` (count 9→10; new 'unclassified'/`UNCLASSIFIED_THEME` assertions)
- `src/vocabulary/context-md.docs-test.ts` (+2 scenarios: CONTEXT.md explains 'unclassified')
- `CONTEXT.md` (Hook Type + Theme entries: counts corrected, new bullet, explanatory paragraph)
- `src/db/schema.ts` (`MIGRATION_1_HOOK_TYPES`/`MIGRATION_1_THEMES` filters, `MIGRATION_2`, `MIGRATIONS`
  array, doc-comment updates)
- `src/db/schema.test.ts` (+2 tests: Idea insert with 'unclassified' for both columns, distinguishability)
- `src/db/migrate.test.ts` (+1 test: migration-2 upgrade path; 1 corrected test: `schema_version` default)

**New:**
- `openspec/changes/issue-219-unclassified-vocabulary-value/` (this change: `proposal.md`, `tasks.md`,
  `specs/domain-vocabulary/spec.md`, `specs/sqlite-foundation/spec.md`, `specs/docs-conformance/spec.md`,
  `handoff.md`)

No `package.json` change. No new source files outside the OpenSpec change itself — this slice only
widens two existing arrays and adds one migration to an existing schema module.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-219-unclassified-vocabulary-value
npx tsc -p tsconfig.json --noEmit          # typecheck — clean
npm test                                   # 2807 tests / 713 suites / 0 fail (this worktree's own measured baseline: 2800 / 711)
npm run test:docs                          # 277 tests / 76 suites / 0 fail (baseline: 275 / 75)
npx openspec validate --all --strict       # 47 passed, 0 failed (baseline: 46)
```

Slice-scoped:
```
node --import tsx --test src/vocabulary/*.test.ts src/vocabulary/*.docs-test.ts \
  src/db/schema.test.ts src/db/migrate.test.ts
# 38 tests / 14 suites / 0 fail
```

Note on the baseline numbers in the `/build-issue` brief (`npm test` "2773 / 699 / 0 fail"): a fresh
measurement in this worktree at `main`'s `4bd9ae1` (before any change) returned **2800 tests / 711
suites / 0 fail**, and `openspec validate --all --strict` returned **46**, not 45. `npm run test:docs`
matched exactly (275/75). Treating the freshly-measured numbers as ground truth for this worktree; the
deltas below are relative to that measured baseline.

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #219) | Proven by |
|---|---|---|
| 1 | Both vocabularies gain an explicit `unclassified` member, in the single source of truth under `src/vocabulary/`, never hand-duplicated | `src/vocabulary/hook-type.test.ts` — "holds exactly eleven distinct... values" + "includes the explicit 'unclassified' member"; `src/vocabulary/theme.test.ts` — the mirrored ten-value assertions; `src/db/schema.test.ts`/`migrate.test.ts` prove the database tables are SEEDED from these same arrays (never a second list) |
| 2 | CONTEXT.md documents both; docs-conformance checks cover the new value; counts updated (10→11, 9→10) | `src/vocabulary/context-md.docs-test.ts`'s EXISTING generic value/meaning loop now requires (and passes) the `unclassified` entry with no test-file change of its own; its 2 NEW scenarios assert CONTEXT.md explains 'unclassified' (names the importer, states distinguishability); `CONTEXT.md` itself states "The eleven values"/"The ten values" |
| 3 | The seeded FK reference tables include it, so a fresh `migrate` produces a database that can accept it | `src/db/migrate.test.ts` — "seeds hook_type_vocabulary from... HOOK_TYPES, verbatim" / "seeds theme_vocabulary from... THEMES, verbatim" (both now assert 11/10 rows, generically over the live arrays, against a FRESH migration) |
| 4 | `unclassified` documented as the importer's assignment when a Brief has no classifiable hook/theme — distinguishable in a query | `CONTEXT.md`'s explanatory paragraphs (both entries name "importer" and "distinguishable"); `src/vocabulary/context-md.docs-test.ts`'s 2 new scenarios assert this in the shipped doc; `src/db/schema.test.ts` — "'unclassified' is distinguishable, in a query, from every real classified value" (a `WHERE hook_type != 'unclassified'` query against a real database returns only the classified Idea) |
| 5 | A test proves an Idea row can be inserted with `unclassified` for both columns against a real migrated database | `src/db/schema.test.ts` — "an Idea row can be inserted with 'unclassified' for BOTH hook_type and theme" (`withTempDb`, `runMigrations`, real FK-enforced insert) — this is issue #219's own named central de-risking test for #204 |
| 6 | Both suites stay green; no doc-conformance check is weakened | `npm test` 2800→2807 (+7, 0 fail); `npm run test:docs` 275→277 (+2, 0 fail); every pre-existing docs-test scenario is UNCHANGED text, still passing; the one non-docs-test I corrected (`migrate.test.ts`'s `schema_version` default) is a genuine fix to a coincidentally-true invariant, not a weakening — see "Self-review notes" |

### Fakes / fixtures used

- **The Magnific fake is NOT used and NOT needed.** This slice touches no Space interaction, no
  Production Spec, no Execution Protocol. No file in this slice imports anything under
  `src/space-driver/`, and no `spaces_*`/`creations_*` MCP tool is called or referenced anywhere in the
  diff. Confirmed: `git diff --name-only $(git merge-base HEAD main) -- . | xargs grep -l
  "magnific\|spaces_\|creations_"` returns only `src/db/schema.ts`'s pre-existing (#201, unchanged by
  this slice) `magnific_creation_id` column name — a plain string column, not a tool call.
- **The real-SQLite-file fixture is `src/db/test-support.ts`'s `withTempDb`** (unchanged by this slice,
  reused as-is) — a real, empty, throwaway SQLite file per test (mkdtemp'd, closed and removed in a
  `finally`), never `:memory:`, matching #201's own Testing Decisions and this brief's own instruction.
  Every new/changed test in `schema.test.ts` and `migrate.test.ts` goes through it.
- No live filesystem outside temp directories is touched by any test — `git status --porcelain data/`
  returns empty both before and after the full suite run; the 61 real Briefs are never read.

### Self-review notes

- **Chose a migration split over a naive re-derivation.** The first draft would have simply appended
  `unclassified` to `HOOK_TYPES`/`THEMES` and let `MIGRATION_1`'s existing `HOOK_TYPES.map(...)`
  generation pick it up automatically — that would have silently changed migration 1's own generated SQL
  (violating the schema module's own documented rule) AND would have collided with migration 2's insert
  (duplicate `PRIMARY KEY`, since `value` is the vocabulary tables' primary key) the moment migration 2
  was added. Fixed by filtering migration 1's seed list to exclude `unclassified`
  (`MIGRATION_1_HOOK_TYPES`/`MIGRATION_1_THEMES`) — still derived from the one live array, never a
  hand-copied literal, just partitioned by which migration introduced each row. Verified with a test that
  simulates a pre-#219 database (migration 1 only) and confirms migration 2 adds exactly one new row per
  table without duplicating or re-seeding.
- **Found and fixed a real, pre-existing latent bug**, not scope creep: the `schema_version`-defaults-to-
  `CURRENT_SCHEMA_VERSION` test could only ever hold while exactly one migration existed (SQLite bakes a
  column's `DEFAULT` into its `CREATE TABLE` statement and has no way to retroactively change it). This
  slice is the first to add a second migration, so it is the first place this was ever exercised. Fixed
  the test to assert the honestly-correct invariant and documented the reasoning directly in
  `schema.ts`'s own doc comment, rather than either leaving a red test or silently deleting the check.
  Flagged in the OpenSpec change (`specs/sqlite-foundation/spec.md`, MODIFIED) so the correction is a
  visible part of the durable spec, not a silent test edit.
- **Considered, and rejected, editing `MIGRATION_1`'s SQL directly** (i.e., not adding a migration 2 at
  all) since no live database with real rows exists yet anywhere in this repo (`data/*.db` does not
  exist — #202/#204 haven't landed). Went with the migration-2 pattern anyway because `schema.ts`'s own
  doc comment explicitly anticipates exactly this case ("Adding an eleventh term... a NEW schema
  migration... never an edit to migration 1's SQL") and because it is the correct precedent for #202/#204
  to inherit once a real database file does exist.
- No dead code found to remove — every change is additive to existing modules (one new array entry, one
  new named export, one new migration, a handful of new/updated test assertions).

### Known limits

- **Classifying anything is explicitly out of scope**, per the issue. No Brief under `data/brands/**` is
  touched, read, or scored by this slice. #206 still owns the actual backfill of the 51 Briefs that DO
  carry free-prose hook text.
- **#204's importer itself is not built here.** This slice only proves, against a real migrated database,
  that its target columns will accept `unclassified` — the importer's own logic (deciding WHEN to assign
  it, reading the 61 real Brief files) is #204's job.
- **The `unclassified` meaning text is a genuine authoring choice by me (the developer)**, not handed down
  verbatim by the issue — worded to be internally consistent with the other ten/nine meanings' style and
  with the issue's own reasoning ("the importer's honest default, never a guess"), but not reviewed by the
  Operator word-for-word. Widening either vocabulary's wording later is a `CONTEXT.md` edit plus (per the
  established pattern) a new migration, not a rewrite.
- **The `schema_version`-default correction changes an existing #201 test's assertion**, not just adds a
  new one — flagged prominently above and in the OpenSpec change (`sqlite-foundation`'s MODIFIED
  Requirement) so qa can independently verify this is a genuine fix, not a weakened guarantee.
