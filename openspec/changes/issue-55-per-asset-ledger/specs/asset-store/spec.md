## ADDED Requirements

### Requirement: An Idea carries a list of per-Recipe Assets; production state lives on the Asset

The system SHALL define an `AssetStatus` type — `"queued" | "in_production" | "produced" | "posted" |
"tracking" | "scored"` — and a `LedgerAssetRecord` shape `{ recipe, status, pending_gate?, spec_path?,
copy?, cast?, character?, asset_url?, produced_at?, post_url?, posted_at?, performance_score? }`
(`src/asset/asset.ts`). Only `recipe` and `status` are required. `casting` SHALL NOT be a valid
`AssetStatus` — it is retired; the *Character Explainer with Cast* Recipe's Cast pick is represented
as `status: "in_production"` with `pending_gate: "cast"` — a PAUSE inside `in_production`, never a
stage of its own. An Idea SHALL carry `assets: LedgerAssetRecord[]`, one entry per chosen Recipe.

#### Scenario: isAssetStatus rejects the retired "casting" value

- **GIVEN** the string `"casting"`
- **WHEN** `isAssetStatus("casting")` is called
- **THEN** it returns `false`

#### Scenario: A Cast-gate pause is represented as in_production + pending_gate, not a stage

- **GIVEN** an Asset for the *Character Explainer with Cast* Recipe paused at its Cast pick
- **WHEN** the Asset record is inspected
- **THEN** its `status` is `"in_production"` and its `pending_gate` is `"cast"`

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
