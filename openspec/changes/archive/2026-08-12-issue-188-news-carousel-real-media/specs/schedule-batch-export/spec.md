## MODIFIED Requirements

### Requirement: Only produced, not-yet-posted, not-yet-scheduled news-carousel Assets are eligible

`selectEligibleAssets` (`src/schedule-batch/eligibility.ts`) SHALL include an Asset in a Schedule Batch
export if and only if its `recipe` is `"news-carousel"`, it does NOT carry `has_video_slide: true`
(ADR-0024, issue #188), its `status` is `"produced"`, and it carries no `scheduled_at` yet. A
non-`"news-carousel"` Asset (e.g. the wired *Character Explainer with Cast* Reel) SHALL be excluded
with a `"video"`-reasoned note naming the Idea and the Recipe — Zoho's bulk scheduler CSV path is
images-only. A `"news-carousel"` Asset that DOES carry `has_video_slide: true` (a real video composited
into one of its 7 slides) SHALL ALSO be excluded with a `"video"`-reasoned note — the SAME reason and
skip mechanism as a non-`"news-carousel"` Asset, checked before any status/scheduled_at check runs. An
Asset whose `status` is not `"produced"` (still `queued`/`in_production`, or already
`posted`/`tracking`/`scored`) SHALL be excluded with a `"not-produced"`-reasoned note. An Asset that
already carries `scheduled_at` SHALL be excluded with an `"already-scheduled"`-reasoned note — this is
what makes re-running the export after a successful one schedule nothing twice. Each Asset of an Idea
SHALL be judged independently.

#### Scenario: A produced, un-posted, un-scheduled news-carousel Asset is eligible

- **GIVEN** an Idea with one Asset: `recipe: "news-carousel"`, `status: "produced"`, no `scheduled_at`
- **WHEN** `selectEligibleAssets` is called
- **THEN** that Asset appears in `eligible`, and `skipped` is empty

#### Scenario: A non-news-carousel (video) Asset is skipped with a note naming the Idea and Recipe

- **GIVEN** an Idea with one Asset: `recipe: "character-explainer-with-cast"`, `status: "produced"`
- **WHEN** `selectEligibleAssets` is called
- **THEN** that Asset appears in `skipped` with `reason: "video"`
- **AND** its note names both the Idea id and the Recipe slug

#### Scenario: A news-carousel Asset carrying a video slide is skipped with reason "video", the SAME mechanism as any other video Asset (ADR-0024, issue #188)

- **GIVEN** an Idea with one Asset: `recipe: "news-carousel"`, `status: "produced"`, no `scheduled_at`,
  `has_video_slide: true`
- **WHEN** `selectEligibleAssets` is called
- **THEN** that Asset appears in `skipped` with `reason: "video"`, `recipe: "news-carousel"`, and its
  note names the Idea id and mentions the video slide

#### Scenario: A news-carousel Asset with has_video_slide false or absent is judged as normal, not skipped for that reason (issue #188)

- **GIVEN** an Idea with two produced, un-scheduled `"news-carousel"` Assets — one carrying
  `has_video_slide: false`, one carrying no `has_video_slide` field at all
- **WHEN** `selectEligibleAssets` is called
- **THEN** both Assets appear in `eligible`, and `skipped` is empty

#### Scenario: An already-scheduled Asset is skipped, making a re-run schedule nothing twice

- **GIVEN** an Idea with one `news-carousel` Asset at `status: "produced"` carrying `scheduled_at`
- **WHEN** `selectEligibleAssets` is called
- **THEN** that Asset appears in `skipped` with `reason: "already-scheduled"`, not in `eligible`

#### Scenario: An empty run (no Ideas at all) yields an empty eligibility result

- **GIVEN** no Ideas
- **WHEN** `selectEligibleAssets` is called
- **THEN** both `eligible` and `skipped` are empty
