## ADDED Requirements

### Requirement: An Asset scheduled via Zoho's MCP path carries the exact reference Zoho returned, verbatim

The system SHALL define an exported type `ZohoScheduleReference = string | readonly string[]`
(`src/asset/asset.ts`) and an optional `LedgerAssetRecord` field `zoho_schedule_reference?:
ZohoScheduleReference`, placed alongside the existing `scheduled_at`. `parseZohoScheduleReference(raw)`
SHALL accept EITHER a non-empty string OR a non-empty array whose every entry is a non-empty string, and
SHALL return it completely UNCHANGED (verbatim) — never collapsed to always-array, never re-derived from
any other field, never partially kept. Any other raw shape — a blank string, an empty array, an array
containing any non-string or blank entry, a number, an object, `null`, or `undefined` — SHALL cause the
WHOLE value to be rejected (`null`), and `parseAssetRecord` SHALL then omit the `zoho_schedule_reference`
key from the parsed Asset entirely, never fabricating or partially reconstructing a reference. This
parsing SHALL never throw.

Adding `zoho_schedule_reference` SHALL NOT introduce a new `AssetStatus` or otherwise change the Asset's
`status`/lifecycle — ADR-0011's six-stage vocabulary (`queued -> in_production -> produced -> posted ->
tracking -> scored`) is unchanged. An Asset scheduled via Zoho's MCP path SHALL remain `status: "produced"`
— being queued in Zoho is not being posted; `zoho_schedule_reference` carries no lifecycle meaning of its
own, exactly like `scheduled_at`.

Reads and writes of this field SHALL go through the existing typed `AssetStore` boundary
(`src/asset/store.ts`'s `writeAsset`/`loadIdeaAssets`) — no parallel or ad hoc store. Because `writeAsset`
re-normalizes an Idea's WHOLE `assets[]` array through `parseAssetRecord` on every write — including a
write that targets a different, sibling Asset on the same Idea — this parsing SHALL be exercised on every
write, not just on a direct read: a write to one Asset SHALL NOT erase another Asset's already-recorded
`zoho_schedule_reference`. A ledger record written before this field existed (no `zoho_schedule_reference`
key at all) SHALL continue to load cleanly, with the parsed Asset simply carrying no
`zoho_schedule_reference` field — defensive parsing, never a crash, never a fabricated default.

#### Scenario: A well-formed single-string reference parses onto the Asset, verbatim

- **GIVEN** a raw Asset record with `zoho_schedule_reference: "post_abc123"` and `status: "produced"`
- **WHEN** the record is parsed (`parseAssetRecord`)
- **THEN** the resulting Asset's `zoho_schedule_reference` is the exact string `"post_abc123"`

#### Scenario: A well-formed array of references parses onto the Asset, verbatim and in order

- **GIVEN** a raw Asset record with `zoho_schedule_reference: ["fb_post_1", "ig_post_1", "li_post_1"]`
- **WHEN** the record is parsed
- **THEN** the resulting Asset's `zoho_schedule_reference` deep-equals the input array, in the same order

#### Scenario: A malformed reference is rejected as a whole, never partially kept

- **GIVEN** a raw `zoho_schedule_reference` that is a blank string, an empty array, an array containing
  one non-string or blank entry alongside otherwise-valid entries, a bare number, or an object
- **WHEN** the record is parsed
- **THEN** the resulting Asset carries NO `zoho_schedule_reference` key at all — not a partially-cleaned
  array, not a coerced string — and parsing never throws

#### Scenario: zoho_schedule_reference is omitted when absent

- **GIVEN** a raw Asset record with no `zoho_schedule_reference` field
- **WHEN** the record is parsed
- **THEN** the resulting Asset has no `zoho_schedule_reference` key

#### Scenario: zoho_schedule_reference introduces no new AssetStatus; status stays produced

- **GIVEN** a raw Asset record with a well-formed `zoho_schedule_reference` and `status: "produced"`
- **WHEN** the record is parsed
- **THEN** the parsed Asset's `status` is still `"produced"` — no `"scheduled"` (or any other new) status
  is ever produced

#### Scenario: A well-formed reference round-trips through load -> write -> load, in either shape

- **GIVEN** an Asset patch carrying `zoho_schedule_reference` as either a single string or an array of
  strings, written via `writeAsset`
- **WHEN** the Idea's Assets are read back via `loadIdeaAssets`
- **THEN** the read-back Asset's `zoho_schedule_reference` is identical to the original value, in its
  original shape (string stays a string; array stays an array in the same order)

#### Scenario: A write to a sibling Asset does not erase an already-recorded zoho_schedule_reference

- **GIVEN** an Idea with two Assets — the first carrying a `zoho_schedule_reference`, the second plain
- **WHEN** `writeAsset` writes a patch that targets only the SECOND Asset
- **THEN** re-reading the Idea's Assets shows the first Asset's `zoho_schedule_reference` completely
  unchanged

#### Scenario: A ledger record written before this field existed still loads cleanly

- **GIVEN** a ledger Asset record with `status: "produced"` and `scheduled_at` set, but no
  `zoho_schedule_reference` key at all (any real Brand ledger written before this slice)
- **WHEN** the record is loaded via `loadIdeaAssets`
- **THEN** it loads without error, `scheduled_at` is preserved, and `zoho_schedule_reference` is simply
  absent — never a crash, never a fabricated value
