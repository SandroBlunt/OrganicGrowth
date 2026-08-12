## Why

The News Carousel's on-card text has always been a minority of the frame (~25-30%, regardless of role) —
too little to read as the carousel's own visual lead — and the Straw Motion logo has appeared on every
one of the 7 slides, diluting the two slides (hook, cta) where branding actually matters. Separately,
idea-05 (2026-W32) proved by hand — a one-off Operator production note — that fetching a real photo from
a story's own source and compositing it into a slide reads as far more credible than a fully generated
equivalent; idea-06 proved the same for video, but its generated background around the video window was
too busy, competing with the video for attention. `docs/adr/0024` (captured 2026-08-12, ahead of this
ticket) formalizes both: fetching real source media becomes the News Carousel Recipe's STANDING rule
(never a one-off note again), and the fallback when a source is unreachable or too low quality is to
render a fully generated slide immediately — never a pause asking the Operator to drop media into the
chat.

## What Changes

- **Text-card minimum vertical space (landed FIRST, per the issue's own build-order note — everything
  else is measured against it).** `news-carousel-contract.ts` gains `CAROUSEL_HERO_ROLES` (`["hook",
  "cta"]`), `CAROUSEL_HERO_TEXT_CARD_MIN_PCT` (60), and `CAROUSEL_STANDARD_TEXT_CARD_MIN_PCT` (50). The
  author-phase checklist gains a new `text-card-size` mechanical item: a hero slide's `image_prompt` must
  state the Baseline Prompt's own 60%-floor clause verbatim; every other slide must state its 50%-floor
  clause verbatim. Straw Motion's real Baseline Prompt document (`unhypped-news` and `unhypped-daily`,
  identical shared content) is rewritten accordingly — its old ~25-30%/~30% card-region language is
  replaced by the new floors, with an explicit note that the (unedited, historical) Examples section is a
  PLACEMENT reference only, never a SIZE reference, from this point on.
- **Logo scoped to the hook and cta slides only.** The Straw Motion logo now appears ONLY on `slide_index`
  0 (hook, unchanged ~⅓ frame width) and `slide_index` 6 (cta, unchanged ~⅙ frame width) — removed
  entirely (not merely shrunk) from the 5 middle slides. The author-phase checklist's `logo-reference`
  item becomes role-aware: a hero slide must reference the logo (name or phrase) plus its negative
  guardrail and the two logo-render clauses (a new `heroLogoClauses` baseline field, split out of the
  now-uniform `fixedClauses`); every other slide must reference the logo NOWHERE at all. The Baseline
  Prompt document's Logo/Logo-guardrail bullets and reusable template are rewritten to match; the
  "Unhypped News" pill (a separate element) keeps its own existing scale behavior, untouched.
- **A per-slide `kind`: `generated` / `image` / `video` (ADR-0024).** `CarouselSlide` gains OPTIONAL
  `kind`/`source_url` fields — optional and backward compatible (`news-carousel-contract.ts`'s
  `slideKind` treats an absent `kind` as `"generated"`, exactly like every pre-#188 Spec on disk).
  `validateNewsCarouselSpec` gains two new codes (`slide_kind_invalid`, `slide_source_url_invalid`): a
  present `kind` must be one of the three values, and `source_url` is required + must look like an
  http(s) URL exactly when the effective kind is `image`/`video`. The author-phase checklist gains
  `slide-kind-source` (surfaces those two codes granularly) and `real-media-composited` (an image-kind
  slide's `image_prompt` must reserve a frame for the real photo; a video-kind slide's must reserve a
  window for the real video AND keep the generated background calmer/less busy than a fully generated
  slide — idea-06's background is the "too busy" reference point this replaces). The Baseline Prompt
  document gains a new "Real source media" bullet plus matching reusable-template brackets.
- **A new fetch-first, fallback-to-generated deep module** (`src/asset/carousel-real-media.ts`), mirroring
  `src/asset/shot-list-media.ts`'s own injectable-downloader precedent: `resolveCarouselSlideMedia`
  attempts `download(source_url)` for an image/video-kind slide (skipping entirely — never calling
  `download` — for a generated-kind slide); on a reachable, adequate response (a byte-size floor plus a
  content-type-family check standing in for "quality") it writes the file to disk and resolves the
  requested kind; on anything else (unreachable, too small, wrong content-type family, thrown error, or
  no `source_url` at all) it resolves `"generated"` with a named fallback reason — **never a pause for the
  Operator, either way**. `applyCarouselMediaResolutions` folds a batch of resolutions back into a
  candidate Spec so the SAVED Spec's `kind` fields are already the RESOLVED, post-fallback truth.
- **Schedule Batch excludes a video-slide carousel Asset, the same mechanism as any other video Asset.**
  `LedgerAssetRecord` gains an optional `has_video_slide` boolean (Recipe-local, mirroring `cast`/
  `character`), parsed defensively (kept only when `true`, mirroring `scheduled_at`'s own "never
  fabricated" contract) and set from `news-carousel-contract.ts`'s new `hasVideoSlide(spec)` helper at
  save time. `src/schedule-batch/eligibility.ts`'s `selectEligibleAssets` gains one more `"video"`-reasoned
  skip check — a news-carousel Asset carrying `has_video_slide: true` is skipped with the SAME reason and
  note shape as a non-news-carousel (Reel) Asset already gets, before any status/scheduled_at check runs.
- **`produce-news-carousel` SKILL.md updated** to author `kind`/`source_url` per slide (only when the
  brief identifies a SPECIFIC real source, mirroring the Shot List's own "specific media URL when
  identifiable" bar), decide the logo/text-card-size brackets per role, and run
  `resolveCarouselMedia`/`applyCarouselMediaResolutions` just before saving so the emitted Spec already
  carries the resolved kind.

## Non-Goals (explicitly out of scope for this slice)

- Actually compositing a fetched photo/video INTO a rendered slide image (pixel-level image/video
  processing) is not built here — this slice authors the Production Spec's reserved-frame/window
  instructions as data the Space/Producer acts on and fetches+validates the real source bytes; the Space
  itself (out of the developer's tools, per the always-rules) is what would eventually render the
  composite. `resolveCarouselSlideMedia` proves the fetch-first-fallback DECISION and downloads the real
  bytes to disk; wiring that into an actual driven render is a live-Space concern, deferred.
- Driving the real "Carrousel" Space end-to-end with a video-kind slide is not proven here — the existing
  `carousel-end-to-end.test.ts` fake (`FakeCarouselSpace`) is unchanged; this slice's new module is tested
  standalone against local fake downloaders, never against a live or fake Space.
- ADR-0025 (per-Recipe Copy platform lists) and ADR-0026 (LinkedIn mention aid) are untouched — separate
  issues (#183/#186).

## Capabilities

### Added Capabilities

- `carousel-real-media`: the News Carousel Recipe's own fetch-first-fallback-to-generated real-media
  resolution deep module (ADR-0024).

### Modified Capabilities

- `production-spec`: the News Carousel Spec contract/validator gain `kind`/`source_url`; the author-phase
  checklist gains `text-card-size`, `slide-kind-source`, `real-media-composited`, and reworks
  `logo-reference` to be hero-role-aware; `verifyBaselineParamsAgainstDocument` gains the four new
  parameterized clauses.
- `recipe-registry`: the News Carousel Recipe's `author` phase Phase Contract prose checklist grows from
  8 to 10 items (9 mechanical + 1 agent-judged) and its `save` phase gains a mechanical item for
  `has_video_slide`.
- `schedule-batch-export`: eligibility gains the `has_video_slide` skip check.
- `asset-store`: `LedgerAssetRecord` gains the optional `has_video_slide` field, parsed defensively.
- `producer-skill`: `produce-news-carousel`'s SKILL.md documents the new per-slide `kind` decision, the
  hero-only logo scoping, the role-dependent text-card-size clause, and the real-media fetch step.

## Impact

- **New code:** `src/asset/carousel-real-media.ts` (+ `.test.ts`).
- **Modified code:** `src/production-spec/news-carousel-contract.ts` (+`.test.ts`), `-validate.ts`
  (+`.test.ts`), `-author-checklist.ts` (+`.test.ts`); `src/production-spec/fixtures/news-carousel-
  specs.ts`, `-author-checklist-specs.ts`, `-straw-motion-specs.ts`; `src/production-spec/news-carousel-
  straw-motion-fixture.test.ts`; `src/recipe/registry.ts` (+`.test.ts`); `src/asset/asset.ts`
  (+`.test.ts`); `src/schedule-batch/eligibility.ts` (+`.test.ts`); `.claude/skills/produce-news-
  carousel/SKILL.md` (+`produce-news-carousel-skill.docs-test.ts`); both Straw Motion News Carousel
  Baseline Prompt documents (`unhypped-news`, `unhypped-daily`).
- **Hermetic, no live Space anywhere.** The new fetch module's own tests inject a LOCAL FAKE downloader —
  never the real `fetch`/network. The existing `FakeCarouselSpace` (the Magnific fake) is untouched and
  not exercised by any of this slice's new tests; no `spaces_*`/`creations_*` call is made anywhere.
- **Always-rules upheld:** generate-never-publish (this slice only authors Spec data and fetches/keeps
  real source bytes on disk — nothing is ever posted); public-metrics-only/relative-not-absolute (no
  metrics code touched); explicit-attribution (`/log-post` untouched); ledger-as-source-of-truth
  (`has_video_slide` is written to the ledger like every other Asset field, and Schedule Batch reads it
  from there, never re-derived ad hoc).
