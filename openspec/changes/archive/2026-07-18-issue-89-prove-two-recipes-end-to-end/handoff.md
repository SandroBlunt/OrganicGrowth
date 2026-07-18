# Slice Handoff — issue-89-prove-two-recipes-end-to-end

This is the one bidirectional Slice Handoff document for this change. The `developer` agent writes the
Build Report below; `qa` appends its Verdict beneath it (nothing is overwritten). Retries append
Round-N blocks.

---

## Build Report (developer, Round 1)

### What changed

Two things, in order:

1. **Node-name alignment to the live canvas (issue #86's decision, applied here).** The live "Carrousel"
   Space capture showed the real canvas uses **`"JSON Master"`** as its inject/run-point node and
   **`"Brand_Logo"`** as its logo reference node — the earlier placeholders (`"Slides Prompts"`,
   `"Brand Logo"`) name no real canvas node at all. Per the capture README's own recorded Operator
   decision (2026-07-18), the BUILD is aligned to the canvas:
   - `src/execution-protocol/protocol.ts`'s `canonicalCarouselProtocol()` now declares its sole
     run-point at `start: "JSON Master"`.
   - `src/recipe/registry.ts`'s `NEWS_CAROUSEL` Recipe now declares `canvasInputs.promptNode: "JSON
     Master"` and its brand-asset media slot's map key (which doubles as its physical canvas node — a
     brand-asset slot has no separate `pinnedReference`-style field, unlike an idea-pick slot) is
     `"Brand_Logo"`. The Brand Asset **store key** (`brandAssetKey: "brand-logo"`) is **unchanged** —
     only the on-canvas node name changed.
   - Every dependent test/fixture/doc that named the old placeholders was updated (full list in "Files
     touched" below).
2. **The FAKE Carrousel is REBUILT to the real, captured single-lane shape**, and the tracer bullet
   itself is built: one accepted Idea, driven through BOTH wired Recipes against their respective
   Magnific fakes, to two independent Assets — proving #81-#88's whole recipe architecture works
   together, not just piece by piece.

### Files touched

**Rebuilt:**
- `src/producer/fixtures/fake-carousel-space.ts` — full node-inventory + wiring rebuild (7 nodes, 5
  connections, the real Image Generator settings, the real 7 slide creation identifiers from the
  capture's "Generated slides" list). Dropped the constructor's `logoReferenceNodeName` parameter (no
  longer needed — the logo node name is now a fixed, real constant).

**New:**
- `src/producer/fixtures/fake-carousel-space.test.ts` — parses the live capture JSON directly and
  asserts the fake's exported inventory/connections/protocol/settings/creation-ids equal it exactly
  (AC1).
- `src/producer/two-recipes-end-to-end.test.ts` — the tracer bullet (AC2, AC3, AC4).

**Modified (node-name alignment; small, mechanical):**
- `src/execution-protocol/protocol.ts` (+`protocol.test.ts`)
- `src/recipe/registry.ts` (+`registry.test.ts`)
- `src/producer/bind-media.test.ts`
- `src/recipe/phase-contract.test.ts`
- `src/producer/carousel-end-to-end.test.ts`
- `src/space-driver/driver.ts` (doc comments only — no behaviour change)
- `src/space-driver/driver.test.ts` (relabelled its two GENERIC "proves genericity" tests with an
  explicitly synthetic node name, `"Arbitrary Recipe Prompt Node"`, since the real News Carousel node
  now coincides with the wired Recipe's own literal `"JSON Master"` string — on a different Space — so
  the old `"Slides Prompts"` example could no longer honestly claim to be "the real News Carousel
  node")
- `src/production-spec/news-carousel-contract.ts` (doc comments only)
- `.claude/skills/produce-news-carousel/SKILL.md` (one sentence: the node it says the Producer injects
  into)
- `src/space-driver/fixtures/live-captures/carrousel/README.md` (appended a short "Status" note
  confirming this slice's implementation — the capture's own decision record is left otherwise intact)

**OpenSpec:**
- `openspec/changes/issue-89-prove-two-recipes-end-to-end/{proposal.md,tasks.md,specs/**}` (this
  change).

### How to run

```bash
# Type-check + full unit/integration suite
npm test

# Docs-conformance suite (agent .md files match their referenced code)
npm run test:docs

# Build (tsc emit)
npm run build

# OpenSpec strict validation (this change + every existing spec)
openspec validate --all --strict

# Just this slice's two new files
node --import tsx --test src/producer/fixtures/fake-carousel-space.test.ts
node --import tsx --test src/producer/two-recipes-end-to-end.test.ts
```

All four commands are green: `npm test` → **1340/1340 pass, 0 fail** (364 suites); `npm run test:docs`
→ **82/82 pass**; `npm run build` → clean (no errors); `openspec validate --all --strict` → **27/27
passed** (26 existing specs + this change).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #89) | Proving test(s) |
|---|---|---|
| 1 | The fake Carrousel replays #86's captures and matches the live single-lane node inventory. | `src/producer/fixtures/fake-carousel-space.test.ts` — all 8 `it`s: node names+types (vs `CARROUSEL_NODE_INVENTORY`), the 5 connections (vs `CARROUSEL_CONNECTIONS`, ids resolved to names), the Producer Protocol's parsed `run_points` (deep-equal to `canonicalCarouselProtocol()`), the Image Generator's real settings, the real 7 slide creation ids, and the old placeholder names' absence — every assertion reads the capture file directly, never a hand-typed copy. |
| 2 | One Idea produced through two Recipes yields two Assets with distinct copy, each independently attributable via `/log-post`. | `src/producer/two-recipes-end-to-end.test.ts`, Step 4 ("resolving the Cast pick renders the SECOND Asset..."): asserts `wired.asset_url !== carousel.asset_url`, `wired.copy.caption !== carousel.copy.caption` (each within its OWN `copyShape.maxChars`), then logs both via `logPostCommand` and asserts each Asset carries **only** its own `post_url` (`assert.notEqual(wiredAfter.post_url, carouselAfter.post_url)`). |
| 3 | A gate-count different from the character Recipe (zero gates) is exercised end-to-end. | `two-recipes-end-to-end.test.ts` Step 2 ("the News Carousel job (zero gates) drives straight to a produced Asset — no pause, ever") drives the carousel job `queued → running → done` with **no** `awaiting_pick` visited, asserting `asset.pending_gate === undefined`; Step 3 ("the Cast job pauses at its gate WHILE the carousel job has already finished") proves the ONE-gate path pauses (`awaiting_pick`) for the SAME Idea, at the same time the zero-gate path has already finished — both gate counts exercised together, not in isolation. |
| 4 | `/queue`, `/report`, and `/track-performance` correctly show the two Assets at independent stages. | `/queue`: Step 3 asserts `queueCommand`'s output shows `[character-explainer-with-cast] ... gate=cast ... awaiting_pick` and, on a separate line, `[news-carousel] ... gate=final ... done`. `/report`: Step 3 asserts the Idea's rolled-up status is the EARLIEST Asset stage (`in_production`) even though the carousel sibling is already `produced`; Step 5 asserts the Posts section lists both logged URLs and the predicted/measured distinction. `/track-performance`: Step 5 seeds two DIFFERENT fake Apify readings for the two distinct `post_url`s in ONE `trackPerformanceCommand` call and asserts the two `performance_score`s/`metrics` diverge and are written independently (never touching the sibling Asset) — this reuses the SAME scoring guarantee issue #84 already unit-tested (`commands/track-performance.test.ts`'s "two Assets" describe block), but here the two Assets originate from an actually-driven two-Recipe production, not a hand-seeded ledger. |
| 5 | The old carousel branch is deleted (salvage merged or consciously dropped); built test-first; strict validate + both suites green. | Confirmed via `git branch -a` (branch absent) and `git tag -l` (`archive/issue-60-second-recipe-carousel` present) — see "Stale-branch confirmation" below. Test-first: every new/rebuilt file's test was written and run RED before the corresponding implementation/rebuild (see `tasks.md`, all boxes checked). Both suites + `openspec validate --all --strict` green (see "How to run" above). |

### Fakes / fixtures used — THE MAGNIFIC FAKE, explicitly flagged

- **`FakeCarouselSpace`** (`src/producer/fixtures/fake-carousel-space.ts`) — **THIS IS THE MAGNIFIC
  FAKE** for the News Carousel Recipe's Space, REBUILT this slice to the real, captured single-lane
  shape. Used by `fake-carousel-space.test.ts`, `carousel-end-to-end.test.ts`, and
  `two-recipes-end-to-end.test.ts`.
- **`FakeSpace`** (`src/space-driver/fixtures/fake-space.ts`) — **THIS IS THE MAGNIFIC FAKE** for the
  wired *Character Explainer with Cast* Recipe's Space — untouched this slice, reused as-is. Used by
  `two-recipes-end-to-end.test.ts`.
- **Live capture fixture** — `src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`
  (issue #86, sanctioned, sanitized — every `token=` redacted, no `.env` value present). Read directly
  (never mutated, never a live call) by `fake-carousel-space.test.ts` to prove the fake matches it.
- **Fake `PerformanceScrapePort`** — inline in `two-recipes-end-to-end.test.ts` Step 5, mirroring
  `commands/track-performance.test.ts`'s own `fakePort` convention — stands in for the live Apify call
  `/track-performance` would otherwise make.
- **Real, committed, read-only fixtures** (never written to by any test): `data/brands/straw-motion/brand-profile.yaml`
  (Copy composition's rules source), `data/brands/straw-motion/assets/brand-logo.png` (resolved via
  `getBrandAsset`, real Brand Asset), `data/brands/straw-motion/seeds.yaml` (the Facebook `post_actor`
  config `/track-performance` resolves). All writes in the new tests land in a **temp** ledger + temp
  queue file (`mkdtemp`); the real `data/brands/straw-motion/ledger.json` and `data/queue.json` are
  never touched.

**Confirmed hermetic:** no `spaces_*`/`creations_*` call anywhere in the new/changed code or tests — the
`developer` agent was not given the Magnific MCP tools and never reached for them. No live Apify call.
No credits spent. No board mutation.

### Node-name alignment — what and why (step 5 of the task brief)

The live capture (`00-spaces_show.fullboard.json`, `src/space-driver/fixtures/live-captures/carrousel/README.md`)
recorded the Operator's 2026-07-18 decision: the real "Carrousel" canvas's inject node is `"JSON
Master"` (not the placeholder `"Slides Prompts"` the pre-#86 build had guessed), and its logo reference
node is `"Brand_Logo"` (not `"Brand Logo"`). The Operator chose to change the BUILD to match the
canvas, not rename the canvas. Concretely:

- `canonicalCarouselProtocol()`'s run-point `start` → `"JSON Master"`.
- `NEWS_CAROUSEL.canvasInputs.promptNode` → `"JSON Master"` (same rename, since the Recipe's
  `promptNode` is read from the same protocol-derived source, `recipe/registry.ts`'s
  `CAROUSEL_RUN_POINT.start`).
- `NEWS_CAROUSEL.canvasInputs.mediaSlots`' key → `"Brand_Logo"` — I chose to rename the map KEY itself
  (not add a new field) because a brand-asset slot has no separate "canvas target" field the way an
  idea-pick slot does (`RecipeSpaceNodes.pinnedReference`); the existing convention (established by
  `promptNode` already literally holding a canvas node name) is that a brand-asset slot's map key IS
  its physical canvas target. This is also literally the convention ADR-0016 itself illustrates (its
  own worked example uses `` `Brand_Logo` `` as the slot name). The Brand Asset **store key**
  (`brandAssetKey: "brand-logo"`) is a separate thing and is untouched.
- The `FakeCarouselSpace`'s port-facing state now seeds all 7 real node names (not just the 4 the old,
  minimal fake carried), and its `edit()` distinguishes an inject goal from a media-bind goal by
  matching on the real `"JSON Master"` node name, exactly as before but pointed at the real name.

**Note on `driver.ts`/`driver.test.ts`'s generic "prove genericity" tests.** Before this slice,
`driver.test.ts` had a test proving `injectSpec`/`DriveLegInput.promptNode` is not hard-coded to `"JSON
Master"`, using `"Slides Prompts"` as an example of "some other Recipe's own node." After this slice
the REAL News Carousel node is *also* literally `"JSON Master"` (on a different Space) — so that test's
old assertion (`assert.doesNotMatch(..., new RegExp(JSON_MASTER_NODE_NAME))`) would become misleading
if left pointed at a now-real name. I relabelled the arbitrary node to `"Arbitrary Recipe Prompt Node"`
— a name that is explicitly synthetic and can never be mistaken for a real Recipe's own node — so the
genericity proof stays honest.

### Stale-branch confirmation (issue #60 salvage)

- `git branch -a` — **`issue-60-second-recipe-carousel` is absent** from both local and remote
  branches. Confirmed already deleted before this slice began, matching the task's premise.
- `git tag -l` — **`archive/issue-60-second-recipe-carousel` is present**, tagging commit `71cb969`
  ("docs(handoff): append QA Verdict — Round 1 (code): PASS-PENDING-CAPTURE"), with the tag message:
  "Archive of the unmerged issue-60 carousel build ... Kept for salvage per ticket #89: validator/
  fixture patterns, fake-space harness, old live capture."
- I inspected the tag's full tree (`git ls-tree -r --name-only archive/issue-60-second-recipe-carousel`).
  Every module the tag carries that is STILL relevant (the news-carousel Spec contract/validator, the
  Recipe registry entry, the `FakeCarouselSpace` fixture pattern, the per-Asset ledger/queue/report
  machinery) has ALREADY been superseded byte-for-byte by the real, merged #81-#88 implementations —
  those are what this slice builds on, not the tag's own copies.
- **One genuinely reusable artifact was salvaged**: the tag's `src/commands/two-recipes.test.ts` — a
  tracer-bullet test with essentially the SAME shape this slice needed (one Idea, two Recipes, distinct
  Copy, `/log-post` attribution, `/report` independent stages). I rewrote it against the CURRENT API
  surface as `src/producer/two-recipes-end-to-end.test.ts`: the tag's version calls retired functions
  (`driveSelectedRunPoints`, `slideRunPointNames`) and models a retired multi-image `asset_urls` array
  shape — both replaced by the real, merged `driveToNextGate`/single-`asset_url` shape from #57/#88.
  The tag's OLD `live-captures-ai-news/` (the pre-rebuild multi-lane board) is superseded by #86's real
  `live-captures/carrousel/` capture and was not salvaged.
- **Nothing further is needed from the tag.** The tag itself is left untouched (git tags are immutable
  history, not something this slice deletes or rewrites) — the `/build-issue` orchestrator's own
  process, not the `developer` agent, decides whether a git tag is ever pruned.

### Self-review notes

- Removed a duplicate/unused `withTempFiles` async helper I initially wrote in
  `two-recipes-end-to-end.test.ts` before settling on the `before`/`after`-hook shared-temp-dir pattern
  (mirrors `brand-asset/store.test.ts`'s own convention) — the file now has exactly one setup path.
  Removed the resulting unused `enqueue`/`QueueState` imports alongside it.
- Confirmed `npx tsc --noEmit` was clean throughout (`noUnusedLocals`/`noUnusedParameters` would have
  caught any leftover dead import).
- Re-checked every "Slides Prompts"/"Brand Logo" grep hit left in the tree after the rename: every
  remaining occurrence is a DELIBERATE, correctly-labelled historical/contrast reference ("the OLD
  placeholder name was X, the real name is Y") — never a live, still-acted-upon value.
- Considered whether to touch `openspec/specs/*` (the living specs) directly — did not: per CLAUDE.md,
  folding a change's spec deltas into the living specs is the `openspec archive` step, which this slice
  deliberately does not run (that is `/build-issue`'s job on merge). The spec deltas under this change's
  own `specs/` folder are the complete, self-contained proposal.
- Considered whether the carousel's finished Asset should carry all 7 slide URLs (a multi-image shape)
  rather than one representative URL — decided NOT to change this (see "Known limits"): it is an
  existing, pre-#89 simplification (`space-driver/driver.ts`'s `AssetResult`/`finishLeg`), out of this
  slice's stated scope, and changing it would ripple into the ledger's `LedgerAssetRecord` shape,
  `/log-post`, and `/report` — a genuinely separate slice's work.

### Known limits (explicitly out of this slice's scope)

- **Driving either Recipe against the LIVE Magnific Space** is still not built — this slice, like every
  prior recipe-architecture slice, proves the wiring against the FAKE only.
- **A multi-image carousel Asset representation.** The carousel's produced Asset's `asset_url` is one
  representative URL (the first of the real 7 captured slide creation identifiers) — the driver's
  `AssetResult` shape does not yet carry all 7. This is a pre-existing (#88) simplification, not a new
  gap introduced here.
- **The `gate`/`render`/`save` Phase Contracts still have no generic mechanical auditor** (issue #85's
  own documented limit, unchanged by this slice) — their checklists stay honest prose, self-audited via
  the `agent-judged` items a human/QA reviewer checks, not machine-computed.
- **The Skill-authoring step itself is not exercised by the tracer bullet.** Both Recipes' Production
  Specs come from committed fixtures (`validSpec()`, `strawMotionIdeaOneCarouselSpec()`) — exactly as
  `carousel-end-to-end.test.ts` already did before this slice — rather than actually invoking
  `produce-character-explainer`/`produce-news-carousel` (those are content-agent Skills, not testable
  TS functions; their own contract-conformance is covered by their respective docs-tests and fixture
  tests, e.g. `news-carousel-straw-motion-fixture.test.ts`).

---

## QA Verdict — Round 1: PASS

QA independently re-ran every command (never trusted the Build Report's claimed numbers) and
independently re-derived every acceptance-criterion mapping from the actual test files and actual code,
not from the developer's self-assessment table.

### Suite result

All four commands run fresh from a clean working tree (`issue-89-prove-two-recipes-end-to-end` branch):

| Command | Result |
|---|---|
| `npm test` | **1340/1340 pass, 0 fail, 0 skipped** (364 suites), `duration_ms 2745.78` — includes `tsc --noEmit` (clean) as its first step |
| `npm run test:docs` | **82/82 pass, 0 fail** (20 suites) |
| `openspec validate --all --strict` | **27/27 passed** (26 existing specs + `change/issue-89-prove-two-recipes-end-to-end`) |
| `npm run build` | clean — `tsc -p tsconfig.build.json`, no errors |
| `npx tsc --noEmit` (independent re-check) | clean, exit 0 |
| `node --import tsx --test src/producer/fixtures/fake-carousel-space.test.ts` (standalone) | **8/8 pass** |
| `node --import tsx --test src/producer/two-recipes-end-to-end.test.ts` (standalone) | **5/5 pass** |

Confirmed the two new suites are genuinely part of the `npm test` run (not orphaned): grepped the full
run's output and found `ok 223 - the FAKE Carrousel replays #86's captured node inventory exactly (issue
#89 AC1)` and `ok 225 - One Idea -> two Recipes -> two Assets, end-to-end against the FAKE (issue #89)`
inside the 1340-test run. The Build Report's numbers are accurate.

### Per-criterion results (issue #89 acceptance criteria, verbatim)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | The fake Carrousel replays #86's captures and matches the live single-lane node inventory. | **PASS** | `src/producer/fixtures/fake-carousel-space.test.ts` reads `00-spaces_show.fullboard.json` directly (`readJsonFile`) — never a hand-typed duplicate — and deep-equals the fake's exported `CARROUSEL_NODE_INVENTORY` (7 nodes, names+types+order), `CARROUSEL_CONNECTIONS` (5, ids resolved to names), the Producer Protocol's parsed `run_points` against `canonicalCarouselProtocol()`, the Image Generator's real settings, and the 7 real slide creation ids. Independently confirmed the capture file itself is untouched by this branch (`git log` shows it was added in the already-merged issue-86 commit `83491b2`, zero diff on this branch) and that its 7 node names (`grep -n '"name"'`) literally are `Producer Protocol`, `Assistant`, `Generated slides`, `Image Generator #21`, `JSON Master`, `List`, `Brand_Logo` — matching the fake's inventory exactly. All 8 `it`s pass standalone. |
| 2 | One Idea produced through two Recipes yields two Assets with distinct copy, each independently attributable via `/log-post`. | **PASS** | `two-recipes-end-to-end.test.ts` Step 4 drives the resumed Cast leg to `finished`, composes each Recipe's own Copy (`mediaContext` differs, `copyShape` differs: 180/1-3 vs 2200/0-2), asserts `wired.asset_url !== carousel.asset_url` and `wired.copy.caption !== carousel.copy.caption`, each within its OWN `maxChars`. Logs both via `logPostCommand` with two distinct URLs and asserts `wiredAfter.post_url !== carouselAfter.post_url` — attribution is via the logged URL alone, never inferred. |
| 3 | A gate-count different from the character Recipe (zero gates) is exercised end-to-end. | **PASS** | Step 2 drives the News Carousel job's sole leg (`targetGate: null`) straight to `outcome.kind === "finished"` and asserts `asset.pending_gate === undefined` — `awaiting_pick` is never visited (verified by reading the test: no `markAwaitingPick` call appears on the carousel path at all). Step 3 simultaneously drives the wired Recipe's Cast-gate leg to a genuine pause (`outcome.kind === "paused"`, `gate === "cast"`) for the SAME Idea, while the carousel sibling has already reached `done` — both gate counts exercised together in one continuous flow, not two isolated tests. |
| 4 | `/queue`, `/report`, and `/track-performance` correctly show the two Assets at independent stages. | **PASS** | `/queue`: Step 3 asserts `queueCommand`'s real output text matches `[character-explainer-with-cast] ... gate=cast ... awaiting_pick` and, on a separate line, `[news-carousel] ... gate=final ... done`. `/report`: Step 3 asserts the Idea's rolled-up row shows `in_production` (the earliest Asset stage) even though the carousel sibling Asset is already `produced`; Step 5 asserts the Posts section lists both distinct `post_url`s plus the predicted-Fit/measured-Performance distinction. `/track-performance`: Step 5 feeds a fake `PerformanceScrapePort` two materially different readings for the two distinct `post_url`s in ONE `trackPerformanceCommand` call, and asserts `wired.performance_score !== carousel.performance_score`, `carousel.performance_score! > wired.performance_score!` (the higher-engagement Post scores higher), and each Asset's `metrics` reflects only its own scraped reading (`deepEqual` against the seeded per-Post numbers) — scored relative to the ONE seeded Channel baseline, never a raw count. |
| 5 | The old carousel branch is deleted (salvage merged or consciously dropped); built test-first; strict validate + both suites green. | **PASS** | Independently ran `git branch -a --list "*issue-60*"` → empty (branch absent, both local and remote). `git tag --list "*issue-60*"` → `archive/issue-60-second-recipe-carousel` present. The Build Report documents a conscious salvage decision (one file, `two-recipes.test.ts`'s tracer shape, rewritten against the current API as `two-recipes-end-to-end.test.ts`; everything else in the tag already superseded) — this is a genuine, reasoned salvage decision, not a silent drop. `tasks.md` shows all boxes checked with a test-first ordering per section (write failing test → implement → confirm green). Both suites + `openspec validate --all --strict` independently re-run and confirmed green above. |

### Per-scenario results (OpenSpec spec deltas)

All scenarios below were cross-checked against the actual test code (not just the spec prose) and the
issue.

**`specs/two-recipe-tracer/spec.md`** (new capability):
- "enqueueOnAccept enqueues one job per chosen Recipe..." — **PASS**, `two-recipes-end-to-end.test.ts`
  Step 1, `assert.deepEqual(result.outcomes, [...])`, `wiredJob.gate === "cast"`, `carouselJob.gate ===
  null`.
- "Driving both Recipes to completion yields two Assets with distinct media and distinct Copy" —
  **PASS**, Step 4 assertions above.
- "The News Carousel job never visits awaiting_pick" — **PASS**, Step 2 (no `markAwaitingPick` call on
  that path; `pending_gate === undefined` asserted).
- "The wired Recipe's Cast-gate job pauses while the carousel job for the SAME Idea has already
  finished" — **PASS**, Step 3.
- "/queue shows the wired job awaiting_pick and the carousel job done, on separate lines" — **PASS**,
  Step 3's `queueOutput` regex assertions.
- "/report's Idea-level status is the EARLIEST of the two Assets' stages" — **PASS**, Step 3's `report`
  regex assertion (`in_production`).
- "Two genuinely different Posts' engagement yields two different Performance Scores" — **PASS**, Step
  5.
- "/report surfaces both logged Posts, keeping predicted Fit Score and measured Performance Score
  distinct" — **PASS**, Step 5's `report` assertions (`/Fit Score is PREDICTED.*Performance Score is
  MEASURED/s` plus both post URLs).

**`specs/recipe-registry/spec.md`** (modified): every scenario (`gates: []`, Space id/nodes,
`clipRunPoint === "JSON Master"`, spec-shape reference equality, copy-shape divergence,
`canvasInputs.mediaSlots["Brand_Logo"]`, author-phase 8-item checklist, gate-phase empty checklist) is
directly covered by `src/recipe/registry.test.ts`, independently re-read and confirmed to assert exactly
these shapes against the live `NEWS_CAROUSEL` export. **PASS** on all scenarios.

**`specs/execution-protocol/spec.md`** (modified): `canonicalCarouselProtocol()`'s one run-point
(`start: "JSON Master"`, `gate: null`), the no-hard-coded-id scenario, and the truncation-cap scenario
are all covered by `src/execution-protocol/protocol.test.ts` (re-read, confirmed assertions match). Also
independently confirmed against the raw capture JSON (`Producer Protocol` node's `data.text`, line 18)
that the live board's own Producer Protocol literally reads `"start": "JSON Master"` — the spec is not
just self-consistent, it matches the real artifact it claims to model. **PASS**.

**`specs/producer-conductor/spec.md`** (modified): the gate-free-run-to-finished scenario and the
missing-required-asset-STOPs-before-any-Space-call scenario are covered by `carousel-end-to-end.test.ts`
(pre-existing, updated for the new node names) and independently re-verified against
`fake-carousel-space.ts`'s `edit()`/`readState()` logic. The new "FakeCarouselSpace replays the live
Carrousel capture's exact node inventory" Requirement and its 4 scenarios are covered by
`fake-carousel-space.test.ts` as already detailed under AC1. **PASS**.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| **Generate-never-publish** | **PASS** | Grepped `src/commands` and `src/producer` for `publishTo`/`autoPublish`/`publishPost` — zero hits. `two-recipes-end-to-end.test.ts` only ever calls `logPostCommand` with a URL the "Operator" (test) supplies as already-published (`wiredPostUrl`/`carouselPostUrl` are plain string literals set by the test, standing in for the human-published URL) — the code path never invents or auto-posts a URL. |
| **Public-metrics-only / Relative-not-absolute** | **PASS** | `src/performance/score.ts`'s `computePerformanceScore` normalizes every metric against `baseline.<metric>` medians (`normMetric`), never against raw counts; `trackPerformanceCommand` in the tracer bullet scores both Assets against the ONE seeded Channel `baseline` (Step 5). The fake `PerformanceScrapePort` stands in for the Apify call — no live Apify request. |
| **Explicit-attribution** | **PASS** | Step 4's `logPostCommand(BRAND, IDEA_ID, WIRED_RECIPE, wiredPostUrl, ...)` / `logPostCommand(..., CAROUSEL_RECIPE, carouselPostUrl, ...)` — attribution is keyed on the `(idea, recipe)` pair the Operator supplies, never inferred from content or timing. `assert.notEqual(wiredAfter.post_url, carouselAfter.post_url)` confirms no collapse. |
| **Ledger-as-source-of-truth** | **PASS** | Every status transition in the tracer bullet goes through `writeAsset`/`AssetStore` (`in_production` → `produced` → `posted` → scored via `trackPerformanceCommand`'s own internal `writeAsset` calls) against a temp ledger file — never an in-memory-only mutation. Confirmed `src/asset/store.ts` is the sole write path used. |
| **Character path stayed behaviour-identical** | **PASS** | `git diff src/space-driver/driver.ts` shows doc-comment-only changes (no logic touched). `git diff src/space-driver/driver.test.ts` shows only a cosmetic relabel of the two "prove genericity" stub tests (`"Slides Prompts"` → `"Arbitrary Recipe Prompt Node"`, a synthetic name) plus `"Brand Logo"` → `"Brand_Logo"` in the *carousel-flavoured* media-bind assertions in that same file — the wired-Recipe-specific describe blocks (Cast pause, `FakeSpace`, `JSON_MASTER_NODE_NAME` for the wired Recipe) are untouched. |
| **Magnific fake — hermetic** | **PASS (critical check)** | `grep -rn "mcp__magnific\|spaces_[a-z]*(\|creations_[a-z]*(" src` → **zero hits** anywhere in `src/`. The only `mcp__magnific__*` string in the whole repo diff is `.claude/agents/producer.md`'s own front-matter `tools:` list, which is the CONTENT `producer` agent's declared runtime tool grant (expected, pre-existing, unrelated to the build/test hermetic requirement — consistent with the same finding QA made on issue #88's Round 1/2 verdicts). No `spaces_*`/`creations_*` call, no credits, no board mutation, anywhere in the new/changed test or fixture code. Both new tests use only `FakeSpace`/`FakeCarouselSpace`/a fake `PerformanceScrapePort`. |
| **Node-name alignment — no dangling references (AC1 sub-check)** | **PASS with one low-severity defect** | `grep -rn "Slides Prompts" src .claude` and `grep -rn '"Brand Logo"' src .claude` (excluding `Brand_Logo`) — every hit in `src/` is a deliberately-labelled historical/contrast reference ("the OLD name was X, the real name is Y") or the capture README's own record of the Operator's decision, confirmed by direct reading. **One stale, non-contrastive reference was found and is NOT part of this slice's diff**: `.claude/agents/producer.md` lines 130-131 (added by the already-merged issue-88 commit `b083eec`, predates this slice, `git status` confirms this file was not touched on this branch) still reads `` `JSON Master` for the wired Recipe, `Slides Prompts` for the News Carousel Recipe `` as a live, current-tense illustrative example — this is now factually wrong (the real value is `"JSON Master"` for both Recipes, on different Spaces) and contradicts the Build Report's own claim that "every dependent test/fixture/doc that named the old placeholders was updated." See Defect list below — this is a documentation-only issue: `driveToNextGate` reads the real value from `recipe.canvasInputs.promptNode` (the registry), never from this prose, so it does not affect any test result or actual driving behaviour; docs-conformance (`npm run test:docs`, 82/82) does not check this specific sentence. |

### Defect list

| # | Severity | Description | Repro |
|---|---|---|---|
| 1 | **low** | `.claude/agents/producer.md` (lines 130-131, pre-existing from issue #88, not touched by this branch) still gives `"Slides Prompts"` as the current, live example of the News Carousel Recipe's `promptNode`, contradicting the real, now-implemented value `"JSON Master"`. This is a stale doc reference this slice's own stated scope ("every dependent test/fixture/doc that named the old placeholders was updated") should have caught, since the Build Report and the OpenSpec proposal's file lists both omit `.claude/agents/producer.md`. It does not affect any test (docs-conformance passes 82/82; no test parses this specific sentence) and does not affect real driving (the driver reads `Recipe.canvasInputs.promptNode` from the registry at runtime, never this prose) — it is a documentation-accuracy gap only, in a file this slice did not touch and whose staleness this slice's own "no dangling reference" self-review missed. | `grep -n "Slides Prompts" .claude/agents/producer.md` → line 131. Read `.claude/agents/producer.md:125-148` ("Drive the canvas" section) to see the stale example in context. Fix: update the sentence to reflect that both wired Recipes' own prompt nodes are literally named `"JSON Master"` (on different Spaces), or use a synthetic example name as `driver.test.ts` now does. Non-blocking for this PASS verdict; recommended as a fast follow (either in this slice via a fix-forward note, or the very next docs-touching slice). |

No other defects found. No critical or high-severity issues. Hermeticity, all five always-rules, and
all five GitHub acceptance criteria are genuinely, independently verified as met — this slice is a real,
comprehensive proof that the whole recipe architecture (map #70, ADRs 0015-0018, issues #81-#88) works
together end-to-end against the Magnific fakes.

### Overall

**PASS.** All suites genuinely green (`npm test` 1340/1340, `npm run test:docs` 82/82,
`openspec validate --all --strict` 27/27, `npm run build` clean — all independently re-run, not taken on
faith). All 5 GitHub acceptance criteria are met by tests that genuinely exercise them, not merely
claimed. The OpenSpec change faithfully matches the issue and traces cleanly to map #70/ADRs 0015-0018.
The Magnific fake is used throughout — no live Space or Apify call anywhere in `src/`. All five
always-rules hold. One low-severity, non-blocking documentation defect (a stale example sentence in a
file this slice did not touch) is logged above for a fast follow; it does not gate this PASS.

---

## Build Report (developer, Round 2)

Fixes QA's one logged low-severity defect (Defect #1: `.claude/agents/producer.md` still cited the
retired `"Slides Prompts"` placeholder as the News Carousel Recipe's `promptNode`). Nothing else in
Round 1 changed — the character path is untouched.

### What changed

1. **Corrected the stale citation — made it recipe-generic, per QA's preferred fix.** Grepped the whole
   `.claude/agents/`, `.claude/commands/`, `.claude/skills/` tree for `Slides Prompts` / `"Brand Logo"`
   (node-name form) — the ONE hit was `.claude/agents/producer.md` lines 130-132 (added by the already-
   merged issue #88 commit, before issue #86's live capture existed). Rather than swap the one stale
   literal for the now-correct `"JSON Master"` literal, I made the sentence recipe-generic — matching
   ADR-0018's own "the Producer is a thin, recipe-generic conductor" framing, which this exact section
   of the doc already otherwise honors:

   > **Before:** "...injects the just-authored Spec into the Recipe's OWN `canvasInputs.promptNode`
   > (e.g. `JSON Master` for the wired Recipe, `Slides Prompts` for the News Carousel Recipe — never a
   > fixed node name)..."
   >
   > **After:** "...injects the just-authored Spec into the Recipe's OWN `canvasInputs.promptNode` —
   > resolved from `src/recipe/registry.ts`'s `getRecipe(job.recipe)`, never a node name hard-coded in
   > this doc (every wired Recipe declares its own; two different Recipes' own nodes may even share a
   > literal name while living on two different Spaces)..."

   The parenthetical explicitly calls out the exact trap that caused the original staleness (two
   Recipes' nodes coincidentally sharing the literal string `"JSON Master"` on two different Spaces),
   so a future reader understands WHY no concrete example is given here.

2. **Added a guard so this can't silently drift again** (the #88 watermark-regression lesson, per QA's
   ask): a new `it` in `src/production-spec/producer-agent.docs-test.ts`, in the SAME
   `describe("producer.md is a thin, recipe-generic conductor...")` block as the existing sibling guard
   ("never hard-codes the wired Recipe's own canvas node names (e.g. 'Character Variants Generator')").
   The new test:
   - **Pins against the registry, not a hardcoded assumption.** It calls `getRecipe("news-carousel")`
     and asserts `canvasInputs.promptNode === "JSON Master"` and
     `Object.keys(canvasInputs.mediaSlots)` is `["Brand_Logo"]` — reading the REAL, current values
     from the live registry, never copy-pasting them as frozen literals. If the registry's own values
     ever change again (a future canvas rebuild), THESE assertions fail first and loudly, so the
     guard's own premise can never itself go silently stale the way the doc did.
   - **Blocks the exact regression.** `assert.doesNotMatch(text, /Slides Prompts/)` and
     `assert.doesNotMatch(text, /"Brand Logo"/)` — both with messages that name the registry's current
     correct value, so a future failure is immediately actionable.
   - **Verified test-first fidelity**: I confirmed (via a standalone Node snippet reproducing the
     original stale sentence) that this exact guard would have failed against the ORIGINAL,
     pre-Round-2 `producer.md` text — proving it is a real regression guard, not a tautology.

### Files touched (Round 2 only)

- `.claude/agents/producer.md` — one sentence, made recipe-generic (see above). No other change.
- `src/production-spec/producer-agent.docs-test.ts` — one new `it` (import of `getRecipe` added).

### How to run

Same four commands as Round 1 (`npm test`, `npm run test:docs`, `npm run build`,
`openspec validate --all --strict`) — all re-run clean after this fix:

- `npm test` → **1340/1340 pass** (364 suites) — unchanged from Round 1 (this fix touches no code under
  the `npm test` glob).
- `npm run test:docs` → **83/83 pass** (was 82 — the one new guard `it`), 20 suites.
- `npm run build` → clean, no errors.
- `openspec validate --all --strict` → **27/27 passed** (this change + 26 existing specs).

### Self-review notes (Round 2)

- Re-grepped the FULL `.claude/agents/`, `.claude/commands/`, `.claude/skills/` tree once more after
  the fix for `Slides Prompts` and `"Brand Logo"` (node-name form, quoted) — zero hits anywhere.
- Confirmed the character (wired) Recipe's path is untouched: `git diff` for this round touches exactly
  the two files listed above; no test file, driver, registry, or fixture changed.
- Confirmed the new guard sits in the correct suite (`*.docs-test.ts`, excluded from `npm test`'s glob,
  matching how the doc itself is edited without needing to touch runtime code) and in the correct,
  already-established describe block (extends the existing recipe-generic-conductor guard family rather
  than starting a new one).
- Did not touch `openspec/specs/*`, did not run `openspec archive`, did not commit/push/open a PR — per
  the coordinator's Round-2 instructions.

### Known limits (Round 2)

None beyond what Round 1 already documented. This round was scoped to exactly the one logged defect.
