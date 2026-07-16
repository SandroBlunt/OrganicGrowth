## Why

ADR-0009 breaks the old "one Idea → at most one Asset" invariant: the Operator now picks **1..N
Recipes per Idea** at Review, and each Recipe yields its own Asset. Today (before this slice)
production state is still a handful of flat scalars on the ONE Idea record — `status` (which can be
`casting` / `produced` / `posted` / `tracking` / `scored`), plus `cast`, `character`, `asset_url`,
`post_url`, `posted_at`, `performance_score`. A scalar status can't say "the Reel is mid-production
while the carousel is already posted," and a single `asset_url`/`post_url` would be overwritten by a
second Recipe's job. ADR-0011 is the fix: move production state OFF the Idea and onto a per-Recipe
**Asset**. ADR-0014 says the reshape stays behind a typed store boundary (files remain the storage
for the MVP; the boundary is the productization contract). This is the **load-bearing schema
change** of the multi-format epic (#53–#60) — and, per ADR-0011's own "Why," it is nearly free right
now because **no live Brand ledger has ever populated a production field**: `mundotip` has 10 Ideas,
all `suggested`/`accepted`/`rejected`; `straw-motion` has 7, all `suggested`. Doing the reshape now,
before the first real Asset lands, avoids a much more expensive migration later.

## What Changes

- **Add the Asset pure deep module** (`src/asset/asset.ts`): `AssetStatus` (`queued → in_production →
  produced → posted → tracking → scored`; `casting` is retired), `LedgerAssetRecord` (`{ recipe,
  status, pending_gate?, spec_path?, copy?, cast?, character?, asset_url?, produced_at?, post_url?,
  posted_at?, performance_score? }` — `cast`/`character` are the *Character Explainer with Cast*
  Recipe's own gate-local extension fields, needed to keep that Recipe's Cast pick working at this
  grain), defensive parsing, `findAsset`/`upsertAsset` (pure, keyed by recipe), the Idea-level
  roll-up (`deriveIdeaRollup`, `rollupAssetStatus` — the EARLIEST Asset stage wins, mirroring
  `phase-resolver`'s existing `earlierPhase`), and the gate-folding helpers `ideaAtGate`/
  `ideaHasAssetStatus`/`pendingGateNames` that replace every flat `idea.status === "casting"`-style
  check.
- **Add the legacy→Asset-grain normalizer** (`src/asset/migrate.ts`): `normalizeIdeaStatus(raw)` is
  the ONE function that folds a raw idea record (however it is currently shaped) onto the canonical
  `{status, assets}` grain — narrowing `status` to `suggested`/`accepted`/`rejected` and folding any
  of the five retired production statuses onto one Asset (`casting` → `in_production` +
  `pending_gate: "cast"`; `produced`/`posted`/`tracking`/`scored` → the matching Asset stage, with
  every populated scalar field carried across). This ONE function is shared by two callers: the
  ledger's readers (`loadIdeas`/`loadReport`), which run it TRANSPARENTLY on every read and never
  persist the result — this is what keeps an **un-migrated ledger loading correctly** — and the
  one-time migration script, which persists it.
- **Add `AssetStore`** (`src/asset/store.ts`): `loadIdeaAssets`/`writeAsset` — the typed store
  boundary for the Assets nested inside a Brand's `ledger.json` (ADR-0014: every entity behind a
  typed store; Assets are relational data (Idea → many Assets, keyed by Recipe), not a document a
  human hand-authors, so — unlike `FormatStore`'s YAML — it gets both a read AND a write shell).
  `writeAsset` normalizes the target Idea before upserting, so writing onto a not-yet-migrated Idea
  never silently drops its legacy production data.
- **Add the one-time, idempotent migration** (`src/ledger/migrate-assets.ts`): `migrateLedgerFile`
  adds `assets: []` to every Idea that doesn't have one, folds any legacy production status onto one
  Asset, and strips the now-redundant top-level scalar keys — but ONLY for a record that actually HAD
  a legacy production status; an already-canonical Idea's inert `null` placeholders
  (`post_url`/`posted_at`/`performance_score`, which the real ledgers pre-populate on every Idea) are
  left untouched, so the real-file diff stays minimal. Idempotent: a second run reports
  `changed: false` for every Idea and does not touch the file (mtime included). Run via
  `npx tsx src/ledger/migrate-assets.ts <brand>|--all`; this slice runs it against BOTH real ledgers
  (`data/brands/mundotip/ledger.json`, `data/brands/straw-motion/ledger.json`) — the only observable
  change is `"assets": []` added to each of the 17 Ideas, since neither ledger has ever left
  `accepted`.
- **Re-grain `src/ledger/ledger.ts`**: `IdeaStatus` narrows to `"suggested" | "accepted" |
  "rejected"`; `LedgerIdea` gains `assets?: readonly LedgerAssetRecord[]`; `loadIdeas`/`loadReport`
  normalize every record on read (transparent, never persisted — the reader-tolerance mechanism);
  `loadReport`'s `ReportIdea.status` becomes the Idea's DERIVED roll-up (`deriveIdeaRollup`), not the
  raw stored status. The now-dead ADR-0004 Phase A/B scalar write functions
  (`ledgerStatusForTransition`, `applyIdeaStatus`, `writeIdeaStatus`, `applyIdeaCast`, `writeIdeaCast`,
  `applyIdeaAsset`, `writeIdeaAsset`, `LedgerIdeaWithCast`, `LedgerIdeaWithAsset`, `loadIdeaCast`) are
  REMOVED — none of them had a live caller (only their own tests, and `production-queue/worker.ts`'s
  TYPE-only import of `LedgerCastCandidate`/`LedgerAsset`, decoupled from these functions via its own
  injected `LedgerWrites` interface). `LedgerCastCandidate`/`LedgerAsset` are RE-EXPORTED unchanged
  so `worker.ts` (ADR-0004, superseded at the runtime level by ADR-0008 — see its own docstring; zero
  lines of it are touched by this slice) keeps compiling. `applyIdeaRecipeSelection`/
  `writeIdeaRecipeSelection`/`LedgerIdeaWithRecipes`/`LedgerDeclinedRecipe` (issue #54) are untouched.
- **Fold Assets in `phase-resolver`** (`src/phase-resolver/resolve.ts`): `resolvePhase` no longer
  switches on a flat `idea.status` beyond `suggested`/`accepted`/`rejected`; for an `accepted` Idea it
  folds EVERY Asset (not just the earliest) into the phase/gate computation — a Recipe already
  `produced` and a second Recipe still `in_production` paused at a gate both surface, mirroring the
  resolver's existing cross-Idea folding one grain down. An `accepted` Idea with NO Assets yet (every
  real Idea today) keeps the exact pre-slice stranded-via-queue-liveness check.
- **Update `/report`'s production surface** (`src/commands/report.ts`): `PRODUCTION_STATES` becomes
  `["casting", "in_production", "produced"]` — `in_production` is the live Asset-grain value;
  `casting` stays as a tolerance entry for a `ReportData` fed in directly (bypassing `loadReport`,
  e.g. a future caller or a test) rather than reached from a real ledger read.
- **Re-grain `/pick-cast`'s gate check + Cast source** (`src/commands/pick-cast.ts`): the Cast gate is
  now "the Idea has an Asset that is `in_production` with `pending_gate: "cast"`"
  (`ideaAtGate`), and the Cast candidates come from that Asset's own `cast` field, not the retired
  top-level `idea.cast`. The refusal message for a non-gated Idea now names the Idea's DERIVED
  roll-up status. The command's WRITE side (enqueue the render, clear the queue's Cast gate) is
  unchanged — it did not write to the ledger before this slice either.
- **Re-grain `/run-pipeline`'s two production checks** (`src/commands/run-pipeline.ts`): "Ideas
  waiting to be queued" is now `accepted` with NO Assets yet; "Ideas at the Cast gate" is
  `ideaAtGate(idea, "cast")`; "produced Ideas" is `ideaHasAssetStatus(idea, "produced")`.

## Non-Goals (explicitly deferred to later slices in the epic, or already-orphaned code left alone)

- **Re-keying the Production Queue to `(brand, idea, recipe)`.** ADR-0011's "Consequences" calls this
  out as its own reshape. The queue stays `(brand, idea_id)`-keyed in this slice; an `accepted` Idea
  with an Asset already in flight is simply excluded from the stranded-via-queue-liveness check
  (rather than mis-keyed against it) — see `phase-resolver`'s spec delta.
- **The generic run-until-gate driver that actually creates/advances Assets from a Recipe.** Issue
  #57. `space-driver/driver.ts`, `production-queue/queue.ts`/`scheduler.ts`/`worker.ts` are
  byte-for-byte untouched by this slice (confirmed via `git diff --stat`) — nothing in this slice's
  diff ever calls `AssetStore.writeAsset` from a live production path; it is built and tested
  test-first, ready for that later wiring.
- **Re-keying `/log-post` to `(brand, idea, recipe)`, and moving `loadReport`'s `post_url`/
  `performance_score` off the Idea's top-level fields.** ADR-0011 anticipates `/log-post <brand>
  <idea> <recipe> <url>`; there is no `/log-post` TypeScript command in this repo today (it is a
  markdown-only agent command, `.claude/commands/log-post.md`), and re-scoping Post/Performance
  attribution to `(Idea, Recipe)` is a larger follow-up. `loadReport`'s `post_url`/`performance_score`
  keep reading the Idea's own top-level fields unchanged — this affects no real ledger today.
- **`production-queue`'s and `run-pipeline-conductor`'s OpenSpec capabilities are NOT modified.**
  `production-queue/worker.ts` (ADR-0004; superseded at the runtime level by ADR-0008) is
  byte-for-byte untouched code — it talks to the ledger only through its own injected `LedgerWrites`
  interface (never a live default adapter calling the functions this slice removes), so its spec's
  prose references to `writeIdeaCast`/`writeIdeaStatus`/`writeIdeaAsset` describe an ALREADY-orphaned,
  never-wired integration this slice does not touch or fix. `run-pipeline-conductor`'s scenarios
  (fixtures using a literal `status: "casting"` ledger record) stay behaviorally TRUE — that literal
  shape is exactly the "un-migrated" case `loadIdeas`'s reader-tolerance normalizes correctly, proven
  by `run-pipeline.test.ts`'s full 46-test suite passing unchanged.
- **A `PostStore`/separate Post entity.** ADR-0011 keeps `post_url`/`posted_at`/`performance_score`
  embedded fields on the Asset (not a separate Post record) — matches this slice's
  `LedgerAssetRecord` shape exactly.

## Capabilities

### Added Capabilities

- `asset-store`: the `AssetStatus`/`LedgerAssetRecord` pure module, the legacy-status normalizer
  (shared by the transparent read path and the migration), `AssetStore`'s read/write shell, and the
  one-time idempotent migration script.

### Modified Capabilities

- `phase-resolver`: `resolvePhase` folds an Idea's `assets`, not a flat `casting`/`produced`/`posted`/
  `tracking`/`scored` Idea status (all five are retired from `IdeaStatus`).
- `report-surface`: the production section and the documented lifecycle are Asset-grained; the Idea's
  `status` `/report` shows is the derived roll-up across its Assets.
- `cast-render`: `/pick-cast`'s gate check and Cast-candidate source move onto the *Character
  Explainer with Cast* Recipe's Asset (its `pending_gate`/`cast` fields), replacing the retired
  `idea.status === "casting"` / top-level `idea.cast` read.

## Impact

- **New code:** `src/asset/asset.ts` (+`asset.test.ts`), `src/asset/migrate.ts` (+`migrate.test.ts`),
  `src/asset/store.ts` (+`store.test.ts`), `src/ledger/migrate-assets.ts`
  (+`migrate-assets.test.ts`).
- **Modified code:** `src/ledger/ledger.ts` (+`ledger.test.ts`, additive `assets`, narrowed
  `IdeaStatus`, removed the 9 dead ADR-0004 exports listed above); `src/phase-resolver/resolve.ts`
  (+`resolve.test.ts`, rewritten test fixtures at the new grain, same assertions/intent); `src/
  commands/report.ts` (+`report.test.ts`, additive tests); `src/commands/pick-cast.ts` (+
  `pick-cast.test.ts`, additive tests — every pre-existing test passes UNCHANGED thanks to the
  transparent-normalize reader tolerance); `src/commands/run-pipeline.ts` (two filter expressions +
  prose comments; `run-pipeline.test.ts` passes UNCHANGED).
- **Migrated data:** `data/brands/mundotip/ledger.json`, `data/brands/straw-motion/ledger.json` — each
  Idea gains `"assets": []`; no other field changes (proven idempotent by running the script twice).
- **Not touched:** `src/production-spec/**`, `src/execution-protocol/**`, `src/space-driver/**`,
  `src/production-queue/**` (`queue.ts`/`scheduler.ts`/`store.ts`/`enqueue-on-accept.ts`/`worker.ts`),
  `src/recipe/**`, `src/format/**`, `producer.md`, `CONTEXT.md`.
- **Hermetic:** no code or test added/changed by this slice touches `spaces_*`/`creations_*` or
  constructs a `FakeSpace`/`SpaceMcpPort` (`grep -rn "spaces_\|creations_\|FakeSpace" src/asset/
  src/ledger/migrate-assets.ts` → no matches). The existing Magnific-fake-backed suites
  (`space-driver/**`, `production-spec/**`, `production-queue/**`) are byte-for-byte unchanged and
  stay green as part of the full suite — proving the single-recipe path is unaffected.
- **Always-rules upheld:** ledger-as-source-of-truth (every Asset field this slice can write goes
  through `AssetStore.writeAsset`'s thin shell, which preserves every unrelated field; the migration
  is lossless and idempotent); generate-never-publish/public-metrics-only/relative-not-absolute are
  unaffected (no production, metrics, or publish code touched); explicit-attribution is unaffected in
  this slice (Post↔Idea attribution still flows through the unchanged top-level `post_url`, per the
  Non-Goals above) and the ADR-0011-anticipated `(Idea, Recipe)`-keyed attribution is a documented
  follow-up, not silently dropped.
