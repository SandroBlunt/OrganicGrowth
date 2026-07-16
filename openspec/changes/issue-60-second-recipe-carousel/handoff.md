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
