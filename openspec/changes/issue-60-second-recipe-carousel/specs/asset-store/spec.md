## MODIFIED Requirements

### Requirement: An Idea carries a list of per-Recipe Assets; production state lives on the Asset

The system SHALL define an `AssetStatus` type — `"queued" | "in_production" | "produced" | "posted" |
"tracking" | "scored"` — and a `LedgerAssetRecord` shape `{ recipe, status, pending_gate?, spec_path?,
copy?, cast?, character?, asset_url?, asset_urls?, produced_at?, post_url?, posted_at?,
performance_score? }` (`src/asset/asset.ts`). Only `recipe` and `status` are required. `casting` SHALL
NOT be a valid `AssetStatus` — it is retired; the *Character Explainer with Cast* Recipe's Cast pick is
represented as `status: "in_production"` with `pending_gate: "cast"` — a PAUSE inside `in_production`,
never a stage of its own. An Idea SHALL carry `assets: LedgerAssetRecord[]`, one entry per chosen
Recipe. `copy` SHALL be a STRUCTURED value — `{ caption: string, hashtags: string[] }`
(`src/copy/contract.ts`'s `Copy`, ADR-0012, issue #58) — never a bare string; a raw record whose `copy`
is missing a non-empty `caption`, or is otherwise not an object, SHALL parse with NO `copy` field (never
a garbled placeholder), while a present-but-non-array `hashtags` degrades to `[]` rather than failing
the whole Asset.

`asset_url` (a single-media Recipe's ONE finished file) and `asset_urls` (a multi-media Recipe's
ORDERED list of finished files — issue #60) are MUTUALLY EXCLUSIVE on one Asset: a real Asset SHALL
carry AT MOST one of the two. `parseAssetUrls` SHALL accept only a non-empty array of non-empty
strings — an empty array or any non-string entry SHALL degrade the WHOLE field to absent (never a
partially-garbled list). `assetMediaUrls(asset)` SHALL return `asset.asset_urls` when present,
otherwise `[asset.asset_url]` when THAT is present, otherwise `[]` — the read-side accessor a caller
uses for "every media URL this Asset has" without needing to know which Recipe produced them.

#### Scenario: isAssetStatus rejects the retired "casting" value

- **GIVEN** the string `"casting"`
- **WHEN** `isAssetStatus("casting")` is called
- **THEN** it returns `false`

#### Scenario: A Cast-gate pause is represented as in_production + pending_gate, not a stage

- **GIVEN** an Asset for the *Character Explainer with Cast* Recipe paused at its Cast pick
- **WHEN** the Asset record is inspected
- **THEN** its `status` is `"in_production"` and its `pending_gate` is `"cast"`

#### Scenario: A structured Copy parses onto the Asset

- **GIVEN** a raw Asset record with `copy: { caption: "Great tip! ☀️", hashtags: ["#lifehacks"] }`
- **WHEN** the record is parsed (`parseAssetRecord`)
- **THEN** the resulting Asset's `copy` is the SAME structured `{ caption, hashtags }` object — not a
  string, not flattened

#### Scenario: A malformed copy value never crashes the parse

- **GIVEN** a raw Asset record whose `copy` is a bare string, or an object missing `caption`, or whose
  `hashtags` is not an array
- **WHEN** the record is parsed
- **THEN** the malformed `copy` is EITHER omitted entirely (missing/blank `caption`) or degraded safely
  (`hashtags` defaults to `[]`) — the parse never throws

#### Scenario: A multi-media Recipe's asset_urls parses onto the Asset, asset_url absent

- **GIVEN** a raw Asset record for `news-carousel` with `asset_urls: [<5 image URLs>]` and no
  `asset_url`
- **WHEN** the record is parsed
- **THEN** the resulting Asset's `asset_urls` is the same ordered list of 5 URLs
- **AND** `asset_url` is `undefined`

#### Scenario: An empty asset_urls array is dropped, never presented as a garbled multi-media Asset

- **GIVEN** a raw Asset record with `asset_urls: []`
- **WHEN** the record is parsed
- **THEN** `asset_urls` is absent from the result (not an empty array)

#### Scenario: assetMediaUrls returns the right list for either media shape, and [] for neither

- **GIVEN** three Assets: one with `asset_url` only, one with `asset_urls` only, one with neither
- **WHEN** `assetMediaUrls` is called on each
- **THEN** it returns `[asset_url]`, `asset_urls` (unchanged), and `[]`, respectively
