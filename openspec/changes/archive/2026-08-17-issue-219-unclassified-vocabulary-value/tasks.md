## 1. The two closed vocabularies gain 'unclassified' — pure (test-first)

- [x] 1.1 Update `hook-type.test.ts`: exactly ELEVEN distinct values (was ten); a new test asserting
  `HOOK_TYPES` carries an `unclassified` entry and `UNCLASSIFIED_HOOK_TYPE === "unclassified"`;
  `isHookType` recognizes it too.
- [x] 1.2 Implement: append `unclassified` to `HOOK_TYPES`, export `UNCLASSIFIED_HOOK_TYPE`.
- [x] 1.3 Update `theme.test.ts`: the identical shape of assertions for `THEMES` (nine → ten) and
  `UNCLASSIFIED_THEME`.
- [x] 1.4 Implement: append `unclassified` to `THEMES`, export `UNCLASSIFIED_THEME`.

## 2. CONTEXT.md documents 'unclassified' as the importer's honest default (test-first)

- [x] 2.1 Write failing scenarios in `context-md.docs-test.ts`: the Hook Type and Theme glossary
  entries each explain `unclassified` beyond just listing it — naming the importer and stating it is
  distinguishable, in a query, from a real classified value.
- [x] 2.2 Update `CONTEXT.md`'s Hook Type entry: "ten values" → "eleven values", the new bullet, and the
  explanatory paragraph (issue #219, issue #204, `NOT NULL`, distinguishable).
- [x] 2.3 Update `CONTEXT.md`'s Theme entry: the mirrored change ("nine values" → "ten values").
- [x] 2.4 Confirm the existing generic value/meaning loop (`context-md.docs-test.ts`) now requires and
  passes the new value with no test-file change of its own.

## 3. The SQLite schema — a second migration, never an edit to migration 1's shipped SQL (test-first)

- [x] 3.1 Write a failing test (`schema.test.ts`): an `idea` row can be inserted with `unclassified` for
  BOTH `hook_type` and `theme` against a real migrated database, and is distinguishable, in a query,
  from a classified Idea (issue #219's central de-risking test for #204).
- [x] 3.2 Write a failing test (`migrate.test.ts`): upgrading a database already at schema version 1
  (migration 1 only, simulating a pre-#219 database) adds EXACTLY one new row to each vocabulary table
  on running migrations again — the original ten/nine rows are untouched, never re-seeded or duplicated.
- [x] 3.3 Implement `src/db/schema.ts`'s `MIGRATION_2`: seeds `unclassified` into
  `hook_type_vocabulary`/`theme_vocabulary` only. Migration 1's own seed list is filtered to EXCLUDE
  `unclassified` (`MIGRATION_1_HOOK_TYPES`/`MIGRATION_1_THEMES`) so its generated SQL is unchanged from
  what it already shipped, even though the live `HOOK_TYPES`/`THEMES` arrays it filters from have grown
  — still one source of truth, partitioned by which migration introduced each row, never a hand-copied
  literal.
- [x] 3.4 Found while running the full suite: a pre-existing #201 test asserted a freshly-written entity
  row's `schema_version` always equals `CURRENT_SCHEMA_VERSION`. That was only true by coincidence while
  a single migration existed. Fix the test (and document in `schema.ts`) that a row's `schema_version`
  defaults to the version of the migration that defined that specific table's DDL — migration 2 touches
  no entity table, so entity rows correctly keep defaulting to `1`.

## 4. OpenSpec + full-suite green + self-review + Build Report

- [x] 4.1 Author spec deltas: `specs/domain-vocabulary` (RENAMED + MODIFIED — the two Requirement titles
  carry the ten/nine counts, so a rename is required alongside the content update), `specs/sqlite-foundation`
  (MODIFIED — the vocabulary-seeding Requirement gains the migration-2 scenario and the 'unclassified'
  Idea-insert scenario; the migration-runner Requirement's `schema_version` scenario is corrected),
  `specs/docs-conformance` (MODIFIED — the existing Hook Type/Theme term-for-term Requirement gains two
  scenarios). Run `openspec validate --strict` until green.
- [x] 4.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs` — all green, above
  baseline.
- [x] 4.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #219
  acceptance criterion maps to a specific test.
- [x] 4.4 Write the Build Report into `handoff.md`.
