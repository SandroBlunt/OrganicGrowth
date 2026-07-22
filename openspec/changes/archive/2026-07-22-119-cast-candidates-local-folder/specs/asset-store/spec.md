## ADDED Requirements

### Requirement: A Cast candidate optionally carries a durable local download path, preferring it over the remote URL

`LedgerCastCandidate` (`src/asset/asset.ts`) SHALL gain an optional `path` field alongside its existing
`identifier`/`url` — mirroring `LedgerAssetRecord.asset_paths` vs its legacy `asset_url`: a durable LOCAL
file path is preferred wherever one exists (downloaded by `src/asset/cast-candidates.ts`'s
`downloadCastCandidates`, issue #119), and the remote `url` remains the fallback for a candidate recorded
before this field existed, or whose download genuinely could not be completed. `parseCastCandidate`
SHALL include `path` in its parsed result ONLY when it is itself a non-empty string (never assigned as
`undefined`, keeping the result clean under `exactOptionalPropertyTypes`) — a missing or malformed `path`
SHALL degrade to an identifier/url-only candidate rather than dropping the whole candidate, and SHALL
NEVER throw. `parseCastArray` SHALL preserve this per-candidate: candidates with and without a `path` may
sit side by side in the same array.

#### Scenario: A candidate with a local path parses with path alongside identifier/url

- **GIVEN** a raw Cast candidate `{ identifier: "cast-1", url: "https://x/1.png", path:
  "data/brands/mundotip/ideas/2026-W22/idea-01.character-explainer-with-cast.cast/1-cast-1.png" }`
- **WHEN** `parseCastCandidate` parses it
- **THEN** the result carries `identifier`, `url`, AND `path`, all unchanged

#### Scenario: A candidate with no path parses fine and omits the path key entirely

- **GIVEN** a raw Cast candidate `{ identifier: "cast-1", url: "https://x/1.png" }` (no `path`)
- **WHEN** `parseCastCandidate` parses it
- **THEN** the result carries `identifier`/`url` only — `path` is OMITTED, never present as `undefined`

#### Scenario: A malformed path is dropped, never the whole candidate

- **GIVEN** a raw Cast candidate whose `path` is an empty string or a non-string value
- **WHEN** `parseCastCandidate` parses it
- **THEN** the result still carries `identifier`/`url` — only the malformed `path` is dropped, and
  parsing never throws

#### Scenario: A mixed Cast array preserves each candidate's own path independently

- **GIVEN** a raw Cast array where some candidates carry a `path` and others do not
- **WHEN** `parseCastArray` parses it
- **THEN** each well-formed candidate is kept with exactly its OWN `path` (present or absent), in order
