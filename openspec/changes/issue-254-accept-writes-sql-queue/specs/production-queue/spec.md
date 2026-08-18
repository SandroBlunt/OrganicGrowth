## ADDED Requirements

### Requirement: enqueueOnAccept optionally syncs newly-enqueued Recipes into SQL, additively and loudly

`src/production-queue/enqueue-on-accept.ts`'s `enqueueOnAccept` SHALL accept an optional `options.db` (a `node:sqlite` `DatabaseSync`). Omitted, its behavior SHALL be byte-for-byte unchanged from before this Requirement existed: only `data/queue.json` is written. When `options.db` is given, AFTER the file queue has already been saved, it SHALL call `src/production-queue/sql-sync.ts`'s `syncAcceptToSql` for exactly the Recipes this call's own file-queue policy (`planEnqueue`) decided were newly enqueued — never for a Recipe already `"already-queued"` in the file queue, which was already SQL-synced on an earlier call, or predates this Requirement via the one-shot importer. A SQL sync failure SHALL NOT be caught or swallowed: it SHALL propagate out of `enqueueOnAccept`, after the file queue write it never blocks.

#### Scenario: Omitting options.db leaves the file-queue write and return shape unchanged

- **GIVEN** an accepted Idea and a chosen Recipe, and no `options.db`
- **WHEN** `enqueueOnAccept` is called
- **THEN** `data/queue.json` gains the job exactly as before this Requirement existed, and the returned result carries no `sql` field

#### Scenario: With options.db, the file queue is unaffected and the SQL job table gains the matching job

- **GIVEN** an accepted Idea and a chosen Recipe, with `options.db` pointing at a database already carrying that Brand/Format's rows
- **WHEN** `enqueueOnAccept` is called
- **THEN** `data/queue.json`'s on-disk shape is identical to the no-`db` case, AND the SQL `job` table gains exactly one new `queued` job for that `(brand, idea, recipe)`

#### Scenario: A SQL sync failure is loud, surfacing only after the file queue already succeeded

- **GIVEN** `options.db` points at a database missing the accept flow's Brand row
- **WHEN** `enqueueOnAccept` is called for an accepted Idea and a chosen Recipe
- **THEN** it throws, naming the missing Brand — but `data/queue.json` already carries the job, proving the file write was never blocked by the SQL failure

#### Scenario: A re-accept that is already-queued in the file never touches SQL again

- **GIVEN** `enqueueOnAccept` has already been called once, with `options.db`, for an Idea/Recipe pair
- **WHEN** it is called again for the SAME Idea/Recipe pair, again with `options.db`
- **THEN** the file queue reports `"already-queued"` and the returned result carries no `sql` field — `syncAcceptToSql` is not called a second time
