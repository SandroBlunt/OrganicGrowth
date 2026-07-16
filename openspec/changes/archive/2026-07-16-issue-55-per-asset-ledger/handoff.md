# Slice Handoff — issue-55-per-asset-ledger

> Bidirectional developer ⇄ qa channel for this slice. The developer writes the Build Report; qa appends
> a Verdict; retries append Round-N blocks. Nothing is overwritten.

## Build Report (developer)

### What changed

Slice 3a of the multi-format epic (#53–#60): the **load-bearing schema re-grain** — production state
moves OFF the Idea and onto a per-Recipe **Asset** (ADR-0011), behind a typed `AssetStore` boundary
(ADR-0014). Before this slice, production state was flat scalars on the ONE Idea record (`status`
could be `casting`/`produced`/`posted`/`tracking`/`scored`, plus `cast`/`character`/`asset_url`/
`post_url`/`posted_at`/`performance_score`) — a scalar status can't say "the Reel is mid-production
while the carousel is already posted." After this slice, an Idea's OWN status is only ever
`suggested`/`accepted`/`rejected`; production state lives on `assets: LedgerAssetRecord[]`, each
moving through `queued → in_production → produced → posted → tracking → scored`, with a human pick
(the Cast gate) represented as a PAUSE inside `in_production` (`pending_gate: "cast"`) rather than a
stage of its own. `casting` is retired.

- **`src/asset/asset.ts`** (pure): `AssetStatus`, `LedgerAssetRecord` (`cast`/`character` are the
  *Character Explainer with Cast* Recipe's own gate-local extension fields — not in ADR-0011's literal
  field list, added deliberately so `/pick-cast` keeps working at the new grain; see "Self-review
  notes"), defensive parsing, `findAsset`/`upsertAsset` (pure, keyed by recipe), the Idea-level
  roll-up (`deriveIdeaRollup`/`rollupAssetStatus` — earliest Asset stage wins, mirrors
  `phase-resolver`'s `earlierPhase` one grain down), and the gate-folding helpers `ideaAtGate`/
  `ideaHasAssetStatus`/`pendingGateNames`.
- **`src/asset/migrate.ts`** (pure): `normalizeIdeaStatus(raw)` — the ONE legacy→Asset-grain fold,
  shared by two callers: `ledger.ts`'s readers (transparent, never persisted — this is the reader
  tolerance) and the migration script (persisted). Idempotent by construction.
- **`src/asset/store.ts`**: `AssetStore` — `loadIdeaAssets`/`writeAsset`, the typed read/write
  boundary for the Assets nested in a Brand's `ledger.json`. `writeAsset` normalizes the target Idea
  before upserting, so writing onto a not-yet-migrated Idea never drops its legacy data.
- **`src/ledger/migrate-assets.ts`**: the one-time, idempotent migration —
  `migrateIdeaRecord`/`migrateLedgerObject`/`migrateLedgerFile`/`migrateAllBrandLedgers` + a
  `<brand>|--all` CLI. Adds `assets: []` to every Idea; folds a genuinely legacy production status
  onto one Asset and strips the now-redundant top-level scalar keys — but ONLY for a record that
  actually had one, so an already-canonical Idea's inert `null` placeholders
  (`post_url`/`posted_at`/`performance_score`, which the real ledgers pre-populate on every Idea) are
  left untouched. **Run against BOTH real Brand ledgers**: `data/brands/mundotip/ledger.json` (10
  Ideas) and `data/brands/straw-motion/ledger.json` (7 Ideas) — the only change in either file is
  `"assets": []` added to every Idea (neither has ever left `accepted`/`suggested`/`rejected`,
  confirming ADR-0011's "nearly free now" claim). Ran a second time: both report "already up to date
  (no-op)", confirmed via `git diff --stat` showing no further change.
- **`src/ledger/ledger.ts`**: `IdeaStatus` narrows to `suggested`/`accepted`/`rejected`; `LedgerIdea`
  gains `assets?: readonly LedgerAssetRecord[]`; `loadIdeas`/`loadReport` call `normalizeIdeaStatus`
  on every raw record (transparent read-time tolerance); `loadReport`'s `ReportIdea.status` becomes
  the derived roll-up. **Removed** 9 dead ADR-0004 Phase A/B exports
  (`ledgerStatusForTransition`, `applyIdeaStatus`, `writeIdeaStatus`, `applyIdeaCast`, `writeIdeaCast`,
  `applyIdeaAsset`, `writeIdeaAsset`, `LedgerIdeaWithCast`, `LedgerIdeaWithAsset`, `loadIdeaCast`) —
  confirmed via `grep` that none had a live caller (only their own tests, and
  `production-queue/worker.ts`'s TYPE-only, decoupled import). `LedgerCastCandidate`/`LedgerAsset` are
  re-exported/kept so `worker.ts` (ADR-0004, superseded at the runtime level by ADR-0008; zero lines
  touched) keeps compiling unchanged. `applyIdeaRecipeSelection`/`writeIdeaRecipeSelection` (issue
  #54) untouched.
- **`src/phase-resolver/resolve.ts`**: `resolvePhase` folds an `accepted` Idea's `assets` (every one
  of them, not just the earliest — a produced Recipe and an in-flight Recipe both surface, mirroring
  the resolver's existing cross-Idea folding one grain down) instead of switching on a flat
  `casting`/`produced`/`posted`/`tracking`/`scored` status. An Idea with no Assets yet (today's real
  shape) keeps the exact pre-slice stranded-via-queue-liveness check.
- **`src/commands/report.ts`**: `PRODUCTION_STATES` → `["casting", "in_production", "produced"]`
  (`in_production` is the live value from `loadReport`; `casting` stays as tolerance for a
  directly-fed `ReportData`).
- **`src/commands/pick-cast.ts`**: the Cast gate check is now `ideaAtGate(idea, "cast")`; Cast
  candidates come from the gated (or last-`cast`-carrying) Asset, not the retired top-level
  `idea.cast`; the refusal message names the Idea's derived roll-up. The command's WRITE side
  (enqueue render, clear the queue's Cast gate) is byte-for-byte unchanged — it never wrote to the
  ledger before this slice either.
- **`src/commands/run-pipeline.ts`**: "waiting to be queued" → `accepted` with no Assets yet (had to
  add this exclusion explicitly — see "Self-review notes" for the bug this caught); "at the Cast
  gate" → `ideaAtGate`; "produced" → `ideaHasAssetStatus(idea, "produced")`.

### Files touched

**New:**
- `src/asset/asset.ts` (+`asset.test.ts`, 37 tests)
- `src/asset/migrate.ts` (+`migrate.test.ts`, 17 tests)
- `src/asset/store.ts` (+`store.test.ts`, 8 tests)
- `src/ledger/migrate-assets.ts` (+`migrate-assets.test.ts`, 17 tests — includes the real-ledger
  round-trip, run against COPIES so the suite itself never writes the real files)
- `openspec/changes/issue-55-per-asset-ledger/{proposal.md,tasks.md,handoff.md,specs/{asset-store,phase-resolver,report-surface,cast-render}/spec.md}`

**Modified:**
- `src/ledger/ledger.ts` (+`ledger.test.ts`: 34 → 23 tests — net -11; removed the dead-function
  blocks, everything else kept/extended)
- `src/phase-resolver/resolve.ts` (+`resolve.test.ts`: 50 → 53 tests — rewritten fixtures at the new
  grain, same assertions/intent, +3 new scenarios incl. one Idea/two-Assets)
- `src/commands/report.ts` (+`report.test.ts`: 16 → 19 tests, +3 new)
- `src/commands/pick-cast.ts` (+`pick-cast.test.ts`: 23 → 27 tests, +4 new — every ONE of the 23
  pre-existing tests passes UNCHANGED)
- `src/commands/run-pipeline.ts` (`run-pipeline.test.ts`: all 46 pre-existing tests pass UNCHANGED,
  no test file edits needed)

**Migrated data (real Brand ledgers, run via the CLI, not hand-edited):**
- `data/brands/mundotip/ledger.json` — 10 Ideas, each gains `"assets": []`. One cosmetic side effect
  of round-tripping through `JSON.stringify(JSON.parse(x))` (the same behavior every existing ledger
  writer in this codebase already has): `idea-2026-W22-08`'s `fit_score` renders as `0.6` instead of
  `0.60` — the numeric VALUE is identical, only the trailing-zero literal formatting changes.
- `data/brands/straw-motion/ledger.json` — 7 Ideas, each gains `"assets": []`. Same cosmetic effect:
  `idea-02`'s `fit_score` renders as `0.7` instead of `0.70`.

**Confirmed NOT touched** (`git diff --stat` → empty for each): `src/production-spec/**`,
`src/execution-protocol/**`, `src/space-driver/**`, `src/production-queue/**` (including
`worker.ts`/`worker.test.ts`), `src/recipe/**`, `src/format/**`, `producer.md`, `CONTEXT.md`.

### How to run

```bash
npm test                     # tsc -p tsconfig.json --noEmit  +  node --import tsx --test "src/**/*.test.ts"
npm run build                # tsc -p tsconfig.build.json (exit 0)
npx openspec validate issue-55-per-asset-ledger --strict

# just this slice's new modules:
node --import tsx --test "src/asset/*.test.ts"
node --import tsx --test "src/ledger/migrate-assets.test.ts"
node --import tsx --test "src/ledger/ledger.test.ts"
node --import tsx --test "src/phase-resolver/resolve.test.ts"
node --import tsx --test "src/commands/report.test.ts" "src/commands/pick-cast.test.ts" "src/commands/run-pipeline.test.ts"

# re-run the migration against real data (idempotency check — safe, already run):
npx tsx src/ledger/migrate-assets.ts --all   # → "already up to date (no-op)" for both Brands
```

Full suite: **873 tests / 264 suites, all passing** (was 795/236 before this slice — +78 tests: +79
across the four new files, -11/+3/+3/+4 net across the four modified test files — see the Files
Touched section for the exact per-file before/after counts). Type-check (`tsc --noEmit`), `npm run
build`, and `npx openspec validate issue-55-per-asset-ledger --strict` all exit clean.

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | `assets: []` sub-collection + per-Asset stages (`queued → in_production → produced → posted → tracking → scored`); `casting` removed from the Idea status vocabulary; Idea status is a derived roll-up | `src/asset/asset.ts`'s `AssetStatus`/`LedgerAssetRecord`; `asset.test.ts`'s `isAssetStatus` block proves `"casting"` is rejected; `ledger.ts`'s `IdeaStatus` narrowed to 3 values (type-checked — nothing in the shipped code can construct an `IdeaStatus` of `"casting"`); `deriveIdeaRollup`/`rollupAssetStatus` + `asset.test.ts`'s roll-up describe blocks; `ledger.test.ts`'s "loadReport — status is the derived roll-up" block proves it end-to-end through the ledger reader |
| 2 | `AssetStore` behind the store boundary; the phase-resolver folds Assets (not flat Idea statuses) | `src/asset/store.ts` (`loadIdeaAssets`/`writeAsset`) + `store.test.ts` (8 tests); `src/phase-resolver/resolve.ts`'s `foldAssetIntoPhase` + the fully-rewritten `resolve.test.ts` (53 tests, every fixture at the `status: "accepted", assets: [...]` grain — none use a flat `casting`/`produced`/etc. status) |
| 3 | One-time idempotent migration; running it twice is a no-op; un-migrated records still load | `src/ledger/migrate-assets.ts`'s `migrateLedgerFile` + `migrate-assets.test.ts`'s "idempotent" describe blocks (record-grain and file-grain, incl. byte-identical-on-disk proof) and the REAL mundotip/straw-motion round-trip test; reader tolerance proven by `ledger.test.ts`'s "a legacy un-migrated 'casting'/'produced' Idea is transparently normalized" tests, `pick-cast.test.ts`'s 23 pre-existing (unmodified, legacy-shaped) tests passing unchanged, and `run-pipeline.test.ts`'s 46 pre-existing (unmodified, legacy-shaped) tests passing unchanged |
| 4 | Every `casting`/`PRODUCTION_STATES` reference (e.g. the report projection) updated to the Asset grain | `report.ts`'s `PRODUCTION_STATES` + `report.test.ts`'s new "the Asset grain" describe block; `resolve.ts`'s renamed/modified Requirement (no flat `casting` case remains in the switch); `pick-cast.ts`'s `ideaAtGate` replaces `idea.status === "casting"`; `run-pipeline.ts`'s two filters use `ideaAtGate`/`ideaHasAssetStatus`; `grep -rn "\"casting\""` across `src/**/*.ts` (excluding tests) shows only `production-queue/worker.ts` (untouched, orphaned, decoupled — see Known limits) and intentional tolerance/doc comments |
| 5 | Built test-first against the fake; single-recipe path green; strict validate + suite green | Every module written test-first (failing test committed before/alongside implementation, run red→green — `tasks.md` shows a "write failing tests" task before each "implement" task); the Magnific-fake-backed suites (`space-driver/**`, `production-spec/**`, `production-queue/**`) are byte-for-byte unchanged (`git diff --stat` empty) and pass as part of the 873; `npx openspec validate issue-55-per-asset-ledger --strict` → valid; `npm test` → 873/873; `npm run build` → exit 0 |

Every task in `tasks.md` is checked off; every acceptance criterion maps to a named test above.

### Fakes / fixtures used

- **The Magnific fake is NOT invoked by this slice at all — flagged explicitly.** No code or test
  added/changed by this slice touches `src/space-driver/**`'s `FakeSpace`/`SpaceMcpPort`, and no test
  constructs one: `grep -rn "spaces_\|creations_\|FakeSpace\|MagnificSpace" src/asset/ src/ledger/
  migrate-assets.ts src/ledger/migrate-assets.test.ts src/ledger/ledger.ts src/ledger/ledger.test.ts
  src/phase-resolver/ src/commands/report.ts src/commands/pick-cast.ts src/commands/run-pipeline.ts`
  → no matches. This slice is pure schema/data-shape work; it never drives a Space. No live
  `spaces_*`/`creations_*` call, no credits, no board mutation anywhere in the diff.
- The existing Magnific-fake-backed suites (`space-driver/**`, `production-spec/**`,
  `production-queue/**`, 260+ tests) are byte-for-byte unchanged (`git diff --stat` empty for those
  directories) and still pass as part of the 873-test full suite — proving the single-recipe
  production path is unaffected by this schema reshape.
- Filesystem fixtures: `mkdtemp`/temp directories for every new I/O-touching test suite
  (`asset/store.test.ts`, `ledger/migrate-assets.test.ts`, `ledger/ledger.test.ts`), mirroring the
  existing `writeIdeaCast`/`writeIdeaRecipeSelection` test convention exactly.
- **The real-ledger round-trip tests operate on COPIES, never the real files**: `migrate-assets.
  test.ts`'s "round-trip against the REAL mundotip and straw-motion ledgers" describe block reads
  `data/brands/{mundotip,straw-motion}/ledger.json` and writes a COPY to a temp directory before
  migrating — `npm test` never mutates the real data files. The real files WERE migrated, but via a
  deliberate, separate, one-time run of the CLI (`npx tsx src/ledger/migrate-assets.ts --all`) during
  this build, not as a side effect of the test suite.
- `DEFAULT_ASSET_RECIPE` (`asset/migrate.ts`) is cross-checked against the REAL Recipe registry
  (`src/recipe/registry.ts`'s `listWiredRecipeSlugs()`) in `migrate.test.ts`, so it cannot silently
  drift from a slug the registry actually wires — without pulling the heavier
  production-spec/space-driver import graph into the hot `loadIdeas` read path at runtime (see
  Self-review notes).

### Self-review notes

- **Chose "transparent normalize on every read" over "require the migration script has run."** The
  same `normalizeIdeaStatus` function backs both `ledger.ts`'s readers (never persisted) and the
  migration script (persisted). This was the single most important design decision: it made "the
  reader stays tolerant of un-migrated records" not just true, but PROVABLY true — every one of the
  23 pre-existing `pick-cast.test.ts` tests and all 46 `run-pipeline.test.ts` tests use exactly the
  legacy flat-status ledger shape (`status: "casting"`, top-level `cast`) and pass UNCHANGED, because
  that shape IS the "un-migrated" case the transparent normalizer handles. I did not have to touch a
  single existing test fixture in either file.
- **Caught a real bug during the `run-pipeline.ts` re-grain**: naively translating `ideas.filter(i =>
  i.status === "accepted")` to the new grain (`i.status === "accepted"`, unchanged) would have made
  "Idea waiting to be queued" and "Idea at the Cast gate" NO LONGER mutually exclusive — an Idea
  already at the Cast gate still has base status `"accepted"` under the new grain (only its Asset
  progressed), so the conductor's `if (acceptedIdeas.length > 0) { ...; return; }` branch would fire
  FOREVER and Gate 2 would never be reached once any Idea entered production. Fixed by requiring
  `(i.assets ?? []).length === 0` for the "waiting to be queued" bucket. `run-pipeline.test.ts`'s
  "pauses at Gate 2 (Cast pick) when Ideas are at 'casting' status" test (which exercises exactly this
  path against a legacy-shaped fixture) would have caught this regression had it been missed — it
  passes.
- **Deliberately added `cast`/`character` as optional extension fields on `LedgerAssetRecord`**,
  beyond ADR-0011's literal `{ recipe, status, spec_path, copy, asset_url, produced_at, post_url,
  posted_at, performance_score, pending_gate }` list. Reasoning: the issue explicitly requires the
  single-recipe path (`/pick-cast`) to stay green, and `/pick-cast` needs SOMEWHERE to read Cast
  candidates from at the new grain — ADR-0011 names `pending_gate` as the pause marker but is silent
  on where the *Character Explainer with Cast* Recipe's own Cast-pick data lives (CONTEXT.md is
  explicit that "Cast"/"Character" are that ONE Recipe's own vocabulary, not universal). Documented
  in `LedgerAssetRecord`'s own doc comment and in the `asset-store` spec delta as a deliberate,
  narrowly-scoped extension, not a silent addition.
- **Decided NOT to touch `production-queue`'s and `run-pipeline-conductor`'s OpenSpec capabilities.**
  `production-queue/worker.ts` (ADR-0004) is byte-for-byte untouched code that talks to the ledger
  only through its own injected `LedgerWrites` interface — never a live default adapter calling the
  functions this slice removes — so its spec's prose naming `writeIdeaCast`/`writeIdeaStatus`/
  `writeIdeaAsset` already described an orphaned, never-wired integration before this slice; fixing
  that stale documentation is out of this slice's bounded scope (see `proposal.md`'s Non-Goals).
  `run-pipeline-conductor`'s scenarios stay behaviorally true (proven by its 46-test suite passing
  unchanged) since their `status: "casting"` GIVEN fixtures are exactly the reader-tolerance case.
- **Decided NOT to update `CLAUDE.md`'s Lifecycle line or `.claude/commands/report.md`'s
  casting/produced prose.** These already had 3 PRE-EXISTING, unrelated `npm run test:docs` failures
  before this slice (verified via `git stash` + re-run against the pre-slice tree — same 3 failures,
  unrelated to casting) — `test:docs` is not part of the required `npm test` gate. Updating product
  docs/agent prompts is a larger, separate concern from this schema slice; see Known limits.
- **`loadReport`'s `post_url`/`performance_score` still read the Idea's top-level fields**, not a
  specific Asset's. ADR-0011 anticipates `/log-post <brand> <idea> <recipe> <url>` re-keying Post
  attribution to `(Idea, Recipe)`, but there is no `/log-post` TypeScript command in this repo (it's
  markdown-only, `.claude/commands/log-post.md`) — re-scoping it is out of this slice's bounded scope
  and affects no real ledger today (no Idea has ever left `accepted`).
- Ran `npm test`/`npm run build`/`openspec validate --strict` after every module addition, not just
  once at the end, to catch regressions immediately; all green throughout.
- No dead code left behind: every new exported function/type is exercised by at least one test;
  removed 9 confirmed-dead ledger.ts exports rather than leaving them stale.

### Known limits (explicit Non-Goals — see `proposal.md`)

- **The Production Queue stays `(brand, idea_id)`-keyed**, not re-keyed to `(brand, idea, recipe)` —
  ADR-0011's own "Consequences" calls this out as a separate reshape (issue #56). An `accepted` Idea
  with an Asset already in flight is excluded from `phase-resolver`'s stranded-via-queue-liveness
  check rather than mis-evaluated against the old grain.
- **No live production path writes an Asset yet.** `AssetStore.writeAsset` is built and tested
  test-first but has no live caller — the generic run-until-gate driver that would actually create/
  advance Assets from a Recipe is issue #57 (matches `recipe/registry.ts`'s own documented scope
  boundary from issue #54).
- **`/log-post` and `loadReport`'s Post/Performance attribution stay Idea-scoped**, not
  `(Idea, Recipe)`-scoped. Affects no real ledger today; a follow-up slice.
- **`production-queue`'s and `run-pipeline-conductor`'s OpenSpec capabilities were not reconciled**
  with ADR-0011's retirement of `casting` — they describe already-orphaned (`worker.ts`) or
  still-behaviorally-true (`run-pipeline-conductor`, proven by its unchanged passing suite) surfaces;
  see Self-review notes for the full reasoning.
- **`CLAUDE.md`'s Lifecycle line and `.claude/commands/report.md`'s prose are unchanged** and still
  describe the pre-#55 scalar model. `npm run test:docs` (not part of the required `npm test` gate)
  already had these same 3 failures before this slice; unaffected either way.
- **`LedgerAssetRecord.cast`/`.character`** are a deliberate, documented extension beyond ADR-0011's
  literal field list, scoped to the one wired Recipe's own gate — see Self-review notes.

---

## QA Verdict — Round 1: PASS

Verified against commit `6e00629` on branch `issue-55-per-asset-ledger`. Read-run-report only; no
product code, tests, specs, or data touched by qa.

### Suite result

- `npm test` (`tsc -p tsconfig.json --noEmit` + `node --import tsx --test "src/**/*.test.ts"`) →
  **873/873 tests, 264/264 suites, 0 fail** — matches the developer's claim exactly (baseline was
  795/236 before this slice; +78 tests / +28 suites).
- `npm run build` (`tsc -p tsconfig.build.json`) → exit 0, clean.
- `npx openspec validate issue-55-per-asset-ledger --strict` → `Change 'issue-55-per-asset-ledger' is
  valid`.
- `npm run test:docs` (NOT part of the required gate) → 3 pre-existing failures. Verified independently
  by checking out the pre-slice tree (`9d3508b`) and re-running: same 3 failures, unrelated to this
  slice's diff. The developer's "pre-existing, not part of `npm test`" claim is confirmed accurate.

### Per-criterion results (issue #55 acceptance criteria)

1. **`assets:[]` sub-collection + per-Asset stages; `casting` removed from the Idea status vocabulary;
   Idea status is a derived roll-up — PASS.** `src/asset/asset.ts` defines `AssetStatus` (six stages,
   `casting` absent) and `LedgerAssetRecord` matching the issue's literal field list plus two
   documented, justified extension fields (`cast`/`character`, ADR-0009's "Cast/Character are that
   Recipe's own vocabulary"). `src/ledger/ledger.ts`'s `IdeaStatus` narrows to
   `"suggested"|"accepted"|"rejected"`. Proven by `asset.test.ts` (`isAssetStatus("casting") === false`),
   `deriveIdeaRollup`/`rollupAssetStatus` + their tests, and `ledger.test.ts`'s "status is the derived
   roll-up" describe block, exercised end-to-end through `loadReport`.
2. **`AssetStore` behind the store boundary; the phase-resolver folds Assets — PASS.**
   `src/asset/store.ts` (`loadIdeaAssets`/`writeAsset`, 8 tests) is the only I/O for Assets nested in
   `ledger.json`. `src/phase-resolver/resolve.ts`'s `foldAssetIntoPhase` folds every Asset of an
   `accepted` Idea (not a flat status); `resolve.test.ts` is fully rewritten at the new grain (53
   tests, including a two-Assets-at-different-stages scenario).
3. **One-time idempotent migration; running it twice is a no-op; un-migrated records still load —
   PASS, independently verified.** See "Migration idempotency and losslessness" below — I re-derived
   this from the raw git diff of the real ledgers myself, not from the developer's claim.
4. **Every `casting`/`PRODUCTION_STATES` reference updated to the Asset grain — PASS, with one
   pre-existing, documented, orphaned exception.** `report.ts`'s `PRODUCTION_STATES` is
   `["casting","in_production","produced"]` with `casting` kept only as tolerance for a directly-fed
   `ReportData` (never reached from a real ledger read — confirmed by `loadReport`'s normalization).
   `pick-cast.ts`/`run-pipeline.ts` use `ideaAtGate`/`ideaHasAssetStatus` throughout — no flat
   `idea.status === "casting"` check remains in any live command. The one un-migrated live reference is
   `src/production-queue/worker.ts` (a `"casting"|"produced"` `writeStatus` type + one call site) — see
   Defect list, low severity; independently confirmed orphaned (no command imports `worker.ts`'s
   `drain`/`tick`; only its own test and a type-only import from `fake-space.ts` reference it).
5. **Built test-first against the fake; single-recipe path green; strict validate + suite green —
   PASS.** Every new module has a matching, thorough test file; `tasks.md`'s "write failing tests"
   tasks precede "implement" tasks for every module and are all checked off. The single-recipe path
   (`pick-cast.test.ts`'s 23 pre-existing tests, `run-pipeline.test.ts`'s 46 pre-existing tests) passes
   byte-for-byte UNCHANGED — confirmed via `git diff --stat` showing 0 lines changed in
   `run-pipeline.test.ts` and additive-only changes in `pick-cast.test.ts`. `space-driver/**`,
   `production-spec/**`, `production-queue/**` (the Magnific-fake-backed suites) are byte-for-byte
   untouched (confirmed via `git diff --stat`) and pass as part of the 873.

### Per-scenario results (spec deltas)

Checked every Requirement/Scenario in `specs/{asset-store,phase-resolver,report-surface,cast-render}/
spec.md` against a real test:

- **`asset-store`** (9 Requirements, 20 scenarios) — all traced to `asset.test.ts` (37 tests),
  `migrate.test.ts` (17 tests), `store.test.ts` (8 tests), `migrate-assets.test.ts` (17 tests
  including the real-ledger round-trip). PASS on every scenario I spot-checked, including the two I
  scrutinized hardest: "A second migration run is a no-op" (byte-identical assertion,
  `migrate-assets.test.ts:205-218`) and "Migrating the real mundotip and straw-motion ledgers is
  lossless and idempotent" (`migrate-assets.test.ts:236-278`) — both independently re-verified by me
  outside the test suite (see below).
- **`phase-resolver`** (5 Requirements, 13 scenarios) — all traced to `resolve.test.ts`'s rewritten
  fixtures. PASS, including the "one Idea with two Assets at different stages" scenario (new, issue
  #55-added) and the stranded-Idea exclusion-for-Asset-bearing-Ideas scenario.
- **`report-surface`** (1 Requirement, 4 scenarios) — traced to `report.test.ts`'s new "Asset grain"
  describe block (lines 179-282) plus the pre-existing Fit/Performance-distinction and baseline tests
  (untouched, still passing). PASS.
- **`cast-render`** (1 Requirement, 4 scenarios) — traced to `pick-cast.test.ts`'s new "against a
  canonical, already-migrated ledger" describe block (lines 384-446) plus every pre-existing test
  (legacy-shaped fixtures = the reader-tolerance scenario, verified unchanged). PASS.

### Always-rules + Magnific-fake checks

- **Generate-never-publish** — PASS. No publish/Facebook code touched; this slice is pure schema/data.
- **Public-metrics-only** — PASS (not applicable; no metrics code touched).
- **Relative-not-absolute** — PASS. `report.ts`'s baseline-relative rendering is untouched and its
  tests still pass.
- **Explicit-attribution** — PASS with a documented, in-scope deferral. `post_url` stays Idea-scoped
  (not yet `(Idea, Recipe)`-scoped, per ADR-0011's own anticipated follow-up); this affects no real
  ledger today (verified: no Idea in either real ledger has ever left `accepted`) and is explicitly
  named as a Non-Goal in `proposal.md`, not a silent gap.
- **Ledger-as-source-of-truth** — PASS, verified independently (see below): the migration is lossless,
  the two real ledgers are correctly migrated, and `AssetStore.writeAsset` preserves every unrelated
  field (`store.test.ts`'s merge/preserve tests).
- **Magnific fake / no live Space** — PASS.
  `grep -rn "spaces_\|creations_\|FakeSpace\|MagnificSpace" src/asset/ src/ledger/migrate-assets.ts
  src/ledger/migrate-assets.test.ts src/ledger/ledger.ts src/ledger/ledger.test.ts
  src/phase-resolver/ src/commands/report.ts src/commands/pick-cast.ts src/commands/run-pipeline.ts`
  → **no matches**, independently re-run by qa. `git diff --stat 9d3508b 6e00629 -- src/space-driver
  src/production-spec src/production-queue` → empty. This slice makes zero Magnific calls, live or
  fake — it is pure schema/data-shape work, as the developer flagged.

### Migration idempotency and losslessness — independently re-verified

I did not take the developer's claim on faith. I:
1. Ran `git diff 9d3508b 6e00629 -- data/brands/{mundotip,straw-motion}/ledger.json` myself — confirmed
   the only change per Idea is `"assets": []` added, plus a cosmetic `fit_score` trailing-zero
   reformat (`0.60`→`0.6`, `0.70`→`0.7`; same numeric value, an artifact of `JSON.stringify` round-
   tripping through `JSON.parse`, consistent with every existing ledger writer in this codebase).
2. Wrote a script diffing every key of every Idea (excluding `assets`/`fit_score`) between the pre- and
   post-migration real ledgers for both Brands — **zero missing keys, zero extra keys, zero value
   differences** beyond the two known ones. Confirmed `assets` is `[]` for all 17 Ideas (10 mundotip +
   7 straw-motion) and `baseline` is untouched in both files.
3. Confirmed via the real ledgers that no Idea in either Brand has ever left `accepted`/`suggested`/
   `rejected` — so the developer's claim that "no in-flight production state existed to lose" is true
   of the actual data, not just asserted.
4. Re-ran `migrateLedgerFile` behavior reasoning against `migrateIdeaRecord`'s source and confirmed the
   idempotency guard (`deepEqual` + `wasLegacyProductionStatus`-gated key-stripping) is structurally
   sound for every real-world (canonical or genuinely-legacy) input.

### Reader tolerance — independently re-verified, one gap found (see Defect 1)

Confirmed old-shape fixtures genuinely still work: `ledger.test.ts`'s legacy-`"casting"`/`"produced"`
tests, `pick-cast.test.ts`'s 23 unmodified legacy-shaped tests, and `run-pipeline.test.ts`'s 46
unmodified legacy-shaped tests all pass against `normalizeIdeaStatus`'s transparent fold — no code path
in `ledger.ts`, `store.ts`, `report.ts`, `pick-cast.ts`, or `run-pipeline.ts` assumes the new shape and
throws on an un-migrated record (checked every reader: all treat `idea.assets` as `?? []`).

I also probed `normalizeIdeaStatus` directly with an adversarial input outside the tests
(`node --import tsx`) and found one real gap in the pure normalizer — see Defect 1. It does not throw
(data-handling rule 4 holds) and is unreachable through any current writer or the real data, but it is
a genuine, fixable correctness gap in the one function this whole slice's reader-tolerance guarantee
rests on.

### `run-pipeline.ts` mutual-exclusivity fix — scrutinized, correct

Confirmed the bug is real: pre-fix, `acceptedIdeas = ideas.filter(i => i.status === "accepted")` would
include an Idea whose Asset is already paused at the Cast gate (its base status is permanently
`"accepted"` post-#55, unlike the old flat-scalar model where `"accepted"` and `"casting"` were
mutually exclusive by construction). This would fire the "auto-draining" branch forever and Gate 2
would never be reached. The fix (`&& (i.assets ?? []).length === 0`) restores mutual exclusivity
correctly. Verified the existing (unmodified) test `"pauses at Gate 2 (Cast pick) when Ideas are at
'casting' status"` (`run-pipeline.test.ts:514`) does in fact exercise this: reasoned through the
pre-fix code path by hand against that test's single-Idea legacy fixture — the unfixed filter would
also have matched this Idea (post-normalization its base status is `"accepted"`), firing the wrong
branch first and producing output that does not match the test's `/Gate 2|Cast pick/i` assertion. The
fix is correct and the regression-catching claim is accurate.

### `exactOptionalPropertyTypes` — sound

`tsconfig.json` has `exactOptionalPropertyTypes: true`, confirmed. `parseAssetRecord` and
`buildLegacyAsset` build every optional field via conditional spread (`...(cond ? {field: x} : {})`),
never assigning an explicit `undefined` — the sound pattern under this flag. `tsc --noEmit` (part of
`npm test`) is clean. No unsoundness found.

### `casting` retirement — grep results

`grep -rn '"casting"' src --include="*.ts"` (excluding tests) finds real (non-comment) code in exactly
one place: `src/production-queue/worker.ts:140,387` (a `writeStatus(ideaId, status: "casting" |
"produced")` type and one call site). Independently confirmed orphaned: no command file (`src/
commands/**`) or `.claude/commands/*.md` imports or wires `worker.ts`'s `drain`/`tick`; the only
references are `worker.ts`'s own test and a type-only import in `space-driver/fixtures/fake-space.ts`.
This is consistent with prior, already-recorded project history (ADR-0008 superseding ADR-0004; the
unattended-worker epic #39 closed not-planned) — `worker.ts` was already dead/orphaned before this
slice, not newly missed by it. See Defect 2 (low severity, informational).

### Defect list

1. **[low] `normalizeIdeaStatus` does not re-narrow `status` when a raw record has BOTH a legacy
   top-level status (e.g. `"casting"`) AND an already-non-empty `assets` array** — a genuinely
   self-contradictory/malformed hybrid shape that no current writer in this codebase produces (the
   migration and `AssetStore.writeAsset` always update `status` and `assets` together), but the pure
   function's own contract ("running it twice is a no-op," "normalizing an already-canonical record
   passes through") does not correctly describe this input, and the retired `"casting"` value leaks
   through unchanged into `LedgerIdea.status` (typed as `string`, not the narrower `IdeaStatus`) and
   would render in `/report`.
   **Repro:**
   ```
   node --import tsx -e '
   import("./src/asset/migrate.ts").then(({ normalizeIdeaStatus }) => {
     const raw = { id: "i1", status: "casting", assets: [{ recipe: "character-explainer-with-cast", status: "queued" }] };
     console.log(normalizeIdeaStatus(raw));
   });'
   # → { status: "casting", assets: [...] }  — expected status to be narrowed to "accepted" (or similar), not echoed as "casting"
   ```
   Root cause: `normalizeIdeaStatus`'s first branch (`existingAssets.length > 0 || CANONICAL_IDEA_STATUSES.has(rawStatus)`)
   short-circuits on `existingAssets.length > 0` alone and returns `rawStatus` verbatim without checking
   it is canonical. Suggested fix (not required to be applied by qa — developer's call): when
   `existingAssets.length > 0`, still clamp `rawStatus` to a canonical value (e.g. `CANONICAL_IDEA_STATUSES.has(rawStatus) ? rawStatus : "accepted"`)
   rather than trusting it unconditionally. Not blocking this round: unreachable via any real ledger,
   any current writer, or the wired single-recipe path; does not affect the two real Brand ledgers
   (independently confirmed empty-assets, canonical-status-only).
2. **[low, informational, not newly introduced by this slice] `src/production-queue/worker.ts` still
   references the retired `"casting"` status literally** (a type + one call site), and its own OpenSpec
   capability documentation still describes `writeIdeaCast`/`writeIdeaStatus`/`writeIdeaAsset`, which
   this slice removed from `ledger.ts`. Confirmed this module is orphaned (no live command wires it up)
   and was already orphaned before this slice (ADR-0008 supersedes the ADR-0004 runtime it belongs to).
   The issue's acceptance criterion 4 names "e.g. the report projection" as its example, which IS fully
   updated; this dead module is a pre-existing documentation/dead-code debt, correctly out of scope per
   the developer's documented Non-Goals. No repro needed — informational only, does not affect any live
   path.

Neither defect blocks this round: both are unreachable through the real data, the real writers, or the
wired single-recipe path, and both are honestly surfaced (not hidden) by the developer's own Known
Limits section. Given the suite is genuinely green, the migration is independently verified lossless
and idempotent against both real ledgers, the OpenSpec change faithfully matches the issue and ADR-
0009/0011/0014, no live Magnific call exists anywhere in this slice's diff, and every acceptance
criterion maps to a real, passing test — **this slice PASSES Round 1.**
