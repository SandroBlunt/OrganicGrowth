## ADDED Requirements

### Requirement: Migration 4 additively adds idea.hook_type_source/idea.theme_source, without altering migrations 1, 2, or 3

`src/db/schema.ts`'s `MIGRATIONS` SHALL gain a fourth entry, `MIGRATION_4` (version `4`), appended after
`MIGRATION_3` — never an edit to any already-shipped migration's own SQL. `CURRENT_SCHEMA_VERSION` SHALL
therefore become `4`. `MIGRATION_4`'s SQL SHALL `ALTER TABLE idea ADD COLUMN` exactly two new, nullable
columns — `hook_type_source` and `theme_source` — and SHALL NOT touch any other table, column,
constraint, or seed row `MIGRATION_1`/`MIGRATION_2`/`MIGRATION_3` already created.

Each new column SHALL accept `NULL` or exactly one of two string values, `'heading'` or `'inferred'`
(enforced by a plain `CHECK`, not a third seeded reference table — mirroring how `format.cadence`/
`asset.status` and their siblings already use a `CHECK` for a small, schema-fixed, single-Brand-agnostic
set rather than a vocabulary table). `NULL` SHALL mean "no classification provenance recorded" — the
state every `idea` row created before this migration is in, and the state any future Idea `createIdea`
inserts stays in until something later calls `classifyIdea` — never a fabricated third provenance value
standing in for "not yet classified."

#### Scenario: A freshly migrated database reaches schema version 4

- **GIVEN** a freshly opened, empty database file
- **WHEN** `runMigrations` is called
- **THEN** it returns `4`, and `getSchemaVersion` afterward also reports `4`

#### Scenario: hook_type_source and theme_source exist on idea, default to NULL, and are independent of each other

- **GIVEN** a freshly migrated database
- **WHEN** an `idea` row is inserted without specifying either new column
- **THEN** both `hook_type_source` and `theme_source` read back as `NULL`, and setting one to `'heading'`
  while leaving the other `NULL` (or setting it to `'inferred'`) is accepted

#### Scenario: A value outside NULL/'heading'/'inferred' is rejected by the CHECK constraint

- **GIVEN** a freshly migrated database
- **WHEN** an `idea` row is inserted with `hook_type_source` (or `theme_source`) set to any value other
  than `NULL`, `'heading'`, or `'inferred'`
- **THEN** the insert fails with a `CHECK` constraint error, and no row is written

#### Scenario: A pre-#206 database (migrations 1+2+3 already applied) migrates forward touching nothing else

- **GIVEN** a database with migrations 1, 2, and 3 already applied and recorded
- **WHEN** `runMigrations` is called again
- **THEN** it reaches schema version 4, `idea` now carries `hook_type_source`/`theme_source`, and every
  table migration 1/2/3 already created — including their row counts in the three seeded vocabulary
  tables and the existence of `schedule_outbox` — is unchanged
