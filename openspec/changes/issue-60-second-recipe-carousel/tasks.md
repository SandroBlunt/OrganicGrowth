## 1. Read the real Space; commit the pre-tidy capture (no live tools)

- [x] 1.1 Read the Operator-supplied sanitized `spaces_state`-shaped dump of the real "AI News" board
  (152 nodes, 103 connections, pre-tidy). Verify (no invention): `JSON Master #2` connects DIRECTLY to
  all seven `Image Prompt Slide N` extractors; each extractor's instructions read
  `return ONLY "image_prompt" from "slide_index": N`; extractors feed their own slide's image
  generator(s) directly; the writing guide (`Assistant Prompt #2`) implies no header fields beyond
  `slide_index`/`image_prompt`; no `Producer Protocol` node exists yet.
- [x] 1.2 Copy the dump into the repo as
  `src/space-driver/fixtures/live-captures-ai-news/00-spaces_state.pre-tidy.txt`, scanned for secrets
  (none), with a `README.md` explicitly marking the capture PARTIAL (pre-tidy board read only; the
  attended run/edit/creations captures are pending, added by the orchestrator + Operator AFTER this
  build).

## 2. The News Carousel Recipe's own Production-Spec contract + validator (test-first)

- [x] 2.1 Write failing tests (`news-carousel-contract.test.ts`): slide bounds (5-7), the physical
  pipeline count (7) cross-checked against `canonicalCarouselProtocol()`, `slideRunPointName`/
  `slideRunPointNames` (only the names for the slides PRESENT, sorted by `slide_index`, never beyond
  the Spec's own count).
- [x] 2.2 Implement `production-spec/news-carousel-contract.ts`: `MIN_SLIDES`/`MAX_SLIDES`/
  `TOTAL_SLIDE_PIPELINES`, `CarouselSlide`/`NewsCarouselSpec`, `slideRunPointName`/`slideRunPointNames`.
- [x] 2.3 Write failing tests (`news-carousel-validate.test.ts`) + fixtures
  (`fixtures/news-carousel-specs.ts`): a well-formed 5/6/7-slide Spec passes; not-an-object,
  missing/miscounted `slides`, a malformed slide, a duplicated/gapped `slide_index` each fail with a
  SPECIFIC code.
- [x] 2.4 Implement `production-spec/news-carousel-validate.ts`: `validateNewsCarouselSpec`, reusing
  `validate.ts`'s `ValidationResult`/`ValidationError` (widened `code: string` — see task 6).

## 3. The canonical carousel protocol + fake Space (test-first)

- [x] 3.1 Write failing tests (`protocol.test.ts`): `canonicalCarouselProtocol()` has SEVEN run-points
  named `Image Prompt Slide 1..7`, ALL gate `null`, all `downstream`, serializes comfortably under the
  read-API truncation budget.
- [x] 3.2 Implement `execution-protocol/protocol.ts`: `carouselSlideRunPointName`,
  `canonicalCarouselProtocol()`.
- [x] 3.3 Write failing tests (`parse.test.ts`): `parse()` resolves all seven gateless run-points
  against a fake carousel `spaces_state`.
- [x] 3.4 Implement `execution-protocol/fixtures/carousel-space-state.ts`: `fakeCarouselSpaceState()`
  with the canonical node names (`JSON Master`, `Image Prompt Slide 1..7`, `Slide 1..7 Generator`,
  `Carousel Prompt Guide`, `Brand Logo`, `Producer Protocol`), patterned on the pre-tidy dump.
- [x] 3.5 Implement `space-driver/fixtures/fake-carousel-space.ts`: `FakeCarouselSpace` (THE Magnific
  fake for this Space) — inject into `JSON Master`, a per-slide `run` that fires that slide's
  extractor+generator and produces exactly one image creation, fault injection (`injectNoOp`,
  `slideRunFails`).

## 4. driveSelectedRunPoints + AssetResult.media (test-first)

- [x] 4.1 Write failing tests (`driver.test.ts`): a single- and a multi-creation finish both resolve
  `AssetResult.media` (in order; `media[0]` === `{assetId, assetUrl}` for the single case — no
  behavior change to the wired path).
- [x] 4.2 Implement: widen `AssetResult` with `media: readonly Creation[]`; generalize the shared
  `finishLeg` to resolve EVERY produced creation via `fetchCast`, not just `creationIds[0]`.
- [x] 4.3 Write failing tests (`driver.test.ts`, against `FakeCarouselSpace`): drives only the
  run-points for the slides present (5-of-7 never touches slide 6/7); drives the full 5 and 7 bounds;
  `run_point_unresolved` on an unknown name stops immediately (nothing after it runs); a mid-list run
  failure stops the WHOLE leg immediately; zero names given fails cleanly; an unconfirmed inject fails
  before any run starts.
- [x] 4.4 Implement `driveSelectedRunPoints` in `space-driver/driver.ts` — built from the SAME
  `injectSpec`/`runRunPoint`/shared `finishLeg` primitives; `driveToNextGate` itself untouched. Widen
  the shared `spec` parameter type (`DriverSpecInput`) to accept a plain-interface Recipe Spec (e.g.
  `NewsCarouselSpec`) alongside the wired `ProductionSpec`/`Record<string, unknown>`.

## 5. Register the second Recipe (test-first)

- [x] 5.1 Write failing tests (`registry.test.ts`): the registry has TWO slugs; the News Carousel
  Recipe declares `gates: []`, a DIFFERENT Space id/name, no pinned-reference/cast/clip run-points, its
  seven slide run-point names from the SAME `canonicalCarouselProtocol()`, its OWN validator (reference
  equality) and copy-shape values (different from the wired Recipe's).
- [x] 5.2 Implement `recipe/registry.ts`: widen `RecipeSpaceNodes` (`pinnedReference`/`castRunPoint`/
  `clipRunPoint` optional; new `slideRunPoints?`); add the `NEWS_CAROUSEL` entry; register both in
  `REGISTRY`.

## 6. Asset schema: asset_urls for a multi-media Recipe (test-first)

- [x] 6.1 Write failing tests (`asset.test.ts`): `parseAssetUrls` (non-empty array of non-empty
  strings; empty/malformed → `null`); `parseAssetRecord` parses `asset_urls` without ever populating
  `asset_url` alongside it; `assetMediaUrls` returns the right list for each shape (and `[]` for
  neither).
- [x] 6.2 Implement `asset/asset.ts`: `LedgerAssetRecord.asset_urls?`, `parseAssetUrls`,
  `assetMediaUrls`; widen `production-spec/validate.ts`'s `ValidationError.code` to plain `string` (so
  `ValidationResult` is reusable by a different Recipe's validator).

## 7. composeSpec becomes Recipe-generic (test-first)

- [x] 7.1 Write failing tests (`compose.test.ts`): a carousel-shaped Spec is written when its OWN
  injected validator passes it (and the WIRED validator would have rejected the same file); refused
  when the injected validator rejects it (never silently falls back to the wired one); two Recipes of
  one Idea save to two different, non-overwriting paths.
- [x] 7.2 Implement `production-spec/compose.ts`: `ComposeOptions.validator?` (defaults to the wired
  `validate`); widen `saveSpec`/`generator` return type to accept a plain-interface Spec shape.

## 8. Prove it: one Idea, two Recipes, end-to-end against the fakes (test-first)

- [x] 8.1 Write `src/commands/two-recipes.test.ts`: drive the wired Recipe's Cast→pick→render legs
  against `FakeSpace`, and the carousel's single zero-gate leg against `FakeCarouselSpace`; compose
  each Recipe's OWN copy shape (default deterministic drafter); write both Assets.
- [x] 8.2 Assert: two Assets recorded, distinct media shape (`asset_url` vs `asset_urls`, never both on
  one Asset), DISTINCT composed copy (never coincidentally equal); independent `/log-post` attribution
  (each Asset carries only its own Post URL); `/report`'s roll-up + per-Recipe rows show independent
  stages when only one Recipe has posted; writing one Recipe's measured Performance never touches its
  sibling's Asset (the guarantee `/track-performance` depends on).
- [x] 8.3 Add a concrete two-Recipe `/queue` test (`commands/queue.test.ts`): the SAME Idea's two
  Recipes show as two lines with independent gate cursors (`gate=cast`/`awaiting_pick` vs
  `gate=final`/`done`).

## 9. Docs

- [x] 9.1 Update `.claude/agents/producer.md`: drop the stale "a second Recipe is future work (issue
  #60)" forward reference; state both wired Recipes up front; add a "News Carousel Recipe (zero gates)"
  section describing how to drive it (compose+validate against ITS OWN validator, inject, run only the
  present slides' run-points, compose Copy against ITS OWN copy-shape, save `asset_urls` — never
  `asset_url`). Keep every `producer-agent.docs-test.ts` pin green (no "not yet wired" language
  introduced; `ADR-0008`/`awaiting_pick`/absence of `awaiting_cast` all still present).

## 10. OpenSpec

- [x] 10.1 Author `proposal.md`, this `tasks.md`, and spec deltas: ADDED `news-carousel-recipe`;
  MODIFIED `recipe-registry` (RENAMED "seeded with exactly one Recipe" + ADDED the second-Recipe
  requirement), `generic-gate-driver` (ADDED `driveSelectedRunPoints` + `AssetResult.media`),
  `asset-store` (MODIFIED the Asset-shape requirement for `asset_urls`), `production-spec` (MODIFIED
  the compose-and-persist requirement for the injectable validator). No change to `production-queue`/
  `report-surface`/`post-attribution` — their existing requirements already describe two-Recipe
  behavior generically; this slice's tests are additional concrete proof, not a behavior change.
- [x] 10.2 `npx openspec validate issue-60-second-recipe-carousel --strict` green; dry-run header
  resolution against `openspec/specs/` for every MODIFIED/RENAMED header before finishing.

## 11. Self-review

- [x] 11.1 `npm test` green (type-check + full suite, 1053 baseline → 1112, only additions/faithful
  updates); `npm run test:docs` green (25/25, unchanged).
- [x] 11.2 Simplify/dead-code pass; confirm every issue #60 acceptance criterion maps to a named test;
  grep the full diff for `spaces_*`/`creations_*` MCP calls — none added (both legs drive their
  respective fakes only).
- [x] 11.3 Write the Build Report into `handoff.md`: per-criterion → test mapping, fakes flagged
  (`FakeSpace` reused unchanged, `FakeCarouselSpace` new), and the fixture-capture criterion explicitly
  marked PARTIAL (pre-tidy board read only; attended run/edit/creations captures pending).
