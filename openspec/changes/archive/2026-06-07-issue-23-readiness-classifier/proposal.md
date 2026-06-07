## Why

The Producer's weekly loop must be able to answer "is this Brand in a ready state to proceed?" before
kicking off any phase. Without a dedicated classifier, readiness checks would be scattered across
commands — each command re-deriving the same logic about token validity, seed count, Space health,
and config completeness. This is the pure computational core of that check: a `classify(inputs)`
function that accepts the *results* of Apify/Magnific probes (performed by the conductor, a later
slice) and returns a deterministic `Finding[]`. A companion `checkConfig(brandProfile, seeds)` checks
the Brand's on-disk configuration for completeness without performing any I/O.

The key design decision: `Finding = { severity: 'block' | 'advisory', phase: 'research' |
'production' | 'publish', code, message }`. A finding blocks only the phase it is tagged with
(phase-scoped gating) — a missing Channel URL does NOT block research; a bad Apify token does NOT
block production or publish. This decision is authoritative (PRD issue #1 design grilling).

Phase enum note: `Finding.phase` carries exactly three values (`research`, `production`, `publish`).
The pipeline also has `review` and `track` phases but these are NOT `Finding.phase` values. The
mapping is deliberate:
- A `block` on `publish` is what gates the downstream publish AND track pipeline phases.
- A Magnific `advisory` on `research` surfaces its warning at the research/review pipeline steps.
This keeps the Finding shape minimal and unambiguous while covering all gating scenarios.

## What Changes

### New deep module `src/readiness/classify.ts`

A pure function `classify(inputs)` — no disk, no network, no Magnific Space, no Apify. Inputs are a
plain `ReadinessInputs` object whose fields carry the would-be results of external probes:

- `apifyTokenValid: boolean` — result of an Apify token probe (performed by the conductor).
- `seedCount: number` — number of valid seed pages available for trend research.
- `spaceAccessible: boolean` — whether the Magnific Space can be reached.
- `creditsOk: boolean` — whether the Magnific balance is sufficient for a generation.
- `channelUrl: string | null` — the Brand's Channel URL (null if missing from the profile).
- `baseline: number | null` — the Channel's performance baseline (null if no history yet).

`classify` encodes the phase-scoped gating policy:
- `apifyTokenValid === false` → `block` on `research` (code: `apify_token_invalid`).
- `seedCount < 1` → `block` on `research` (code: `no_valid_seed`).
- `spaceAccessible === false` → `advisory` on `research` + `block` on `production`
  (codes: `space_inaccessible_advisory`, `space_inaccessible`).
- `creditsOk === false` → `advisory` on `research` + `block` on `production`
  (codes: `credits_low_advisory`, `credits_low`).
- `channelUrl === null` → `block` on `publish` (code: `channel_url_missing`).
- `baseline === null` → `advisory` on `research` (code: `null_baseline`).

### New deep module `src/readiness/check-config.ts`

A pure function `checkConfig(brandProfile, seeds)` — accepts already-parsed objects (no YAML I/O
inside the pure core). Returns `Finding[]` for presence/sanity issues:
- TODO placeholders in `niche` or `voice` → `advisory` on `research` (code: `config_todo`).
- `niche` unset (empty or missing) → `advisory` on `research` (code: `niche_unset`).
- `voice` unset (empty or missing) → `advisory` on `research` (code: `voice_unset`).
- `seed_pages` array has fewer than 1 entry → `block` on `research` (code: `no_valid_seed`).
- Seed page whose language/region signals differ from the Brand's niche language → `advisory` on
  `research` (code: `off_niche_seed`).
- `channel.url` missing or empty → `block` on `publish` (code: `channel_url_missing`).
- `banned_words` empty or missing → `advisory` on `research` (code: `empty_banned_words`).

A fully-healthy config (all fields present and valid, ≥1 seed, no TODOs) yields no findings.

### Shared types `src/readiness/types.ts`

`Finding`, `FindingSeverity`, `FindingPhase`, and `ReadinessInputs` types — shared by both modules.

### Tests

- `src/readiness/classify.test.ts` — isolation tests for `classify`, covering every
  severity×phase combination and the deterministic ordering requirement.
- `src/readiness/check-config.test.ts` — isolation tests for `checkConfig`, covering every
  finding code, healthy-config no-findings, and deterministic ordering.

## Capabilities

### Added Capabilities

- `readiness-classifier`: A pure deep module (`classify`) that converts Apify/Magnific probe results
  into a `Finding[]` list with phase-scoped severity, encoding the gating policy without touching
  any external system. No I/O. Isolation-tested across every severity×phase combination.
- `brand-config-sanity`: A pure deep module (`checkConfig`) that validates a Brand's profile and
  seeds for completeness and internal consistency. Takes already-parsed objects; no YAML I/O in the
  pure core. Isolation-tested.

## Impact

- No existing modules are changed. Both new modules are additive.
- `src/readiness/` is a new directory containing three files: `types.ts`, `classify.ts`,
  `check-config.ts`, and their colocated test files.
- The conductor (a future slice) will call `classify` and `checkConfig` after performing the probes;
  this slice delivers only the pure classification logic.
