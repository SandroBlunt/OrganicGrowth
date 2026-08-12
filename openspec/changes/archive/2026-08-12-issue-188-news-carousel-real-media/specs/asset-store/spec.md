## ADDED Requirements

### Requirement: An Asset carries an optional has_video_slide flag, the News Carousel Recipe's own extension field (ADR-0024, issue #188)

`LedgerAssetRecord` (`src/asset/asset.ts`) SHALL carry an OPTIONAL `has_video_slide: boolean` field —
Recipe-local, mirroring `cast`/`character` being the *Character Explainer with Cast* Recipe's own
extension fields rather than a universal Asset concept. `parseAssetRecord` SHALL keep this field ONLY
when the raw value is `=== true` — a raw `false`, a missing field, or any non-boolean value SHALL
degrade to the field being omitted entirely from the parsed result (never a stray `false` key, never
fabricated), mirroring `scheduled_at`'s own "never fabricated" contract. This field carries no
`AssetStatus`/lifecycle meaning of its own — it exists solely so
`src/schedule-batch/eligibility.ts` can keep a News Carousel Asset carrying a real video slide out of
the images-only Zoho bulk-export path, the SAME way a non-`"news-carousel"` Recipe's video Asset
already is.

#### Scenario: has_video_slide: true parses and round-trips

- **GIVEN** an Asset record with `has_video_slide: true`
- **WHEN** the record is parsed via `parseAssetRecord`
- **THEN** the parsed Asset carries `has_video_slide: true`

#### Scenario: has_video_slide: false is omitted entirely — never a stray false key

- **GIVEN** an Asset record with `has_video_slide: false`
- **WHEN** the record is parsed via `parseAssetRecord`
- **THEN** the parsed Asset carries NO `has_video_slide` key at all

#### Scenario: A missing or malformed has_video_slide is omitted, never fabricated, never throws

- **GIVEN** an Asset record whose `has_video_slide` is absent, or a non-boolean value (e.g. the string
  `"yes"`)
- **WHEN** the record is parsed via `parseAssetRecord`
- **THEN** the parsed Asset carries no `has_video_slide` key at all, and parsing does not throw

#### Scenario: has_video_slide introduces no new AssetStatus

- **GIVEN** an Asset record with `has_video_slide: true` and `status: "produced"`
- **WHEN** the record is parsed
- **THEN** the parsed Asset's `status` is still `"produced"` — no new status is ever produced
