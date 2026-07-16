## ADDED Requirements

### Requirement: The News Carousel Recipe's Production Spec is an ordered 5-7 slide list, media instructions only

The system SHALL define a `NewsCarouselSpec` contract (`src/production-spec/news-carousel-contract.ts`)
distinct from the wired *Character Explainer with Cast* Recipe's contract: a top-level `slides` array of
`{ slide_index: number, image_prompt: string }` entries. `slides` SHALL have between `MIN_SLIDES` (5)
and `MAX_SLIDES` (7) entries — `MAX_SLIDES` SHALL equal `TOTAL_SLIDE_PIPELINES` (7), the physical count
of parallel slide pipelines wired on the "AI News" Space's canvas
(`execution-protocol/protocol.ts`'s `canonicalCarouselProtocol()`). `slide_index` values SHALL be exactly
`1..slides.length`, each exactly once (no gap, no duplicate). The Spec SHALL carry no `post_copy` field
(media instructions only — ADR-0012, mirroring the wired Recipe's own contract).

#### Scenario: A well-formed 5, 6, or 7-slide Spec validates ok

- **GIVEN** a Spec with 5 (or 6, or 7) slides, `slide_index` `1..N` each once, every `image_prompt`
  non-empty
- **WHEN** `validateNewsCarouselSpec` is called
- **THEN** it returns `ok: true` with no errors

#### Scenario: Fewer than 5 or more than 7 slides is rejected

- **GIVEN** a Spec with 4 slides (or 8 slides)
- **WHEN** `validateNewsCarouselSpec` is called
- **THEN** it returns `ok: false` with a `slides_count` error

#### Scenario: A duplicated or gapped slide_index is rejected

- **GIVEN** a 5-slide Spec whose `slide_index` values are `[1,2,3,4,4]` (duplicate, gap at 5) or
  `[1,2,3,4,6]` (gap at 5)
- **WHEN** `validateNewsCarouselSpec` is called
- **THEN** it returns `ok: false` with a `slide_index_invalid` error

#### Scenario: A slide missing its image_prompt is rejected

- **GIVEN** a Spec whose slides are otherwise well-formed but one entry has no `image_prompt`
- **WHEN** `validateNewsCarouselSpec` is called
- **THEN** it returns `ok: false` with a `slide_shape` error

### Requirement: Only the run-points for the slides present are ever driven, never the Space's full fixed set

`slideRunPointNames(spec)` (`src/production-spec/news-carousel-contract.ts`) SHALL resolve the ORDERED
run-point NAMES (`Image Prompt Slide 1`..`Image Prompt Slide N`) for exactly the slides a given Spec
carries, in ascending `slide_index` order, regardless of the Spec's own array order — NEVER a name
beyond the Spec's own slide count, even though the Space's canvas always wires all seven pipelines.

#### Scenario: A 5-slide Spec names exactly 5 run-points, never Slide 6 or 7

- **GIVEN** a valid 5-slide Spec
- **WHEN** `slideRunPointNames` is called
- **THEN** it returns exactly `["Image Prompt Slide 1", ..., "Image Prompt Slide 5"]`
- **AND** neither `"Image Prompt Slide 6"` nor `"Image Prompt Slide 7"` appears

#### Scenario: Names are sorted by slide_index regardless of the Spec's own array order

- **GIVEN** a valid Spec whose `slides` array is NOT in `slide_index` order
- **WHEN** `slideRunPointNames` is called
- **THEN** the returned names are in ascending `slide_index` order

### Requirement: The News Carousel Recipe declares zero gates, its own copy shape, and the "AI News" Space

The registry's `news-carousel` Recipe (`src/recipe/registry.ts`) SHALL declare `gates: []` — a
different gate COUNT than the wired Recipe's one — driving `specShape.validate` to
`validateNewsCarouselSpec` (reference equality, never a re-implementation) and `space` to the "AI News"
Space (id `a2402c48-b688-436b-8cb6-23a4aad7822e`, distinct from the wired Recipe's Space id). Its
`copyShape` SHALL be its OWN literal params — `maxChars: 2200`, `minEmojis: 0`, `maxEmojis: 2` —
deliberately different from the wired Recipe's `180`/`1`/`3` (an Instagram editorial caption reads
longer and favours fewer emoji than a Reel hook). `space.nodes.specInput` SHALL equal
`space-driver/driver.ts`'s `JSON_MASTER_NODE_NAME` (the SAME spec-injection convention the wired Space
uses); `space.nodes.slideRunPoints` SHALL be the seven names from
`execution-protocol/protocol.ts`'s `canonicalCarouselProtocol()`, never re-typed as independent string
literals; `space.nodes.pinnedReference`/`castRunPoint`/`clipRunPoint` SHALL be absent (this Recipe has
no pick to pin and no single cast/clip run-point — those are the wired Recipe's own vocabulary).

#### Scenario: The News Carousel Recipe's gates, Space, and validator are distinct from the wired Recipe's

- **GIVEN** `getRecipe("news-carousel")` and `getRecipe("character-explainer-with-cast")`
- **WHEN** their `gates`, `space.id`, and `specShape.validate` are compared
- **THEN** the carousel Recipe's `gates` is `[]` (the wired Recipe's is `["cast"]`)
- **AND** its `space.id` differs from the wired Recipe's
- **AND** its `specShape.validate` is `validateNewsCarouselSpec`, not the wired Recipe's `validate`

#### Scenario: The News Carousel Recipe's copy shape differs from the wired Recipe's

- **GIVEN** `getRecipe("news-carousel").copyShape`
- **WHEN** compared to `getRecipe("character-explainer-with-cast").copyShape`
- **THEN** `maxChars`/`minEmojis`/`maxEmojis` are `2200`/`0`/`2`, not `180`/`1`/`3`

### Requirement: The "AI News" Space's node shapes are sourced from a real, captured board dump — never invented

The News Carousel Recipe's canvas facts SHALL be patterned on a real, sanitized, read-only capture of
the live "AI News" board — never invented shapes — specifically the node names and the
`JSON Master` → `Image Prompt Slide N` → `Slide N Generator` wiring captured at
`src/space-driver/fixtures/live-captures-ai-news/00-spaces_state.pre-tidy.txt`. This capture is
READ-ONLY and PRE-TIDY (captured before the Operator's canonical
node-renaming pass) — it contains no live `spaces_run`/`spaces_edit`/`creations_*` capture. The
record/replay fixture set for this Space is therefore **PARTIALLY** complete: the pre-tidy board read is
committed; the attended run/edit/creations captures (mirroring the wired Space's own sanctioned capture,
issue #40) are deferred to an attended pass with the Operator, AFTER this slice's build.

#### Scenario: The pre-tidy capture is committed, read-only, and marked partial

- **GIVEN** `src/space-driver/fixtures/live-captures-ai-news/`
- **WHEN** its contents are inspected
- **THEN** `00-spaces_state.pre-tidy.txt` (the sanitized board dump) and a `README.md` are present
- **AND** the README explicitly states the capture is partial — no live run/edit/creations fixtures are
  included yet

#### Scenario: The fake Space's node names match the real board's canonical (post-tidy) naming

- **GIVEN** the Operator's canonical node names (`JSON Master`, `Image Prompt Slide N`, `Slide N
  Generator`, `Carousel Prompt Guide`, `Brand Logo`)
- **WHEN** `fakeCarouselSpaceState()` is inspected
- **THEN** every one of those names is present, and `JSON Master` is the Spec-injection node (matching
  the real board's `JSON Master #2` → per-slide extractor wiring)
