## Why

Issue #201 made `idea.hook_type` and `idea.theme` `NOT NULL` foreign keys into two closed vocabularies.
QA caught the consequence before it bit: not one of the 61 existing Briefs carries a value for either —
51 have free-prose hook text under a heading (two spellings, `Hook concept`/`Hook Concept`), and the
remaining 10 have neither a hook heading nor a `format` field. The classifier that would populate them
is #206, which runs AFTER the one-shot importer (#204) and is the agreed drop candidate — so, as
sequenced, #204's import must populate a required column using a classifier that runs afterward and may
never run at all.

`idea.trend_id` was made nullable in the same schema for exactly this import-compatibility reason. That
reasoning was not extended to `hook_type`/`theme`.

**Operator decision, taken 2026-08-17:** add an explicit `unclassified` member to both vocabularies
rather than making the columns nullable or resequencing #206. Nullable would conflate two different
facts — "not yet classified" and "has no hook to classify" — and push that ambiguity into every later
query. An explicit value keeps both columns `NOT NULL`, stays queryable, and lets the 10 headingless
Briefs carry `unclassified` permanently and honestly rather than being assigned a guess. #206 then
upgrades only what it can actually read, and dropping #206 costs nothing structurally.

## What Changes

- **`unclassified` becomes the eleventh Hook Type / tenth Theme**, appended to
  `src/vocabulary/hook-type.ts`'s `HOOK_TYPES` and `src/vocabulary/theme.ts`'s `THEMES` — the single
  source of truth both `CONTEXT.md` and the seeded reference tables derive from, never a second,
  hand-duplicated list. Each module also exports a named sentinel constant
  (`UNCLASSIFIED_HOOK_TYPE`/`UNCLASSIFIED_THEME`) so a future caller (issue #204's importer) never
  hand-types the literal string.
- **`CONTEXT.md`'s Hook Type and Theme entries** list the new value with its meaning, update the stated
  counts ("ten"→"eleven", "nine"→"ten"), and add a sentence explaining `unclassified` is the importer's
  honest default for a Brief with no classifiable hook/subject — explicitly stated as distinguishable,
  in any query, from a real classified value (never conflated with "not yet classified"). The existing
  `context-md.docs-test.ts` generic value/meaning loop covers the new member automatically; two new
  scenarios assert the explanatory prose exists.
- **A second schema migration** (`src/db/schema.ts`'s `MIGRATION_2`, `src/db/migrate.ts` unchanged)
  seeds ONLY the new `unclassified` row into `hook_type_vocabulary`/`theme_vocabulary` — never an edit
  to migration 1's already-shipped SQL (this module's own established rule, now exercised for the first
  time). Migration 1's seed rows are the ORIGINAL ten/nine, still derived from the live `HOOK_TYPES`/
  `THEMES` arrays (filtered to exclude `unclassified`), so nothing is a second, hand-copied list.
- **A found-and-fixed test correction, surfaced by adding the first-ever migration 2**: a freshly-written
  entity-table row's `schema_version` was asserted to always equal `CURRENT_SCHEMA_VERSION`. That was
  only ever true by coincidence while exactly one migration existed — SQLite has no `ALTER COLUMN ...
  SET DEFAULT`, so a migration that seeds vocabulary rows without touching any entity table's DDL (like
  the new migration 2) cannot retroactively bump that table's baked-in default. The corrected, honest
  invariant: a row's `schema_version` defaults to the version of the migration that defined that
  table's own DDL — documented in `schema.ts`'s own doc comment and re-asserted by the fixed test.

## Non-Goals (explicitly out of scope for this slice)

- **Classifying anything.** This ticket only makes the honest default expressible. #206 still owns the
  actual backfill of the 51 readable Briefs — not touched here.
- **Touching any of the 61 real Briefs** under `data/brands/*/ideas/**`.
- **The one-shot importer** (#204) itself — this ticket only proves, with a real migrated database, that
  its target column values will be accepted.

## Capabilities

### Modified Capabilities

- `domain-vocabulary`: `HOOK_TYPES`/`THEMES` each gain one member (`unclassified`) and a named sentinel
  export; the closed-set sizes change from ten/nine to eleven/ten.
- `sqlite-foundation`: a second migration exists (seeding `unclassified` into both vocabulary reference
  tables); an Idea can be inserted with `unclassified` for both columns against a real migrated
  database; the `schema_version` default invariant is corrected to reflect per-table migration
  ownership rather than a blanket `CURRENT_SCHEMA_VERSION` equality.
- `docs-conformance`: the existing Hook Type/Theme term-for-term Requirement gains two scenarios
  asserting `CONTEXT.md` explains `unclassified` as the importer's honest, distinguishable default.

## Impact

- **New code:** `openspec/changes/issue-219-unclassified-vocabulary-value/` (this change).
- **Modified code:** `src/vocabulary/hook-type.ts` (+`.test.ts`), `src/vocabulary/theme.ts`
  (+`.test.ts`), `src/vocabulary/context-md.docs-test.ts`, `src/db/schema.ts`, `src/db/schema.test.ts`,
  `src/db/migrate.test.ts`, `CONTEXT.md`.
- **Hermetic, no live Space or Zoho MCP calls.** Every new/changed test opens a REAL, empty, throwaway
  SQLite file per test (`src/db/test-support.ts`'s `withTempDb`, never `:memory:`), mirroring #201's own
  Testing Decisions. No `magnific`/Zoho MCP tool is imported or called by any file this slice touches.
- **Always-rules upheld:** this slice touches no content-generation, publication, or metrics code —
  generate-never-publish/public-metrics-only/relative-not-absolute/explicit-attribution are untouched by
  construction. Ledger-as-source-of-truth is untouched: this database is not read or written by any
  existing command; the file ledger stays canonical until issue #202 swaps a store's backing.
