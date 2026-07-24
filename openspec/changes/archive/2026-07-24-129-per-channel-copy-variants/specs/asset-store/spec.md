## ADDED Requirements

### Requirement: parseCopy/parseCopyVariant parse an Asset's Copy variants defensively; the ledger records every variant

The system SHALL provide `parseCopyVariant` and `parseCopyVariants` (`src/asset/asset.ts`), parsing one
raw `CopyVariant` (`{ platform, caption, hashtags }`) and an array of them respectively. A variant
missing a non-empty `platform` or `caption` SHALL be dropped (returns `null`); a missing/non-array
`hashtags` SHALL degrade to `[]`; a non-array `variants` input SHALL yield `[]` — never throw.
`parseCopy` SHALL be extended, additively, to include the parsed `variants` array on the returned `Copy`
ONLY when at least one well-formed entry parses; a raw Copy with no `variants` key, a malformed
(non-array) `variants` value, or a `variants` array whose every entry is malformed SHALL all parse to
the exact same plain `{ caption, hashtags }` shape `parseCopy` already returned before this capability —
never a `variants: []` key. Because `LedgerAssetRecord.copy` is written through the existing
`AssetStore`/`writeAsset` path unchanged, saving a Copy carrying `variants` onto an Asset records every
variant on the Brand's `ledger.json` (always-rule 7, ledger-as-source-of-truth) with no additional
write path.

#### Scenario: A raw Copy with no variants key parses to the exact pre-#129 shape

- **GIVEN** a raw Copy object with only `caption` and `hashtags`
- **WHEN** `parseCopy` is called
- **THEN** the result has only `caption` and `hashtags` — no `variants` key at all

#### Scenario: Well-formed variants parse verbatim, labeled by platform

- **GIVEN** a raw Copy carrying a `variants` array of well-formed `{ platform, caption, hashtags }`
  entries
- **WHEN** `parseCopy` is called
- **THEN** the result's `variants` array deep-equals the input, in order

#### Scenario: A malformed variant entry is dropped; well-formed siblings are kept

- **GIVEN** a raw Copy's `variants` array mixing well-formed entries with malformed ones (missing
  `platform`, missing `caption`, or not an object)
- **WHEN** `parseCopy` is called
- **THEN** the result's `variants` array contains only the well-formed entries, in their original order

#### Scenario: A variants array that is entirely malformed degrades to the plain shape

- **GIVEN** a raw Copy whose `variants` value is either not an array, or an array whose every entry is
  malformed
- **WHEN** `parseCopy` is called
- **THEN** the result has only `caption` and `hashtags` — no `variants` key
