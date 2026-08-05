## MODIFIED Requirements

### Requirement: Pure builders produce a brand-profile, seeds, and empty ledger from interview answers

The system SHALL expose three pure builder functions that accept `BrandInterviewAnswers` (or no
arguments for the ledger) and return serialisable data structures:

- `buildBrandProfile(answers)` — maps interview answers to the brand-profile YAML shape.
- `buildSeeds(answers)` — maps interview answers to the seeds YAML shape.
- `buildEmptyLedger()` — returns the canonical empty ledger shape.

All three functions SHALL be **pure**: no I/O, no filesystem access, no random values, no clock
access. Same inputs ALWAYS produce the same outputs.

The builders SHALL **never invent brand facts**: every field in the output that derives from the
Operator's answers SHALL be taken verbatim from `answers`; every field not supplied by the
Operator SHALL be absent or set to an appropriate empty default (e.g. `[]`, `""`). The conductor
SHALL NOT supply placeholder text, inferred values, or fabricated seeds on behalf of the Operator.

`buildBrandProfile`'s `channel` output SHALL follow ADR-0019's Channel-list shape (issue #135) — a
LIST of exactly one entry, `{ platform, url, primary: true }`, rather than the retired single-object
shape (`{ name, platform, url }`). The entry's `platform` SHALL equal `answers.platform` verbatim;
its `url` SHALL equal `answers.channelUrl` when supplied, or `""` when not (never a fabricated URL);
its `primary` SHALL always be `true` (the scaffolder always creates exactly one Channel, so it is
always the Brand's primary one). The Channel entry SHALL carry NO `name` field — matching ADR-0019's
Channel entry shape (`{ platform, url?, primary? }`, no `name`/`handle`) and the two real Brand
Profiles migrated by issue #127 (neither `data/brands/straw-motion/brand-profile.yaml` nor
`data/brands/mundotip/brand-profile.yaml` carries a display-name field anywhere in the file). The
Operator's typed display name (`answers.name`) continues to be used ONLY to derive the Brand's slug
(`deriveSlug`) — it is no longer persisted onto the Channel or anywhere else in the scaffolded
`brand-profile.yaml`.

This output SHALL parse correctly under the Brand Profile Channel reader
(`channelsFrom`/`primaryChannelFrom`, `src/production-spec/brand-profile.ts`) and SHALL NOT trip the
readiness classifier's `channel_url_missing` finding (`checkConfig`, `src/readiness/check-config.ts`)
once a `channelUrl` is supplied — closing the gap where a freshly onboarded Brand's profile could not
be parsed by the current Channel store (issue #135).

#### Scenario: buildBrandProfile maps every supplied answer field to the correct output key

- **GIVEN** a `BrandInterviewAnswers` object with `name`, `niche`, `voice`, `language`, `region`,
  `platform`, `seedPages`, and no deferred fields
- **WHEN** `buildBrandProfile(answers)` is called
- **THEN** the result contains:
  - `channel` equal to a one-entry array
  - `channel[0].platform` equal to `answers.platform`
  - `channel[0].url` equal to `""` (empty, since `channelUrl` was not supplied)
  - `channel[0].primary` equal to `true`
  - `niche` equal to `answers.niche`
  - `voice` equal to `answers.voice`
  - `language` equal to `answers.language`
  - `region` equal to `answers.region`
  - `banned_words` equal to `[]` (empty, since `bannedWords` was not supplied)
  - `required_cta` equal to `""` (empty)
  - `required_hashtags` equal to `[]`

#### Scenario: buildBrandProfile includes deferred fields when supplied

- **GIVEN** a `BrandInterviewAnswers` object that includes `channelUrl`, `bannedWords`,
  `requiredCta`, and `requiredHashtags`
- **WHEN** `buildBrandProfile(answers)` is called
- **THEN** the result contains:
  - `channel[0].url` equal to `answers.channelUrl`
  - `banned_words` equal to `answers.bannedWords`
  - `required_cta` equal to `answers.requiredCta`
  - `required_hashtags` equal to `answers.requiredHashtags`

#### Scenario: buildBrandProfile's Channel entry never carries a name field

- **GIVEN** any `BrandInterviewAnswers` object, regardless of what `answers.name` is (e.g. `"Mundo
  Tip!"`, a display name that differs from the derived slug)
- **WHEN** `buildBrandProfile(answers)` is called
- **THEN** `channel[0]` has no `name` key — the display name is used only to derive the Brand's slug
  elsewhere in the onboarding flow, never persisted onto the Channel

#### Scenario: buildBrandProfile round-trips through YAML serialization

- **GIVEN** a `BrandInterviewAnswers` object
- **WHEN** `buildBrandProfile(answers)` is called, the result is serialized to YAML with `stringify`,
  then parsed back with `parse`
- **THEN** the parsed result has the same key/value pairs as the original builder output (string
  fields match exactly; the `channel` array has the same length and same entries)

#### Scenario: buildBrandProfile's output parses as a configured primary Channel under channelsFrom/primaryChannelFrom

- **GIVEN** a `BrandInterviewAnswers` object with `channelUrl: "https://www.facebook.com/acmecorp"`
- **WHEN** `buildBrandProfile(answers)`'s result is passed to `channelsFrom` and `primaryChannelFrom`
  (`src/production-spec/brand-profile.ts`)
- **THEN** `channelsFrom` returns one entry with the answered `platform`, the supplied `url`, and
  `primary: true`
- **AND** `primaryChannelFrom` returns that same entry (never `null`)

#### Scenario: buildBrandProfile's output does not trip checkConfig's channel_url_missing finding once a URL is supplied

- **GIVEN** a `BrandInterviewAnswers` object with `channelUrl: "https://www.facebook.com/acmecorp"`
  and at least one seed page
- **WHEN** `buildBrandProfile(answers)`'s result and a healthy `seeds` object are passed to
  `checkConfig` (`src/readiness/check-config.ts`)
- **THEN** the result contains NO finding with `code: 'channel_url_missing'`

#### Scenario: buildBrandProfile's output still trips checkConfig's channel_url_missing finding when no URL is supplied

- **GIVEN** a `BrandInterviewAnswers` object with `channelUrl` omitted (the deferred-field default) and
  at least one seed page
- **WHEN** `buildBrandProfile(answers)`'s result and a healthy `seeds` object are passed to
  `checkConfig`
- **THEN** the result contains a finding with `severity: 'block'`, `phase: 'publish'`, and
  `code: 'channel_url_missing'` — the finding still correctly fires for a genuinely unconfigured
  Channel, proving this fix does not silently suppress the check

#### Scenario: buildSeeds maps seed pages and selects the correct Apify actor block

- **GIVEN** a `BrandInterviewAnswers` with `platform: "facebook"` and `seedPages: ["https://www.facebook.com/peer1"]`
- **WHEN** `buildSeeds(answers)` is called
- **THEN** the result contains:
  - `seed_pages` equal to `["https://www.facebook.com/peer1"]`
  - `language` equal to `answers.language`
  - `region` equal to `answers.region`
  - `apify.facebook.trends_actor` set to the standard Facebook trends actor slug

#### Scenario: buildSeeds round-trips through YAML serialization

- **GIVEN** a `BrandInterviewAnswers` object
- **WHEN** `buildSeeds(answers)` is called, the result is serialized to YAML and parsed back
- **THEN** the parsed result has the same seed_pages array and the same apify block

#### Scenario: buildEmptyLedger returns the canonical empty shape

- **GIVEN** no arguments
- **WHEN** `buildEmptyLedger()` is called
- **THEN** the result has:
  - `ideas` equal to `[]`
  - `baseline.updated_at` equal to `null`
  - `baseline.shares` equal to `null`
  - `baseline.comments` equal to `null`
  - `baseline.reactions` equal to `null`
  - `baseline.views` equal to `null`
