## ADDED Requirements

### Requirement: createTrend enforces the schema's own platform CHECK constraint, never re-implementing it in application code

`createTrend` SHALL rely on the `trend` table's own
`platform TEXT CHECK (platform IS NULL OR platform IN (...))` constraint (`src/db/schema.ts`, the same
`KNOWN_PLATFORMS`-derived CHECK `channel.platform` already carries) rather than duplicating that check
in application code: a `platform` value outside `KNOWN_PLATFORMS` SHALL be rejected with a
CHECK-constraint error, and no `trend` row SHALL be created.

#### Scenario: createTrend rejects a platform outside KNOWN_PLATFORMS

- **GIVEN** a `TrendInput` with a `platform` value not present in `KNOWN_PLATFORMS`
- **WHEN** `createTrend` is called with it
- **THEN** it throws a CHECK-constraint error, and no `trend` row is created
