## ADDED Requirements

### Requirement: listAllJobs returns every Job in the database, across every Brand/Asset, regardless of status

`src/production-queue/job-store.ts`'s `listAllJobs(db)` SHALL return every `job` row in the database,
oldest-enqueued first, regardless of `status` — `[]` for an empty database. This is the whole-table read
the local read-only Library's Run & queue screen needs to show what is produced, parked, or failed
without reading `data/queue.json`.

#### Scenario: An empty database returns an empty list

- **GIVEN** a freshly migrated database with no `job` row
- **WHEN** `listAllJobs(db)` is called
- **THEN** it returns `[]`

#### Scenario: Every Job is returned, oldest-enqueued first, regardless of status

- **GIVEN** two `job` rows for the same Asset: an earlier one later moved to `failed`, and a later one
  still `queued`
- **WHEN** `listAllJobs(db)` is called
- **THEN** it returns both, the earlier-enqueued one first, each carrying its own current `status`
