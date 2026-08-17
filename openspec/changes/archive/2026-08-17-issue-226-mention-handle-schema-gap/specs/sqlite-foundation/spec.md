## MODIFIED Requirements

### Requirement: The schema covers every entity CONTEXT.md names, each carrying id/created_at/updated_at/schema_version

`src/db/schema.ts`'s migrations SHALL create all 18 entity tables: `brand`, `channel`, `format`,
`baseline_prompt`, `brand_asset`, `run`, `trend`, `idea`, `idea_recipe`, `asset`, `asset_media`,
`copy_variant`, `job`, `gate_request`, `post`, `metric_snapshot`, `performance_score`,
`channel_baseline` (`ENTITY_TABLES`). Every one of these tables SHALL carry an `id` column, a
`created_at` column, an `updated_at` column, and a `schema_version` column.

`mention_handle` SHALL NOT be one of these 18 tables. The Mention Handle Registry is a global,
hand-maintained mapping of company/product names to platform handles
(`data/mention-handles.yaml`, `src/mention-handle/store.ts`, issue #149) — a human-authored document
under ADR-0029's file carve-out, not canonical/relational state, and nothing in this schema
foreign-keys into it. This is a deliberate decision (ADR-0029, issue #226, 2026-08-17), closing a gap
between #201 (which never named `mention_handle` in its own schema AC) and #202 (which named Mention
Handle among the stores to swap to SQL) that #222 correctly declined to paper over by inventing a table
outside its own spec. Adding a `mention_handle` table remains a legitimate FUTURE, additive migration if
issue #210's Library needs to query it directly — this migration does not build one.

#### Scenario: Every entity table exists after migration

- **GIVEN** a freshly migrated database
- **WHEN** `sqlite_master` is queried for tables
- **THEN** every table named in `ENTITY_TABLES` exists

#### Scenario: Every entity table carries id, created_at, updated_at, and schema_version

- **GIVEN** a freshly migrated database
- **WHEN** `PRAGMA table_info` is read for every table in `ENTITY_TABLES`
- **THEN** each one's column list includes `id`, `created_at`, `updated_at`, and `schema_version`

#### Scenario: mention_handle does not exist after migration (issue #226)

- **GIVEN** a freshly migrated database
- **WHEN** `sqlite_master` is queried for a table named `mention_handle`
- **THEN** it does not exist — the Mention Handle Registry stays a file (ADR-0029), not a schema entity
