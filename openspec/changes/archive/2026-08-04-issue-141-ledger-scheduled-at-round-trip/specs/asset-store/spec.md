## ADDED Requirements

### Requirement: An Asset's scheduled_at and a Copy variant's unresolvedMentions survive every ledger round-trip

The system SHALL parse a Ledger Asset record's optional `scheduled_at` field (ISO-8601 timestamp) and a
Copy variant's optional `unresolvedMentions` field (`readonly string[]`, `src/copy/contract.ts`'s
`CopyVariant`) defensively in `src/asset/asset.ts`'s `parseAssetRecord`/`parseCopyVariant`, so that both
survive every ledger load -> write -> load cycle. `scheduled_at` SHALL be kept only when it is a
non-empty string, and SHALL be omitted from the parsed result entirely otherwise (never fabricated).
Adding `scheduled_at` SHALL NOT introduce a new `AssetStatus` or otherwise change the Asset's
`status`/lifecycle — ADR-0011's six-stage vocabulary (`queued -> in_production -> produced -> posted ->
tracking -> scored`) is unchanged; `scheduled_at` carries no lifecycle meaning of its own.
`unresolvedMentions` SHALL be kept as the well-formed (non-empty string) entries of the raw value, in
order, and SHALL be included on the parsed `CopyVariant` ONLY when at least one entry survives — a
missing, empty, or non-array raw value SHALL degrade to the field being omitted entirely (never a stray
empty-array key). Because `writeAsset` (`src/asset/store.ts`) re-normalizes an Idea's WHOLE `assets[]`
array through this same parser on every write — including a write that targets a different, sibling
Asset on the same Idea — this parsing SHALL be exercised on every write, not just on a direct read: a
write to one Asset SHALL NOT erase another Asset's already-recorded `scheduled_at` or a Copy variant's
`unresolvedMentions`.

#### Scenario: A well-formed scheduled_at round-trips through load -> write -> load

- **GIVEN** an Asset record carrying a well-formed ISO-8601 `scheduled_at`
- **WHEN** the record is parsed, then written back through `writeAsset`, then read again
- **THEN** the read-back Asset's `scheduled_at` is byte-identical to the original value

#### Scenario: A missing or malformed scheduled_at is omitted, never fabricated

- **GIVEN** an Asset record whose raw `scheduled_at` is absent, blank, or a non-string value
- **WHEN** the record is parsed
- **THEN** the parsed Asset carries no `scheduled_at` key at all

#### Scenario: scheduled_at introduces no new AssetStatus

- **GIVEN** an Asset record with a well-formed `scheduled_at` and status `"produced"`
- **WHEN** the record is parsed
- **THEN** the parsed Asset's `status` is still `"produced"` — no `"scheduled"` (or any other new)
  status is ever produced

#### Scenario: A Copy variant's non-empty unresolvedMentions parses verbatim

- **GIVEN** a raw `CopyVariant` carrying a non-empty `unresolvedMentions` array of strings
- **WHEN** `parseCopyVariant` is called
- **THEN** the result's `unresolvedMentions` deep-equals the input, in order

#### Scenario: An absent, empty, or malformed unresolvedMentions omits the key entirely

- **GIVEN** a raw `CopyVariant` whose `unresolvedMentions` is absent, an empty array, or a non-array
  value
- **WHEN** `parseCopyVariant` is called
- **THEN** the result carries no `unresolvedMentions` key at all — never a stray `[]`

#### Scenario: A write to one Asset does not erase a sibling Asset's scheduled_at or unresolvedMentions

- **GIVEN** an Idea with two Assets — the first carrying `scheduled_at` and a Copy variant with
  `unresolvedMentions`, the second plain
- **WHEN** `writeAsset` writes a patch that targets only the SECOND Asset
- **THEN** re-reading the Idea's Assets shows the first Asset's `scheduled_at` and its Copy variant's
  `unresolvedMentions` completely unchanged
