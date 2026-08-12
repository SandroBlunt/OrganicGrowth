## 1. Text-card minimum vertical space (landed FIRST — everything else measured against it)

- [x] 1.1 Add `CAROUSEL_HERO_ROLES`, `isCarouselHeroRole`, `CAROUSEL_HERO_TEXT_CARD_MIN_PCT` (60),
  `CAROUSEL_STANDARD_TEXT_CARD_MIN_PCT` (50) to `news-carousel-contract.ts`.
- [x] 1.2 Write failing tests + implement `NewsCarouselBaselineParams`' `heroTextCardMinPctClause`/
  `standardTextCardMinPctClause` fields and the checklist's new `text-card-size` mechanical item
  (`news-carousel-author-checklist.ts`, `.test.ts`).
- [x] 1.3 Rewrite Straw Motion's real Baseline Prompt document (`unhypped-news/news-carousel.md`, then
  patch the identical shared content into `unhypped-daily/news-carousel.md`): a new "Card size" bullet
  stating the 60%/50% floors, the reusable template's `[CARD SIZE]` bracket, and a note that the
  (unedited) Examples section is a placement reference only, never a size reference from here on.
  `news-carousel-straw-motion-fixture.test.ts` proves the real document's strings match
  `STRAW_MOTION_BASELINE` verbatim.

## 2. Logo scoped to hook/cta only (measured against the FINAL card size from step 1)

- [x] 2.1 Write failing tests + rework the checklist's `logo-reference` item to be hero-role-aware: a
  hero slide (hook/cta) must reference the logo + guardrail + the new `heroLogoClauses`; every other
  slide must reference the logo NOWHERE. Split `fixedClauses` (now uniform, every slide) from the new
  `heroLogoClauses` (hero-only) in `NewsCarouselBaselineParams`; extend
  `verifyBaselineParamsAgainstDocument` to check both.
- [x] 2.2 Update `news-carousel-straw-motion-specs.ts`'s `buildImagePrompt`/`logoClause` to call the logo
  clause ONLY for hero roles, differentiating the hook's ~⅓ scale from the cta's ~⅙ scale (both
  unchanged values, now both actually implemented per-role instead of the earlier always-~⅓
  simplification).
- [x] 2.3 Rewrite the Baseline Prompt document's Logo/Logo-guardrail bullets + reusable template's
  `[LOGO CLAUSE]` bracket to be hook/cta-only, omitted entirely on the 5 middle slides; the "Unhypped
  News" pill bullet's own wording is lightly reworded (no behavior change — it still appears on every
  slide, scaled by role) since it used to reference "matching the logo above".

## 3. Per-slide kind: generated / image / video (ADR-0024)

- [x] 3.1 Write failing tests + add optional `kind`/`source_url` to `CarouselSlide`
  (`news-carousel-contract.ts`), `CAROUSEL_SLIDE_KINDS`, `slideKind`, `hasVideoSlide`. Backward
  compatible: a Spec with no `kind` field parses/validates exactly as before.
- [x] 3.2 Write failing tests + add `slide_kind_invalid`/`slide_source_url_invalid` validation codes to
  `news-carousel-validate.ts` (`slideKindError`, mirroring `news-short-script-validate.ts`'s own
  `looksLikeUrl`).
- [x] 3.3 Write failing tests + add the checklist's `slide-kind-source` (structural) and
  `real-media-composited` (image reserves a frame / video reserves a window + calmer background) items,
  plus `realImageFrameClause`/`realVideoWindowClause` to `NewsCarouselBaselineParams`.
- [x] 3.4 Add a "Real source media" bullet + matching `[REAL MEDIA CLAUSE]` template bracket to the
  Baseline Prompt document, naming idea-06's background as the "too busy" reference point the calmer
  video-background clause replaces.

## 4. The fetch-first, fallback-to-generated deep module

- [x] 4.1 Write failing tests (`carousel-real-media.test.ts`, a LOCAL FAKE downloader throughout — never
  the real network) for `resolveCarouselSlideMedia`: a generated-kind slide resolves `null` without
  calling `download`; a reachable+adequate image/video source fetches, writes to disk, and resolves the
  requested kind; an unreachable source (ok:false or a thrown error) falls back `"unreachable"`; a
  too-small or wrong-content-type-family response falls back `"low_quality"`; a slide with no
  `source_url` falls back `"unreachable"` without ever calling `download`.
- [x] 4.2 Implement `src/asset/carousel-real-media.ts`: `resolveCarouselSlideMedia`,
  `resolveCarouselMedia` (sequential, one entry per attempted slide), `applyCarouselMediaResolutions`
  (bakes the resolved kind back into a candidate Spec), `defaultCarouselMediaDownload`, `MIN_IMAGE_BYTES`/
  `MIN_VIDEO_BYTES`.
- [x] 4.3 Write a failing test + prove `applyCarouselMediaResolutions` + `hasVideoSlide` together: a
  requested video slide that falls back reads `hasVideoSlide() === false`; one that succeeds reads
  `true` — the ledger/Schedule Batch fact tracks the ACTUAL rendered shape, never the authoring intent.

## 5. Schedule Batch excludes a video-slide carousel Asset

- [x] 5.1 Write a failing test + add optional `has_video_slide` to `LedgerAssetRecord`
  (`src/asset/asset.ts`), parsed defensively in `parseAssetRecord` (kept only when `=== true`, mirroring
  `scheduled_at`'s "never fabricated" contract — never a stray `false` key).
- [x] 5.2 Write a failing test + add the `has_video_slide` skip check to
  `src/schedule-batch/eligibility.ts`'s `selectEligibleAssets`, the SAME `"video"` reason/note shape a
  non-news-carousel Asset already gets.
- [x] 5.3 Document the new `save`-phase mechanical checklist item in `recipe/registry.ts`'s
  `NEWS_CAROUSEL_PHASES` (references `hasVideoSlide`).

## 6. Registry + Skill + full-suite green

- [x] 6.1 Update `recipe/registry.ts`'s `NEWS_CAROUSEL_PHASES` author-phase checklist prose (10 items: 9
  mechanical + 1 agent-judged) and its own doc comment counts; update `registry.test.ts`'s item-count
  assertion.
- [x] 6.2 Update `.claude/skills/produce-news-carousel/SKILL.md`: the per-slide `kind` decision (only
  when the brief identifies a specific real source), the hero-only logo/role-dependent card-size
  brackets, the real-media clause bracket, running `resolveCarouselMedia`/
  `applyCarouselMediaResolutions` before saving, and the updated Author-phase checklist bullet list. Add
  matching assertions to `produce-news-carousel-skill.docs-test.ts`.
- [x] 6.3 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --strict` for this change; all green (one known, pre-existing, unrelated failure in
  `src/format/store.test.ts` noted, not caused by this change).
- [x] 6.4 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #188
  acceptance criterion maps to a specific test.
- [x] 6.5 Write the Build Report into `handoff.md`.
