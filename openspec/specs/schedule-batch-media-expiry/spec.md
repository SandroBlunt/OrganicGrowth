# schedule-batch-media-expiry Specification

## Purpose
TBD - created by archiving change issue-198-schedule-media-private-bucket. Update Purpose after archive.
## Requirements
### Requirement: computeMediaExpiry derives a hosted link's expiry from the Asset's own scheduled time

`computeMediaExpiry(scheduledAtIso, uploadedAtIso)` (`src/schedule-batch/media-expiry.ts`) SHALL be
PURE — no clock read, no randomness — and SHALL return `{ expiresAt, expiresInSeconds, cappedByAwsLimit
}`. The NATURAL target expiry SHALL be `scheduledAtIso + EXPIRY_BUFFER_AFTER_SCHEDULED_MS` (1 hour) —
"access ends when the schedule does," with a small grace buffer past the moment Zoho is expected to
actually fetch the media. `expiresInSeconds` SHALL be the whole number of seconds from `uploadedAtIso`
to that target, clamped to `[1, MAX_PRESIGN_SECONDS]` (`src/media-host/aws-presign-limit.ts`).
`cappedByAwsLimit` SHALL be `true` exactly when the natural target's raw duration exceeds
`MAX_PRESIGN_SECONDS` — in that case `expiresAt` SHALL be EARLIER than the Asset's own `scheduledAtIso`
(a genuine, documented limitation — no code can lift AWS's own SigV4 ceiling). Both `scheduledAtIso` and
`uploadedAtIso` SHALL be validated as parseable ISO-8601 instants, throwing a clearly-labeled error
(never fabricating an expiry) when either is not.

#### Scenario: A schedule well within the AWS window expires 1 hour after scheduledAt

- **GIVEN** a `scheduledAtIso` roughly 33 hours after `uploadedAtIso`
- **WHEN** `computeMediaExpiry` is called
- **THEN** `expiresAt` equals `scheduledAtIso + 1 hour`
- **AND** `cappedByAwsLimit` is `false`

#### Scenario: computeMediaExpiry is pure — the same inputs always produce the same output

- **GIVEN** the same `(scheduledAtIso, uploadedAtIso)` pair
- **WHEN** `computeMediaExpiry` is called twice
- **THEN** both results are deep-equal

#### Scenario: A schedule sitting beyond the AWS ceiling is capped, and expires BEFORE the Asset's own scheduled time

- **GIVEN** a `scheduledAtIso` roughly 16 days after `uploadedAtIso`
- **WHEN** `computeMediaExpiry` is called
- **THEN** `expiresInSeconds` equals `MAX_PRESIGN_SECONDS`
- **AND** `cappedByAwsLimit` is `true`
- **AND** `expiresAt` is EARLIER than `scheduledAtIso`

#### Scenario: The 7-day boundary itself is not treated as capped

- **GIVEN** a `scheduledAtIso` chosen so the natural target lands EXACTLY at `uploadedAtIso +
  MAX_PRESIGN_SECONDS`
- **WHEN** `computeMediaExpiry` is called
- **THEN** `cappedByAwsLimit` is `false`
- **AND** `expiresInSeconds` equals `MAX_PRESIGN_SECONDS`

#### Scenario: An unparseable scheduledAt or uploadedAt throws, naming which one, rather than fabricating an expiry

- **GIVEN** `computeMediaExpiry`
- **WHEN** called with a `scheduledAtIso` or an `uploadedAtIso` that does not parse to a valid instant
- **THEN** it throws, naming the offending argument

### Requirement: A signed link's expiry can never race the cleanup routine's earliest possible deletion

`EXPIRY_BUFFER_AFTER_SCHEDULED_MS` (`src/schedule-batch/media-expiry.ts`) SHALL be STRICTLY less than
`CLEANUP_AFTER_MS` (`src/schedule-batch/cleanup.ts`, 24 hours) — proven by a dedicated regression test
importing both constants directly, never duplicating either value. Because of this, a signed link
minted for any Asset SHALL ALWAYS already be expired by the earliest instant `runScheduleCleanup` could
possibly consider that Asset's hosted object due for deletion (strictly more than `CLEANUP_AFTER_MS`
past `scheduled_at`) — expiry and deletion SHALL NEVER be able to race into a state where Zoho holds a
link that still reads as unexpired against an object that has already been deleted.

#### Scenario: EXPIRY_BUFFER_AFTER_SCHEDULED_MS is strictly under CLEANUP_AFTER_MS

- **GIVEN** `EXPIRY_BUFFER_AFTER_SCHEDULED_MS` and `CLEANUP_AFTER_MS`
- **WHEN** compared directly
- **THEN** `EXPIRY_BUFFER_AFTER_SCHEDULED_MS` is strictly less than `CLEANUP_AFTER_MS`

#### Scenario: A link minted for a due-for-cleanup entry is always already expired by the earliest possible cleanup instant

- **GIVEN** an Asset uploaded 1 day before its own `scheduled_at`
- **WHEN** its `computeMediaExpiry`-derived `expiresAt` is compared against the earliest instant
  `isDueForCleanup` could return `true` for that same `scheduled_at`
- **THEN** `expiresAt` is strictly earlier than that earliest-due instant

### Requirement: Every hosted slide is uploaded under a fresh, unguessable key with an Asset-derived expiry

Both orchestration shells SHALL host every eligible Asset's every slide under a fresh, unguessable key
and an Asset-derived expiry, never a fixed default. `src/commands/export-schedule.ts` (the CSV/S3
fallback path) and `src/commands/schedule-via-zoho-mcp.ts` (the MCP-primary path, ADR-0020) SHALL, for
every eligible Asset's every slide: mint a fresh `randomMediaKeyToken()` (`src/media-host/token.ts`),
build the hosted key via `scheduleMediaKey(brand, run, ideaShortName, slideBaseName, token)`
(`src/schedule-batch/media-key.ts`), derive that Asset's own `expiresInSeconds` via
`computeMediaExpiry(scheduledAtIso, now)` — using the SAME `scheduled_at` instant the command already
derives for its own manifest/ledger stamp, never a second, independent clock read — and pass BOTH into
`mediaHost.upload(destPath, key, { expiresInSeconds })`. Every slide of the SAME Asset SHALL share the
SAME derived `expiresInSeconds` (one `scheduled_at` per Asset); DIFFERENT slides of the SAME Asset SHALL
each get a DIFFERENT token.

#### Scenario: export-schedule.ts hosts each slide under a distinct, unguessable key with the Asset's own derived expiry

- **GIVEN** an eligible Asset with 7 downloaded slides, exported via `/export-schedule`
- **WHEN** the export runs against a `FakeMediaHost`
- **THEN** every recorded `uploadCalls` entry's `key` matches
  `<brand>/<run>/<idea-short-name>/<token>/<slide-base-name>.jpg` with a DIFFERENT token per slide
- **AND** every recorded `uploadCalls` entry's `expiresInSeconds` equals
  `computeMediaExpiry(asset.scheduled_at, now).expiresInSeconds`

#### Scenario: schedule-via-zoho-mcp.ts hosts each slide the same way, keyed off the MCP plan's own scheduledAtUtc

- **GIVEN** an eligible Asset with 7 downloaded slides, scheduled via `scheduleViaZohoMcpCommand`
- **WHEN** the command runs against a `FakeMediaHost` and a `FakeZohoSchedulePort`
- **THEN** every recorded `uploadCalls` entry's `key` carries a distinct token per slide
- **AND** every recorded `uploadCalls` entry's `expiresInSeconds` equals
  `computeMediaExpiry(planned.scheduledAtUtc, now).expiresInSeconds`

### Requirement: A schedule whose signed link cannot reach its own post time refuses the WHOLE export loudly, before any I/O

`validateWithinPresignWindow` SHALL be a PURE function (`src/schedule-batch/media-expiry.ts`,
`validateWithinPresignWindow(scheduledAtIsos, uploadedAtIso)`) and SHALL return `{ ok: true }` when
EVERY given scheduled time's signed link (per
`computeMediaExpiry`) reaches at least as far as that scheduled time itself, or `{ ok: false, violations
}` naming EVERY offending index (never stopping at the first) otherwise — mirroring `schedule.ts`'s
`validateSlotsFuture` exactly (issue #198 QA Round 1 Defect #1: a capped expiry must never ship
silently, extending that SAME loud-refusal treatment to the far-future case rather than a second,
independent mechanism). A schedule that is merely `cappedByAwsLimit` (its ideal 1-hour post-scheduled
buffer trimmed away) but whose link STILL reaches the scheduled time itself SHALL NOT be a violation —
only `expiresAt < scheduledAtIso` (the link is provably dead before the post is even due) counts.

Both orchestration shells SHALL call this validation, from the SAME derived slots their own near-future
`validateSlotsFuture` check already runs against, BEFORE any file is written, any media hosted, or any
Zoho call made: `src/commands/export-schedule.ts` calls it directly, refusing with an `EXPORT REFUSED`
message naming every violating Idea's own scheduled time, how far past AWS's ~7-day ceiling it sits
(`formatOverageDuration`), and that rescheduling within the window or re-exporting closer to the event
is the fix; `src/schedule-batch/mcp-plan.ts`'s `buildMcpSchedulePlan` calls it the SAME way, returning
`{ ok: false, reason: "presign-window", message }` with the SAME naming/guidance shape, which
`src/commands/schedule-via-zoho-mcp.ts` forwards verbatim (mirroring how it already forwards that
module's `"lead-window"` refusal). Both shells' own per-slide hosting loop additionally asserts, as an
explicit internal-error guard (never a silent drift), that the Asset it is about to host was never
capable of tripping this condition in the first place.

#### Scenario: validateWithinPresignWindow: ok: true for a schedule sitting exactly at the 7-day ceiling, even though it is capped

- **GIVEN** a `scheduledAtIso` exactly `MAX_PRESIGN_SECONDS` after `uploadedAtIso`
- **WHEN** `validateWithinPresignWindow` is called
- **THEN** the result is `{ ok: true }`, even though that same scheduled time's `computeMediaExpiry`
  reports `cappedByAwsLimit: true`

#### Scenario: validateWithinPresignWindow: ok: false one millisecond past that same ceiling, naming the violation

- **GIVEN** a `scheduledAtIso` one millisecond past `uploadedAtIso + MAX_PRESIGN_SECONDS`
- **WHEN** `validateWithinPresignWindow` is called
- **THEN** the result is `{ ok: false }` with exactly one violation naming that index, its
  `scheduledAtIso`, the actual (earlier) `expiresAt`, and a positive `overageMs`

#### Scenario: export-schedule.ts refuses the WHOLE export loudly, writing and hosting nothing, for a far-future schedule

- **GIVEN** an eligible Asset whose derived schedule slot sits beyond AWS's ~7-day signed-link ceiling
  from "now"
- **WHEN** `/export-schedule` runs
- **THEN** it returns an `EXPORT REFUSED` message naming that Asset's Idea id and the ~7-day ceiling
- **AND** no file is written, no `convertToJpg`/`upload` call is made, and no `scheduled_at` is stamped

#### Scenario: buildMcpSchedulePlan refuses with reason "presign-window", and schedule-via-zoho-mcp.ts forwards it, hosting nothing

- **GIVEN** an eligible Asset whose derived schedule slot sits beyond AWS's ~7-day signed-link ceiling
  from "now"
- **WHEN** `buildMcpSchedulePlan` is called directly, and separately when `scheduleViaZohoMcpCommand`
  runs the same scenario end to end
- **THEN** `buildMcpSchedulePlan` returns `{ ok: false, reason: "presign-window" }` naming that Asset's
  Idea id
- **AND** `scheduleViaZohoMcpCommand` forwards that message, making zero `ZohoSchedulePort` calls and
  zero `MediaHostPort.upload` calls, and stamps no `scheduled_at`

### Requirement: The existing cleanup routine needs no change to keep deleting hosted media correctly

`runScheduleCleanup` (`src/schedule-batch/cleanup-runner.ts`) SHALL continue to delete a due Asset
entry's hosted media by the EXACT keys recorded in its own manifest (`s3_keys`) — it SHALL NEVER
reconstruct a key from its Brand/run/Idea/slide-name components. Because of this, the new unguessable
token segment `scheduleMediaKey` folds into every key SHALL require NO change to the cleanup routine at
all — every pre-existing cleanup test SHALL continue to pass unmodified.

#### Scenario: Cleanup deletes a token-bearing key exactly as recorded, with no key reconstruction

- **GIVEN** a manifest entry whose `s3_keys` carry the new
  `<brand>/<run>/<idea-short-name>/<token>/<slide-base-name>.jpg` shape
- **WHEN** `runScheduleCleanup` finds that entry due
- **THEN** it calls `mediaHost.delete` with EXACTLY that recorded key string, unmodified

