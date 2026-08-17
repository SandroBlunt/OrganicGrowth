## ADDED Requirements

### Requirement: The command surface exposes the Schedule Outbox's reserve/call/confirm operation

`src/command-surface/schedule-outbox.ts` SHALL expose `scheduleViaOutbox(db, input, port, now)` and
`reconcileScheduleOutbox(db, idempotencyKey, port, now)`, composing `src/schedule-outbox/store.ts`'s
`reserveScheduleOutboxEntry`/`confirmScheduleOutboxEntry`/`getScheduleOutboxEntry` and
`src/schedule-outbox/reconcile.ts`'s PURE `findMatchingSchedule` directly — never a store bypassed,
never new business logic duplicated from what those modules already implement, and never a store write
function reachable through a separate deep-orchestration module outside `src/command-surface/`. This is
a NEW capability beyond the eight operations issue #205's own acceptance criteria named, not a companion
to them — the "exactly three deliberate, minimal companions" Requirement (issue #205) is unaffected and
stays exactly as it was. `recordReviewDecision` (`ideas.ts`) already established that a command-surface
function MAY compose more than one store call behind real conditional branching logic — this is that
SAME established shape, not a new one. Both functions SHALL be re-exported from
`src/command-surface/index.ts`.

#### Scenario: scheduleViaOutbox reserves, calls Zoho, and confirms — through the command surface directly

- **GIVEN** a fresh, migrated, throwaway database, a seeded Asset, and a fake `ZohoSchedulePort`
- **WHEN** `scheduleViaOutbox(db, { idempotencyKey, assetId, request }, port)` is called via
  `src/command-surface/index.ts`'s own exported name
- **THEN** `port.createSchedule` is called exactly once, and the `schedule_outbox` entry is readable back
  as `'confirmed'`, with its reference, exactly as `src/schedule-outbox/store.ts`'s own
  `getScheduleOutboxEntry` reports

#### Scenario: reconcileScheduleOutbox is read-only toward Zoho, never calling createSchedule

- **GIVEN** an idempotency key that was never reserved
- **WHEN** `reconcileScheduleOutbox(db, idempotencyKey, port)` is called
- **THEN** it returns `{ status: "unknown-key" }`, and the port receives zero calls of any kind

### Requirement: schedule_outbox's write functions are registered with the store-write boundary guard

`src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS` SHALL name
`src/schedule-outbox/store.ts`'s write-function exports (`reserveScheduleOutboxEntry`,
`confirmScheduleOutboxEntry`), exactly like every other SQL-backed domain store this command surface
sits over. A new module importing either function directly from outside `src/command-surface/**` and
test paths SHALL fail the guard, unless individually audited onto
`src/store-write-boundary/allow-list.ts`'s `STORE_WRITE_BOUNDARY_ALLOW_LIST` with a stated reason — the
SAME governance every other store already has, applied to this ticket's own new store from the moment it
is added, not as a later sweep.

#### Scenario: an un-registered write function is invisible to the guard — the failure mode this Requirement exists to prevent

- **GIVEN** a hypothetical SQL-backed store whose write functions are NOT named in
  `STORE_WRITE_FUNCTIONS`
- **WHEN** a module outside `src/command-surface/**` imports and calls one of its write functions
  directly
- **THEN** the store-write boundary guard does not detect it — proving why registration must happen at
  the same time a store is added, never deferred

#### Scenario: schedule_outbox's write functions ARE registered, and the guard covers them for real

- **GIVEN** `STORE_WRITE_FUNCTIONS`'s entry for `src/schedule-outbox/store.ts`
- **WHEN** `src/schedule-outbox/fixtures/crash-schedule-worker.ts`'s import of
  `reserveScheduleOutboxEntry` is (hypothetically) removed from
  `STORE_WRITE_BOUNDARY_ALLOW_LIST`
- **THEN** `store-write-guard.test.ts` fails, naming exactly that (file, store, function) triple as an
  un-audited violation
