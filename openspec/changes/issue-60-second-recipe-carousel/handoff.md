# Slice Handoff — issue-60-second-recipe-carousel

Bidirectional channel between `developer` and `qa`. Developer writes the Build Report; `qa` appends a
Verdict below it. Retries append `Round-N Build` blocks. Nothing here is ever overwritten.

---

## Build Report (Round 1)

### What changed

Wired a **second Recipe** into the registry — **News Carousel** (`slug: "news-carousel"`), a zero-gate
Instagram carousel driven by the Operator-confirmed **"AI News"** Space (id
`a2402c48-b688-436b-8cb6-23a4aad7822e`) — and proved the multi-format machinery (ADR-0009–0012) is
genuinely generic by running one Idea through BOTH Recipes end-to-end against fakes.

- **Registry**: `RecipeSpaceNodes`'s wired-Recipe-specific fields (`pinnedReference`/`castRunPoint`/
  `clipRunPoint`) became optional; a new `slideRunPoints` field was added. The `news-carousel` entry
  declares `gates: []`, its own Spec shape/validator, its own copy shape (2200 chars / 0-2 emojis vs the
  wired Recipe's 180 / 1-3), and the "AI News" Space target.
- **Spec shape**: `production-spec/news-carousel-contract.ts` + `news-carousel-validate.ts` — an
  ordered 5-7 slide list (`{ slide_index, image_prompt }`, `slide_index` exactly `1..N` once each),
  patterned on a real, captured, pre-tidy dump of the live board (never invented).
- **Driver**: a new `driveSelectedRunPoints` orchestrator (built from the SAME low-level primitives as
  `driveToNextGate`, which is itself UNCHANGED) drives a caller-selected, ordered subset of a Space's
  parallel gateless run-points — only the run-points for the slides an Idea's Spec actually has, never
  the Space's fixed 7. `AssetResult` gained `media: readonly Creation[]` (every produced creation, in
  order) shared by both orchestrators; a single-media finish still yields a one-element `media` (no
  behavior change to the wired Recipe).
- **Asset schema**: `LedgerAssetRecord` gained `asset_urls?: readonly string[]` (a multi-media Recipe's
  ordered file list) alongside the existing `asset_url` — mutually exclusive on one Asset —
  plus `assetMediaUrls(asset)`, the shape-agnostic read accessor.
- **`composeSpec` became Recipe-generic**: an injectable `validator` (defaults to the wired Recipe's
  `validate`, unchanged for every existing caller), mirroring the already-injectable `generator`.
  `ValidationError.code` widened from the wired-only union to plain `string` so `ValidationResult` is
  reusable by any Recipe's own validator.
- **Proved it**: `src/commands/two-recipes.test.ts` drives ONE Idea through both Recipes against
  `FakeSpace` (wired, unchanged) and the NEW `FakeCarouselSpace`, composing each Recipe's own copy
  shape, and asserts: two independent Assets, distinct media shape, distinct copy, independent
  `/log-post` attribution, independent `/report` stage display, and that a Performance write to one
  Recipe's Asset never touches its sibling (the guarantee `/track-performance` depends on).
  `/queue`/`/report`/`/log-post` needed **zero production-code changes** — they were already
  Recipe-generic from issues #54-58 and simply had never been proven against a second real Recipe.
- **Docs**: `.claude/agents/producer.md` drops the stale "second Recipe is future work" note and gains
  a "News Carousel Recipe (zero gates)" section describing how to drive it generically.

### Files touched

**New:**
- `src/production-spec/news-carousel-contract.ts` (+`.test.ts`)
- `src/production-spec/news-carousel-validate.ts` (+`.test.ts`)
- `src/production-spec/fixtures/news-carousel-specs.ts`
- `src/execution-protocol/fixtures/carousel-space-state.ts`
- `src/space-driver/fixtures/fake-carousel-space.ts` — **the Magnific fake for the second Space**
- `src/commands/two-recipes.test.ts` — the two-Recipe end-to-end proof
- `src/space-driver/fixtures/live-captures-ai-news/00-spaces_state.pre-tidy.txt` (+`README.md`)
- `openspec/changes/issue-60-second-recipe-carousel/{proposal.md,tasks.md,specs/**}`

**Modified:**
- `src/recipe/registry.ts` (+`.test.ts`) — second entry, `RecipeSpaceNodes` widened
- `src/space-driver/driver.ts` (+`.test.ts`) — `driveSelectedRunPoints`, `AssetResult.media`,
  `DriverSpecInput`
- `src/asset/asset.ts` (+`.test.ts`) — `asset_urls`, `parseAssetUrls`, `assetMediaUrls`
- `src/production-spec/validate.ts` — `ValidationError.code` widened to `string`
- `src/production-spec/compose.ts` (+`.test.ts`), `store.ts` — injectable validator, widened spec type
- `src/execution-protocol/protocol.ts` (+`.test.ts`) — `canonicalCarouselProtocol`,
  `carouselSlideRunPointName`
- `src/execution-protocol/parse.test.ts` — carousel-protocol resolution proof
- `src/commands/queue.test.ts` — two-Recipe independent-jobs proof
- `.claude/agents/producer.md`

### How to run

```bash
npm test              # type-check (tsc --noEmit) + full unit suite — 1112/1112 (baseline 1053)
npm run test:docs     # markdown-conformance suite — 25/25 (unchanged)
npx openspec validate issue-60-second-recipe-carousel --strict   # green
npx openspec validate --all --strict                             # 21/21 green (specs + this change)

# a few focused runs used while building:
npx tsx --test src/space-driver/driver.test.ts
npx tsx --test src/recipe/registry.test.ts
npx tsx --test src/commands/two-recipes.test.ts
npx tsx --test src/production-spec/news-carousel-contract.test.ts src/production-spec/news-carousel-validate.test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1a | A second Recipe exists in the registry with its own gates | `src/recipe/registry.test.ts` → "The News Carousel Recipe declares its OWN gates + spec-shape + copy-shape + Space target" → "declares ZERO gates — a gate count different from the wired Recipe's one" |
| 1b | ...its own spec-shape | `src/production-spec/news-carousel-contract.test.ts` (slide bounds, run-point naming) + `news-carousel-validate.test.ts` (well-formed/malformed Specs); `registry.test.ts`'s "spec-shape's validator IS the real News Carousel Spec validator (zero drift)" |
| 1c | ...its own copy-shape | `registry.test.ts` → "declares a copy-shape DIFFERENT from the wired Recipe's 180/1-3" (2200/0/2) |
| 1d | ...its own Space | `registry.test.ts` → "declares a DIFFERENT Space target from the wired Recipe's — 'AI News'" |
| 1e | Space captured as record/replay fixtures for the fake | **PARTIALLY MET** — see "Fixture-capture status" below |
| 2 | One Idea, two Recipes → two Assets, distinct copy, independently attributable via `/log-post` | `src/commands/two-recipes.test.ts` → "produces two Assets... DISTINCT composed copy" and "each Asset is independently attributable via /log-post" |
| 3 | A gate count different from the wired recipe (zero) is exercised end-to-end | `src/space-driver/driver.test.ts` → "driveSelectedRunPoints — a REAL carousel-shaped Space, zero gates, several images collected" (5 tests: 5-of-7 slides, full 7, minimum 5, unresolved-name short-circuit, mid-list-failure short-circuit) + `two-recipes.test.ts`'s `produceCarouselAsset` flow; the wired one-gate recipe's own 40 driver tests remain green, unchanged |
| 4a | `/queue` shows two Assets of one Idea at independent stages | `src/commands/queue.test.ts` → "queueCommand — one Idea's TWO chosen Recipes show as independent jobs" |
| 4b | `/report` shows two Assets at independent stages | `two-recipes.test.ts` → "/report shows both Assets at independent stages when only ONE of the two has been posted" |
| 4c | `/track-performance` shows two Assets at independent stages | `two-recipes.test.ts` → "writing performance to ONE Recipe's Asset never touches the other Recipe's Asset" — proves the `AssetStore.writeAsset` per-(Idea,Recipe) isolation guarantee `/track-performance` (prompt-driven, no TS runtime) depends on; see Known Limits |
| 5 | Built test-first; strict validate + full suite green | `npm test` 1112/1112 (1053 baseline + 59 new), `npm run test:docs` 25/25, `npx openspec validate issue-60-second-recipe-carousel --strict` green, `npx openspec validate --all --strict` 21/21 |

### Fakes / fixtures used

- **`FakeSpace`** (`src/space-driver/fixtures/fake-space.ts`) — the WIRED Recipe's existing Magnific
  fake, reused UNCHANGED (proves the wired path stayed byte-for-byte identical).
- **`FakeCarouselSpace`** (`src/space-driver/fixtures/fake-carousel-space.ts`) — **NEW, THE MAGNIFIC
  FAKE for the second Space ("AI News")**. Implements `SpaceMcpPort`; models per-slide `Image Prompt
  Slide N` → `Slide N Generator` runs, each producing exactly one image creation; fault injection
  (`injectNoOp`, `slideRunFails`). **No live `spaces_*`/`creations_*` call anywhere** — confirmed by
  grep across the full diff (only doc/comment/fixture-filename mentions of those strings, never a tool
  invocation; the `developer` build was never given the Magnific MCP tools).
- **`fakeCarouselSpaceState()`** (`src/execution-protocol/fixtures/carousel-space-state.ts`) — the
  synthetic `spaces_state` the fake/parser read, patterned on the real board dump.
- **`composeCopy`'s default deterministic drafter** — never a live model, per ADR-0012's existing
  discipline (unchanged from issue #58).
- **The pre-tidy board dump** — `src/space-driver/fixtures/live-captures-ai-news/00-spaces_state.pre-tidy.txt`,
  a sanitized (no secrets, verified by grep), READ-ONLY capture the Operator supplied this session — the
  ground truth every carousel node name/shape in this slice is patterned on.

### Fixture-capture status (flagged, not claimed done)

**Partially met.** The pre-tidy, READ-ONLY board dump is committed in-repo
(`src/space-driver/fixtures/live-captures-ai-news/`), and every carousel node name/shape in this slice
is patterned on it (never invented) — verified in the file's own README. What is **NOT** yet
present: a real captured `spaces_run`/`spaces_run_status` (carousel run), a real `spaces_edit`/
`spaces_edit_status` (post-tidy `JSON Master` inject), and real `creations_get` fetches — the
record/replay set `space-driver/fixtures/live-captures/` holds for the FIRST Space (issue #40). I have
no Magnific MCP tools and was explicitly instructed not to attempt any live call. These attended
captures are pending, to be added by the orchestrator + Operator on this same branch, before qa. The
fake is structured so swapping them in is a **data change** (new fixture files + any post-tidy node-name
corrections), not a code change — `injectSpec`/`runRunPoint`/`driveSelectedRunPoints` are already
Recipe/Space-agnostic.

### Self-review notes

- Simplified `finishLeg`'s finished-leg path: originally called both `fetchAsset(port, assetId)` AND
  `fetchCast(port, creationIds)` (two `port.fetchCreations` round-trips, one of them redundant for the
  primary creation). Refactored to resolve `media` ONCE via `fetchCast` and derive `assetUrl` from
  `media` — one port call instead of two, same observable result (all 40 driver tests still pass
  unchanged).
- Reused `production-spec/validate.ts`'s `ValidationResult`/`ValidationError` for the News Carousel's
  validator (widening `code` to `string`) instead of inventing a parallel, redundant pair of types —
  confirmed no other module relied on the narrower `ValidationCode` field type.
- Kept `driveToNextGate` **completely untouched** (0 diff to its own logic) rather than generalizing its
  `.find()` to a `.filter()`-and-loop — a caller-selected subset of same-gate run-points is a
  Spec-driven concern, not a gate-name-driven one, so a SEPARATE, purpose-built orchestrator
  (`driveSelectedRunPoints`) built from the same low-level primitives is the smaller, more honest diff.
- Did not touch `production-queue`/`report-surface`/`post-attribution`'s OpenSpec capability specs:
  their existing requirements already described two-Recipe behavior generically (with a `"carousel"`
  placeholder slug); this slice's new tests are additional concrete proof against the real registered
  `news-carousel` slug, not a behavior change — confirmed by reading each capability's current spec
  before deciding not to touch it (avoids padding the change with no-op deltas).

### Known limits

- **Attended live captures pending** (see "Fixture-capture status" above) — the acceptance criterion is
  explicitly marked partial, not claimed done.
- **`composeSpec`'s default brand-safety scan does not yet cover a carousel Spec's `image_prompt`
  fields.** `production-spec/brand-safety.ts`'s `collectTextFields` reads the wired contract's own field
  names; it does not know to read `slides[].image_prompt`. `composeSpec`'s VALIDATOR is now injectable
  per Recipe (proven for the carousel), but its banned-word FIELD COLLECTION is not — flagged here
  rather than silently claimed as covered. Out of this slice's scope; would need `collectTextFields` (or
  its caller) to become Recipe-parameterized, mirroring how `copy/validate.ts`'s banned-word scan
  already IS parameterized per Copy shape.
- **`/track-performance` has no TS runtime** (it is entirely prompt-driven, `.claude/commands/
  track-performance.md`, already generic/unmodified by this slice) — proven indirectly via the
  `AssetStore.writeAsset` per-(Idea,Recipe) isolation test in `two-recipes.test.ts`, the guarantee that
  command's per-Asset writes depend on, rather than a direct execution of the prompt itself.
- **No Format's `default_recipes` was updated** to offer `news-carousel` at Review for any real Brand
  (e.g. Straw Motion's "Unhypped News") — out of scope for this slice (a product/content decision, not
  required by the acceptance criteria); the Recipe is available to any Brand via `isWiredRecipe` the
  moment a Format or the Operator names it.

---

## QA Verdict — Round 1 (code): PASS-PENDING-CAPTURE

Scope of this round, per the orchestrator's brief: a **code verification**. Acceptance criterion 1e
(live-Space record/replay capture) is KNOWN-PARTIAL by design — attended captures land on this branch
AFTER this round, before the PR — and is assessed here as **PENDING**, not failed. Every other criterion
is assessed fully and must be genuinely green.

All commands were actually run by `qa` (not assumed); real output is reported below.

### Suite result

| Command | Claimed | Actual |
|---|---|---|
| `npm test` | 1112/1112 (baseline 1053) | **1112/1112 pass, 0 fail** — confirmed |
| `npm run test:docs` | 25/25 | **25/25 pass, 0 fail** — confirmed |
| `npm run build` | green | **green** (`tsc -p tsconfig.build.json`, no errors) |
| `npx openspec validate issue-60-second-recipe-carousel --strict` | green | **"Change 'issue-60-second-recipe-carousel' is valid"** — confirmed |
| `npx openspec validate --all --strict` | 21/21 | **"Totals: 21 passed, 0 failed (21 items)"** — confirmed |

All four Build Report claims verified as actually green, not assumed.

### Per-criterion results (issue #60 acceptance criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | A second Recipe exists in the registry with its own gates/spec-shape/copy-shape/Space; its Space is captured as record/replay fixtures for the fake | **PASS** (registry/gates/spec-shape/copy-shape/Space) + **PENDING** (fixture capture) | `src/recipe/registry.ts`'s `NEWS_CAROUSEL` entry: `gates: []`, `specShape.validate = validateNewsCarouselSpec`, `copyShape` = 2200/0/2 (vs wired 180/1/3), `space.id = a2402c48-…` ("AI News", distinct from wired `a1f05d67-…`). All proven by `registry.test.ts` (spot-checked test names against real file — verbatim match). Fixture capture: `src/space-driver/fixtures/live-captures-ai-news/00-spaces_state.pre-tidy.txt` + `README.md` committed, honestly marked partial; the real dump's node names (`JSON Master #2`→`JSON Master`, `Image Prompt Slide 1..7`, `Assistant Prompt #2`→`Carousel Prompt Guide`, `Straw_motion_logo`→`Brand Logo`) were spot-checked against `fake-carousel-space.ts`/`carousel-space-state.ts` and match exactly — the fake is genuinely patterned on the real capture, not invented. **See Defect list — none; PENDING per instructions.** |
| 2 | One Idea produced through two Recipes yields two Assets with distinct copy, each independently attributable via `/log-post <brand> <idea> <recipe> <url>` | **PASS** | `src/commands/two-recipes.test.ts` — scrutinized hard, does NOT stub past the interesting parts: `produceWiredAsset` drives the real `driveToNextGate` (cast leg → pick → render leg) against `FakeSpace`; `produceCarouselAsset` drives the real `driveSelectedRunPoints` against `FakeCarouselSpace`; both call the real `composeCopy`, real `writeAsset`, real `loadIdeaAssets`, real `logPostCommand(brand, idea, recipe, url, …)` (signature matches the issue's stated CLI shape exactly), real `loadReport`/`loadIdeas`/`findIdea`. Asserts `wired.copy.caption !== carousel.copy.caption` (genuinely distinct, not coincidental), `wired.post_url !== carousel.post_url`, each Asset carries only its own Post. |
| 3 | A gate-count different from the wired recipe (e.g. zero gates) is exercised end-to-end | **PASS** | `driveSelectedRunPoints` architecturally can never pause — it always calls `finishLeg(port, null, …)` (`targetGate` hard-coded `null`), so the News Carousel Recipe cannot set a gate cursor by construction. `driver.test.ts`'s 5 new `driveSelectedRunPoints` tests (5-of-7, full 7, minimum 5, unresolved-name short-circuit, mid-list-failure short-circuit) + `queue.test.ts`'s new two-Recipe job test (`gate=cast/awaiting_pick` vs `gate=final/done`) prove zero-gate vs one-gate side by side. The wired one-gate Recipe's pre-existing 31 tests are UNMODIFIED (`diff` of `driver.test.ts` against the pre-slice commit shows only additive imports + appended `describe` blocks after the original 675 lines — zero existing assertions touched) and all still pass (confirmed: pre-slice `driver.test.ts` run in isolation = 31/31; post-slice full file = 40/40). |
| 4 | `/queue`, `/report`, `/track-performance` correctly show the two Assets at independent stages | **PASS** (with one honestly-flagged limit) | `/queue`: `queue.test.ts`'s new test, two independent job lines for one Idea, never collapsed. `/report`: `two-recipes.test.ts`'s "shows both Assets at independent stages when only ONE has posted" — wired stays `produced`, carousel advances to `posted`, both rows present. `/track-performance`: this command is entirely prompt-driven (`.claude/commands/track-performance.md`, no TS runtime, unmodified by this slice) — proven indirectly via the `AssetStore.writeAsset` per-`(Idea,Recipe)` isolation test (writing the wired Asset's `performance_score` leaves the carousel sibling untouched at `posted`/no score). This is the same indirect-proof pattern used for this command in prior slices; honestly disclosed as a Known Limit, not silently claimed as a direct execution. |
| 5 | Built test-first; strict validate + full test suite green | **PASS** | See Suite result table above — all four commands independently re-run and confirmed green by `qa`, not assumed from the Build Report. |

### Per-scenario results (spec deltas → issue)

Spot-checked every ADDED/MODIFIED requirement in `openspec/changes/issue-60-second-recipe-carousel/specs/**` against a real, named, passing test. All resolve.

| Capability | Requirement | Scenario(s) | Result | Covering test |
|---|---|---|---|---|
| `news-carousel-recipe` | 5-7 slide Spec, media instructions only | well-formed 5/6/7; <5 or >7 rejected; dup/gapped `slide_index` rejected; missing `image_prompt` rejected | PASS | `news-carousel-validate.test.ts` |
| `news-carousel-recipe` | Only run-points for slides present are driven | 5-slide names exactly 5, never 6/7; sorted regardless of array order | PASS | `news-carousel-contract.test.ts` |
| `news-carousel-recipe` | Zero gates, own copy shape, "AI News" Space | gates/space/validator distinct from wired; copy shape 2200/0/2 vs 180/1/3 | PASS | `registry.test.ts` |
| `news-carousel-recipe` | Node shapes sourced from real captured dump, never invented | pre-tidy capture committed + marked partial; fake's node names match Operator's canonical list | PASS (capture sub-scenario: PENDING per instructions) | `live-captures-ai-news/README.md` (manually inspected) + `carousel-space-state.ts`/`fake-carousel-space.ts` (spot-checked against the real dump) |
| `recipe-registry` (RENAMED+MODIFIED) | Wired Recipe unchanged | validator reference-equality, copy-shape literal, node names, run-point names all unchanged | PASS | `registry.test.ts` (wired-Recipe describe block, unmodified assertions) |
| `recipe-registry` (ADDED) | Registry holds a genuinely different second Recipe | 2 entries; carousel has no pinned/cast/clip fields; unregistered slug still resolves to null/false | PASS | `registry.test.ts` |
| `generic-gate-driver` (ADDED) | `AssetResult.media` resolves every creation | single-creation → 1-element array; multi-creation → all, in order, `assetId`/`assetUrl` = first | PASS | `driver.test.ts` ("AssetResult.media" describe block) |
| `generic-gate-driver` (ADDED) | `driveSelectedRunPoints` | drives only named run-points; collects all media in order; unresolved name stops immediately; mid-list failure stops immediately; empty list fails without touching the Space | PASS | `driver.test.ts` ("driveSelectedRunPoints" describe block, 6 tests incl. the empty-list case) |
| `asset-store` (MODIFIED) | `asset_urls`/`asset_url` mutually exclusive; `assetMediaUrls` | multi-media parses, `asset_url` stays undefined; empty array dropped, not garbled; accessor returns the right list for either shape or `[]` for neither | PASS | `asset.test.ts` |
| `production-spec` (MODIFIED) | Injectable validator, Recipe-segmented Spec | carousel-shaped Spec written under its OWN validator even though the wired validator would reject it; refused when the injected validator rejects; two Recipes' Specs never overwrite each other | PASS | `compose.test.ts` |

`production-queue`/`report-surface`/`post-attribution` were correctly left untouched — their base specs (`openspec/specs/`) already contain generic two-Recipe scenarios (a `"carousel"` placeholder slug), confirmed by direct inspection; this slice's tests are additional concrete proof against the real `news-carousel` slug, not a spec change. No drift found.

### Always-rules + Magnific-fake checks

| Check | Result | Evidence |
|---|---|---|
| **Generate-never-publish** | PASS | `driveSelectedRunPoints` and `driveToNextGate` both only ever return a surfaced Asset/media list; neither calls anything publish-shaped. `producer.md`'s new News Carousel section ends step 6 with "**STOP.** You never publish." |
| **Public-metrics-only** | PASS (unaffected) | No metrics code touched by this slice (confirmed via file-touch list; `performance` fields only written by test fixtures mimicking `/track-performance`'s existing, unmodified behavior). |
| **Relative-not-absolute** | PASS (unaffected) | No scoring/baseline code touched by this slice. |
| **Explicit-attribution** | PASS | `logPostCommand(brand, ideaId, recipe, url, …)` requires an explicit `recipe` argument naming exactly one `(Idea, Recipe)` Asset; proven by `two-recipes.test.ts`'s attribution test (each Asset carries only its own `post_url`, never inferred, never collapsed). |
| **Ledger-as-source-of-truth** | PASS | Every new field (`asset_urls`) is read/written exclusively through `AssetStore`/`asset.ts` parsing; confirmed both real brand ledgers (`data/brands/mundotip/ledger.json`, `data/brands/straw-motion/ledger.json`) still load cleanly under the widened schema — ran `loadIdeas`/`loadReport` against both: `mundotip ideas: 10 report ideas: 10`, `straw-motion ideas: 7 report ideas: 7`, no errors. |
| **Magnific fake used; no live-Space calls** | PASS | `grep -rn "mcp__magnific\|spaces_run(\|spaces_edit(\|creations_get(\|creations_show(\|creations_wait("  src/` → **zero matches**. Full diff grep for `spaces_*`/`creations_*` shows only comments/docstrings/fixture filenames, never a tool invocation. `FakeCarouselSpace` implements `SpaceMcpPort` purely in-memory (no network). |
| **`driveToNextGate` itself untouched** | PASS | Diffed the function's own body line-by-line against the pre-slice commit (`f24fcd9`): zero changes within `driveToNextGate`'s own lines; all new code is appended after it. The shared `finishLeg` helper it calls DID change (resolves `media` via one `fetchCast` call instead of `fetchAsset`+`fetchCast`) — a declared, honest refactor, not a silent one. Verified it does not regress the wired path: diffed `driver.test.ts` against pre-slice — the original 31 tests are pure textual carry-forward (only new imports + new `describe` blocks appended after line 675, zero existing assertions edited) — and ran the pre-slice 31-test file standalone (31/31 pass) plus the full post-slice 40-test file (40/40 pass). |
| **`asset_urls`/`asset_url` mutual exclusivity is defensive, doesn't break existing ledgers** | PASS | Purely additive schema change (`asset.ts` diff: new optional field + 2 new functions, no field removed/renamed). Both real brand ledgers load without error (see above). |

### Defect list

None blocking this round. One item noted for the Operator/next slice, not a code defect in this round:

- **Severity: low (tracking note, not a defect).** `composeSpec`'s default brand-safety scan
  (`production-spec/brand-safety.ts`'s `collectTextFields`) does not yet read a carousel Spec's
  `slides[].image_prompt` fields — confirmed by reading `collectTextFields`: it is hard-coded to
  `character_concepts`/`clips[].{concept_title,image_prompt,video_prompt}`, the wired contract's own
  field names. A banned word inside a News Carousel Spec's `image_prompt` would NOT currently be
  caught by the default scan (though `composeSpec`'s *validator* is correctly Recipe-generic and
  proven). This is honestly disclosed in the Build Report's Known Limits and is explicitly out of this
  slice's stated scope (issue #60 does not ask for banned-word coverage of the new shape). Repro: call
  `composeSpec` with a News Carousel-shaped Spec containing a banned word in `image_prompt` and observe
  it is not flagged by the default banned-word scan. Recommend a follow-up ticket to parameterize
  `collectTextFields` per Recipe (mirroring `copy/validate.ts`'s already-parameterized scan) before this
  Recipe is offered to a real Brand's Review flow.

### Capture criterion — explicitly PENDING (not failed, per Round-1 code-verification scope)

Acceptance criterion 1e ("its Space is captured as record/replay fixtures for the fake") is **PENDING**:

- Present: a real, sanitized, read-only pre-tidy `spaces_state` dump (`00-spaces_state.pre-tidy.txt`,
  152 nodes/103 connections) + an honest `README.md` that itself states the capture is partial.
- Confirmed genuine (not invented): spot-checked the real dump's raw node rows against
  `fake-carousel-space.ts`/`carousel-space-state.ts` — `JSON Master #2`, `Image Prompt Slide 1`..`7`
  (`prompt-generator` nodes, each instructed "return ONLY image_prompt from slide_index: N"),
  `Assistant Prompt #2` (the writing guide, renamed `Carousel Prompt Guide`), `Straw_motion_logo`
  (renamed `Brand Logo`) — all present in the dump exactly as the README and the fake both claim. No
  invented shape found.
- Missing (as declared): real `spaces_run`/`spaces_run_status`, `spaces_edit`/`spaces_edit_status`
  (post-tidy `JSON Master` inject), and `creations_get` captures — the record/replay set
  `live-captures/` holds for the FIRST Space. These are explicitly scoped to land on this branch,
  attended, with the Operator, after this round and before the PR.
- No live-Space call was made by the `developer` or by `qa` during this verification.

**This is assessed as PENDING per the orchestrator's explicit instruction, not as a failure, and does
not block the PASS-PENDING-CAPTURE verdict.**

### Overall verdict

**PASS-PENDING-CAPTURE.** Every acceptance criterion other than the live-capture criterion (1e,
explicitly PENDING) is genuinely proven by a real, passing, non-stubbed test — including the hardest one
to fake, criterion 2's `two-recipes.test.ts`, which drives both Recipes' real orchestrators end-to-end
against their respective fakes rather than stubbing past the interesting parts. The suite, build, and
both `openspec validate --strict` runs were independently re-run by `qa` and confirmed green, not
assumed. The wired one-gate Recipe's pre-existing behavior is provably byte-for-byte unchanged (diffed
against the pre-slice commit). No live Magnific calls anywhere. All checked always-rules hold. No
blocking defects. Once the attended live-Space captures land (criterion 1e), this slice is ready for a
PR.
