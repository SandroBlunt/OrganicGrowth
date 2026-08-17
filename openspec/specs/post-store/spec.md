# post-store Specification

## Purpose
TBD - created by archiving change issue-203-job-claiming-performance-time-series. Update Purpose after archive.
## Requirements
### Requirement: Post is its own record, keyed to an Asset and a Channel

`src/post/store.ts`'s `recordPost` SHALL be a KEYED UPSERT on `(assetId, channelId)` (the schema's own
`UNIQUE` constraint, ADR-0028): a first call for a given pair INSERTS a new `post` row (carrying
`postUrl`/`postedAt`/an optional `trackingState`) and returns its id; a later call for the EXACT SAME
pair UPDATES that same row in place (`post_url`/`posted_at`/`tracking_state` refreshed) rather than
throwing or duplicating — the SQL-backed sibling of `/log-post`'s existing re-log behaviour. Publishing
the SAME Asset to a DIFFERENT Channel SHALL yield a SECOND, fully independent Post row.

#### Scenario: A new (asset, channel) pair inserts a Post row

- **GIVEN** an Asset and a Channel with no logged Post yet
- **WHEN** `recordPost` is called
- **THEN** a new `post` row is created, carrying the given `postUrl`/`postedAt`

#### Scenario: Re-recording the same (asset, channel) pair updates in place, never duplicates

- **GIVEN** a Post already recorded for `(assetId, channelId)`
- **WHEN** `recordPost` is called again for the SAME pair with a corrected URL
- **THEN** the SAME row id is returned, its `postUrl` reflects the correction, and no second row exists
  for that pair

#### Scenario: One Asset published to two Channels yields two independent Post rows

- **GIVEN** one Asset published to a Facebook Channel and a LinkedIn Channel
- **WHEN** `recordPost` is called once per Channel
- **THEN** two DISTINCT `post` rows exist, one per Channel, each independently readable and updatable

#### Scenario: An unknown assetId or channelId is rejected

- **GIVEN** an `assetId` or `channelId` that does not exist
- **WHEN** `recordPost` is called
- **THEN** it throws a foreign-key constraint error and no row is written

### Requirement: A Post's reads never fabricate a result and its tracking state can be updated in place

`getPost(db, id)` and `getPostForAssetAndChannel(db, assetId, channelId)` SHALL return `null` — never
throw — when no matching Post exists. `listPostsForAsset(db, assetId)` SHALL return every Post logged
for that Asset, across every Channel it was actually published to (`[]` when none). `updatePostTrackingState(db, postId, trackingState, now)` SHALL update ONLY that field on the named
Post, throwing a clear, named error for an unknown `postId` and changing nothing.

#### Scenario: Reads return null/[] for an Asset with no logged Post

- **GIVEN** an Asset with no Post logged for any Channel
- **WHEN** `getPostForAssetAndChannel` and `listPostsForAsset` are called
- **THEN** the first returns `null` and the second returns `[]`

#### Scenario: listPostsForAsset returns every Channel's Post for one Asset

- **GIVEN** an Asset with a logged Post on two different Channels
- **WHEN** `listPostsForAsset` is called
- **THEN** it returns both Posts, each carrying its own `channelId`

#### Scenario: updatePostTrackingState throws for an unknown postId

- **GIVEN** a `postId` that does not exist
- **WHEN** `updatePostTrackingState` is called
- **THEN** it throws, naming the id, and no row is written

