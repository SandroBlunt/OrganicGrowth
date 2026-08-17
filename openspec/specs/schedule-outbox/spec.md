# schedule-outbox Specification

## Purpose
TBD - created by archiving change issue-209-scheduling-outbox-sips-port. Update Purpose after archive.
## Requirements
### Requirement: Scheduling reserves its idempotency key before calling Zoho, and confirms afterwards

`src/command-surface/schedule-outbox.ts`'s `scheduleViaOutbox` SHALL reserve `idempotencyKey`
(`db`, `{ idempotencyKey, assetId, request }`, `port`, `now` — `src/schedule-outbox/store.ts`'s
`reserveScheduleOutboxEntry`) BEFORE any `ZohoSchedulePort.createSchedule` call is made, and SHALL
confirm the reservation
(`confirmScheduleOutboxEntry`) with Zoho's returned reference immediately AFTER a successful
`createSchedule` call — never the reverse order. `reserveScheduleOutboxEntry` SHALL be insert-or-find,
keyed on `idempotency_key` (`UNIQUE` in the schema): a fresh key inserts a new `'reserved'` row; an
already-seen key returns the EXISTING row, changing nothing, rather than inserting a second row or
throwing.

#### Scenario: A brand-new reservation calls createSchedule exactly once and confirms with its reference

- **GIVEN** an idempotency key never seen before
- **WHEN** `scheduleViaOutbox` is called
- **THEN** `createSchedule` is called exactly once, and the `schedule_outbox` row ends `'confirmed'`
  with the reference `createSchedule` returned

#### Scenario: Reserving the SAME key twice never produces a second row

- **GIVEN** one `schedule_outbox` row already reserved under `idempotencyKey`
- **WHEN** `reserveScheduleOutboxEntry` is called again with the SAME `idempotencyKey`
- **THEN** it returns the EXISTING row (`alreadyReserved: true`), and exactly one row for that key exists
  in `schedule_outbox`

### Requirement: A crash between reserve and confirm cannot cause a re-run to double-post

A `'reserved'`-but-not-yet-`'confirmed'` `schedule_outbox` entry SHALL NEVER cause a subsequent call to
`scheduleViaOutbox` for the SAME `idempotencyKey` to call `ZohoSchedulePort.createSchedule` a SECOND
time for a post Zoho already accepted. This SHALL be proven by a GENUINE crash: a real, separate OS
process reserves the key, actually calls a real (file-backed, cross-process-durable) fake Zoho's
`createSchedule`, and then exits (`process.exit`) WITHOUT ever calling `confirmScheduleOutboxEntry` —
never merely an asserted intermediate state within one process.

#### Scenario: A real, separate OS process crashes after Zoho accepted the schedule; a retry does not double-post

- **GIVEN** a real, separate OS process that reserves `idempotencyKey`, calls the real (fake) Zoho's
  `createSchedule` (which durably records the schedule), and then crashes (`process.exit`) WITHOUT
  confirming
- **WHEN** `scheduleViaOutbox` is called again, in a DIFFERENT process, for the SAME
  `idempotencyKey` and the SAME request
- **THEN** `createSchedule` is NOT called again — the crashed process's own schedule remains the only one
  Zoho holds for that target
- **AND** the `schedule_outbox` entry ends `'confirmed'`, carrying the reference Zoho returned to the
  CRASHED process's own call, discovered by reconciliation

### Requirement: A reserved-but-unconfirmed key is reconcilable against Zoho, never left ambiguous

`src/command-surface/schedule-outbox.ts`'s `reconcileScheduleOutbox(db, idempotencyKey, port, now)` SHALL
resolve a `'reserved'`-but-not-yet-`'confirmed'` entry by ASKING Zoho — `ZohoSchedulePort.listSchedules`
for the entry's own target — rather than assuming the earlier `createSchedule` call failed (which would
double-post on a blind retry) or assuming it succeeded (which would silently drop the post if it never
actually reached Zoho). A match is found via `src/schedule-outbox/reconcile.ts`'s PURE
`findMatchingSchedule`, matching on the exact post content and the exact local schedule time this system
itself generated — never on Zoho's own reference (unknown until discovered) and never on "the only one
returned" (a target can legitimately hold more than one schedule). An unknown key returns `"unknown-key"`;
an already-`'confirmed'` key returns its reference WITHOUT calling `listSchedules` at all.
`reconcileScheduleOutbox` SHALL NEVER call `createSchedule`, under any outcome — the corresponding
`createSchedule` call, when reconciliation finds nothing, is `scheduleViaOutbox`'s own responsibility,
not this function's.

#### Scenario: Reconciliation finds a match and confirms without calling createSchedule

- **GIVEN** a `'reserved'` entry whose request Zoho's `listSchedules` reports as already scheduled
  (same content, same local schedule time)
- **WHEN** `reconcileScheduleOutbox` is called
- **THEN** it returns `"confirmed-by-reconciliation"` with the matched reference, the entry becomes
  `'confirmed'`, and `createSchedule` is never called

#### Scenario: Reconciliation finds no match and changes nothing

- **GIVEN** a `'reserved'` entry whose request Zoho's `listSchedules` does NOT report
- **WHEN** `reconcileScheduleOutbox` is called
- **THEN** it returns `"still-unconfirmed"`, the entry remains `'reserved'`, and `createSchedule` is
  never called

#### Scenario: A retry that finds nothing on Zoho still schedules exactly once — the post is never silently dropped

- **GIVEN** a real, separate OS process that reserves `idempotencyKey` and crashes BEFORE ever calling
  Zoho
- **WHEN** `scheduleViaOutbox` is called again for the SAME `idempotencyKey`
- **THEN** reconciliation finds nothing, `createSchedule` IS called (exactly once), and the entry ends
  `'confirmed'`

### Requirement: An already-confirmed key short-circuits — calling Zoho zero times

A `scheduleViaOutbox` call for an idempotency key that is ALREADY `'confirmed'` SHALL return that
entry's existing reference immediately, calling NO method on `ZohoSchedulePort` at all — not
`createSchedule`, not even the read-only `listSchedules`.

#### Scenario: A second call for an already-confirmed key makes zero port calls

- **GIVEN** an idempotency key already `'confirmed'` (a prior `scheduleViaOutbox` call succeeded)
- **WHEN** `scheduleViaOutbox` is called again for the SAME key
- **THEN** it returns the SAME reference, `alreadyConfirmed: true`, `calledCreateSchedule: false`, and no
  new call of any kind reaches the port

### Requirement: schedule_outbox is additive; migrations 1 and 2 are untouched

`src/db/schema.ts`'s `MIGRATION_3` SHALL add exactly one new table, `schedule_outbox`, and SHALL NOT
alter any table, column, or constraint `MIGRATION_1`/`MIGRATION_2` already shipped.
`schedule_outbox` SHALL carry `id`, `created_at`, `updated_at`, and `schema_version` like every other
entity table, an `idempotency_key` UNIQUE constraint, an `asset_id` foreign key into `asset(id)`, a
`platform` CHECKed against the SAME `KNOWN_PLATFORMS` set `channel`/`trend` already use, and a `status`
CHECKed to exactly `'reserved'` or `'confirmed'` — no other value. `schedule_outbox` SHALL NOT be one of
`ENTITY_TABLES` (it is engineering infrastructure, not a `CONTEXT.md`-named domain entity).

#### Scenario: A pre-#209 database (migrations 1+2 only) gains ONLY schedule_outbox after migrating

- **GIVEN** a database with migrations 1 and 2 already applied, and no `schedule_outbox` table
- **WHEN** `runMigrations` is called
- **THEN** `schedule_outbox` now exists, and it is the ONLY new table — every table migration 1/2 already
  created is untouched

#### Scenario: schedule_outbox rejects an unknown asset_id, a duplicate idempotency_key, and an out-of-set status or platform

- **GIVEN** a freshly migrated database
- **WHEN** a `schedule_outbox` row is inserted with an unknown `asset_id`, then (separately) two rows
  share the same `idempotency_key`, then (separately) a `status` outside `'reserved'`/`'confirmed'`,
  then (separately) a `platform` outside the known set
- **THEN** every one of these four inserts throws — a foreign-key error, a uniqueness error, and two
  CHECK-constraint errors respectively

### Requirement: The Schedule Outbox is proven, not yet wired to a live command

The Schedule Outbox SHALL be exposed on the typed command surface (`scheduleViaOutbox`/
`reconcileScheduleOutbox`, `src/command-surface/schedule-outbox.ts`), which itself calls
`src/schedule-outbox/store.ts` (the SQL primitives) and `src/schedule-outbox/reconcile.ts` (the PURE
matching logic) directly — mirroring `src/command-surface/ideas.ts`'s own `recordReviewDecision`
precedent for a command-surface function composing more than one store call. There SHALL be no separate
deep-orchestration module BETWEEN the store and the command surface for this capability: the reserve/
reconcile/create-if-needed/confirm sequencing lives in the command-surface module itself, so the
store-write boundary guard (issue #233)'s existing `isCommandSurfacePath` exemption covers it by
construction, with no separate audit needed for an intermediate layer. This SHALL NOT be wired into any
currently-live production command by this change — the live, attended `scheduleViaZohoMcpCommand`
(`src/commands/schedule-via-zoho-mcp.ts`) keeps its own existing call-then-write order until a later
slice (the worker, issue #208) rewires it. This mirrors `src/production-queue/job-store.ts`'s own issue
#203 posture: prove the primitive against the real schema, first.

#### Scenario: scheduleViaOutbox is reachable only through the command surface, over a real database

- **GIVEN** a fresh, migrated, throwaway database and a fake `ZohoSchedulePort`
- **WHEN** a test imports only `scheduleViaOutbox` from `src/command-surface/index.ts` (or
  `schedule-outbox.ts` directly) and calls it
- **THEN** the full reserve/reconcile/create-if-needed/confirm behavior is observed directly — there is
  no separate deep module elsewhere in `src/schedule-outbox/` importing the store's write functions to
  re-prove

#### Scenario: the store-write boundary guard covers schedule_outbox's write functions

- **GIVEN** `src/schedule-outbox/store.ts`'s `reserveScheduleOutboxEntry`/`confirmScheduleOutboxEntry`,
  registered in `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS`
- **WHEN** the store-write boundary guard (`store-write-guard.test.ts`) runs
- **THEN** it flags any future direct import of either function from outside
  `src/command-surface/**` and test paths as an un-audited violation, exactly like every other
  governed store — proven by temporarily removing the ONE legitimate remaining exception
  (`src/schedule-outbox/fixtures/crash-schedule-worker.ts`'s allow-list entry) and observing the guard
  fail, naming that exact triple

