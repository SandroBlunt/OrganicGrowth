## MODIFIED Requirements

### Requirement: checkConfig returns Finding[] for presence/sanity of the Brand's config

The system SHALL expose a pure function `checkConfig(brandProfile, seeds): Finding[]` that accepts
already-parsed objects (no YAML I/O in the pure core) and returns a `Finding[]` list for the
following conditions:

- `niche` field contains a TODO placeholder or is unset → advisory on `research`.
- `voice` field contains a TODO placeholder or is unset → advisory on `research`.
- `seeds.seed_pages` has fewer than 1 entry → block on `research` (code: `no_valid_seed`).
- A seed page URL appears off-niche (heuristic: the conductor / config author marks it with a comment
  or the caller passes a hint; the pure function checks a detectable signal) → advisory on `research`
  (code: `off_niche_seed`).
- The Brand's ONE primary Channel entry's `url` is missing or empty (ADR-0019, issue #127) → block on
  `publish` (code: `channel_url_missing`). Per ADR-0019, `brandProfile.channel` is now a LIST of
  `{ platform, url?, primary? }` entries; `checkConfig` finds the ONE entry marked `primary: true` (via
  `primaryChannelFrom`, `src/production-spec/brand-profile.ts`) and checks THAT entry's `url`. There is
  NO back-compat shim for the pre-ADR-0019 single-object `channel: { name, platform, url }` shape — a
  `channel` value in that old shape (or any other non-array/malformed shape) has no primary entry, which
  reads exactly like "Channel URL not configured" and still produces this same finding.
- `banned_words` missing or empty array → advisory on `research` (code: `empty_banned_words`).

A fully-healthy config (all required fields set, no TODOs, ≥1 seed, the primary Channel entry's URL
present, non-empty banned_words) yields no findings.

#### Scenario: TODO placeholder in niche produces an advisory

- **GIVEN** a `brandProfile` with `niche: "TODO: fill in niche"` and a valid seeds object
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** a finding with `severity: 'advisory'` and `phase: 'research'` and `code: 'config_todo'`
  is returned

#### Scenario: Niche unset produces an advisory

- **GIVEN** a `brandProfile` with `niche: ""` (or null/missing) and a valid seeds object
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** a finding with `severity: 'advisory'` and `phase: 'research'` and `code: 'niche_unset'`
  is returned

#### Scenario: Voice unset produces an advisory

- **GIVEN** a `brandProfile` with `voice: ""` (or null/missing) and a valid seeds object
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** a finding with `severity: 'advisory'` and `phase: 'research'` and `code: 'voice_unset'`
  is returned

#### Scenario: Fewer than 1 seed page blocks research

- **GIVEN** a `brandProfile` with all fields set and a `seeds` with `seed_pages: []`
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** a finding with `severity: 'block'` and `phase: 'research'` and `code: 'no_valid_seed'`
  is returned

#### Scenario: Missing primary Channel URL blocks publish

- **GIVEN** a `brandProfile` with `channel: [{ platform: "facebook", url: "", primary: true }]` (or the
  primary entry's `url` omitted) and a valid seeds object
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** a finding with `severity: 'block'` and `phase: 'publish'` and `code: 'channel_url_missing'`
  is returned

#### Scenario: No entry marked primary blocks publish, same as a missing URL

- **GIVEN** a `brandProfile` with `channel: [{ platform: "facebook", url: "https://fb.example/page" }]`
  — a Channel entry exists with a URL, but none is marked `primary: true` — and a valid seeds object
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** a finding with `severity: 'block'` and `phase: 'publish'` and `code: 'channel_url_missing'`
  is returned (there is no primary entry to read a URL from)

#### Scenario: The pre-ADR-0019 single-object channel shape blocks publish — no back-compat shim

- **GIVEN** a `brandProfile` with `channel: { name: "TestBrand", platform: "facebook", url:
  "https://fb.example/page" }` (the old single-Channel object shape) and a valid seeds object
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** a finding with `severity: 'block'` and `phase: 'publish'` and `code: 'channel_url_missing'`
  is returned — the old shape is not reinterpreted as a configured primary Channel

#### Scenario: Empty banned_words is an advisory (never blocks)

- **GIVEN** a `brandProfile` with `banned_words: []` and all other fields set
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** a finding with `severity: 'advisory'` and `phase: 'research'` and
  `code: 'empty_banned_words'` is returned

#### Scenario: A fully healthy config produces no findings

- **GIVEN** a `brandProfile` with `niche` set, `voice` set, `channel` holding one entry marked
  `primary: true` with a non-empty `url`, non-empty `banned_words`, and a `seeds` object with at least
  1 seed page
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** the result is an empty array
