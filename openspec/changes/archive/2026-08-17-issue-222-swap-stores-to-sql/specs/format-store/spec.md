## ADDED Requirements

### Requirement: A { db }-backed CRUD layer is additive to the existing YAML-file reader

`src/format/store.ts` SHALL expose `createFormat`/`getFormatBySlug`/`getFormatById`/`listFormatsForBrand`/`updateFormat` as a `{ db }`-only, ADDITIVE CRUD layer over the `format` SQL table — the existing
`loadFormat`/`listFormatSlugs`/`parseFormatFile` YAML-file-reading functions (and their own test suite)
SHALL be unaffected: a Format's YAML file stays the Operator-authored document (ADR-0029), and this new
layer does not read or write it. `format` is a real, REFERENCED SQL table — `run.format_id`,
`idea.format_id`, and `baseline_prompt.format_id` all foreign-key into it — so a `format` row is
required plumbing for the rest of the schema to be usable at all, not an optional convenience.
`createFormat` SHALL default `cadence` to `"weekly"`, `ideasPerRun` to `10`, `sourceMode` to `"peer"`,
and `defaultRecipes` to `[]` when omitted, mirroring the YAML reader's own established defaults.

#### Scenario: createFormat with defaults matches the YAML reader's own established defaults

- **GIVEN** a `FormatDbInput` carrying only `brandId`, `slug`, `name`, and `voice`
- **WHEN** `createFormat` is called
- **THEN** the returned row's `cadence` is `"weekly"`, `ideasPerRun` is `10`, `sourceMode` is `"peer"`,
  and `defaultRecipes` is `[]`

#### Scenario: A duplicate (brandId, slug) pair is rejected

- **GIVEN** a Format already committed for a Brand with slug `"unhypped-news"`
- **WHEN** `createFormat` is called again for the SAME Brand with the SAME slug
- **THEN** it throws a uniqueness error

#### Scenario: An unknown brandId is rejected

- **GIVEN** no committed Brand for a given id
- **WHEN** `createFormat` is called with that id as `brandId`
- **THEN** it throws a foreign-key error

#### Scenario: getFormatBySlug/listFormatsForBrand are scoped to their Brand

- **GIVEN** two Brands, each with a Format of the same slug
- **WHEN** `getFormatBySlug(db, brandA, slug)` is called
- **THEN** it returns Brand A's Format, never Brand B's

#### Scenario: updateFormat merges a patch and throws a clear error for an unknown Format

- **GIVEN** an existing Format
- **WHEN** `updateFormat` is called with a patch touching only one field
- **THEN** that field is updated and every other field is unchanged; calling it with an unknown id
  throws an error naming the id
