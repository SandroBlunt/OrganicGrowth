## ADDED Requirements

### Requirement: Copy Variants are stored as rows keyed to (asset, channel), not nested JSON keyed to a platform string

`src/copy/store.ts` SHALL expose `upsertCopyVariant`/`upsertCopyVariants`/`listCopyVariants`/`getCopyVariantForChannel` as the typed SQL boundary for the `copy_variant` table, `{ db }`-only —
genuinely new. Each variant SHALL be keyed to a real `channel_id` foreign key (not a bare platform
string, as the file-based `Copy.variants[]` was) — enforced by the schema's own
`UNIQUE (asset_id, channel_id)` and `FOREIGN KEY (channel_id) REFERENCES channel(id)`.
`upsertCopyVariant` SHALL insert a new row when none exists for `(assetId, channelId)`, and UPDATE the
existing row in place otherwise — never a duplicate.

#### Scenario: upsertCopyVariant creates a new variant

- **GIVEN** an Asset with no Copy variant yet for a given Channel
- **WHEN** `upsertCopyVariant` is called with a caption and hashtags
- **THEN** `getCopyVariantForChannel` returns a row with that caption and hashtags

#### Scenario: upsertCopyVariant updates the SAME row on a second call, never duplicating

- **GIVEN** an Asset with a Copy variant already committed for a Channel
- **WHEN** `upsertCopyVariant` is called again for the SAME `(assetId, channelId)` with a different
  caption
- **THEN** `listCopyVariants` still returns exactly one row for that Asset, with the NEW caption

#### Scenario: An unknown channelId is rejected

- **GIVEN** an Asset and a `channelId` with no committed Channel
- **WHEN** `upsertCopyVariant` is called with that `channelId`
- **THEN** it throws a foreign-key error

### Requirement: unresolvedMentions is carried into mentions_json only when non-empty

`upsertCopyVariant` SHALL serialize `CopyVariantInput.unresolvedMentions` into the `mentions_json`
column when present, and the read-back `CopyVariantRecord.unresolvedMentions` SHALL be present ONLY
when at least one mention survives — an absent or empty list SHALL degrade to the field being omitted
entirely on read, never a stray empty array.

#### Scenario: unresolvedMentions round-trips when present

- **GIVEN** a Copy variant with `unresolvedMentions: ["Unknown Startup", "Ghost Co"]`
- **WHEN** it is upserted, then read back via `getCopyVariantForChannel`
- **THEN** `unresolvedMentions` equals `["Unknown Startup", "Ghost Co"]`

#### Scenario: unresolvedMentions is absent, not an empty array, when never given

- **GIVEN** a Copy variant upserted with no `unresolvedMentions`
- **WHEN** it is read back
- **THEN** the returned record has no `unresolvedMentions` key at all

### Requirement: upsertCopyVariants writes a multi-Channel batch atomically

`upsertCopyVariants` SHALL write every item in `variants` inside ONE transaction (`withTransaction`) —
composing one Copy variant per targeted Channel platform (ADR-0025) either lands completely or not at
all. If any item fails (an unknown `channelId`), the WHOLE batch SHALL roll back, including variants
that individually would have succeeded.

#### Scenario: A fully valid batch commits every variant

- **GIVEN** an Asset and two real Channels
- **WHEN** `upsertCopyVariants` is called with one variant per Channel
- **THEN** `listCopyVariants` returns both

#### Scenario: A failure partway through the batch leaves nothing behind

- **GIVEN** an Asset, one real Channel, and one non-existent `channelId`
- **WHEN** `upsertCopyVariants` is called with a variant for each, the real Channel FIRST in the array
- **THEN** it throws, and `listCopyVariants` returns `[]` — the real Channel's variant does not survive
  even though it would individually have succeeded
