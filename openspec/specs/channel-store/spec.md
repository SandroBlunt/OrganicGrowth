# channel-store Specification

## Purpose
TBD - created by archiving change issue-222-swap-stores-to-sql. Update Purpose after archive.
## Requirements
### Requirement: ChannelStore is the typed SQL boundary for the channel table

`src/channel/store.ts` SHALL expose `createChannel`/`getChannel`/`getChannelByPlatform`/`listChannelsForBrand`/`getPrimaryChannel`/`setPrimaryChannel` as the typed read/write boundary for the `channel` table,
`{ db }`-only — genuinely new, mirroring `brand-store`'s own reasoning (there was no pre-existing
`{ ledgerPath }`-taking "Channel store" to port; a Brand's Channel list was a plain array field on
`brand-profile.yaml`). `createChannel` SHALL default `isPrimary`/`isTracked` to `false` and `url` to
`""` when omitted, mirroring the schema's own column defaults.

#### Scenario: createChannel with defaults

- **GIVEN** a `ChannelInput` carrying only `brandId` and `platform`
- **WHEN** `createChannel` is called
- **THEN** the returned row's `isPrimary` and `isTracked` are both `false`

### Requirement: createChannel enforces the schema's own FK/CHECK/unique-index constraints, never re-implementing them in application code

`createChannel` SHALL rely on the `channel` table's own constraints rather than duplicating them:
an unknown `brandId` (FOREIGN KEY) is rejected; a `platform` outside `KNOWN_PLATFORMS` (CHECK) is
rejected; a second `isPrimary: true` Channel for a Brand that already has one (the partial unique index
`idx_channel_one_primary_per_brand`, ADR-0019) is rejected.

#### Scenario: An unknown brandId is rejected

- **GIVEN** no committed Brand for a given id
- **WHEN** `createChannel` is called with that id as `brandId`
- **THEN** it throws a foreign-key error

#### Scenario: A platform outside KNOWN_PLATFORMS is rejected

- **GIVEN** a `platform` value not in `KNOWN_PLATFORMS`
- **WHEN** `createChannel` is called with it
- **THEN** it throws a CHECK-constraint error

#### Scenario: A second primary Channel for the same Brand is rejected

- **GIVEN** a Brand with one Channel already `isPrimary: true`
- **WHEN** `createChannel` is called again for the SAME Brand with `isPrimary: true`
- **THEN** it throws a uniqueness error

### Requirement: Channel lookups are scoped to their Brand and null-for-unknown

`getChannel` SHALL return `null` for an unknown id. `getChannelByPlatform` SHALL return `null` when the
given Brand has no Channel for that platform — including when a DIFFERENT Brand has one, which SHALL
NOT be returned. `listChannelsForBrand` SHALL return only the given Brand's Channels, sorted by
platform. `getPrimaryChannel` SHALL return `null` when no Channel is marked primary yet.

#### Scenario: getChannelByPlatform never returns another Brand's Channel

- **GIVEN** Brand A with a `"facebook"` Channel and Brand B with an `"instagram"` Channel
- **WHEN** `getChannelByPlatform(db, brandA, "instagram")` is called
- **THEN** it returns `null` — Brand B's Channel is never returned for Brand A's lookup

#### Scenario: getPrimaryChannel returns null before any Channel is marked primary

- **GIVEN** a Brand with one non-primary Channel
- **WHEN** `getPrimaryChannel` is called
- **THEN** it returns `null`

### Requirement: setPrimaryChannel atomically moves primary from one Channel to another

`setPrimaryChannel` SHALL demote whichever Channel (if any) currently holds `isPrimary` on the target
Channel's Brand and promote the target — a two-row write run inside `withTransaction`, so it can never
land half-done (both marked primary, violating the schema's own partial unique index, or both
demoted). For an unknown `channelId` it SHALL throw a clear error naming the id and change nothing.

#### Scenario: setPrimaryChannel demotes the old primary and promotes the new one

- **GIVEN** a Brand with Channel A marked primary and Channel B not
- **WHEN** `setPrimaryChannel(db, channelB)` is called
- **THEN** `getPrimaryChannel` returns Channel B, and Channel A's `isPrimary` is now `false`

#### Scenario: setPrimaryChannel on an unknown channel id throws and changes nothing

- **GIVEN** a Brand with Channel A marked primary
- **WHEN** `setPrimaryChannel` is called with an id that does not exist
- **THEN** it throws an error naming the id, and Channel A is still primary

