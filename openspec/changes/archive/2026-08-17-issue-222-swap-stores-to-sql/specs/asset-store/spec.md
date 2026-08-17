## MODIFIED Requirements

### Requirement: AssetStore is the typed read/write boundary for an Idea's Assets

`src/asset/store.ts` SHALL expose `loadIdeaAssets(ideaId, ledgerPath)` — returning the Idea's
normalized Assets, `null` when the Idea is not found, `[]` when found with none yet — and
`writeAsset(ideaId, recipe, patch, options)` — a thin write shell that loads the full ledger,
NORMALIZES the target Idea (folding any legacy production status onto the grain BEFORE upserting, so
writing onto a not-yet-migrated Idea never silently drops its legacy data), upserts `recipe`'s Asset
with `patch`, and saves — preserving every other field on the target Idea, every sibling Idea, and
every sibling Asset. An unknown `ideaId` SHALL leave the file untouched (the ledger stays canonical —
never invents a record).

`loadIdeaAssets`/`writeAsset` SHALL ALSO accept a `{ db }` option (a real, migrated `DatabaseSync`,
issue #222) as an ADDITIVE overload on the SAME exported names — never a replacement, never a breaking
change to the file-based branch's own code path or callers. When called with `{ db }`, they SHALL
read/write the `asset` SQL table instead of `ledger.json`, keyed on `(idea_id, recipe_slug)` (the
schema's own `UNIQUE` constraint), with the SAME null-vs-`[]` convention: `null` when no `idea` row
exists for `ideaId`, `[]` for a known Idea with no Assets yet. An unknown `ideaId` SHALL leave the
database untouched, mirroring the file branch. The SQL-backed return shape (`DbAssetRecord`) SHALL be
narrower than the file-based `LedgerAssetRecord` — see the "SQL-backed Asset shape" Requirement below
for exactly which fields are out of scope, and why.

#### Scenario: writeAsset on a not-yet-migrated Idea folds its legacy data before upserting

- **GIVEN** an un-migrated Idea record (`status: "casting"`, top-level `cast` field) and a NEW Recipe
  `"carousel"` to add
- **WHEN** `writeAsset(ideaId, "carousel", { status: "queued" }, options)` is called
- **THEN** the Idea's on-disk record ends up with `status: "accepted"` and TWO Assets: the legacy
  `character-explainer-with-cast` Asset (folded, `in_production`/`pending_gate: "cast"`, carrying the
  Cast candidates) and the new `carousel` Asset (`queued`) — neither is lost

#### Scenario: writeAsset for an unknown Idea leaves the ledger untouched

- **GIVEN** a ledger with no Idea matching `ideaId`
- **WHEN** `writeAsset(ideaId, recipe, patch, options)` is called
- **THEN** the ledger file on disk is unchanged

#### Scenario: The { db } branch upserts one asset row, keyed on (idea_id, recipe_slug), never duplicating

- **GIVEN** a real, migrated database with a valid Idea row, and an Asset already written for
  `"character-explainer-with-cast"`
- **WHEN** `writeAsset(ideaId, "character-explainer-with-cast", { status: "in_production", pending_gate:
  "cast" }, { db })` is called
- **THEN** `loadIdeaAssets(ideaId, { db })` still returns exactly ONE Asset for that Recipe, now with the
  updated `status`/`pending_gate`, and any SIBLING Asset on the same Idea is untouched

#### Scenario: The { db } branch leaves the database untouched for an unknown Idea

- **GIVEN** a real, migrated database with no `idea` row for `ideaId`
- **WHEN** `writeAsset(ideaId, recipe, patch, { db })` is called
- **THEN** `loadIdeaAssets(ideaId, { db })` still returns `null` — no `asset` row was created

#### Scenario: Every EXISTING file-based caller and test is unaffected

- **GIVEN** the existing `src/asset/store.test.ts` suite, written entirely against the `ledgerPath`
  branch, and the four real production modules importing `writeAsset`
- **WHEN** the `{ db }` overload is added
- **THEN** every existing test still passes and every existing caller still compiles, with zero source
  changes to either

## ADDED Requirements

### Requirement: asset_media is stored as rows, replacing the file branch's asset_paths/asset_url fields

`src/asset/store.ts`'s `addAssetMedia`/`addAssetMediaBatch`/`listAssetMedia` SHALL be the typed
boundary for the `asset_media` table — one row per produced media item (image/video/audio), ordered by
`ordinal`. `addAssetMedia` SHALL delegate to `src/db/media-ref.ts`'s `insertAssetMedia`, so an
absolute/home-shorthand/traversal `storageKey` is rejected (`StorageKeyError`) BEFORE any row is
written — the same store-boundary guard the rest of the SQLite foundation enforces, never
re-implemented a second time. `addAssetMediaBatch` SHALL write every item inside ONE transaction
(`withTransaction`): a failure on any item (an invalid storage key, or a duplicate `ordinal` on the
same Asset — the schema's own `UNIQUE (asset_id, ordinal)`) SHALL roll back the WHOLE batch, including
items that individually would have succeeded.

#### Scenario: addAssetMedia rejects an absolute storage key before writing any row

- **GIVEN** a real, migrated database with a valid Asset
- **WHEN** `addAssetMedia` is called with an absolute `storageKey`
- **THEN** it throws `StorageKeyError`, and `listAssetMedia` for that Asset returns `[]`

#### Scenario: addAssetMediaBatch rolls back the WHOLE batch when one item fails partway through

- **GIVEN** a real, migrated database with a valid Asset, and a batch of three media items where the
  third duplicates the first's `ordinal`
- **WHEN** `addAssetMediaBatch` is called with that batch
- **THEN** it throws a uniqueness error, and `listAssetMedia` for that Asset returns `[]` — not even the
  first two, individually-valid items survive

#### Scenario: listAssetMedia returns every row for an Asset, in ordinal order

- **GIVEN** media items added out of ordinal order (`ordinal: 1` then `ordinal: 0`)
- **WHEN** `listAssetMedia` is called
- **THEN** the returned array is ordered `[0, 1]` by `ordinal`, not insertion order

### Requirement: The SQL-backed Asset shape is narrower than the file-based LedgerAssetRecord, by documented design

`DbAssetRecord` (the `{ db }` branch's return shape) SHALL carry exactly the columns the `asset` table
(`src/db/schema.ts`, frozen from issue #201) defines: `id`, `ideaId`, `recipe`, `status`,
`pending_gate`, `spec` (the Production Spec JSON, from `spec_json`), `produced_at`, `scheduled_at`,
`camera_hub_uploaded_at`, `zoho_schedule_reference`, `created_at`, `updated_at`. It SHALL NOT carry
`cast`/`character` (the *Character Explainer with Cast* Recipe's own gate-local fields — no column
exists, and the Recipe's own survival is an explicitly open epic question), `has_video_slide` (the News
Carousel Recipe's own extension flag — no column exists), or `metrics`/`tracked_at`/`history`/
`post_url`/`posted_at`/`performance_score` (ADR-0028 moves these OFF the Asset entirely onto
`post`/`metric_snapshot`/`performance_score`, keyed by Channel — not built by this ticket). This is a
documented, deliberate scope boundary, not a silent truncation of the file-based shape.

#### Scenario: zoho_schedule_reference round-trips verbatim, string or array

- **GIVEN** a Production Spec-bearing Asset written via `writeAsset(..., { zoho_schedule_reference:
  ["fb_post_1", "ig_post_1"] }, { db })`
- **WHEN** it is read back via `loadIdeaAssets(ideaId, { db })`
- **THEN** `zoho_schedule_reference` equals `["fb_post_1", "ig_post_1"]`, unchanged in shape

#### Scenario: A patch touching only cast/character/metrics-shaped fields is rejected by the type system, not silently dropped

- **GIVEN** the `DbAssetPatch` type, which has no `cast`/`character`/`metrics`/`post_url` keys
- **WHEN** a caller attempts to pass one of those keys to the `{ db }` overload of `writeAsset`
- **THEN** it is a compile-time TypeScript error, not a runtime silent no-op
