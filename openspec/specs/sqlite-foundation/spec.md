# sqlite-foundation Specification

## Purpose
TBD - created by archiving change issue-201-adrs-vocabularies-sqlite-foundation. Update Purpose after archive.
## Requirements
### Requirement: One local SQLite database, opened in-process — no service, no hosted database

The SQLite foundation SHALL be a single database file, opened **in-process** by Node via the built-in
`node:sqlite` module (`src/db/connection.ts`'s `openDatabase`) — never a native npm dependency, never a
hosted service, never an HTTP API, never a container, never Postgres/Supabase, never multi-tenant.
`openDatabase` SHALL create the database file (and any missing parent directories) if absent, and SHALL
enable `PRAGMA foreign_keys = ON` on every connection it opens, because SQLite does not enforce foreign
keys by default. `openDatabase` SHALL also enable `PRAGMA busy_timeout = 5000` on every connection it
opens (issue #203) — `node:sqlite` defaults this pragma to `0`, meaning a second connection's write
while another connection holds the write lock fails IMMEDIATELY with `SQLITE_BUSY` rather than waiting;
this repo's own documented reality (the Operator runs two concurrent sessions against the same folder)
means every connection instead WAITS (up to 5s) for the lock to free, letting SQLite's serialized-writer
guarantee do its job rather than surfacing a spurious contention error.

#### Scenario: openDatabase creates a fresh file and enables foreign-key enforcement

- **GIVEN** a path to a SQLite file that does not yet exist, inside a directory that also does not yet
  exist
- **WHEN** `openDatabase(path)` is called
- **THEN** the file and its parent directory are created, and a foreign-key constraint violation on that
  connection throws (proving `PRAGMA foreign_keys = ON` took effect)

#### Scenario: openDatabase enables a 5-second busy timeout on every connection

- **GIVEN** a freshly opened database connection
- **WHEN** `PRAGMA busy_timeout` is read back on that connection
- **THEN** it reports `5000`

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

### Requirement: A migration runner creates and upgrades the schema, and records which version a database is at

`src/db/migrate.ts`'s `runMigrations(db)` SHALL apply every migration in `src/db/schema.ts`'s
`MIGRATIONS` that a given database has not yet applied, in ascending version order, each inside its own
transaction — rolled back cleanly, and NOT recorded as applied, if any statement in it fails.
`getSchemaVersion(db)` SHALL return the highest recorded migration version (`0` for a database with none
applied). `runMigrations` SHALL be idempotent: calling it again against an already-current database SHALL
neither re-apply nor re-record any migration.

`CURRENT_SCHEMA_VERSION` SHALL equal the highest version among ALL `MIGRATIONS`, whether or not a given
migration alters any entity table's own DDL — a migration that only seeds reference-table rows (e.g.
migration 2, issue #219) still advances it. This is DISTINCT from any one entity table's own
`schema_version` DEFAULT, which SQLite bakes into that table's `CREATE TABLE` statement and cannot be
retroactively changed (`ALTER COLUMN ... SET DEFAULT` does not exist in SQLite) — see the next Scenario.

#### Scenario: A fresh database starts at schema version 0 and reaches CURRENT_SCHEMA_VERSION after migrating

- **GIVEN** a freshly opened, empty database file
- **WHEN** `getSchemaVersion` is read, then `runMigrations` is called, then `getSchemaVersion` is read
  again
- **THEN** the first read returns `0` and the second returns `CURRENT_SCHEMA_VERSION`

#### Scenario: Running migrations twice is a safe no-op the second time

- **GIVEN** an already-migrated database
- **WHEN** `runMigrations` is called a second time
- **THEN** it returns `CURRENT_SCHEMA_VERSION` again and `schema_migrations` gains no new row

#### Scenario: A failed migration rolls back cleanly and is not recorded as applied

- **GIVEN** a database whose schema already conflicts with what a pending migration would create (so
  that migration's SQL fails partway through)
- **WHEN** `runMigrations` is called
- **THEN** it throws, `getSchemaVersion` still reports the pre-migration version, and no table the failed
  migration would have created later in its own script exists

#### Scenario: A freshly-written entity-table row's schema_version defaults to the version of the migration that defined that table's DDL

- **GIVEN** a freshly migrated database, where `CURRENT_SCHEMA_VERSION` is `2` (migration 1 plus
  migration 2, issue #219) but `brand`'s own `CREATE TABLE` statement was written by migration 1 and has
  not been altered since
- **WHEN** a row is inserted into `brand` without the caller specifying `schema_version`
- **THEN** the stored `schema_version` equals `1` — the version of the migration that actually defined
  `brand`'s DDL — NOT `CURRENT_SCHEMA_VERSION`, because migration 2 never touches `brand`'s shape

### Requirement: The three closed vocabularies are seeded reference tables with real foreign-key enforcement

The migration SHALL create `hook_type_vocabulary`, `theme_vocabulary`, and `recipe_vocabulary` as seeded
lookup tables, and SHALL seed them AT MIGRATION TIME directly from `src/vocabulary/hook-type.ts`'s
`HOOK_TYPES`, `src/vocabulary/theme.ts`'s `THEMES`, and `src/recipe/registry.ts`'s
`listWiredRecipeSlugs()`/`getRecipe()` — never a second, hand-maintained list. `idea.hook_type` and
`idea.theme` SHALL be `NOT NULL` foreign keys into `hook_type_vocabulary(value)` /
`theme_vocabulary(value)`; `idea_recipe.recipe_slug`, `asset.recipe_slug`, and
`baseline_prompt.recipe_slug` SHALL be foreign keys into `recipe_vocabulary(slug)`. A value outside the
seeded set SHALL be rejected by the foreign-key constraint (with `PRAGMA foreign_keys = ON` enabled),
never merely discouraged.

Widening `HOOK_TYPES`/`THEMES` with a new member SHALL be seeded by a NEW migration, never an edit to an
already-applied migration's SQL. Issue #219 (Operator decision 2026-08-17) is the first case: migration 1
seeds the original ten Hook Types / nine Themes; migration 2 seeds ONLY the explicit sentinel
`unclassified` for each — a real, `NOT NULL`-compatible member of both closed vocabularies (never a
nullable escape hatch), distinguishable in any query from every classified value.

#### Scenario: hook_type_vocabulary is seeded verbatim from HOOK_TYPES

- **GIVEN** a freshly migrated database
- **WHEN** `hook_type_vocabulary` is read in full
- **THEN** it holds exactly one row per `HOOK_TYPES` entry, each with the SAME `value` and `meaning`

#### Scenario: theme_vocabulary is seeded verbatim from THEMES

- **GIVEN** a freshly migrated database
- **WHEN** `theme_vocabulary` is read in full
- **THEN** it holds exactly one row per `THEMES` entry, each with the SAME `value` and `meaning`

#### Scenario: recipe_vocabulary is seeded from the registry, including the third wired Recipe

- **GIVEN** a freshly migrated database
- **WHEN** `recipe_vocabulary` is read in full
- **THEN** it holds exactly one row per `listWiredRecipeSlugs()` entry, including `news-short-script`

#### Scenario: An Idea with a hook_type or theme outside the closed set is rejected

- **GIVEN** a freshly migrated database with a valid Idea fixture chain (brand/format/run)
- **WHEN** an `idea` row is inserted with a `hook_type` (or `theme`) value not present in
  `hook_type_vocabulary`/`theme_vocabulary`
- **THEN** the insert throws a foreign-key constraint error

#### Scenario: A recipe_slug outside the registry's wired set is rejected

- **GIVEN** a freshly migrated database with a valid Idea
- **WHEN** an `idea_recipe` row is inserted with a `recipe_slug` not present in `recipe_vocabulary`
- **THEN** the insert throws a foreign-key constraint error, and every one of the registry's REAL wired
  slugs is accepted without error

#### Scenario: An Idea can be inserted with 'unclassified' for both hook_type and theme, distinguishable in a query (issue #219)

- **GIVEN** a freshly migrated database with a valid Idea fixture chain, one Idea inserted with
  `unclassified` for both `hook_type` and `theme`, and another inserted with real classified values
- **WHEN** the `unclassified` Idea is inserted
- **THEN** the insert succeeds, and a query excluding `hook_type = 'unclassified'` returns only the
  classified Idea — `unclassified` is never indistinguishable from a real classified value

#### Scenario: Migration 2 adds only 'unclassified' to each vocabulary table, without re-seeding or duplicating migration 1's rows (issue #219)

- **GIVEN** a database already upgraded to schema version 1 only (migration 1 applied, migration 2 not
  yet — simulating a database created before issue #219 landed)
- **WHEN** `runMigrations` is called again
- **THEN** it reaches `CURRENT_SCHEMA_VERSION`, and `hook_type_vocabulary`/`theme_vocabulary` each gain
  EXACTLY one new row (`unclassified`) — the original ten/nine rows are untouched, never re-seeded or
  duplicated

### Requirement: Exactly one primary Channel per Brand

`channel` SHALL carry an `is_primary` flag, and the schema SHALL enforce — via a partial unique index on
`channel(brand_id) WHERE is_primary = 1`, not a `CHECK` (which cannot see sibling rows) — that at most one
Channel per Brand is marked primary (ADR-0019).

#### Scenario: A second primary Channel for the same Brand is rejected

- **GIVEN** a Brand with one Channel already marked `is_primary = 1`
- **WHEN** a second Channel for the SAME Brand is inserted with `is_primary = 1`
- **THEN** the insert throws a uniqueness error

#### Scenario: A non-primary sibling, and a primary Channel on a different Brand, both succeed

- **GIVEN** a Brand with one primary Channel already inserted
- **WHEN** a second, non-primary Channel is inserted for the SAME Brand, and a primary Channel is
  inserted for a DIFFERENT Brand
- **THEN** both inserts succeed

### Requirement: Media is referenced by a root-relative storage key, rejected as absolute at the store boundary

`src/db/storage-key.ts`'s `assertRootRelativeStorageKey(key)` SHALL return `key` unchanged when it is a
non-empty, root-relative path containing no `..` segment, and SHALL throw `StorageKeyError` for: an empty
string; a POSIX absolute path (leading `/`); a Windows absolute path (a drive letter, or a UNC
`\\host\share` path); a home-directory shorthand (leading `~`); or any path containing a `..` segment.
Every write that carries a `storage_key` (`src/db/media-ref.ts`'s `insertAssetMedia`/`insertBrandAsset`)
SHALL call this validator BEFORE inserting, so an invalid key is rejected at the store boundary itself —
proven against a real database, with no partial row left behind — not merely documented as a convention.

#### Scenario: A well-formed root-relative storage key is accepted

- **GIVEN** `"straw-motion/2026-W32/idea-01/0-hook.jpg"`
- **WHEN** `assertRootRelativeStorageKey` is called
- **THEN** it returns the same string unchanged

#### Scenario: A POSIX absolute, Windows absolute, home-shorthand, empty, or traversal key is rejected

- **GIVEN** `"/Users/CaxtonTaylor/Developer/OrganicGrowth/data/x.jpg"`, `"C:\\Users\\ops\\x.jpg"`,
  `"~/OrganicGrowth-Backups/x.jpg"`, `""`, and `"../../etc/passwd"`
- **WHEN** `assertRootRelativeStorageKey` is called on each
- **THEN** every one throws `StorageKeyError`, and the error message names the rejected key

#### Scenario: insertAssetMedia rejects an absolute storage key before writing any row

- **GIVEN** a real, migrated database with a valid Asset fixture chain
- **WHEN** `insertAssetMedia` is called with an absolute `storageKey`
- **THEN** it throws `StorageKeyError` and `asset_media` gains no row

#### Scenario: insertBrandAsset rejects a home-directory-shorthand storage key before writing any row

- **GIVEN** a real, migrated database with a valid Brand
- **WHEN** `insertBrandAsset` is called with a `~`-prefixed `storageKey`
- **THEN** it throws `StorageKeyError` and `brand_asset` gains no row

### Requirement: The schema leaves room for account, user, and connection without building them

The migration SHALL NOT create `account`, `user`, or `connection` tables — multi-tenancy is deliberately
out of scope for this single-Operator, local installation (epic #195). No column on `brand` SHALL assume
their future existence in a way that would require reshaping `brand` to add them later.

#### Scenario: account, user, and connection do not exist after migration

- **GIVEN** a freshly migrated database
- **WHEN** `sqlite_master` is queried for tables named `account`, `user`, and `connection`
- **THEN** none of them exist

### Requirement: Tests exercise a real, empty SQLite file per test — never an in-memory double

Every test in this capability SHALL open a real, empty SQLite file (via `src/db/test-support.ts`'s
`withTempDb`, never `:memory:`) inside a fresh temp directory per test, and SHALL remove that directory
in a `finally` block regardless of test outcome.

#### Scenario: withTempDb provides a real file-backed database and cleans it up

- **GIVEN** a callback that inserts a row and asserts it is readable back
- **WHEN** `withTempDb` invokes it
- **THEN** the callback receives a `DatabaseSync` backed by a real, non-`:memory:` file, and after
  `withTempDb` returns, that file's containing temp directory no longer exists on disk

### Requirement: A shared transaction helper is the ONE place a multi-row write is wrapped in BEGIN/COMMIT/ROLLBACK

`src/db/transaction.ts`'s `withTransaction(db, fn)` SHALL run `fn` inside `BEGIN`/`COMMIT`, and SHALL
roll back (`ROLLBACK`) and re-throw the ORIGINAL error, unchanged, if `fn` throws — never wrapping or
swallowing it. On success it SHALL return `fn`'s own return value. This is the ONE seam every store's
multi-row write goes through (`addAssetMediaBatch`, `upsertCopyVariants`, `setPrimaryChannel`), factored
out of `migrate.ts`'s own inline `BEGIN`/`COMMIT`/`ROLLBACK` pattern so `IdeaStore` (issue #223) reuses
the SAME tested atomicity guarantee rather than each store hand-rolling its own.

#### Scenario: A successful callback commits every write

- **GIVEN** a callback that inserts two rows
- **WHEN** `withTransaction` runs it
- **THEN** both rows are committed and readable afterward

#### Scenario: A multi-row write that fails on its SECOND row leaves NOTHING behind

- **GIVEN** a callback that inserts one row successfully, then attempts a second insert that violates a
  constraint
- **WHEN** `withTransaction` runs it
- **THEN** it throws, and NEITHER row survives — not even the first, individually-valid one

#### Scenario: The original error is re-thrown unchanged

- **GIVEN** a callback that throws a specific `Error` instance
- **WHEN** `withTransaction` runs it
- **THEN** the SAME error instance propagates to the caller, not a wrapped or replaced one

#### Scenario: Nesting throws loudly rather than silently starting a second transaction

- **GIVEN** a callback that calls `withTransaction` again on the same `db`, from inside an already-open
  transaction
- **WHEN** the outer `withTransaction` runs it
- **THEN** it throws (SQLite itself rejects a `BEGIN` issued while a transaction is already open) rather
  than silently proceeding as if two independent transactions were opened

