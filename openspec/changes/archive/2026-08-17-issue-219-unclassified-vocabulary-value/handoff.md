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

## QA Verdict — Round 1: PASS

Verified in `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-219-unclassified-vocabulary-value`,
branch `issue-219-unclassified-vocabulary-value`, HEAD `b8ed06d`, rebased onto `main` `50805d0`. Nothing
in this worktree was edited by qa; a disposable `git worktree` pinned to `main`'s `50805d0` was created
under the scratchpad to diff against, then removed (`git worktree remove --force`) — confirmed the
issue-219 worktree is clean (`git status --porcelain` empty) before and after verification.

**If this passes, it is safe to merge immediately.** One real defect was found (below) but it is
functionally inert (a SQL comment, no data or behavior impact, no live database exists yet) — it does
not need to block the merge, though it should be corrected as a fast-follow for the honesty of the claim
it contradicts.

### Suite result — all green, exactly matching the expected rebased numbers

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | clean, exit 0 |
| `npm test` | **2853 tests / 724 suites / 0 fail** (matches the rebased-`main` expectation given in the brief exactly) |
| `npm run test:docs` | **281 tests / 76 suites / 0 fail** (developer's pre-rebase figure was 277/76; the +4 comes from the rebase pulling in other already-merged docs tests, not from this slice — confirmed by running the identical command against a disposable worktree pinned to `main`@`50805d0`, whose own `npm test`/`openspec validate` baseline is 2846/722/0-fail and 47, matching the brief's stated `main` baseline) |
| `npx openspec validate --all --strict` | **48 passed, 0 failed**, not 47 as the developer's Build Report states. Reconciled: `main`@`50805d0` alone reports **47** (verified directly in the disposable worktree); this branch's 48th item is `change/issue-219-unclassified-vocabulary-value` itself — the still-unarchived OpenSpec change appearing as its own validated item. Not a discrepancy once accounted for. |
| Slice-scoped (`node --import tsx --test src/vocabulary/*.test.ts src/vocabulary/*.docs-test.ts src/db/schema.test.ts src/db/migrate.test.ts`) | **38 tests / 14 suites / 0 fail**, matches the Build Report exactly |

### Per-criterion results (issue #219 acceptance criteria)

| # | Criterion | Result | Proving test |
|---|---|---|---|
| 1 | Both vocabularies gain an explicit `unclassified` member in the single source of truth under `src/vocabulary/`, never hand-duplicated | PASS | `src/vocabulary/hook-type.test.ts` "holds exactly eleven distinct..." + "includes the explicit 'unclassified' member..."; `src/vocabulary/theme.test.ts` mirrored (ten). Independently confirmed no hand-duplication: `grep -rln "unclassified" src/ CONTEXT.md` (excluding `*.test.ts`/`*.docs-test.ts`) returns only `hook-type.ts`, `theme.ts` (the source), `schema.ts` (imports the named constants, never types the literal in insertion logic — only inside two comments), and `CONTEXT.md` (the derived doc) |
| 2 | `CONTEXT.md` documents both; docs-conformance checks cover the new value; counts updated 10→11, 9→10 | PASS | `CONTEXT.md` lines 83–102 (Hook Type: "The eleven values", `unclassified` bullet + explanatory paragraph) and lines 111–128 (Theme: "The ten values", mirrored); `src/vocabulary/context-md.docs-test.ts`'s pre-existing generic value/meaning loop (unchanged text, now iterates 11/10-length live arrays) plus its 2 new scenarios (`describe("CONTEXT.md documents 'unclassified'...")`) |
| 3 | Seeded FK reference tables include it, so a fresh `migrate` produces a database that can accept it | PASS | `src/db/migrate.test.ts` "seeds hook_type_vocabulary from... HOOK_TYPES, verbatim" / "...theme_vocabulary... THEMES, verbatim" (now assert against the full 11/10-row live arrays against a **fresh** migration) plus the new "migration 2 adds ONLY the 'unclassified' row..." upgrade-path test |
| 4 | `unclassified` documented as the importer's (#204) assignment for a Brief with no classifiable hook/theme, distinguishable in a query | PASS | `CONTEXT.md`'s explanatory paragraphs name "importer" + state "distinguishable, in any query"; `context-md.docs-test.ts`'s 2 new scenarios assert this against the shipped doc; `src/db/schema.test.ts` "'unclassified' is distinguishable, in a query, from every real classified value" — a real `WHERE hook_type != 'unclassified'` query against a real migrated database returns only the classified Idea |
| 5 | A test proves an Idea row inserts with `unclassified` for BOTH columns against a real migrated database | PASS | `src/db/schema.test.ts` "an Idea row can be inserted with 'unclassified' for BOTH hook_type and theme" — uses `withTempDb` (confirmed real, throwaway, mkdtemp'd SQLite file per test in `src/db/test-support.ts`; never `:memory:`) + `runMigrations` |
| 6 | Both suites stay green; no doc-conformance check weakened | PASS | `npm test` 2853/724/0 fail; `npm run test:docs` 281/76/0 fail; `git diff main -- src/vocabulary/context-md.docs-test.ts` is purely additive (two new `describe` blocks appended, zero lines removed or altered in existing scenarios) |

### Per-scenario results (spec deltas → issue)

**`specs/domain-vocabulary/spec.md`** (RENAMED + MODIFIED)

| Scenario | Result | Covering test |
|---|---|---|
| HOOK_TYPES holds exactly eleven distinct values, each with a meaning | PASS | `hook-type.test.ts` "holds exactly eleven distinct..." |
| isHookType recognizes every closed value incl. 'unclassified', rejects an outside one | PASS | `hook-type.test.ts` `describe("isHookType", ...)` |
| UNCLASSIFIED_HOOK_TYPE names the sentinel value, not a magic string | PASS | `hook-type.test.ts` "includes the explicit 'unclassified' member..." |
| THEMES holds exactly ten distinct values, each with a meaning | PASS | `theme.test.ts` mirrored |
| isTheme recognizes every closed value incl. 'unclassified', rejects an outside one | PASS | `theme.test.ts` `describe("isTheme", ...)` |
| UNCLASSIFIED_THEME names the sentinel value, not a magic string | PASS | `theme.test.ts` mirrored |

**`specs/sqlite-foundation/spec.md`** (MODIFIED)

| Scenario | Result | Covering test |
|---|---|---|
| A fresh database starts at 0, reaches CURRENT_SCHEMA_VERSION after migrating | PASS (pre-existing, unaffected) | `migrate.test.ts` |
| Running migrations twice is a safe no-op | PASS (pre-existing) | `migrate.test.ts` |
| A failed migration rolls back cleanly, not recorded | PASS (pre-existing) | `migrate.test.ts` |
| A freshly-written entity-table row's schema_version defaults to the version of the migration that defined that table's DDL | PASS — genuinely corrected, not weakened (see analysis below) | `migrate.test.ts` "a freshly-written row's schema_version defaults to the version of the migration that defined that table's DDL..." |
| hook_type_vocabulary seeded verbatim from HOOK_TYPES | PASS | `migrate.test.ts` |
| theme_vocabulary seeded verbatim from THEMES | PASS | `migrate.test.ts` |
| recipe_vocabulary seeded from registry, incl. third wired Recipe | PASS (pre-existing, unaffected) | `migrate.test.ts` |
| An Idea with hook_type/theme outside the closed set is rejected | PASS (pre-existing) | `schema.test.ts` |
| A recipe_slug outside the registry's wired set is rejected | PASS (pre-existing) | `schema.test.ts` |
| An Idea can be inserted with 'unclassified' for both columns, distinguishable in a query (#219) | PASS | `schema.test.ts` (2 new tests, §"idea.hook_type and idea.theme accept the explicit 'unclassified' member...") |
| Migration 2 adds only 'unclassified' to each vocabulary table, no re-seed/duplicate (#219) | PASS | `migrate.test.ts` "migration 2 adds ONLY the 'unclassified' row..." |

**`specs/docs-conformance/spec.md`** (MODIFIED)

| Scenario | Result | Covering test |
|---|---|---|
| CONTEXT.md's Hook Type entry lists every HOOK_TYPES value with its exact meaning | PASS | `context-md.docs-test.ts` (pre-existing generic loop, now covers 11) |
| CONTEXT.md's Theme entry lists every THEMES value with its exact meaning | PASS | `context-md.docs-test.ts` (pre-existing generic loop, now covers 10) |
| CONTEXT.md's Hook Type entry explains 'unclassified' beyond just listing it (#219) | PASS | `context-md.docs-test.ts` new scenario |
| CONTEXT.md's Theme entry explains 'unclassified' beyond just listing it (#219) | PASS | `context-md.docs-test.ts` new scenario |

### Always-rules + Magnific-fake checks

| Check | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS (untouched by construction) | `git diff 50805d0 HEAD -- . \| grep -in "spaces_\|creations_\|magnific\|zoho"` returns nothing |
| Public-metrics-only | PASS (untouched) | Same grep — no metrics-path code touched |
| Relative-not-absolute | PASS (untouched) | Same — no scoring/comparison code touched |
| Explicit-attribution | PASS (untouched) | Same — no Post/attribution code touched |
| Ledger-as-source-of-truth | PASS | `git diff --name-only 50805d0 HEAD -- data/` returns empty; no `ledger.json`/`queue.json` touched; this SQLite database is not wired into any command yet (confirmed: no caller of `runMigrations`/`schema.ts` outside `src/db/**` tests exists on this branch), so the file ledger remains canonical, consistent with #202 not having landed |
| Magnific fake / hermetic (no live Space, no credits, no board mutation) | PASS | `git diff 50805d0 HEAD -- . \| grep -in "spaces_\|creations_\|magnific\|zoho"` returns zero matches across the whole diff; every DB test goes through `src/db/test-support.ts`'s `withTempDb`, which opens a REAL, throwaway SQLite file via `mkdtemp` (confirmed by reading the file) — never `:memory:`, matching #201's Testing Decisions |
| OpenSpec change id matches branch slug | PASS | Both are `issue-219-unclassified-vocabulary-value` |

### Independent verification of the "migration 1 is byte-for-byte unchanged" claim — FALSE as stated (see Defect 1)

Checked out `main`@`50805d0` into a disposable worktree, imported `MIGRATIONS` from both versions of
`src/db/schema.ts` (main vs. this branch), extracted `MIGRATION_1.sql`'s generated text from each, and
byte-compared them (`cmp`/`diff`/`md5`). They are **not** byte-identical: this branch's `MIGRATION_1.sql`
has exactly one added line inside its `sql` template body (a `--` SQL comment). See Defect 1 below for
the full analysis — it is functionally inert but the "byte-for-byte" claim in the Build Report,
`proposal.md`, and `schema.ts`'s own new doc comment is not literally true.

### Independent verification of the `schema_version` invariant and its correction

- **Is the new stated invariant true of the code as written?** Yes. `brand`'s (and every entity table's)
  `schema_version INTEGER NOT NULL DEFAULT 1` is a literal baked into `MIGRATION_1`'s `CREATE TABLE`
  statement. SQLite has no `ALTER COLUMN ... SET DEFAULT`, and `MIGRATION_2` never touches any entity
  table's DDL (it only `INSERT`s into the two vocabulary tables, which carry no `schema_version` column
  at all). So a freshly inserted `brand` row's `schema_version` is provably `1` even though
  `CURRENT_SCHEMA_VERSION` is now `2` — verified by reading `MIGRATION_1`'s DDL directly and by running
  the corrected test.
- **Is the corrected test still meaningful, or was it weakened into something that can no longer fail?**
  Still meaningful. It hardcodes the expected value (`1`) independently of `CURRENT_SCHEMA_VERSION`, and
  separately pins `assert.equal(CURRENT_SCHEMA_VERSION, 2, ...)` as a canary — so the test can still fail
  two different ways: if `brand`'s baked-in default ever drifted from `1` (a real regression), or if
  `CURRENT_SCHEMA_VERSION` ever stopped being `2` without this test being revisited (a stale-assumption
  guard). This is a strictly stronger test than the one it replaced, not a weakened one.
- **Design concern to flag before #202 (non-blocking, but should be read):** `schema_version` no longer
  means "the schema version the database was at when this row was written," which is the natural reading
  given the column name and the epic's own stated motivation ("no file carries a version stamp"). As
  built, it means "the version of the migration that defined this TABLE's own DDL" — a value frozen at
  table-creation time, per table, not per row. It will not advance as `CURRENT_SCHEMA_VERSION` climbs
  through any future migration that doesn't rebuild that table's DDL (migration 2, issue #219, is the
  first proof of this). Any future code — #202's store swap, a later backfill script, auditing/tooling —
  that reads a row's `schema_version` expecting "which schema generation produced this row" will get a
  number that provably diverges from "when was this row actually inserted." If per-row provenance is
  ever actually needed, the default would need to become dynamic (set by application code at INSERT time
  from the live `CURRENT_SCHEMA_VERSION`), not a static SQL `DEFAULT`. This does not block this slice —
  the doc comment and the spec both now state the corrected invariant honestly and prominently — but
  whoever builds #202 should read `src/db/schema.ts`'s doc comment on `schema_version` before assuming
  otherwise.

### Scope check — clean

- `git diff --name-only 50805d0 HEAD` outside `openspec/changes/issue-219-unclassified-vocabulary-value/`
  is exactly the 9 files the Build Report lists: `CONTEXT.md`, `src/db/migrate.test.ts`,
  `src/db/schema.test.ts`, `src/db/schema.ts`, `src/vocabulary/context-md.docs-test.ts`,
  `src/vocabulary/hook-type.test.ts`, `src/vocabulary/hook-type.ts`, `src/vocabulary/theme.test.ts`,
  `src/vocabulary/theme.ts`. No `data/**` file, no #204 importer, no #206 classifier code, no other
  source file.
- `git diff --name-only 50805d0 HEAD -- data/` — empty, both directions.
- No Brief is read or scored by any new/changed test (confirmed by reading every new/changed test file in
  full — all fixtures are synthetic, inserted by the test itself).

### OpenSpec archive dry-run claim — verified independently, resolves cleanly

Did **not** run `openspec archive`. Instead, called the installed CLI's own `applySpecs` function
directly (`/opt/homebrew/lib/node_modules/@fission-ai/openspec/dist/core/specs-apply.js` — the same
module `openspec archive` uses) with `{ dryRun: true, skipValidation: false }` against this worktree.
Result: all three capabilities (`docs-conformance` ~1 modified, `domain-vocabulary` ~2 modified + →2
renamed, `sqlite-foundation` ~2 modified) resolved with **no thrown errors** and the internal `Validator`
pass (not skipped) raised nothing. `git status --porcelain openspec/specs/` was empty before and after —
confirming `dryRun: true` made no writes, and that the developer's claim about a clean `applySpecs`
resolution is accurate. `openspec archive` itself was never invoked.

### Defect list

**1. [MEDIUM — non-blocking] Migration 1's SQL is not literally byte-for-byte unchanged; the Build
Report's and proposal's claim is false, even though the specific change is functionally inert.**

- **File/line:** `src/db/schema.ts`, line 427 — inside `MIGRATION_1`'s `sql:` template literal, the line
  `-- (the original ten Hook Types / nine Themes only — 'unclassified' is migration 2's seed row, below)`
  was added to the SQL body itself (not just to the surrounding TypeScript doc comment, where an
  equivalent explanation already exists a few lines above, at the `MIGRATION_1_HOOK_TYPES`/
  `MIGRATION_1_THEMES` declaration).
- **Repro steps:**
  1. `git worktree add <tmp-dir> 50805d0` (pin a disposable copy of `main` before this slice).
  2. In both `<tmp-dir>` and this branch's worktree, run a small script that imports `MIGRATIONS` from
     `src/db/schema.ts` and writes `MIGRATIONS.find(m => m.version === 1).sql` to a file.
  3. `cmp main.sql branch.sql` → reports a mismatch at char 9582 / line 298.
  4. `diff main.sql branch.sql` → shows exactly one added line: the SQL comment quoted above.
- **Impact:** None today. It is a `--` SQL comment; SQLite ignores it, so the resulting database schema
  and seeded rows are byte-identical whether the old or new migration-1 text runs. `src/db/migrate.ts`
  records only an integer `version` in `schema_migrations` — there is no checksum/hash of a migration's
  SQL text anywhere in this codebase that this could silently break. No `data/*.db` file exists yet
  (#202/#204 haven't landed), so nothing is corrupted.
- **Why it's still a defect worth fixing:** The Build Report states "so its generated SQL is byte-for-byte
  what it already shipped," and `schema.ts`'s own new doc comment says the same. Both are asserted as
  verified fact but are not true as literally written. This is exactly the discipline `schema.ts`'s own
  rule exists to protect ("never an edit to an already-shipped migration's SQL") — this instance happens
  to be harmless, but the claim should be either made true (move the comment out of the `sql:` string,
  e.g. up to the doc comment where the equivalent note already lives) or corrected to describe what
  actually happened.
- **Recommendation:** Fix trivially (delete or relocate the one added comment line) in this PR or a fast
  follow. Does not need a new QA round for this alone — it is a one-line, zero-risk change with no
  interaction with tested behavior. **Does not block merge.**

No other defects found.
