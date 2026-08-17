## MODIFIED Requirements

### Requirement: The importer reads exclusively through existing loaders and normalisers, never raw JSON

`src/importer/plan.ts`'s `planImport` SHALL read every source record through the existing typed loaders
this repo already ships — `src/ledger/ledger.ts`'s `loadFullIdeas` (an additive extension of the SAME
module `loadIdeas`/`loadReport` already use, running every record through the SAME
`normalizeIdeaStatus` normalizer), `src/format/store.ts`'s `listFormatSlugs`/`loadFormat`,
`src/format/brief-path.ts`'s `resolveBriefPathCandidates`, `src/production-spec/brand-profile.ts`'s
`loadZohoConfig`/`loadCopyRules`/`loadWatermarkHandle`/`loadChannels`, and
`src/production-queue/store.ts`'s `loadQueue` — and SHALL NOT parse a ledger, Format file, Brand
Profile, or `data/queue.json` from raw JSON/YAML anywhere else in this change.

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

### Requirement: every write routes through the typed command surface, in dependency order

`src/importer/execute.ts`'s `executeImport` SHALL write an already-validated `ImportPlan` exclusively
through `src/command-surface/` functions — never a store directly — in the order Brand → Channel →
Format → Run → Trend → Idea (+ Review decision) → Asset → Asset Media → Post → Job, so that a Trend a
later Idea references always already exists (a dangling `trendId` otherwise raises a raw FOREIGN KEY
error, issue #228), every Job's Asset already has a real id before the Job is created, and every Asset's
Post always has a real, already-committed Channel row to key against before it is logged.

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

#### Scenario: a Brand's Channels are created before any of its Assets

- **GIVEN** a Brand whose plan carries one Channel and one Idea with an Asset that logs a Post
- **WHEN** the plan is executed
- **THEN** the Channel row exists before the Asset's Post is logged, so `logPost` never raises a
  FOREIGN KEY error for a Channel that has not been created yet

### Requirement: the run ends with a per-entity reconciliation — counts in versus counts out, for both Brands

`src/importer/reconcile.ts`'s `buildReconciliation` SHALL compute, per Brand and in total, the count of
Ideas, Assets, Jobs, and Posts the plan says should exist ("counts in") alongside a REAL query against
the database after `executeImport` ran ("counts out" — never an echo of the plan's own numbers), plus
the dead-media-paths and duplicate-job-identity-keys reports. `formatReconciliationMarkdown` SHALL
render this as human-readable Markdown suitable for posting on the tracked issue, and SHALL state, in
prose on the report itself, exactly which entities this reconciliation counts and cross-checks (Ideas,
Assets, Jobs, Posts) and which it does not (at minimum: Brand, Channel, Format, Run, Trend,
`idea_recipe`, `asset_media`, `gate_request`, `copy_variant`, `metric_snapshot`, `performance_score`,
`channel_baseline`, `brand_asset`, `baseline_prompt`) — so a category never named on this report can
never again be mistaken for one this report has verified.

#### Scenario: counts in and counts out match after a clean import

- **GIVEN** a plan that executes cleanly
- **WHEN** the reconciliation is built
- **THEN** every Brand's Ideas/Assets/Jobs/Posts counts-in equal its counts-out, and the totals equal 61
  Ideas, 54 Assets, 66 jobs, and 7 Posts for the real corpus

#### Scenario: a mismatch between counts in and counts out is visible, never hidden

- **GIVEN** a plan whose `executeImport` was never actually run against the database being reconciled
- **WHEN** the reconciliation is built
- **THEN** counts-out is zero while counts-in reflects the plan — the mismatch is directly visible in
  the report, not silently reconciled away

#### Scenario: the report states what it does and does not cover, in prose, on the report itself

- **GIVEN** any built reconciliation report
- **WHEN** it is rendered to Markdown
- **THEN** it names Ideas, Assets, Jobs, and Posts as the entities it counts and cross-checks, and
  separately names at least one entity it creates but does NOT independently count (e.g.
  `channel_baseline`) — so a reader of the report alone, not just this file's source, can see the
  boundary of what a clean reconciliation actually proves

## ADDED Requirements

### Requirement: An Asset's post_url resolves to a Channel from its own URL, never assumed, and becomes a Post row

`src/importer/resolve-post-platform.ts`'s `resolvePostPlatform` SHALL determine the platform an Asset's
logged `post_url` was published to purely from the URL's own hostname — never assumed from the Brand's
primary Channel, and never hardcoded to any single platform. `src/importer/plan-idea.ts`'s
`planOneAsset` SHALL treat an Asset carrying both `post_url` and `posted_at` as a Post to import: the
resolved platform SHALL be checked against that specific Brand's own configured Channel platforms
(planned from `brand-profile.yaml`'s `channel` list); a platform the Brand has no configured Channel
for, or a `post_url` that does not resolve to any of `KNOWN_PLATFORMS`, SHALL be a named refusal —
exactly like every other unparseable record this importer refuses on, never a silent drop.
`src/importer/execute.ts`'s `executeImport` SHALL log each resolved Post through
`src/command-surface/index.ts`'s `logPost`, keyed `(asset_id, channel_id)` per ADR-0028 — never a store
bypassed.

#### Scenario: a Facebook post_url resolves against the Brand's own configured Facebook Channel

- **GIVEN** a Brand whose `channel` list includes a `primary: true` `facebook` entry, and an Asset whose
  `post_url` is a `facebook.com` permalink carrying a `posted_at`
- **WHEN** the plan is built and executed
- **THEN** a `post` row exists for that Asset, with `channel_id` referencing the Brand's own `facebook`
  `channel` row — never a hardcoded platform

#### Scenario: a post_url resolving to a platform the Brand has no configured Channel for is a refusal

- **GIVEN** an Asset whose `post_url` resolves to `"instagram"` and a Brand whose `channel` list carries
  no `instagram` entry
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the Idea, the Asset, and the unresolved platform

#### Scenario: a post_url that does not resolve to any known platform at all is a refusal

- **GIVEN** an Asset's `post_url` pointing at a host matching none of `KNOWN_PLATFORMS`
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the offending URL

#### Scenario: a post_url with no posted_at is a refusal, never a fabricated timestamp

- **GIVEN** an Asset carrying `post_url` but no `posted_at`
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the Idea and Asset — no `post` row is ever created with a
  fabricated `posted_at`

### Requirement: An Asset with no post_url produces no Post row

`src/importer/plan-idea.ts`'s `planOneAsset` SHALL only carry `postUrl`/`postedAt`/the resolved
`postPlatform` onto a `PlannedAsset` when the source ledger Asset record itself carries a `post_url`.
`src/importer/execute.ts`'s `executeImport` SHALL only call `logPost` for an Asset whose plan carries a
`postUrl` — an Asset with none writes no `post` row, so the reconciliation's Posts count reflects only
Assets that were genuinely published.

#### Scenario: an Asset with no post_url writes no post row

- **GIVEN** two Assets on the same Idea, only one carrying a `post_url`
- **WHEN** the plan is executed
- **THEN** exactly one `post` row exists in the database, and it belongs to the Asset that carried
  `post_url` — a direct `COUNT(*)` against `post` proves it, not an inference from the plan alone

### Requirement: Golden-file coverage exists for the real Straw Motion Posts

A dedicated test SHALL prove the real shape of Straw Motion's 7 `post_url`-carrying Assets directly
against `data/brands/straw-motion/ledger.json` — including confirming whether any of the 7 share an
Idea, so the shape asserted elsewhere in this change's test suite (a single Asset per Idea) is proven
against the real data, not assumed.

#### Scenario: the real 7 W32 news-carousel Posts each belong to a distinct Idea, and all resolve to facebook

- **GIVEN** the real `data/brands/straw-motion/ledger.json`
- **WHEN** its `post_url`-carrying Assets are identified
- **THEN** there are exactly 7, all Recipe `news-carousel`, all from Run `2026-W32`, all resolve to
  `facebook` via `resolvePostPlatform`, and no two share an Idea id
