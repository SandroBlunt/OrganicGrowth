# carousel-real-media Specification

## Purpose
TBD - created by archiving change issue-188-news-carousel-real-media. Update Purpose after archive.
## Requirements
### Requirement: resolveCarouselSlideMedia fetches a slide's real source media first, falling back to generated — never pausing for the Operator (ADR-0024, issue #188)

`resolveCarouselSlideMedia(slide, destDir, options)` (`src/asset/carousel-real-media.ts`) SHALL, for a
slide whose effective `kind` is `"image"` or `"video"`, attempt `options.download(slide.source_url)`
(defaulting to `defaultCarouselMediaDownload`, a real `fetch`-based implementation never exercised by
this module's own tests) and resolve to EXACTLY ONE of two outcomes: `"fetched"` (the response was
reachable AND met the quality bar below — the bytes are written to `destDir`, created if absent, and the
resolution's `resolvedKind` equals the requested kind) or `"fallback"` (any other case — the resolution's
`resolvedKind` is `"generated"`, and NOTHING is written to disk). The function SHALL return `null`
immediately, WITHOUT ever calling `download`, for a slide whose effective `kind` is `"generated"`
(`news-carousel-contract.ts`'s `slideKind` — including a slide carrying no `kind` field at all). The
function SHALL NEVER throw, and SHALL NEVER pause for Operator input in either branch — the whole
decision is one non-interactive `await`.

A "fallback" outcome's `reason` SHALL be `"unreachable"` when `download` returns `{ ok: false }`, throws,
or the slide's `source_url` is missing/blank (in which case `download` is never called at all), and
`"low_quality"` when the fetch succeeded but the response failed the quality bar.

#### Scenario: A generated-kind slide (or one with no kind at all) never calls download

- **GIVEN** a slide with `kind: "generated"`, and separately a slide with no `kind` field at all
- **WHEN** `resolveCarouselSlideMedia` is called with each
- **THEN** both return `null`, and the injected `download` function was never called

#### Scenario: A reachable, adequate image source is fetched and written to disk

- **GIVEN** an image-kind slide with a well-formed `source_url`, and a `download` that returns
  `{ ok: true, bytes, contentType: "image/jpeg" }` with at least `MIN_IMAGE_BYTES` bytes
- **WHEN** `resolveCarouselSlideMedia` is called
- **THEN** it returns `{ resolvedKind: "image", outcome: { kind: "fetched", path, filename } }`, and the
  bytes are readable back from `path`

#### Scenario: A reachable, adequate video source is fetched and written to disk

- **GIVEN** a video-kind slide with a well-formed `source_url`, and a `download` that returns
  `{ ok: true, bytes, contentType: "video/mp4" }` with at least `MIN_VIDEO_BYTES` bytes
- **WHEN** `resolveCarouselSlideMedia` is called
- **THEN** it returns `{ resolvedKind: "video", outcome: { kind: "fetched", path, filename } }`

#### Scenario: An unreachable source (ok:false, or a thrown error) falls back to generated, naming the reason

- **GIVEN** an image-kind slide whose `download` returns `{ ok: false, error: "404 Not Found" }`, and
  separately one whose `download` throws
- **WHEN** `resolveCarouselSlideMedia` is called with each
- **THEN** both return `{ resolvedKind: "generated", outcome: { kind: "fallback", reason: "unreachable",
  error } }`, and NEITHER call writes a file to `destDir`

#### Scenario: A reachable but too-small, or wrong-content-type-family, response falls back with reason low_quality

- **GIVEN** an image-kind slide whose `download` returns fewer than `MIN_IMAGE_BYTES` bytes, and
  separately one whose response's `contentType` family does not match the slide's own kind (e.g.
  `text/html` for an image-kind slide)
- **WHEN** `resolveCarouselSlideMedia` is called with each
- **THEN** both return `{ resolvedKind: "generated", outcome: { kind: "fallback", reason: "low_quality" }
  }`, and neither writes a file to disk

#### Scenario: A slide typed image/video but carrying no source_url falls back, unreachable, without ever calling download

- **GIVEN** a slide with `kind: "image"` and no `source_url` field
- **WHEN** `resolveCarouselSlideMedia` is called
- **THEN** it returns `{ resolvedKind: "generated", outcome: { kind: "fallback", reason: "unreachable" }
  }`, and the injected `download` function was never called

### Requirement: resolveCarouselMedia resolves every image/video slide of a Spec, sequentially, contributing nothing for a generated slide

`resolveCarouselMedia(spec, destDir, options)` SHALL call `resolveCarouselSlideMedia` for every slide of
`spec.slides`, IN SLIDE ORDER, sequentially (never in parallel), and return one `CarouselMediaResolution`
per slide whose effective `kind` was `"image"`/`"video"` — a `"generated"`-kind slide (or one with no
`kind`) contributes NOTHING to the returned array. The function SHALL NEVER throw, regardless of the mix
of outcomes across the Spec's 7 slides.

#### Scenario: A generated-only Spec resolves to an empty array

- **GIVEN** a Spec whose every slide is `"generated"`-kind (or carries no `kind` at all)
- **WHEN** `resolveCarouselMedia` is called
- **THEN** it returns `[]`

#### Scenario: A mixed Spec returns one entry per attempted slide, in slide order

- **GIVEN** a 5-slide Spec mixing generated, image-kind, and video-kind slides in slide-index order
- **WHEN** `resolveCarouselMedia` is called with a `download` that always succeeds
- **THEN** the returned array has one entry per image/video-kind slide, in the SAME slide-index order,
  each carrying its own `resolvedKind`

#### Scenario: Never throws across a mix of every outcome

- **GIVEN** a Spec whose image-kind slides' source URLs are engineered to trigger, one each, a
  successful fetch, a thrown download error, a too-small response, and an unreachable (`ok: false`)
  response
- **WHEN** `resolveCarouselMedia` is called
- **THEN** it resolves without throwing, and the returned array's `outcome.kind` values are
  `["fetched", "fallback", "fallback", "fallback"]` in that same slide order

### Requirement: applyCarouselMediaResolutions bakes the RESOLVED, post-fallback kind back into the Spec

`applyCarouselMediaResolutions(spec, resolutions)` SHALL return a NEW Spec (pure — never mutates `spec`)
whose every slide is: (a) left EXACTLY as authored (`kind`/`source_url` unchanged) when its resolution's
`outcome.kind` is `"fetched"`; (b) demoted to `kind: "generated"` with `source_url` dropped ENTIRELY
(never a stray leftover) when its resolution's `outcome.kind` is `"fallback"`; (c) left untouched when no
resolution matches its `slide_index` (i.e. it was already `"generated"`). Because the returned Spec's
`kind` fields are therefore the RESOLVED, post-fallback truth, `news-carousel-contract.ts`'s
`hasVideoSlide`, called on the returned Spec, reads the Asset's ACTUAL rendered shape — never an
unresolved authoring intent.

#### Scenario: A successfully-fetched slide is left exactly as authored

- **GIVEN** a Spec whose one `kind: "image"` slide's resolution is `"fetched"`
- **WHEN** `applyCarouselMediaResolutions` is called
- **THEN** that slide's `kind` and `source_url` in the returned Spec are unchanged from the input

#### Scenario: A fallen-back slide is demoted to generated, with source_url dropped

- **GIVEN** a Spec whose one `kind: "video"` slide's resolution is `"fallback"`
- **WHEN** `applyCarouselMediaResolutions` is called
- **THEN** that slide's `kind` in the returned Spec is `"generated"`, and it carries no `source_url` key
  at all

#### Scenario: hasVideoSlide reads the resolved, post-fallback shape — never the authored request

- **GIVEN** a Spec whose one slide was AUTHORED as `kind: "video"`
- **WHEN** its resolution is `"fallback"` and `applyCarouselMediaResolutions` + `hasVideoSlide` are
  called, and SEPARATELY when its resolution is `"fetched"` (successful) and the same two functions are
  called
- **THEN** the fallback case's `hasVideoSlide` is `false`; the fetched case's is `true`

