## Why

Multi-format's whole point (ADR-0009/0010/0011/0012) was never provable with only ONE Recipe wired: a
registry that always returns the same shape, a driver that only ever walks one gate, an Asset schema
that has only ever held one file, and attribution that has only ever pointed at one Post are all
consistent with a single-Recipe system by accident. Issue #60 is the tracer bullet — the Operator
(HITL) pointed the second Recipe at a REAL second Space ("AI News") and locked the shape: a **zero-gate**
Instagram news carousel whose Asset is SEVERAL images, not one file. Proving this end-to-end is what
turns "the machinery is generic" from a claim into a tested fact.

## What Changes

- **A second Recipe is registered — `news-carousel` ("News Carousel")** — `src/recipe/registry.ts`
  gains a second entry alongside the wired *Character Explainer with Cast*: `gates: []` (zero — a
  different gate COUNT than the wired Recipe's one), its own Production-Spec shape (an ordered 5-7
  slide list, `production-spec/news-carousel-contract.ts` + `news-carousel-validate.ts`), its own copy
  shape (Instagram editorial: 2200 chars, 0-2 emojis — deliberately different bounds from the wired
  Recipe's 180/1-3), and its own Space target ("AI News",
  `a2402c48-b688-436b-8cb6-23a4aad7822e`). `RecipeSpaceNodes`'s wired-Recipe-specific fields
  (`pinnedReference`/`castRunPoint`/`clipRunPoint`) become OPTIONAL and a new `slideRunPoints` field is
  added, so the shared type serves both Recipes' genuinely different node-reference shapes without
  either one faking fields it does not have.
- **The driver gains a second orchestrator, `driveSelectedRunPoints`, alongside the untouched
  `driveToNextGate`.** A Recipe whose Spec ITSELF selects which of a Space's several PARALLEL,
  always-gateless run-points to drive (the carousel: only the 5-7 slides an Idea's Spec actually has,
  never the Space's fixed 7) cannot be expressed as a single-gate walk — `driveToNextGate`'s own gate
  structure has nothing to distinguish between same-gate run-points. `driveSelectedRunPoints` injects
  the Spec once, then runs each CALLER-named run-point downstream in order, stopping the whole leg
  immediately on the first failure (no partial/best-effort result), and finishes with EVERY produced
  creation resolved into the Asset's result. `driveToNextGate` itself is unmodified.
- **`AssetResult` gains `media: readonly Creation[]`** — every creation a finished leg produced, in
  order, shared by both orchestrators (`finishLeg`, `space-driver/driver.ts`). A single-media Recipe's
  render still yields exactly one entry (`media[0]` === `{identifier: assetId, url: assetUrl}` — no
  behavior change for the wired Recipe); a multi-media Recipe's `media` carries all of them.
- **`LedgerAssetRecord` gains `asset_urls?: readonly string[]`** (`src/asset/asset.ts`) — a multi-media
  Recipe's ORDERED list of finished files, parsed defensively (`parseAssetUrls`) and never populated
  alongside the existing single-media `asset_url` on the same Asset. `assetMediaUrls(asset)` is the
  new read-side accessor a caller uses when it wants "every media URL", regardless of which Recipe
  produced them.
- **`composeSpec` becomes Recipe-generic**: `ComposeOptions` gains an injectable `validator` (defaults
  to the wired Recipe's `validate`, unchanged behavior for every existing caller), mirroring the
  already-injectable `generator`. `ValidationError.code` widens from the wired-only `ValidationCode`
  union to plain `string` so a DIFFERENT Recipe's validator (with its own error-code vocabulary) can
  reuse the SAME `ValidationResult`/`ValidationError` shape `RecipeSpecShape.validate` is typed to.
- **One Idea is produced through BOTH Recipes end-to-end, against fakes, proving two independent
  Assets with distinct copy, independently attributable.** A new integration suite
  (`src/commands/two-recipes.test.ts`) drives the wired Recipe against `FakeSpace` and the carousel
  against the NEW `FakeCarouselSpace`, composes each Recipe's OWN copy shape, writes both Assets, and
  proves: distinct media shape (`asset_url` vs `asset_urls`), distinct composed copy, independent
  `/log-post` attribution, independent `/report` stage display, and that writing one Asset's measured
  Performance never touches its sibling's (the guarantee `/track-performance` depends on).
  `/queue`/`/report`/`/log-post` needed **no production-code change** for this — their existing,
  already-generic (per-Recipe-keyed) implementations from issues #54-58 simply had never been proven
  against a SECOND real, registered Recipe before.
- **The "AI News" Space's node shapes come from a REAL, captured, sanitized board dump** (issue #60's
  pre-tidy read-only capture, `src/space-driver/fixtures/live-captures-ai-news/`), never invented —
  the fake (`fake-carousel-space.ts`) and the committed protocol artifact
  (`execution-protocol/protocol.ts`'s `canonicalCarouselProtocol()`) are patterned on it.

## Non-Goals (explicitly deferred)

- **Attended live-Space captures (run/edit/creations) for the "AI News" Space.** This slice's
  `developer` build has no Magnific MCP tools and must not attempt any live `spaces_*`/`creations_*`
  call. Only the pre-tidy, READ-ONLY board dump is used. The attended post-tidy capture pass (mirroring
  `live-captures/`'s sanctioned capture for the first Space, issue #40) is explicitly OUT of this
  slice — it happens after this build, on this same branch, with the Operator present. The acceptance
  criterion "its Space is captured as record/replay fixtures for the fake" is **partially met**: see
  `src/space-driver/fixtures/live-captures-ai-news/README.md` and the Build Report.
- **Re-pointing `producer.md` at the live "AI News" Space.** `producer.md` documents HOW to drive a
  zero-gate, multi-run-point Recipe generically (a new "News Carousel Recipe" section), but actually
  running it against the live Space is gated on the attended captures above.
- **Banned-word scanning of a carousel Spec's `image_prompt` fields via `composeSpec`'s default
  brand-safety scan.** `production-spec/brand-safety.ts`'s `collectTextFields` reads the WIRED
  contract's own field names (`character_concepts`/`clips`/`thumbnails`); it does not (yet) know to
  read a carousel Spec's `slides[].image_prompt`. `composeSpec`'s validator is now injectable per
  Recipe; its banned-word FIELD COLLECTION is not (out of this slice's scope — flagged as a known
  limit, not silently claimed as covered).

## Capabilities

### New Capabilities

- `news-carousel-recipe`: the News Carousel Recipe's own Production-Spec contract (5-7 slides, `{
  slide_index, image_prompt }`, `slide_index` exactly `1..N` once each) + validator, its slide
  run-point NAMING/selection rule (only the run-points for the slides present), its copy-shape values,
  its Space target, and the record/replay fixture-capture status (explicitly partial).

### Modified Capabilities

- `recipe-registry`: RENAMED "seeded with exactly one Recipe" → describes the WIRED Recipe's own
  unchanged path (no longer claims "exactly one" registry entry); ADDED requirement for the second
  registered Recipe + `RecipeSpaceNodes`'s widened, per-Recipe-optional shape.
- `generic-gate-driver`: ADDED requirements for `driveSelectedRunPoints` and `AssetResult.media`
  (`driveToNextGate` itself is unmodified — same header, no change to its own requirement text).
- `asset-store`: MODIFIED the Asset-shape requirement to add `asset_urls?`/`assetMediaUrls` alongside
  the existing `asset_url` (same header, body/scenarios updated).
- `production-spec`: MODIFIED "Compose and persist a Production Spec beside the Brief, segmented by
  Recipe" to describe the injectable `validator` (same header, body/scenario updated).

No change to `production-queue`, `report-surface`, or `post-attribution`: their existing requirements
already describe two-Recipe behavior generically (e.g. "Two Recipes of one Idea show as two distinct
lines" / "each show their own Post, never collapsed onto one row" / "the Post lands on exactly the
named Recipe's Asset") — this slice's new tests are additional, concrete PROOF of those existing
requirements against a real second registered Recipe, not a behavior change.

## Impact

- **New code:** `src/production-spec/news-carousel-contract.ts` (+`.test.ts`),
  `news-carousel-validate.ts` (+`.test.ts`), `fixtures/news-carousel-specs.ts`;
  `src/execution-protocol/fixtures/carousel-space-state.ts`;
  `src/space-driver/fixtures/fake-carousel-space.ts`; `src/commands/two-recipes.test.ts`;
  `src/space-driver/fixtures/live-captures-ai-news/` (pre-tidy capture + README).
- **Modified:** `src/recipe/registry.ts` (+`.test.ts`); `src/space-driver/driver.ts` (+`.test.ts`);
  `src/asset/asset.ts` (+`.test.ts`); `src/production-spec/validate.ts`, `compose.ts` (+`.test.ts`),
  `store.ts`; `src/execution-protocol/protocol.ts` (+`.test.ts`), `parse.test.ts`;
  `src/commands/queue.test.ts`; `.claude/agents/producer.md`.
- **Hermetic:** no live `spaces_*`/`creations_*` call anywhere in this slice — the carousel leg is
  exercised entirely through `FakeCarouselSpace` (THE Magnific fake for the second Space), the wired
  leg through the pre-existing `FakeSpace`; Copy composition uses `composeCopy`'s default deterministic
  drafter, never a live model.
- **Always-rules upheld:** generate-never-publish holds (the carousel driver renders/collects media, it
  never posts); public-metrics-only/relative-not-absolute are unaffected (no metrics code touched);
  explicit-attribution holds and is the whole point of the `two-recipes.test.ts` suite;
  ledger-as-source-of-truth holds — every new field (`asset_urls`) is read/written only through
  `AssetStore`.
