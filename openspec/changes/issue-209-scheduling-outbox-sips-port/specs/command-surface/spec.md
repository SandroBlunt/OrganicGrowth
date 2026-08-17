## ADDED Requirements

### Requirement: The command surface exposes the Schedule Outbox's reserve/call/confirm operation

`src/command-surface/schedule-outbox.ts` SHALL expose `scheduleViaOutbox(db, input, port, now)` and
`reconcileScheduleOutbox(db, idempotencyKey, port, now)` as thin orchestration shells over
`src/schedule-outbox/run.ts`'s `runScheduleOutboxEntry`/`reconcileScheduleOutboxEntry` — never a store
bypassed, never new business logic duplicated from what those functions already implement. This is a NEW
capability beyond the eight operations issue #205's own acceptance criteria named, not a companion to
them — the "exactly three deliberate, minimal companions" Requirement (issue #205) is unaffected and
stays exactly as it was. Both functions SHALL be re-exported from `src/command-surface/index.ts`.

#### Scenario: scheduleViaOutbox forwards to runScheduleOutboxEntry unchanged

- **GIVEN** a fresh, migrated, throwaway database, a seeded Asset, and a fake `ZohoSchedulePort`
- **WHEN** `scheduleViaOutbox(db, { idempotencyKey, assetId, request }, port)` is called via
  `src/command-surface/index.ts`'s own exported name
- **THEN** the SAME outcome `runScheduleOutboxEntry` would produce is returned, and the `schedule_outbox`
  entry is readable back exactly as `src/schedule-outbox/store.ts`'s own `getScheduleOutboxEntry` reports

#### Scenario: reconcileScheduleOutbox forwards to reconcileScheduleOutboxEntry unchanged, never calling createSchedule

- **GIVEN** an idempotency key that was never reserved
- **WHEN** `reconcileScheduleOutbox(db, idempotencyKey, port)` is called
- **THEN** it returns `{ status: "unknown-key" }`, and the port receives zero calls of any kind
