# importer Specification

## Purpose
TBD - created by archiving change issue-204-importer-and-rehearsals. Update Purpose after archive.
## Requirements
### Requirement: The importer reads exclusively through existing loaders and normalisers, never raw JSON

`src/importer/plan.ts`'s `planImport` SHALL read every source record through the existing typed loaders
this repo already ships — `src/ledger/ledger.ts`'s `loadFullIdeas` (an additive extension of the SAME
module `loadIdeas`/`loadReport` already use, running every record through the SAME
`normalizeIdeaStatus` normalizer), `src/format/store.ts`'s `listFormatSlugs`/`loadFormat`,
`src/format/brief-path.ts`'s `resolveBriefPathCandidates`, `src/production-spec/brand-profile.ts`'s
`loadZohoConfig`/`loadCopyRules`/`loadWatermarkHandle`, and `src/production-queue/store.ts`'s
`loadQueue` — and SHALL NOT parse a ledger, Format file, Brand Profile, or `data/queue.json` from raw
JSON/YAML anywhere else in this change.

#### Scenario: a legacy un-migrated production status still folds through the same normalizer

- **GIVEN** a raw ledger Idea record with `status: "produced"` and a legacy `asset_url` (no `assets`
  array populated yet)
- **WHEN** `loadFullIdeas` reads it
- **THEN** the returned record's `status` is `"accepted"` and its `assets` array carries one folded
  Asset — the SAME transformation `normalizeIdeaStatus` already performs for `loadIdeas`

#### Scenario: the real MundoTip and Straw Motion ledgers both load successfully through the same path

- **GIVEN** the real `data/brands/mundotip/ledger.json` and `data/brands/straw-motion/ledger.json`
- **WHEN** `planImport` is run against a checkout containing them
- **THEN** it succeeds (`ok: true`) and every Idea in both ledgers is accounted for in the resulting plan

### Requirement: Anything the importer cannot parse causes a refusal naming the record, never a silent drop or a repair

`planImport` SHALL collect every problem it finds across BOTH Brands into one list and refuse
(`ok: false`) rather than writing anything, when that list is non-empty. It SHALL NOT stop at the first
problem found, and SHALL NOT silently drop, null, or repair a record it cannot make sense of.
`src/importer/load-queue-strict.ts`'s `loadQueueStrict` SHALL turn any `console.warn` the existing
(deliberately tolerant) `loadQueue` emits into a named problem, so a malformed `data/queue.json` job
becomes a refusal instead of a silent omission.

#### Scenario: a missing Brief is a refusal, naming every candidate path tried

- **GIVEN** an Idea record with no Brief file at any of its candidate paths
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false` with a problem naming the Idea's id and every candidate path tried

#### Scenario: an Idea referencing an unresolvable Trend is a refusal

- **GIVEN** an Idea whose `trend_id` names a Trend absent from both the Idea's own inline `trend_label`
  and that Run's `trends.json`
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false` with a problem naming the Idea and the unresolved Trend id

#### Scenario: a foreign absolute path the importer cannot safely relativize is a refusal

- **GIVEN** an Asset's `asset_paths` entry that is an absolute path under a root OTHER than the
  configured `legacyAbsolutePrefix`
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false` with a problem naming the offending path

#### Scenario: a queue.json job the tolerant loader would drop is a refusal instead

- **GIVEN** a `data/queue.json` job record with an invalid `status` value
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false` with a problem naming the dropped job, rather than silently omitting it
  the way the underlying `loadQueue` would on its own

#### Scenario: a malformed data/queue.json top-level shape is a refusal, not a silent empty queue

- **GIVEN** a `data/queue.json` whose top level is not the expected `{ jobs: [...] }` object shape
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false` naming the malformed shape, rather than silently proceeding as if the
  queue held zero jobs

#### Scenario: a ledger record loadFullIdeas silently skipped is a refusal, not an unnoticed count drop

- **GIVEN** a Brand's `ledger.json` whose raw `ideas` array holds a record with no string `id` (a shape
  `loadFullIdeas` — mirroring `loadIdeas`'s own established convention — skips without raising a
  problem of its own)
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false` naming the Brand and the mismatch between the ledger's raw record count
  and the count `loadFullIdeas` actually returned — never silently continuing with fewer Ideas than the
  source file holds

#### Scenario: a rejected Idea with no rejection_reason is a refusal at planning time, not an execution-time crash

- **GIVEN** an Idea whose resolved status is `rejected` and which carries no `rejection_reason`
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false` naming the Idea — never reaching `executeImport`, where the store's own
  `rejectIdea` would otherwise throw for the same reason mid-write

### Requirement: The importer is rehearsable — runs against a copy of data/, and refuses to run against a non-empty database

`src/importer/cli.ts`'s `importCommand` SHALL accept an explicit `--checkout-root` distinct from the
process's own working directory, so it can be pointed at a copy of `data/` instead of the real
checkout. It SHALL refuse, with a clear and actionable message, to run against a target database that
already holds at least one Brand — the import is one-shot and not incremental (no source file carries
`updated_at`, a version, or an etag), so a second run against an already-populated database is a
programmer/Operator error to be refused loudly, never a partial double-write.

#### Scenario: a full rehearsal against a copy of data/ succeeds and reconciles

- **GIVEN** a read-only copy of the real `data/` directory at a scratch location
- **WHEN** `npm run import-data --` is run with `--checkout-root`/`--db` pointed at that copy
- **THEN** it succeeds and the resulting database's per-entity counts match the source ledgers/queue
  exactly (61 Ideas, 54 Assets, 66 jobs, across both Brands)

#### Scenario: re-running against the same, now-populated database is refused

- **GIVEN** a database `importCommand` has already successfully imported into
- **WHEN** `importCommand` is run again against that SAME database file
- **THEN** it throws, naming the database path and the Brands already present, and writes nothing further

#### Scenario: a fresh, empty database imports cleanly

- **GIVEN** a freshly-migrated, empty SQLite database
- **WHEN** `importCommand` runs against it
- **THEN** it succeeds without needing any prior state

### Requirement: Golden-file coverage exists for every legacy shape named by this change

Dedicated tests SHALL exist, each naming a specific real record, proving: MundoTip's pre-Format Idea
shape (no `format` field at all); Straw Motion's three Idea shapes (no Assets yet; Assets populated with
a canonical top-level status; Assets populated with a stale legacy top-level status); Straw Motion's
three Idea ID schemes (bare `idea-NN`, ISO-week-embedded `idea-<week>-NN`, calendar-date-embedded
`idea-<date>-NN`); and all four real folder layouts a Brief can live under (legacy flat; Format-
namespaced flat weekly; Format-namespaced flat daily; nested-daily per ADR-0023).

#### Scenario: MundoTip's pre-Format Idea resolves its Brief without a format field

- **GIVEN** the real record `idea-2026-W22-01` (no `format` field)
- **WHEN** its Brief is resolved
- **THEN** it is found via the legacy-flat reconstruction candidate, with no format-namespaced candidate
  attempted first

#### Scenario: the third Straw Motion Idea shape resolves to accepted

- **GIVEN** the real record `idea-2026-08-11-12`, whose `assets` array is already populated but whose
  raw top-level `status` is the retired value `"produced"`
- **WHEN** `resolveIdeaStatus` is applied to it
- **THEN** it resolves to `"accepted"`

#### Scenario: the nested-daily folder layout is proven live, not just by the pure resolver's own tests

- **GIVEN** the real record `idea-2026-08-14-01`, whose Run id is the flat date `"2026-08-14"` but whose
  `brief_path` points into the nested `unhypped-daily/2026-W33/friday-14-august/` folder
- **WHEN** its Brief is loaded via that recorded `brief_path`
- **THEN** it is found

### Requirement: Duplicate job identity keys are reported for an Operator decision, never resolved by the importer

`planImport` SHALL group `data/queue.json` jobs by the composite `(brand, idea_id, recipe)` identity and
SHALL surface every group with more than one job on the resulting plan's `duplicateJobKeys`, without
merging, deduplicating, or dropping any of the individual jobs — each SHALL still be imported as its own
`job` row.

#### Scenario: two genuine duplicate jobs both import as separate rows, and are named on the report

- **GIVEN** two `data/queue.json` jobs sharing the exact same `(brand, idea_id, recipe, gate)` (a real
  re-run, not a Cast-gate two-leg pair)
- **WHEN** the plan is executed
- **THEN** the database holds two separate `job` rows, and the reconciliation names the duplicate pair
  with each job's own `gate`/`status`/`enqueued_at`/`pick`

#### Scenario: a legitimate two-leg Cast-gate pair is also reported, without being treated differently

- **GIVEN** a `(brand, idea_id, recipe)` pair with two jobs — one at `gate: "cast"`, one at `gate: null`
  with a resolved `pick`
- **WHEN** the plan runs
- **THEN** the pair appears on `duplicateJobKeys` (same composite key, two jobs) exactly like a genuine
  re-run — this importer does not attempt to distinguish the two cases; both are named for the Operator

### Requirement: Dead media paths are reported for an Operator decision, never silently nulled

`src/importer/plan-asset-media.ts`'s `planAssetMedia` SHALL detect a legacy `asset_paths` entry that
converts to a valid root-relative storage key but does not exist on disk, and SHALL surface it on the
plan's `deadMediaPaths` by name — never creating an `asset_media` row with a fabricated `bytes`/
`checksum`, and never omitting it from the report.

#### Scenario: a dead path produces no asset_media row and is named on the reconciliation

- **GIVEN** an Asset's `asset_paths` entry that relativizes cleanly but whose file does not exist
- **WHEN** the plan is built and executed
- **THEN** no `asset_media` row exists for that entry, and it appears by name (Brand, Idea, Recipe,
  ordinal, storage key) in the final reconciliation's dead-media-paths section

#### Scenario: the real 8 dead media paths are all four W33-Friday news-short-script output files

- **GIVEN** the real Straw Motion ledger
- **WHEN** the rehearsal runs against a full copy of `data/`
- **THEN** exactly 8 dead media paths are reported, each a `script.txt` or `shot-list.txt` reference
  under `unhypped-daily/2026-W33/friday-14-august/` for one of Ideas `idea-2026-08-14-01/03/05/12`

### Requirement: Absolute legacy paths are converted to root-relative storage keys; none survive into the database

Every legacy `asset_paths` entry SHALL be converted to a root-relative storage key
(`src/importer/storage-key-from-legacy-path.ts`'s `relativizeLegacyPath`) before it is ever written to
`asset_media.storage_key` — the store boundary's own `assertRootRelativeStorageKey`
(`src/db/storage-key.ts`) already rejects an absolute path at the write itself, so this is the thing
that makes a legacy absolute path writable in the first place, never a way around that rejection.

#### Scenario: an absolute legacy path under the recognized prefix is stripped to a relative key

- **GIVEN** an `asset_paths` entry starting with the configured `legacyAbsolutePrefix`
- **WHEN** it is planned and executed
- **THEN** the resulting `asset_media.storage_key` is root-relative, with the prefix removed

#### Scenario: no absolute path survives anywhere in a real rehearsal's database

- **GIVEN** the full rehearsal against a real copy of `data/`
- **WHEN** every `asset_media.storage_key` in the resulting database is inspected
- **THEN** none begins with `/`

### Requirement: hook_type and theme are always unclassified on import; Source(s) parsing extracts links, never editorial notes

Every imported Idea SHALL be created with `hook_type: "unclassified"` and `theme: "unclassified"` —
never inferred from a Brief's own `## Hook concept`/`Hook Concept` prose (that classification is issue
#206's job). `src/importer/source-urls.ts`'s `extractSourceUrls` SHALL extract every `https?://` URL
substring found in a Brief's `## Source(s)` section and SHALL drop a bullet that carries no URL at all
(a pure editorial/verification note) — never treating such a note as a citation.

#### Scenario: every imported Idea is unclassified regardless of its Brief's own hook prose

- **GIVEN** a Brief containing a rich `## Hook concept` section
- **WHEN** the Idea is imported
- **THEN** its `hook_type` and `theme` are both `"unclassified"`

#### Scenario: a Source(s) bullet with no URL is dropped, never mistaken for a citation

- **GIVEN** a Brief's `## Source(s)` section containing one bullet with a real URL and one bullet that is
  a pure editorial note (e.g. "(No distinct official corporate blog post was found for this feature.)")
- **WHEN** `extractSourceUrls` runs
- **THEN** only the real URL is returned

### Requirement: every write routes through the typed command surface, in dependency order

`src/importer/execute.ts`'s `executeImport` SHALL write an already-validated `ImportPlan` exclusively
through `src/command-surface/` functions — never a store directly — in the order Brand → Format → Run →
Trend → Idea (+ Review decision) → Asset → Asset Media → Job, so that a Trend a later Idea references
always already exists (a dangling `trendId` otherwise raises a raw FOREIGN KEY error, issue #228) and
every Job's Asset already has a real id before the Job is created.

#### Scenario: a Trend is always created before any Idea that references it

- **GIVEN** a plan with one Run carrying a Trend and one Idea referencing that Trend's legacy id
- **WHEN** the plan is executed
- **THEN** the resulting Idea's `trend_id` resolves to a real, already-committed `trend` row — no
  FOREIGN KEY error occurs

#### Scenario: a job reaches its real historical status through the same legal transitions a live run would use

- **GIVEN** a planned job whose target status is `"done"`
- **WHEN** it is executed
- **THEN** it is created via `enqueueJob` → `claimJob` → `releaseJob` (never a raw status write), ending
  at `status: "done"` with its original `enqueued_at` preserved

### Requirement: the run ends with a per-entity reconciliation — counts in versus counts out, for both Brands

`src/importer/reconcile.ts`'s `buildReconciliation` SHALL compute, per Brand and in total, the count of
Ideas, Assets, and Jobs the plan says should exist ("counts in") alongside a REAL query against the
database after `executeImport` ran ("counts out" — never an echo of the plan's own numbers), plus the
dead-media-paths and duplicate-job-identity-keys reports. `formatReconciliationMarkdown` SHALL render
this as human-readable Markdown suitable for posting on the tracked issue.

#### Scenario: counts in and counts out match after a clean import

- **GIVEN** a plan that executes cleanly
- **WHEN** the reconciliation is built
- **THEN** every Brand's Ideas/Assets/Jobs counts-in equal its counts-out, and the totals equal 61
  Ideas, 54 Assets, and 66 jobs for the real corpus

#### Scenario: a mismatch between counts in and counts out is visible, never hidden

- **GIVEN** a plan whose `executeImport` was never actually run against the database being reconciled
- **WHEN** the reconciliation is built
- **THEN** counts-out is zero while counts-in reflects the plan — the mismatch is directly visible in
  the report, not silently reconciled away

