## ADDED Requirements

### Requirement: An Asset carries an optional camera_hub_uploaded_at marker, the News Short Script Recipe's own extension field (ADR-0027, issue #189)

`LedgerAssetRecord` (`src/asset/asset.ts`) SHALL carry an OPTIONAL `camera_hub_uploaded_at: string`
field — Recipe-local, mirroring `scheduled_at`/`zoho_schedule_reference`/`has_video_slide` being a
convenience marker rather than a universal Asset concept with lifecycle meaning of its own.
`parseAssetRecord` SHALL keep this field ONLY when the raw value is a non-empty string — a missing,
blank, or non-string value SHALL degrade to the field being omitted entirely from the parsed result
(never fabricated), mirroring `scheduled_at`'s own "never fabricated" contract. This field carries NO
`AssetStatus`/lifecycle meaning of its own — ADR-0011's six-stage vocabulary is unchanged; a Recipe's
Asset with `camera_hub_uploaded_at` set keeps whatever `status` it already had. It exists solely so
`src/camera-hub/news-short-script.ts`'s `selectUnuploadedNewsShortScripts` can skip an Asset already
uploaded to Camera Hub, so re-running the offer never double-uploads.

#### Scenario: A well-formed camera_hub_uploaded_at parses and round-trips

- **GIVEN** an Asset record with a well-formed ISO-8601 `camera_hub_uploaded_at`
- **WHEN** the record is parsed via `parseAssetRecord`, written, and read back
- **THEN** the read-back Asset's `camera_hub_uploaded_at` is byte-identical to the original value

#### Scenario: A missing or malformed camera_hub_uploaded_at is omitted, never fabricated, never throws

- **GIVEN** an Asset record whose `camera_hub_uploaded_at` is absent, blank, or a non-string value (e.g.
  a number)
- **WHEN** the record is parsed via `parseAssetRecord`
- **THEN** the parsed Asset carries no `camera_hub_uploaded_at` key at all, and parsing does not throw

#### Scenario: camera_hub_uploaded_at introduces no new AssetStatus

- **GIVEN** an Asset record with a well-formed `camera_hub_uploaded_at` and any valid `status` (e.g.
  `"posted"`)
- **WHEN** the record is parsed
- **THEN** the parsed Asset's `status` is unchanged — no new status is ever produced

#### Scenario: A write to one Asset does not erase a sibling Asset's camera_hub_uploaded_at

- **GIVEN** an Idea with two Assets, the first carrying `camera_hub_uploaded_at`
- **WHEN** the second Asset is updated via `upsertAsset`
- **THEN** re-reading the Idea's Assets shows the first Asset's `camera_hub_uploaded_at` unchanged
