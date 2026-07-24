## ADDED Requirements

### Requirement: The Brand Profile reader exposes the Brand's Channel list and its ONE primary entry, defensively (ADR-0019)

`src/production-spec/brand-profile.ts` SHALL provide `channelsFrom(raw)` and `primaryChannelFrom(raw)`
(pure) plus `loadChannels(path)` and `loadPrimaryChannel(path)` (the async I/O shell), reading the
Brand Profile's `channel` field from already-parsed / on-disk data respectively. Per ADR-0019, `channel`
is a LIST of entries shaped `{ platform, url?, primary? }` — a Brand may publish to several platforms,
and exactly one entry carries `primary: true`: the entry the Channel performance-tracker, the baseline,
readiness checks, and ledger attribution all key off (unchanged machinery from the pre-list
single-Channel behavior — per-Channel tracking for the rest is a deliberate future epic, not built by
this Requirement). There is NO `handle` field on a Channel entry — LinkedIn `@mention` tagging is a
separate lookup (issue #126).

This is a migrate-in-place change with NO back-compat shim for the pre-ADR-0019 single-object shape
(`channel: { name, platform, url }`): `channelsFrom` SHALL treat any `channel` value that is not an
array — including that old object shape — the same as a missing `channel` key, yielding `[]`.

Both reader functions SHALL be defensive (data-handling rule 4 — never let one malformed record crash a
Run): a list entry that is not an object, or whose `platform` is missing, blank, or non-string, SHALL be
dropped rather than crashing the whole Run; a malformed/absent `url` on a surviving entry SHALL default
to `""` (never `null`/`undefined`); a malformed/absent `primary` SHALL default to `false`.
`primaryChannelFrom` SHALL return `null` when no surviving entry is marked `primary: true`. If more than
one surviving entry is (mis)configured `primary: true`, `primaryChannelFrom` SHALL deterministically
return the FIRST such entry — never throw, never pick arbitrarily.

#### Scenario: channelsFrom reads a multi-Channel list with one primary entry

- **GIVEN** `{ channel: [{ platform: "facebook", url: "https://fb.example/page", primary: true },
  { platform: "instagram", url: "" }] }`
- **WHEN** `channelsFrom(raw)` is called
- **THEN** it returns both entries, `platform`/`url` trimmed, the facebook entry's `primary` is
  `true` and the instagram entry's `primary` is `false`

#### Scenario: channelsFrom returns [] for the pre-ADR-0019 single-object channel shape — no back-compat shim

- **GIVEN** `{ channel: { name: "TestBrand", platform: "facebook", url: "https://x.test" } }` (the old
  single-Channel object shape)
- **WHEN** `channelsFrom(raw)` is called
- **THEN** it returns `[]` — the old shape is NOT reinterpreted as a one-entry Channel list

#### Scenario: channelsFrom drops malformed entries without crashing

- **GIVEN** a `channel` list containing one well-formed entry alongside `null`, a number, a string, an
  empty object, an entry with a blank `platform`, an entry with a non-string `url`, and an entry with a
  non-boolean `primary`
- **WHEN** `channelsFrom(raw)` is called
- **THEN** the malformed entries are dropped or defensively coerced (non-string `url` → `""`,
  non-boolean `primary` → `false`) rather than throwing, and the well-formed entry is still present in
  the result

#### Scenario: primaryChannelFrom returns the one primary entry, or null when none/multiple are marked

- **GIVEN** a Channel list with exactly one entry marked `primary: true`
- **WHEN** `primaryChannelFrom(raw)` is called
- **THEN** it returns that entry
- **GIVEN** a Channel list with NO entry marked `primary: true`
- **WHEN** `primaryChannelFrom(raw)` is called
- **THEN** it returns `null`
- **GIVEN** a Channel list with MORE THAN ONE entry marked `primary: true`
- **WHEN** `primaryChannelFrom(raw)` is called
- **THEN** it deterministically returns the FIRST such entry — never throws

#### Scenario: loadChannels / loadPrimaryChannel degrade to [] / null for a missing file, never crash

- **GIVEN** a path with no file on disk
- **WHEN** `loadChannels(path)` and `loadPrimaryChannel(path)` are called
- **THEN** they resolve to `[]` and `null` respectively, never rejecting
