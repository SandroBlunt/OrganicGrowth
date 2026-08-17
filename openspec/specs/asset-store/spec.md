# asset-store Specification

## Purpose
TBD - created by archiving change issue-55-per-asset-ledger. Update Purpose after archive.
## Requirements
### Requirement: An Idea carries a list of per-Recipe Assets; production state lives on the Asset

The system SHALL define an `AssetStatus` type — `"queued" | "in_production" | "produced" | "posted" |
"tracking" | "scored"` — and a `LedgerAssetRecord` shape `{ recipe, status, pending_gate?, spec_path?,
copy?, cast?, character?, asset_url?, produced_at?, post_url?, posted_at?, performance_score?,
metrics?, tracked_at?, history? }` (`src/asset/asset.ts`). Only `recipe` and `status` are required.
`casting` SHALL NOT be a valid `AssetStatus` — it is retired; the *Character Explainer with Cast*
Recipe's Cast pick is represented as `status: "in_production"` with `pending_gate: "cast"` — a PAUSE
inside `in_production`, never a stage of its own. An Idea SHALL carry `assets: LedgerAssetRecord[]`,
one entry per chosen Recipe. `copy` SHALL be a STRUCTURED value — `{ caption: string, hashtags:
string[] }` (`src/copy/contract.ts`'s `Copy`, ADR-0012, issue #58) — never a bare string; a raw record
whose `copy` is missing a non-empty `caption`, or is otherwise not an object, SHALL parse with NO
`copy` field (never a garbled placeholder), while a present-but-non-array `hashtags` degrades to `[]`
rather than failing the whole Asset.

`metrics` (issue #84) SHALL be `{ shares: number, comments: number, reactions: number, views: number }`
— the four public readings behind the Asset's CURRENT `performance_score` — required to ALL be finite,
non-negative numbers or the whole `metrics` value SHALL be omitted (never half-fabricated). `tracked_at`
SHALL be an ISO-8601 string timestamp of the most recent tracking pull. `history` SHALL be an array of
`{ tracked_at, performance_score, metrics }` snapshots of EARLIER pulls (never the current one) —
malformed entries SHALL be dropped individually, never invalidating the whole array or the Asset.

#### Scenario: isAssetStatus rejects the retired "casting" value

- **GIVEN** the string `"casting"`
- **WHEN** `isAssetStatus("casting")` is called
- **THEN** it returns `false`

#### Scenario: A Cast-gate pause is represented as in_production + pending_gate, not a stage

- **GIVEN** an Asset for the *Character Explainer with Cast* Recipe paused at its Cast pick
- **WHEN** the Asset record is inspected
- **THEN** its `status` is `"in_production"` and its `pending_gate` is `"cast"`

#### Scenario: A structured Copy parses onto the Asset

- **GIVEN** a raw Asset record with `copy: { caption: "Great tip! ☀️", hashtags: ["#lifehacks"] }`
- **WHEN** the record is parsed (`parseAssetRecord`)
- **THEN** the resulting Asset's `copy` is the SAME structured `{ caption, hashtags }` object — not a
  string, not flattened

#### Scenario: A malformed copy value never crashes the parse

- **GIVEN** a raw Asset record whose `copy` is a bare string, or an object missing `caption`, or whose
  `hashtags` is not an array
- **WHEN** the record is parsed
- **THEN** the malformed `copy` is EITHER omitted entirely (missing/blank `caption`) or degraded safely
  (`hashtags` defaults to `[]`) — the parse never throws

#### Scenario: A well-formed metrics/tracked_at/history reading parses onto the Asset

- **GIVEN** a raw Asset record with `metrics: { shares: 4, comments: 10, reactions: 55, views: 1200 }`,
  `tracked_at: "2026-06-13T12:00:00.000Z"`, and one well-formed `history` entry
- **WHEN** the record is parsed (`parseAssetRecord`)
- **THEN** the resulting Asset carries `metrics`, `tracked_at`, and `history` exactly as given

#### Scenario: A metrics reading missing any one of the four fields is omitted entirely, never half-fabricated

- **GIVEN** a raw Asset record with `metrics: { shares: 1, comments: 1, reactions: 1 }` (missing
  `views`)
- **WHEN** the record is parsed
- **THEN** the resulting Asset has NO `metrics` field at all — not a partial one defaulting the
  missing field to `0`

#### Scenario: A malformed history entry is dropped without invalidating the whole array

- **GIVEN** a raw `history` array with one well-formed snapshot and one malformed entry (missing
  `performance_score`)
- **WHEN** the record is parsed
- **THEN** the resulting `history` contains only the well-formed snapshot

### Requirement: The Idea's derived roll-up folds the earliest stage across its Assets

`deriveIdeaRollup(baseStatus, assets)` (`src/asset/asset.ts`) SHALL return `baseStatus` unchanged for
any `baseStatus` other than `"accepted"` (covers `suggested`/`rejected`, and any legacy value passed
through). For `baseStatus: "accepted"`, it SHALL return `"accepted"` when `assets` is empty (no
Recipe has started production yet — today's shape for every real Brand ledger), and otherwise the
EARLIEST Asset stage across `assets` (`rollupAssetStatus`) — mirroring `phase-resolver`'s existing
`earlierPhase` pattern one grain down, so an Idea with one Recipe `posted` and another still
`in_production` rolls up to `in_production` (there is still active work).

#### Scenario: An accepted Idea with no Assets yet rolls up to accepted

- **GIVEN** `baseStatus: "accepted"` and `assets: []`
- **WHEN** `deriveIdeaRollup` is called
- **THEN** it returns `"accepted"`

#### Scenario: An accepted Idea with Assets rolls up to the EARLIEST Asset stage

- **GIVEN** `baseStatus: "accepted"` and two Assets, one `"posted"` and one `"in_production"`
- **WHEN** `deriveIdeaRollup` is called
- **THEN** it returns `"in_production"` (the earlier of the two)

#### Scenario: suggested and rejected pass through unchanged regardless of Assets

- **GIVEN** `baseStatus: "suggested"` (or `"rejected"`) and any `assets` array
- **WHEN** `deriveIdeaRollup` is called
- **THEN** it returns `baseStatus` unchanged

### Requirement: A gate is per-Asset; every pending gate across an Idea's Assets surfaces

`ideaAtGate(idea, gate)` SHALL return `true` only when at least one of the Idea's Assets is
`in_production` with `pending_gate === gate`. `pendingGateNames(assets)` SHALL return the
deduplicated set of gate names across EVERY `in_production` Asset paused at a gate — not just the
Asset at the Idea's rolled-up (earliest) stage — so a Recipe already `produced` (ready to publish)
and a second Recipe still paused at a gate both surface for Operator attention.

#### Scenario: ideaAtGate is false for an in_production Asset with no pending_gate

- **GIVEN** an Asset with `status: "in_production"` and no `pending_gate`
- **WHEN** `ideaAtGate(idea, "cast")` is called
- **THEN** it returns `false` (running, but not paused at a gate)

#### Scenario: pendingGateNames surfaces gates from every in_production Asset, not just the earliest

- **GIVEN** one Idea with Asset A `produced` and Asset B `in_production`/`pending_gate: "cast"`
- **WHEN** the Idea's gates are computed
- **THEN** `"cast"` is surfaced as a pending gate for Asset B even though Asset A's stage
  (`produced`) is later in the lifecycle

### Requirement: findAsset/upsertAsset are pure, keyed by Recipe slug

`findAsset(assets, recipe)` SHALL return the Asset for that Recipe or `null`. `upsertAsset(assets,
recipe, patch)` SHALL insert a new Asset when the Recipe has none yet, or merge `patch` onto the
EXISTING Asset for that Recipe when one exists — in both cases returning a NEW array and never
mutating its input or sibling Assets for other Recipes.

#### Scenario: upsertAsset updates an existing Asset's status without touching a sibling Recipe's Asset

- **GIVEN** an Idea with Assets for Recipe `"r1"` (`queued`) and Recipe `"r2"` (`produced`)
- **WHEN** `upsertAsset(assets, "r1", { status: "in_production", pending_gate: "cast" })` is called
- **THEN** the returned array's `"r1"` Asset reflects the patch
- **AND** the `"r2"` Asset is unchanged

### Requirement: normalizeIdeaStatus is the ONE legacy-fold function, shared by transparent reads and the migration

`normalizeIdeaStatus(raw, defaultRecipe?)` (`src/asset/migrate.ts`) SHALL compute the canonical
`{status, assets}` for one raw idea record. A record already at the canonical grain (`status` already
`suggested`/`accepted`/`rejected`, or `assets` already a parseable array) SHALL pass through
unchanged. A record whose `status` is one of the five RETIRED values (`casting`, `produced`,
`posted`, `tracking`, `scored`) SHALL resolve to `status: "accepted"` plus exactly one Asset at the
matching stage (`casting` → `in_production` + `pending_gate: "cast"`; the other four map 1:1 to the
same-named `AssetStatus`), carrying every populated legacy scalar field (`cast`, `character`,
`asset_url`, `produced_at`, `post_url`, `posted_at`, `performance_score`) onto that Asset. The Asset's
`recipe` SHALL be the Idea's own `recipes[0]` (issue #54's recorded Recipe selection) when present,
else `defaultRecipe` (defaulting to the one wired Recipe slug). A missing or unrecognized status SHALL
degrade to `suggested` with no Assets — it SHALL NEVER throw. This function SHALL be the SAME one
`ledger.ts`'s `loadIdeas`/`loadReport` call transparently on every read (never persisting the result)
and `ledger/migrate-assets.ts`'s migration calls (persisting the result) — one function, two callers,
so a read through a not-yet-migrated ledger and a read through an already-migrated one are
indistinguishable to every downstream consumer.

#### Scenario: A legacy casting record folds to accepted + one Asset paused at the Cast gate

- **GIVEN** a raw record `{ status: "casting", cast: [{identifier, url}, ...] }`
- **WHEN** `normalizeIdeaStatus` is called
- **THEN** it returns `status: "accepted"` and one Asset with `status: "in_production"`,
  `pending_gate: "cast"`, and the Cast candidates carried onto the Asset's `cast` field

#### Scenario: normalizeIdeaStatus is idempotent

- **GIVEN** the OUTPUT of a prior `normalizeIdeaStatus` call, fed back in as `{status, assets}`
- **WHEN** `normalizeIdeaStatus` is called again on that output
- **THEN** the result is equivalent (same status, same Asset content) — normalizing an
  already-normalized record changes nothing

#### Scenario: A missing or garbled status never crashes

- **GIVEN** a raw record with no `status` field, or an unrecognized status string
- **WHEN** `normalizeIdeaStatus` is called
- **THEN** it returns `status: "suggested"` and `assets: []` without throwing

### Requirement: AssetStore is the typed read/write boundary for an Idea's Assets

`src/asset/store.ts` SHALL expose `loadIdeaAssets(ideaId, ledgerPath)` — returning the Idea's
normalized Assets, `null` when the Idea is not found, `[]` when found with none yet — and
`writeAsset(ideaId, recipe, patch, options)` — a thin write shell that loads the full ledger,
NORMALIZES the target Idea (folding any legacy production status onto the grain BEFORE upserting, so
writing onto a not-yet-migrated Idea never silently drops its legacy data), upserts `recipe`'s Asset
with `patch`, and saves — preserving every other field on the target Idea, every sibling Idea, and
every sibling Asset. An unknown `ideaId` SHALL leave the file untouched (the ledger stays canonical —
never invents a record).

`loadIdeaAssets`/`writeAsset` SHALL ALSO accept a `{ db }` option (a real, migrated `DatabaseSync`,
issue #222) as an ADDITIVE overload on the SAME exported names — never a replacement, never a breaking
change to the file-based branch's own code path or callers. When called with `{ db }`, they SHALL
read/write the `asset` SQL table instead of `ledger.json`, keyed on `(idea_id, recipe_slug)` (the
schema's own `UNIQUE` constraint), with the SAME null-vs-`[]` convention: `null` when no `idea` row
exists for `ideaId`, `[]` for a known Idea with no Assets yet. An unknown `ideaId` SHALL leave the
database untouched, mirroring the file branch. The SQL-backed return shape (`DbAssetRecord`) SHALL be
narrower than the file-based `LedgerAssetRecord` — see the "SQL-backed Asset shape" Requirement below
for exactly which fields are out of scope, and why.

#### Scenario: writeAsset on a not-yet-migrated Idea folds its legacy data before upserting

- **GIVEN** an un-migrated Idea record (`status: "casting"`, top-level `cast` field) and a NEW Recipe
  `"carousel"` to add
- **WHEN** `writeAsset(ideaId, "carousel", { status: "queued" }, options)` is called
- **THEN** the Idea's on-disk record ends up with `status: "accepted"` and TWO Assets: the legacy
  `character-explainer-with-cast` Asset (folded, `in_production`/`pending_gate: "cast"`, carrying the
  Cast candidates) and the new `carousel` Asset (`queued`) — neither is lost

#### Scenario: writeAsset for an unknown Idea leaves the ledger untouched

- **GIVEN** a ledger with no Idea matching `ideaId`
- **WHEN** `writeAsset(ideaId, recipe, patch, options)` is called
- **THEN** the ledger file on disk is unchanged

#### Scenario: The { db } branch upserts one asset row, keyed on (idea_id, recipe_slug), never duplicating

- **GIVEN** a real, migrated database with a valid Idea row, and an Asset already written for
  `"character-explainer-with-cast"`
- **WHEN** `writeAsset(ideaId, "character-explainer-with-cast", { status: "in_production", pending_gate:
  "cast" }, { db })` is called
- **THEN** `loadIdeaAssets(ideaId, { db })` still returns exactly ONE Asset for that Recipe, now with the
  updated `status`/`pending_gate`, and any SIBLING Asset on the same Idea is untouched

#### Scenario: The { db } branch leaves the database untouched for an unknown Idea

- **GIVEN** a real, migrated database with no `idea` row for `ideaId`
- **WHEN** `writeAsset(ideaId, recipe, patch, { db })` is called
- **THEN** `loadIdeaAssets(ideaId, { db })` still returns `null` — no `asset` row was created

#### Scenario: Every EXISTING file-based caller and test is unaffected

- **GIVEN** the existing `src/asset/store.test.ts` suite, written entirely against the `ledgerPath`
  branch, and the four real production modules importing `writeAsset`
- **WHEN** the `{ db }` overload is added
- **THEN** every existing test still passes and every existing caller still compiles, with zero source
  changes to either

### Requirement: A one-time migration converges a Brand's ledger onto the Asset grain, idempotently

`src/ledger/migrate-assets.ts`'s `migrateLedgerFile(path)` SHALL, for every Idea in the ledger,
call `normalizeIdeaStatus` and persist the result — but SHALL strip the now-redundant top-level
legacy scalar keys (`cast`, `character`, `asset_url`, `produced_at`, `post_url`, `posted_at`,
`performance_score`) ONLY from a record whose raw `status` was one of the five retired production
statuses (a genuinely FOLDED record) — an already-canonical Idea's inert `null` placeholders for
those same field names SHALL be left untouched. The migration SHALL write to disk ONLY when something
actually changed, and SHALL be idempotent: a second run against an already-migrated ledger SHALL
report `changed: false` for every Idea and SHALL NOT touch the file (byte-identical, mtime included).
A malformed (non-object) idea entry SHALL pass through untouched rather than being fabricated or
dropped.

#### Scenario: Migrating an already-canonical Idea only adds assets:[]

- **GIVEN** an Idea record `{ status: "accepted", post_url: null, posted_at: null,
  performance_score: null }` (today's real-ledger shape)
- **WHEN** the migration runs
- **THEN** the record gains `assets: []`
- **AND** `post_url`/`posted_at`/`performance_score` remain present, still `null`, unstripped

#### Scenario: A second migration run is a no-op

- **GIVEN** a ledger file already migrated once
- **WHEN** `migrateLedgerFile` runs a second time
- **THEN** it reports `changed: false` and `ideasChanged: 0`
- **AND** the file's bytes on disk are unchanged (mtime untouched, since it is never rewritten)

#### Scenario: Migrating the real mundotip and straw-motion ledgers is lossless and idempotent

- **GIVEN** the real `data/brands/mundotip/ledger.json` (10 Ideas) and
  `data/brands/straw-motion/ledger.json` (7 Ideas)
- **WHEN** the migration runs against each
- **THEN** every Idea's `id`/`status`/`title` and every other pre-existing field is preserved
  unchanged, and each Idea gains `assets: []` (neither ledger has ever left `accepted`, so no legacy
  status fold is exercised on real data)
- **AND** running the migration a second time against each reports no further change

### Requirement: A Cast candidate optionally carries a durable local download path, preferring it over the remote URL

`LedgerCastCandidate` (`src/asset/asset.ts`) SHALL gain an optional `path` field alongside its existing
`identifier`/`url` — mirroring `LedgerAssetRecord.asset_paths` vs its legacy `asset_url`: a durable LOCAL
file path is preferred wherever one exists (downloaded by `src/asset/cast-candidates.ts`'s
`downloadCastCandidates`, issue #119), and the remote `url` remains the fallback for a candidate recorded
before this field existed, or whose download genuinely could not be completed. `parseCastCandidate`
SHALL include `path` in its parsed result ONLY when it is itself a non-empty string (never assigned as
`undefined`, keeping the result clean under `exactOptionalPropertyTypes`) — a missing or malformed `path`
SHALL degrade to an identifier/url-only candidate rather than dropping the whole candidate, and SHALL
NEVER throw. `parseCastArray` SHALL preserve this per-candidate: candidates with and without a `path` may
sit side by side in the same array.

#### Scenario: A candidate with a local path parses with path alongside identifier/url

- **GIVEN** a raw Cast candidate `{ identifier: "cast-1", url: "https://x/1.png", path:
  "data/brands/mundotip/ideas/2026-W22/idea-01.character-explainer-with-cast.cast/1-cast-1.png" }`
- **WHEN** `parseCastCandidate` parses it
- **THEN** the result carries `identifier`, `url`, AND `path`, all unchanged

#### Scenario: A candidate with no path parses fine and omits the path key entirely

- **GIVEN** a raw Cast candidate `{ identifier: "cast-1", url: "https://x/1.png" }` (no `path`)
- **WHEN** `parseCastCandidate` parses it
- **THEN** the result carries `identifier`/`url` only — `path` is OMITTED, never present as `undefined`

#### Scenario: A malformed path is dropped, never the whole candidate

- **GIVEN** a raw Cast candidate whose `path` is an empty string or a non-string value
- **WHEN** `parseCastCandidate` parses it
- **THEN** the result still carries `identifier`/`url` — only the malformed `path` is dropped, and
  parsing never throws

#### Scenario: A mixed Cast array preserves each candidate's own path independently

- **GIVEN** a raw Cast array where some candidates carry a `path` and others do not
- **WHEN** `parseCastArray` parses it
- **THEN** each well-formed candidate is kept with exactly its OWN `path` (present or absent), in order

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

### Requirement: An Asset carries an optional has_video_slide flag, the News Carousel Recipe's own extension field (ADR-0024, issue #188)

`LedgerAssetRecord` (`src/asset/asset.ts`) SHALL carry an OPTIONAL `has_video_slide: boolean` field —
Recipe-local, mirroring `cast`/`character` being the *Character Explainer with Cast* Recipe's own
extension fields rather than a universal Asset concept. `parseAssetRecord` SHALL keep this field ONLY
when the raw value is `=== true` — a raw `false`, a missing field, or any non-boolean value SHALL
degrade to the field being omitted entirely from the parsed result (never a stray `false` key, never
fabricated), mirroring `scheduled_at`'s own "never fabricated" contract. This field carries no
`AssetStatus`/lifecycle meaning of its own — it exists solely so
`src/schedule-batch/eligibility.ts` can keep a News Carousel Asset carrying a real video slide out of
the images-only Zoho bulk-export path, the SAME way a non-`"news-carousel"` Recipe's video Asset
already is.

#### Scenario: has_video_slide: true parses and round-trips

- **GIVEN** an Asset record with `has_video_slide: true`
- **WHEN** the record is parsed via `parseAssetRecord`
- **THEN** the parsed Asset carries `has_video_slide: true`

#### Scenario: has_video_slide: false is omitted entirely — never a stray false key

- **GIVEN** an Asset record with `has_video_slide: false`
- **WHEN** the record is parsed via `parseAssetRecord`
- **THEN** the parsed Asset carries NO `has_video_slide` key at all

#### Scenario: A missing or malformed has_video_slide is omitted, never fabricated, never throws

- **GIVEN** an Asset record whose `has_video_slide` is absent, or a non-boolean value (e.g. the string
  `"yes"`)
- **WHEN** the record is parsed via `parseAssetRecord`
- **THEN** the parsed Asset carries no `has_video_slide` key at all, and parsing does not throw

#### Scenario: has_video_slide introduces no new AssetStatus

- **GIVEN** an Asset record with `has_video_slide: true` and `status: "produced"`
- **WHEN** the record is parsed
- **THEN** the parsed Asset's `status` is still `"produced"` — no new status is ever produced

### Requirement: An Asset carries an optional camera_hub_uploaded_at marker, the News Short Script Recipe's own extension field (ADR-0027, issue #189)

`LedgerAssetRecord` (`src/asset/asset.ts`) SHALL carry an OPTIONAL `camera_hub_uploaded_at: string`
field — Recipe-local, mirroring `scheduled_at`/`zoho_schedule_reference`/`has_video_slide` being a
convenience marker rather than a universal Asset concept with lifecycle meaning of its own.
`parseAssetRecord` SHALL keep this field ONLY when the raw value is a non-empty string — a missing,
blank, or non-string value SHALL degrade to the field being omitted entirely from the parsed result
(never fabricated), mirroring `scheduled_at`'s own "never fabricated" contract. This field carries NO
`AssetStatus`/lifecycle meaning of its own — ADR-0011's six-stage vocabulary is unchanged; a Recipe's
Asset with `camera_hub_uploaded_at` set keeps whatever `status` it already had. It exists solely so
`src/camera-hub/news-short-script.ts`'s `selectUnuploadedNewsShortScripts` can skip an Asset already
uploaded to Camera Hub, so re-running the offer never double-uploads.

#### Scenario: A well-formed camera_hub_uploaded_at parses and round-trips

- **GIVEN** an Asset record with a well-formed ISO-8601 `camera_hub_uploaded_at`
- **WHEN** the record is parsed via `parseAssetRecord`, written, and read back
- **THEN** the read-back Asset's `camera_hub_uploaded_at` is byte-identical to the original value

#### Scenario: A missing or malformed camera_hub_uploaded_at is omitted, never fabricated, never throws

- **GIVEN** an Asset record whose `camera_hub_uploaded_at` is absent, blank, or a non-string value (e.g.
  a number)
- **WHEN** the record is parsed via `parseAssetRecord`
- **THEN** the parsed Asset carries no `camera_hub_uploaded_at` key at all, and parsing does not throw

#### Scenario: camera_hub_uploaded_at introduces no new AssetStatus

- **GIVEN** an Asset record with a well-formed `camera_hub_uploaded_at` and any valid `status` (e.g.
  `"posted"`)
- **WHEN** the record is parsed
- **THEN** the parsed Asset's `status` is unchanged — no new status is ever produced

#### Scenario: A write to one Asset does not erase a sibling Asset's camera_hub_uploaded_at

- **GIVEN** an Idea with two Assets, the first carrying `camera_hub_uploaded_at`
- **WHEN** the second Asset is updated via `upsertAsset`
- **THEN** re-reading the Idea's Assets shows the first Asset's `camera_hub_uploaded_at` unchanged

### Requirement: asset_media is stored as rows, replacing the file branch's asset_paths/asset_url fields

`src/asset/store.ts`'s `addAssetMedia`/`addAssetMediaBatch`/`listAssetMedia` SHALL be the typed
boundary for the `asset_media` table — one row per produced media item (image/video/audio), ordered by
`ordinal`. `addAssetMedia` SHALL delegate to `src/db/media-ref.ts`'s `insertAssetMedia`, so an
absolute/home-shorthand/traversal `storageKey` is rejected (`StorageKeyError`) BEFORE any row is
written — the same store-boundary guard the rest of the SQLite foundation enforces, never
re-implemented a second time. `addAssetMediaBatch` SHALL write every item inside ONE transaction
(`withTransaction`): a failure on any item (an invalid storage key, or a duplicate `ordinal` on the
same Asset — the schema's own `UNIQUE (asset_id, ordinal)`) SHALL roll back the WHOLE batch, including
items that individually would have succeeded.

#### Scenario: addAssetMedia rejects an absolute storage key before writing any row

- **GIVEN** a real, migrated database with a valid Asset
- **WHEN** `addAssetMedia` is called with an absolute `storageKey`
- **THEN** it throws `StorageKeyError`, and `listAssetMedia` for that Asset returns `[]`

#### Scenario: addAssetMediaBatch rolls back the WHOLE batch when one item fails partway through

- **GIVEN** a real, migrated database with a valid Asset, and a batch of three media items where the
  third duplicates the first's `ordinal`
- **WHEN** `addAssetMediaBatch` is called with that batch
- **THEN** it throws a uniqueness error, and `listAssetMedia` for that Asset returns `[]` — not even the
  first two, individually-valid items survive

#### Scenario: listAssetMedia returns every row for an Asset, in ordinal order

- **GIVEN** media items added out of ordinal order (`ordinal: 1` then `ordinal: 0`)
- **WHEN** `listAssetMedia` is called
- **THEN** the returned array is ordered `[0, 1]` by `ordinal`, not insertion order

### Requirement: The SQL-backed Asset shape is narrower than the file-based LedgerAssetRecord, by documented design

`DbAssetRecord` (the `{ db }` branch's return shape) SHALL carry exactly the columns the `asset` table
(`src/db/schema.ts`, frozen from issue #201) defines: `id`, `ideaId`, `recipe`, `status`,
`pending_gate`, `spec` (the Production Spec JSON, from `spec_json`), `produced_at`, `scheduled_at`,
`camera_hub_uploaded_at`, `zoho_schedule_reference`, `created_at`, `updated_at`. It SHALL NOT carry
`cast`/`character` (the *Character Explainer with Cast* Recipe's own gate-local fields — no column
exists, and the Recipe's own survival is an explicitly open epic question), `has_video_slide` (the News
Carousel Recipe's own extension flag — no column exists), or `metrics`/`tracked_at`/`history`/
`post_url`/`posted_at`/`performance_score` (ADR-0028 moves these OFF the Asset entirely onto
`post`/`metric_snapshot`/`performance_score`, keyed by Channel — not built by this ticket). This is a
documented, deliberate scope boundary, not a silent truncation of the file-based shape.

#### Scenario: zoho_schedule_reference round-trips verbatim, string or array

- **GIVEN** a Production Spec-bearing Asset written via `writeAsset(..., { zoho_schedule_reference:
  ["fb_post_1", "ig_post_1"] }, { db })`
- **WHEN** it is read back via `loadIdeaAssets(ideaId, { db })`
- **THEN** `zoho_schedule_reference` equals `["fb_post_1", "ig_post_1"]`, unchanged in shape

#### Scenario: A patch touching only cast/character/metrics-shaped fields is rejected by the type system, not silently dropped

- **GIVEN** the `DbAssetPatch` type, which has no `cast`/`character`/`metrics`/`post_url` keys
- **WHEN** a caller attempts to pass one of those keys to the `{ db }` overload of `writeAsset`
- **THEN** it is a compile-time TypeScript error, not a runtime silent no-op

### Requirement: getAssetById looks up one Asset by its own stable id

`src/asset/store.ts`'s `getAssetById(db, id)` SHALL return the SQL-backed `DbAssetRecord` for `id`, or
`null` for an unknown id — never throws. This is the lookup a `job` row's own `asset_id` needs: a `job`
row carries only `asset_id`, never `(idea_id, recipe_slug)` directly, so a caller holding a job's claimed
record cannot reach its Asset's Production Spec/status through `loadIdeaAssets` (which is keyed by Idea)
without first resolving the Asset by id.

#### Scenario: A known Asset id resolves to its full record, including its saved Spec

- **GIVEN** an Asset saved with `status: 'queued'` and a Production Spec
- **WHEN** `getAssetById(db, assetId)` is called
- **THEN** it returns the Asset's full record, including `spec`

#### Scenario: An unknown Asset id returns null, never throws

- **GIVEN** an id that names no `asset` row
- **WHEN** `getAssetById(db, id)` is called
- **THEN** it returns `null`

