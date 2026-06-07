## ADDED Requirements

### Requirement: The Finding type has exactly the authoritative shape

The system SHALL define `Finding = { severity: 'block' | 'advisory', phase: 'research' |
'production' | 'publish', code: string, message: string }`. This shape is authoritative (PRD issue
#1 design grilling). No `canEnterGates`/`blockedReasons` shape shall be used.

`FindingPhase` is exactly `'research' | 'production' | 'publish'` — three values only. The
pipeline also uses `review` and `track` phase names, but these are NOT `Finding.phase` values. The
deliberate mapping is:
- A `block` on `'publish'` gates the downstream publish AND track pipeline phases.
- A Magnific `advisory` on `'research'` surfaces its warning at the research/review pipeline steps.

This three-value enum keeps the Finding shape minimal and unambiguous while covering all gating
scenarios.

#### Scenario: Finding object has severity, phase, code, and message

- **GIVEN** any `Finding` returned by `classify` or `checkConfig`
- **WHEN** the caller inspects the Finding
- **THEN** it has `severity` equal to `'block'` or `'advisory'`
- **AND** it has `phase` equal to `'research'`, `'production'`, or `'publish'`
- **AND** it has a non-empty string `code`
- **AND** it has a non-empty string `message`

---

### Requirement: classify returns Finding[] encoding the phase-scoped gating policy

The system SHALL expose a pure function `classify(inputs: ReadinessInputs): Finding[]` that accepts
a plain-data inputs object — the would-be results of Apify/Magnific probes performed by the
conductor — and returns a `Finding[]` list. The function is pure and deterministic: no disk, no
network, no Magnific, no Apify. The same inputs always produce the same output in the same order.

`ReadinessInputs` has these fields:
- `apifyTokenValid: boolean`
- `seedCount: number`
- `offNicheSeedCount: number` — count of gathered seeds whose niche signals diverge from the Brand's; the conductor computes this and passes it in; 0 means all seeds are on-niche.
- `spaceAccessible: boolean`
- `creditsOk: boolean`
- `channelUrl: string | null`
- `baseline: number | null`
- `bannedWordsEmpty: boolean` — `true` if the Brand profile has no banned words configured; the conductor reads this from the parsed profile before calling `classify`.

Phase-scoped gating policy (each check is independent; multiple findings may be returned):
- `apifyTokenValid === false` → `{ severity: 'block', phase: 'research', code: 'apify_token_invalid', ... }`
- `seedCount < 1` → `{ severity: 'block', phase: 'research', code: 'no_valid_seed', ... }`
- `spaceAccessible === false` → two findings:
  `{ severity: 'advisory', phase: 'research', code: 'space_inaccessible_advisory', ... }` AND
  `{ severity: 'block', phase: 'production', code: 'space_inaccessible', ... }`
- `creditsOk === false` → two findings:
  `{ severity: 'advisory', phase: 'research', code: 'credits_low_advisory', ... }` AND
  `{ severity: 'block', phase: 'production', code: 'credits_low', ... }`
- `channelUrl === null` → `{ severity: 'block', phase: 'publish', code: 'channel_url_missing', ... }`
- `baseline === null` → `{ severity: 'advisory', phase: 'research', code: 'null_baseline', ... }`
- `offNicheSeedCount > 0` → `{ severity: 'advisory', phase: 'research', code: 'off_niche_seed', ... }` — never blocks any phase
- `bannedWordsEmpty === true` → `{ severity: 'advisory', phase: 'research', code: 'empty_banned_words', ... }` — never blocks any phase

#### Scenario: classify returns a Finding[] with the correct shape fields

- **GIVEN** a `ReadinessInputs` with `apifyTokenValid: false` and all other fields valid
- **WHEN** `classify(inputs)` is called
- **THEN** the result is an array
- **AND** every element has `severity`, `phase`, `code`, and `message` fields

#### Scenario: Bad Apify token blocks research

- **GIVEN** `ReadinessInputs` with `apifyTokenValid: false`, `seedCount: 1`, `spaceAccessible: true`,
  `creditsOk: true`, `channelUrl: 'https://fb.com/page'`, `baseline: 1.0`
- **WHEN** `classify(inputs)` is called
- **THEN** one finding with `severity: 'block'` and `phase: 'research'` and `code: 'apify_token_invalid'`
  is returned
- **AND** no `block` finding on `'production'` or `'publish'` is returned

#### Scenario: No valid seed blocks research

- **GIVEN** `ReadinessInputs` with `apifyTokenValid: true`, `seedCount: 0`, `spaceAccessible: true`,
  `creditsOk: true`, `channelUrl: 'https://fb.com/page'`, `baseline: 1.0`
- **WHEN** `classify(inputs)` is called
- **THEN** one finding with `severity: 'block'` and `phase: 'research'` and `code: 'no_valid_seed'`
  is returned

#### Scenario: Inaccessible Space warns at research and hard-stops production

- **GIVEN** `ReadinessInputs` with `apifyTokenValid: true`, `seedCount: 1`,
  `spaceAccessible: false`, `creditsOk: true`, `channelUrl: 'https://fb.com/page'`, `baseline: 1.0`
- **WHEN** `classify(inputs)` is called
- **THEN** a finding with `severity: 'advisory'` and `phase: 'research'` and
  `code: 'space_inaccessible_advisory'` is returned
- **AND** a finding with `severity: 'block'` and `phase: 'production'` and
  `code: 'space_inaccessible'` is returned
- **AND** no `block` finding on `'research'` is returned

#### Scenario: Insufficient credits warns at research and hard-stops production

- **GIVEN** `ReadinessInputs` with `apifyTokenValid: true`, `seedCount: 1`,
  `spaceAccessible: true`, `creditsOk: false`, `channelUrl: 'https://fb.com/page'`, `baseline: 1.0`
- **WHEN** `classify(inputs)` is called
- **THEN** a finding with `severity: 'advisory'` and `phase: 'research'` and
  `code: 'credits_low_advisory'` is returned
- **AND** a finding with `severity: 'block'` and `phase: 'production'` and `code: 'credits_low'`
  is returned
- **AND** no `block` finding on `'research'` is returned

#### Scenario: Missing Channel URL blocks only publish

- **GIVEN** `ReadinessInputs` with `apifyTokenValid: true`, `seedCount: 1`,
  `spaceAccessible: true`, `creditsOk: true`, `channelUrl: null`, `baseline: 1.0`
- **WHEN** `classify(inputs)` is called
- **THEN** a finding with `severity: 'block'` and `phase: 'publish'` and
  `code: 'channel_url_missing'` is returned
- **AND** no `block` finding on `'research'` or `'production'` is returned

#### Scenario: Null baseline is a pure advisory (never blocks any phase)

- **GIVEN** `ReadinessInputs` with `apifyTokenValid: true`, `seedCount: 1`,
  `spaceAccessible: true`, `creditsOk: true`, `channelUrl: 'https://fb.com/page'`,
  `baseline: null`
- **WHEN** `classify(inputs)` is called
- **THEN** a finding with `severity: 'advisory'` and `phase: 'research'` and
  `code: 'null_baseline'` is returned
- **AND** no `block` finding is returned for any phase

#### Scenario: A healthy inputs object produces no findings

- **GIVEN** `ReadinessInputs` with `apifyTokenValid: true`, `seedCount: 3`,
  `offNicheSeedCount: 0`, `spaceAccessible: true`, `creditsOk: true`,
  `channelUrl: 'https://fb.com/page'`, `baseline: 0.5`, `bannedWordsEmpty: false`
- **WHEN** `classify(inputs)` is called
- **THEN** the result is an empty array

#### Scenario: Multiple problems produce multiple findings

- **GIVEN** `ReadinessInputs` with `apifyTokenValid: false`, `seedCount: 0`,
  `spaceAccessible: false`, `creditsOk: false`, `channelUrl: null`, `baseline: null`
- **WHEN** `classify(inputs)` is called
- **THEN** the result contains at least one finding for each triggered condition

---

### Requirement: classify produces pure advisories that never block any phase

`classify` SHALL produce `advisory` findings only for off-niche seeds, empty banned-words, and null
baselines — none of these SHALL ever produce a `block` finding. They warn but do NOT prevent any
phase from proceeding.

NOTE on relationship with `checkConfig`: `checkConfig` detects off-niche seeds and empty
banned-words from the static config file (via seed URL markers and profile fields). `classify`
detects the same conditions from conductor-gathered runtime probe results passed in as
`ReadinessInputs`. Both functions legitimately surface these signals from different vantage points
— this is not accidental duplication.

#### Scenario: Off-niche seed is advisory only

- **GIVEN** `ReadinessInputs` with `offNicheSeedCount: 2`, `apifyTokenValid: true`, `seedCount: 3`,
  `spaceAccessible: true`, `creditsOk: true`, `channelUrl: 'https://fb.com/page'`,
  `baseline: 0.5`, `bannedWordsEmpty: false`
- **WHEN** `classify(inputs)` is called
- **THEN** a finding with `severity: 'advisory'` and `phase: 'research'` and `code: 'off_niche_seed'`
  is returned
- **AND** no `block` finding is returned on any phase

#### Scenario: Off-niche count of zero produces no off-niche finding

- **GIVEN** `ReadinessInputs` with `offNicheSeedCount: 0` and all other fields healthy
- **WHEN** `classify(inputs)` is called
- **THEN** no finding with `code: 'off_niche_seed'` is returned

#### Scenario: Empty banned-words is advisory only

- **GIVEN** `ReadinessInputs` with `bannedWordsEmpty: true`, `apifyTokenValid: true`, `seedCount: 3`,
  `offNicheSeedCount: 0`, `spaceAccessible: true`, `creditsOk: true`,
  `channelUrl: 'https://fb.com/page'`, `baseline: 0.5`
- **WHEN** `classify(inputs)` is called
- **THEN** a finding with `severity: 'advisory'` and `phase: 'research'` and
  `code: 'empty_banned_words'` is returned
- **AND** no `block` finding is returned on any phase

#### Scenario: Non-empty banned-words produces no empty-banned-words finding

- **GIVEN** `ReadinessInputs` with `bannedWordsEmpty: false` and all other fields healthy
- **WHEN** `classify(inputs)` is called
- **THEN** no finding with `code: 'empty_banned_words'` is returned

#### Scenario: Null baseline is advisory only (no block on any phase)

- **GIVEN** `ReadinessInputs` with `baseline: null` and all other fields healthy
- **WHEN** `classify(inputs)` is called
- **THEN** the finding for `null_baseline` has `severity: 'advisory'`
- **AND** there is no `block` finding on `'research'`, `'production'`, or `'publish'`

---

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
- `channel.url` missing or empty → block on `publish` (code: `channel_url_missing`).
- `banned_words` missing or empty array → advisory on `research` (code: `empty_banned_words`).

A fully-healthy config (all required fields set, no TODOs, ≥1 seed, channel URL present,
non-empty banned_words) yields no findings.

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

#### Scenario: Missing Channel URL blocks publish

- **GIVEN** a `brandProfile` with `channel.url: ""` (or null/missing) and a valid seeds object
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** a finding with `severity: 'block'` and `phase: 'publish'` and `code: 'channel_url_missing'`
  is returned

#### Scenario: Empty banned_words is an advisory (never blocks)

- **GIVEN** a `brandProfile` with `banned_words: []` and all other fields set
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** a finding with `severity: 'advisory'` and `phase: 'research'` and
  `code: 'empty_banned_words'` is returned

#### Scenario: A fully healthy config produces no findings

- **GIVEN** a `brandProfile` with `niche` set, `voice` set, `channel.url` set, non-empty
  `banned_words`, and a `seeds` object with at least 1 seed page
- **WHEN** `checkConfig(brandProfile, seeds)` is called
- **THEN** the result is an empty array

---

### Requirement: Findings are grouped/ordered deterministically for display

`classify` and `checkConfig` SHALL return findings in a stable, deterministic order. The ordering
rule: first by phase (`'research'` < `'production'` < `'publish'`), then by severity within a phase
(`'block'` before `'advisory'`), then by code (alphabetical). The same inputs always produce the
same finding list in the same order.

#### Scenario: Multiple findings are ordered by phase then severity then code

- **GIVEN** inputs that trigger findings across multiple phases and severities
- **WHEN** `classify(inputs)` is called
- **THEN** all `'research'` findings appear before `'production'` findings
- **AND** all `'production'` findings appear before `'publish'` findings
- **AND** within a phase, `'block'` findings appear before `'advisory'` findings
- **AND** within the same phase+severity, findings are ordered alphabetically by code

#### Scenario: Same inputs always produce the same finding order

- **GIVEN** the same `ReadinessInputs` passed twice
- **WHEN** `classify(inputs)` is called twice
- **THEN** the two results are deeply equal in value and order

---

### Requirement: Both classify and checkConfig are pure and isolation-tested

Both functions SHALL be testable by passing plain JavaScript objects — no filesystem reads, no
Magnific Space calls, no Apify calls, no clock access. Neither module SHALL import anything that
performs I/O. Every test assertion SHALL operate on the function's return value only.

#### Scenario: Tests exercise classify and checkConfig with no I/O

- **GIVEN** tests that construct `ReadinessInputs`, brand profile, and seeds objects as plain literals
- **WHEN** `classify` or `checkConfig` is called in the test
- **THEN** the test asserts the result without mocking any I/O system
- **AND** no filesystem, network, Magnific Space, or Apify path is exercised
