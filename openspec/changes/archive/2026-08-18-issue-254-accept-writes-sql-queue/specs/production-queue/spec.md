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

#### Scenario: Two DIFFERENT accepted Ideas sharing an identical title, accepted through enqueueOnAccept itself, never collide

- **GIVEN** two genuinely distinct accepted Ideas sharing an identical `title`, each with its own chosen Recipe
- **WHEN** `enqueueOnAccept` is called for the FIRST Idea, then separately for the SECOND, both with `options.db`
- **THEN** both calls return an `sql` field with `ideaCreated: true` and DIFFERENT `ideaId`s, `data/queue.json` gains two distinct jobs, and the SQL `job` table gains one job per Idea — the second Idea's SQL sync is never silently skipped

### Requirement: job.idempotency_key is backstopped by a real, partial UNIQUE schema index, closing the cross-process double-enqueue race

`job.idempotency_key` SHALL carry a partial `UNIQUE (idempotency_key) WHERE idempotency_key IS NOT NULL` schema index (migration 5). `listJobsForComposite` (checked before every `enqueueJob` call) remains the primary, single-process guard against a double-enqueued job; this index is the cross-process backstop for the SAME race — two separate OS processes both holding the same SQLite file open, each passing the read-check before either commits its write — turning what would otherwise be a silently duplicated `queued` job into a loud `SQLITE_CONSTRAINT` error on the second `enqueueJob` call. The index SHALL NOT constrain any job carrying no `idempotency_key` (e.g. every job the one-shot importer creates) — `NULL` values are never compared by a partial index.

#### Scenario: A second job with the SAME idempotency_key throws, never silently duplicating

- **GIVEN** a `job` row already exists with `idempotency_key: "straw-motion::idea-01::news-carousel"`
- **WHEN** a second `job` row is inserted with the SAME `idempotency_key`
- **THEN** the insert throws a `SQLITE_CONSTRAINT` error and no second row is created

#### Scenario: Multiple jobs with no idempotency_key coexist — the index never constrains the importer's own jobs

- **GIVEN** the one-shot importer's own job-creation path, which sets no `idempotency_key`
- **WHEN** it creates several `job` rows for the same Asset, none carrying an `idempotency_key`
- **THEN** every insert succeeds — the partial index never compares `NULL` values against each other
