## ADDED Requirements

### Requirement: The Brand Profile reader exposes per-Brand Zoho Social Brand config, defensively (issue #143)

`src/production-spec/brand-profile.ts` SHALL provide `zohoConfigFrom(raw, brand)` (pure) and
`loadZohoConfig(path, brand)` (the async I/O shell), reading an OPTIONAL top-level `zoho` field from
already-parsed / on-disk Brand Profile data respectively. `brand` SHALL be an explicit, caller-supplied
identity string (the Brand's slug or display name) used to name that Brand in the returned
message/result — this module does no Brand-existence validation of its own.

The `zoho` field's shape, when present, SHALL be `{ brands: ZohoSocialBrand[] }`, where each
`ZohoSocialBrand` entry represents one **Zoho Social Brand** (Zoho's own container of connected
accounts, distinct from an OrganicGrowth **Brand**) and SHALL carry: an OPTIONAL `name` (a
human-readable label, defaulting to `""` when absent — never itself a validation problem); a REQUIRED
`timezone` (a non-empty string that SHALL be a timezone identifier `Intl.DateTimeFormat` accepts — the
standard-library IANA timezone database check, no new dependency); and a REQUIRED, non-empty `channels`
array of `{ platform, label }` entries, where `platform` is the OrganicGrowth Channel platform key (a
free string, matching `Channel.platform`'s own convention — NOT cross-validated against the Brand's own
`channel` list) and `label` is the EXACT string Zoho's bulk uploader matches for that platform's
connected account, read and passed through VERBATIM — never normalized, guessed, or title-cased (e.g. a
personal LinkedIn profile's label is `"LinkedInProfile"`, a DIFFERENT Zoho channel than the company-Page
`"LinkedIn"`).

Both functions SHALL NEVER throw, for any input shape, and SHALL always return one of exactly two typed
results (mirroring `src/format/baseline-prompt.ts`'s `BaselinePromptLookup` never-throwing convention):

- `{ configured: true, brand, zohoBrands }` — the `zoho` field was present and every entry validated
  cleanly.
- `{ configured: false, brand, reason, message, errors }` — with `reason` either:
  - `"not_configured"` — the raw profile data (or the file at `path`, including a missing file) carries
    NO `zoho` key at all. This is the ORDINARY, expected outcome for a Brand that has not wired Schedule
    Batch yet (e.g. MundoTip) — NOT an error; `errors` SHALL be `[]`.
  - `"malformed"` — a `zoho` key IS present but fails validation. `errors` SHALL be non-empty and SHALL
    name EVERY problem found across the whole structure (never only the first, never a partial
    best-effort result) — including (each independently, all collected together when several occur at
    once): `zoho` itself not being an object; `zoho.brands` missing, not an array, or empty; a
    `zoho.brands` entry not being an object; that entry's `timezone` missing, blank, or not a string; a
    present `timezone` string that is not a recognized IANA identifier; that entry's `channels` missing,
    not an array, or empty; a `channels` entry not being an object; a `channels` entry's `platform` or
    `label` missing, blank, or not a string; and the SAME `platform` value appearing under more than one
    Zoho Social Brand entry (each platform SHALL map to exactly one CSV file).

  In both `reason` cases, `message` SHALL name `brand` explicitly (e.g.
  `Brand "mundotip" has no "zoho" config...`).

Every string field read (`name`, `timezone`, `platform`, `label`) SHALL be trimmed of surrounding
whitespace before being placed on the returned `ZohoSocialBrand`/`ZohoChannelMapping`.

#### Scenario: A Brand with no zoho key gets a clear not-configured result, naming the Brand

- **GIVEN** an already-parsed Brand Profile with no `zoho` key (e.g. MundoTip's real, committed
  profile)
- **WHEN** `zohoConfigFrom(raw, "mundotip")` (or `loadZohoConfig` against that file) is called
- **THEN** it returns `configured: false`, `reason: "not_configured"`, `errors: []`, and a `message`
  naming `"mundotip"` and stating it is not configured for Schedule Batch
- **AND** it never throws

#### Scenario: A well-formed two-Zoho-Brand config is read in full

- **GIVEN** a `zoho.brands` list of two well-formed entries — one grouping `facebook`/`instagram`/
  `tiktok` with labels `Facebook`/`Instagram`/`TikTok`, one grouping `linkedin`/`x` with labels
  `LinkedInProfile`/`X` — both carrying the same `timezone`
- **WHEN** `zohoConfigFrom(raw, brand)` is called
- **THEN** it returns `configured: true` with `zohoBrands` deep-equal to the two entries exactly as
  configured, each `platform`/`label` trimmed

#### Scenario: A missing name defaults to '' without being a validation problem

- **GIVEN** a `zoho.brands` entry with a well-formed `timezone` and `channels` but no `name` field
- **WHEN** `zohoConfigFrom(raw, brand)` is called
- **THEN** it returns `configured: true` with that entry's `name` equal to `""`

#### Scenario: A non-object zoho value is malformed, naming the Brand

- **GIVEN** an already-parsed Brand Profile whose `zoho` field is a string (not an object)
- **WHEN** `zohoConfigFrom(raw, "straw-motion")` is called
- **THEN** it returns `configured: false`, `reason: "malformed"`, a non-empty `errors` list, and a
  `message` naming `"straw-motion"`

#### Scenario: Missing or empty zoho.brands is malformed

- **GIVEN** `zoho: {}` (no `brands` key) and separately `zoho: { brands: [] }` (an empty list)
- **WHEN** `zohoConfigFrom(raw, brand)` is called with each
- **THEN** both return `configured: false, reason: "malformed"`

#### Scenario: A missing or unrecognized timezone is malformed

- **GIVEN** a `zoho.brands` entry with no `timezone` field, and separately one whose `timezone` is
  `"Not/AZone"` (not a recognized IANA identifier)
- **WHEN** `zohoConfigFrom(raw, brand)` is called with each
- **THEN** both return `configured: false, reason: "malformed"`, with `errors` naming the specific
  entry (by index) and, for the unrecognized case, the bad timezone string itself

#### Scenario: Missing or empty channels, or a channel missing platform/label, is malformed

- **GIVEN** a `zoho.brands` entry with no `channels` field, one with `channels: []`, one whose one
  channel entry has no `platform`, and one whose one channel entry has no `label`
- **WHEN** `zohoConfigFrom(raw, brand)` is called with each
- **THEN** every case returns `configured: false, reason: "malformed"`

#### Scenario: A platform assigned to more than one Zoho Social Brand is malformed, naming the platform

- **GIVEN** a `zoho.brands` list whose two entries both declare a channel mapping for the SAME
  `platform` value (e.g. `"facebook"` in both)
- **WHEN** `zohoConfigFrom(raw, "straw-motion")` is called
- **THEN** it returns `configured: false, reason: "malformed"`, with `errors` naming `"facebook"` and
  stating each platform must map to exactly one CSV file

#### Scenario: Multiple independent problems are ALL reported, never just the first

- **GIVEN** a `zoho.brands` entry with BOTH a missing `timezone` AND an empty `channels` list
- **WHEN** `zohoConfigFrom(raw, brand)` is called
- **THEN** it returns `configured: false, reason: "malformed"` with `errors` containing at least two
  distinct problems (never short-circuiting after the first)

#### Scenario: The function never throws for any malformed shape

- **GIVEN** any of `null`, `undefined`, `{}`, `{ zoho: null }`, `{ zoho: 7 }`, or
  `{ zoho: { brands: "nope" } }`
- **WHEN** `zohoConfigFrom(raw, brand)` is called with each
- **THEN** it returns a typed result without throwing

#### Scenario: loadZohoConfig degrades a missing file to not_configured, never crashes

- **GIVEN** a `path` with no file on disk
- **WHEN** `loadZohoConfig(path, brand)` is called
- **THEN** it resolves to `configured: false, reason: "not_configured"`, naming `brand` — it never
  rejects

#### Scenario: Straw Motion's real, committed Brand Profile carries the real grouping, labels, and clock

- **GIVEN** the real, committed `data/brands/straw-motion/brand-profile.yaml`
- **WHEN** `loadZohoConfig(path, "straw-motion")` is called against it
- **THEN** it returns `configured: true` with exactly two Zoho Social Brands: one grouping
  `facebook`/`instagram`/`tiktok` (the main file), one grouping `linkedin`/`x` (the second file)
- **AND** the `linkedin` entry's `label` is EXACTLY `"LinkedInProfile"` — never `"LinkedIn"`
- **AND** both Zoho Social Brands share the same, non-empty `timezone` (the Operator's own clock)

#### Scenario: MundoTip's real, committed Brand Profile is not configured for Schedule Batch

- **GIVEN** the real, committed `data/brands/mundotip/brand-profile.yaml` (deliberately left
  untouched by this change — MundoTip's actual Zoho wiring is a separate, later task)
- **WHEN** `loadZohoConfig(path, "mundotip")` is called against it
- **THEN** it returns `configured: false, reason: "not_configured"`, naming `"mundotip"`
