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

`openDatabase` SHALL additionally accept an optional `{ readOnly?: boolean }` option (issue #210, the
local read-only Library). When `readOnly` is `true`, `openDatabase` SHALL open the connection via
`node:sqlite`'s own `DatabaseSync` `readOnly` constructor option — enforced by SQLite itself, so any
write attempted through the returned handle (a raw `exec`/`prepare().run()`, or any typed store's write
function called against it) THROWS, never merely by this codebase's own discipline — SHALL NOT create
the file or its parent directories (a read-only caller has nothing legitimate to write), and SHALL throw
when the target file does not already exist, rather than silently creating an empty one to open
read-only. `openDatabase` SHALL still enable `PRAGMA foreign_keys = ON` and `PRAGMA busy_timeout = 5000`
on a `readOnly` connection exactly as it does on a read-write one (both are read-only-safe pragmas,
verified against the real `node:sqlite` runtime). `readOnly` defaults to `false` — every EXISTING caller
of `openDatabase(path)` (no second argument) is unaffected, unchanged.

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

#### Scenario: openDatabase({ readOnly: true }) refuses a database file that does not exist yet

- **GIVEN** a path to a SQLite file that does not exist
- **WHEN** `openDatabase(path, { readOnly: true })` is called
- **THEN** it throws, and the file is NOT created

#### Scenario: a write through a { readOnly: true } connection throws, at the connection level

- **GIVEN** a real, already-migrated SQLite file, and a connection to it opened via
  `openDatabase(path, { readOnly: true })`
- **WHEN** a write is attempted through that connection — a raw `db.exec("INSERT ...")`, or a typed
  store's write function (e.g. `AssetStore`'s `writeAsset`) called with that connection
- **THEN** the write throws, and reopening the same file afterward (even read-only) shows the write never
  landed
