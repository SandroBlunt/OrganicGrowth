## MODIFIED Requirements

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
