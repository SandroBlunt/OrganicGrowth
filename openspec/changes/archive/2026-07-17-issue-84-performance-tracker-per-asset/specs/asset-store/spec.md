## MODIFIED Requirements

### Requirement: An Idea carries a list of per-Recipe Assets; production state lives on the Asset

The system SHALL define an `AssetStatus` type — `"queued" | "in_production" | "produced" | "posted" |
"tracking" | "scored"` — and a `LedgerAssetRecord` shape `{ recipe, status, pending_gate?, spec_path?,
copy?, cast?, character?, asset_url?, produced_at?, post_url?, posted_at?, performance_score?,
metrics?, tracked_at?, history? }` (`src/asset/asset.ts`). Only `recipe` and `status` are required.
`casting` SHALL NOT be a valid `AssetStatus` — it is retired; the *Character Explainer with Cast*
Recipe's Cast pick is represented as `status: "in_production"` with `pending_gate: "cast"` — a PAUSE
inside `in_production`, never a stage of its own. An Idea SHALL carry `assets: LedgerAssetRecord[]`,
one entry per chosen Recipe. `copy` SHALL be a STRUCTURED value — `{ caption: string, hashtags:
string[] }` (`src/copy/contract.ts`'s `Copy`, ADR-0012, issue #58) — never a bare string; a raw record
whose `copy` is missing a non-empty `caption`, or is otherwise not an object, SHALL parse with NO
`copy` field (never a garbled placeholder), while a present-but-non-array `hashtags` degrades to `[]`
rather than failing the whole Asset.

`metrics` (issue #84) SHALL be `{ shares: number, comments: number, reactions: number, views: number }`
— the four public readings behind the Asset's CURRENT `performance_score` — required to ALL be finite,
non-negative numbers or the whole `metrics` value SHALL be omitted (never half-fabricated). `tracked_at`
SHALL be an ISO-8601 string timestamp of the most recent tracking pull. `history` SHALL be an array of
`{ tracked_at, performance_score, metrics }` snapshots of EARLIER pulls (never the current one) —
malformed entries SHALL be dropped individually, never invalidating the whole array or the Asset.

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

#### Scenario: A well-formed metrics/tracked_at/history reading parses onto the Asset

- **GIVEN** a raw Asset record with `metrics: { shares: 4, comments: 10, reactions: 55, views: 1200 }`,
  `tracked_at: "2026-06-13T12:00:00.000Z"`, and one well-formed `history` entry
- **WHEN** the record is parsed (`parseAssetRecord`)
- **THEN** the resulting Asset carries `metrics`, `tracked_at`, and `history` exactly as given

#### Scenario: A metrics reading missing any one of the four fields is omitted entirely, never half-fabricated

- **GIVEN** a raw Asset record with `metrics: { shares: 1, comments: 1, reactions: 1 }` (missing
  `views`)
- **WHEN** the record is parsed
- **THEN** the resulting Asset has NO `metrics` field at all — not a partial one defaulting the
  missing field to `0`

#### Scenario: A malformed history entry is dropped without invalidating the whole array

- **GIVEN** a raw `history` array with one well-formed snapshot and one malformed entry (missing
  `performance_score`)
- **WHEN** the record is parsed
- **THEN** the resulting `history` contains only the well-formed snapshot
