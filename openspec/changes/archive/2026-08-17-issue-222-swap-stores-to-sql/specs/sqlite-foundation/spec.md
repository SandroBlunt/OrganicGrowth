## ADDED Requirements

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
