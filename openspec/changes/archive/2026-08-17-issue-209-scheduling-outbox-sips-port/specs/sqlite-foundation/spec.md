## ADDED Requirements

### Requirement: Migration 3 additively adds schedule_outbox, without altering migrations 1 or 2

`src/db/schema.ts`'s `MIGRATIONS` SHALL gain a third entry, `MIGRATION_3` (version `3`), appended after
`MIGRATION_2` — never an edit to either already-shipped migration's own SQL. `CURRENT_SCHEMA_VERSION`
SHALL therefore become `3`. `MIGRATION_3`'s SQL SHALL create exactly one new table, `schedule_outbox`
(the Schedule Outbox's own reserve/confirm ledger — see the `schedule-outbox` capability for its full
behavior), and SHALL NOT touch any table, column, constraint, or seed row `MIGRATION_1`/`MIGRATION_2`
already created. `schedule_outbox` is deliberately NOT one of `ENTITY_TABLES` — it is engineering
infrastructure the Schedule Outbox needs, not one of the domain entities `CONTEXT.md` names, and
`ENTITY_TABLES`'s own existing Requirement ("every entity CONTEXT.md names") stays exactly as it was: 18
tables, unchanged. `schedule_outbox` still carries `id`/`created_at`/`updated_at`/`schema_version` like
every `ENTITY_TABLES` member — proven by its own direct tests, not via the `ENTITY_TABLES` loop.

#### Scenario: A freshly migrated database reaches schema version 3

- **GIVEN** a freshly opened, empty database file
- **WHEN** `runMigrations` is called
- **THEN** it returns `3`, and `getSchemaVersion` afterward also reports `3`

#### Scenario: schedule_outbox exists after migration, and is not counted among ENTITY_TABLES

- **GIVEN** a freshly migrated database
- **WHEN** `sqlite_master` is queried for a table named `schedule_outbox`, and separately `ENTITY_TABLES`
  is inspected
- **THEN** `schedule_outbox` exists as a real table, and `ENTITY_TABLES` does NOT include it (still
  exactly the same 18 `CONTEXT.md`-named entities issue #201 shipped)

#### Scenario: A pre-#209 database (migrations 1+2 already applied) migrates forward touching nothing else

- **GIVEN** a database with migrations 1 and 2 already applied and recorded
- **WHEN** `runMigrations` is called again
- **THEN** it reaches schema version 3, `schedule_outbox` now exists, and every table migration 1/2
  already created — including their row counts in the three seeded vocabulary tables — is unchanged
