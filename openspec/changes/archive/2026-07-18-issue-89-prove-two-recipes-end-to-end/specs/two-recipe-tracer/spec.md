## ADDED Requirements

### Requirement: One accepted Idea, driven through both wired Recipes, yields two independent Assets with distinct Copy

The system SHALL prove, end-to-end against the Magnific fakes, that ONE accepted Idea whose chosen
Recipes are BOTH wired Recipes (`character-explainer-with-cast` and `news-carousel`) yields TWO
independent Assets — one per Recipe — each rendered via that Recipe's OWN Space (`FakeSpace` /
`FakeCarouselSpace`), each composing its OWN Copy via `composeCopy` under that Recipe's OWN `copyShape`
(180/1-3 emoji vs 2200/0-2 emoji). The two Assets' `asset_url`s SHALL differ and their composed
`copy.caption`s SHALL differ (never coincidentally equal), each staying within its own Recipe's
`maxChars` bound. `enqueueOnAccept` SHALL enqueue ONE job per chosen Recipe for the Idea — the second
Recipe's job is never dropped as a duplicate of the first.

#### Scenario: enqueueOnAccept enqueues one job per chosen Recipe, with the Recipe-appropriate first gate

- **GIVEN** one accepted Idea and the chosen-Recipe list `[character-explainer-with-cast,
  news-carousel]`
- **WHEN** `enqueueOnAccept` is called
- **THEN** the queue holds exactly TWO jobs for that Idea: the wired Recipe's job targets gate `"cast"`
  (its first declared gate) and the News Carousel job targets gate `null` (it declares zero gates)

#### Scenario: Driving both Recipes to completion yields two Assets with distinct media and distinct Copy

- **GIVEN** the wired Recipe's job driven through its Cast gate and the Operator's resumed render leg,
  and the News Carousel job driven through its sole gate-free leg
- **WHEN** both Assets are read from the ledger
- **THEN** both are `status: "produced"`, their `asset_url`s differ, and their composed `copy.caption`s
  differ — each within its OWN Recipe's `copyShape.maxChars`

### Requirement: A zero-gate Recipe's job runs straight through while a one-gate Recipe's job independently pauses, for the SAME Idea

The system SHALL prove a gate-count difference from the wired Recipe (zero gates, `news-carousel`) is
exercised END-TO-END alongside the wired Recipe's one-gate Cast path, for the SAME Idea, at the SAME
time: the News Carousel job's SOLE leg SHALL move `queued -> running -> done` without ever visiting
`awaiting_pick`, while the wired Recipe's Cast-gate leg SHALL move `queued -> running -> awaiting_pick`
and stay there until the Operator's pick resolves the next leg. The News Carousel job reaching `done`
SHALL NOT be blocked by, and SHALL NOT block, the wired Recipe's job for the SAME Idea (ADR-0008's
single-Space lock is released the instant a job pauses at its gate or finishes).

#### Scenario: The News Carousel job never visits awaiting_pick

- **GIVEN** the News Carousel job's sole leg driven to completion via `driveToNextGate`
- **WHEN** its queue-status transitions are inspected
- **THEN** they are exactly `queued -> running -> done` — `awaiting_pick` never appears

#### Scenario: The wired Recipe's Cast-gate job pauses while the carousel job for the SAME Idea has already finished

- **GIVEN** the News Carousel job already `done` and the wired Recipe's Cast-gate leg driven to a pause
- **WHEN** the queue state is inspected
- **THEN** the wired job's status is `awaiting_pick` (gate `"cast"`) and the carousel job's status is
  `done` (gate `null`/`"final"`) — the SAME Idea's two Recipes sit at genuinely different stages

### Requirement: /queue and /report show the Idea's two Assets at independent stages

The system SHALL prove `/queue` and `/report` each surface the SAME Idea's two Recipes' Assets at their
OWN, independently-tracked stage — never collapsed onto one row, never forced into lockstep.
`/queue`'s per-job line SHALL show each job's own `recipe`, `gate` cursor, and `status` independently.
`/report`'s Idea-level roll-up (`deriveIdeaRollup`) SHALL be the EARLIEST of the Idea's Assets' stages
(ADR-0011) — so an Idea with one Asset `in_production` and a sibling Asset already `produced` SHALL
report `in_production` at the Idea level, while the per-Recipe Posts section SHALL still show each
Asset's own, more advanced status once logged.

#### Scenario: /queue shows the wired job awaiting_pick and the carousel job done, on separate lines

- **GIVEN** the wired Recipe's Cast-gate job `awaiting_pick` and the News Carousel job `done`, both for
  the same `(brand, idea)`
- **WHEN** `/queue <brand>` is run
- **THEN** its output contains one line naming `character-explainer-with-cast` with `gate=cast` and
  `awaiting_pick`, and a SEPARATE line naming `news-carousel` with `gate=final` and `done`

#### Scenario: /report's Idea-level status is the EARLIEST of the two Assets' stages

- **GIVEN** the same Idea, with the wired Asset `in_production` (paused at Cast) and the carousel Asset
  already `produced`
- **WHEN** `/report <brand>` is run
- **THEN** the Idea's summary row shows status `in_production` (the earliest stage), not `produced`

### Requirement: /track-performance scores the Idea's two genuinely-driven Assets independently

The system SHALL prove `/track-performance` scores the two Assets of ONE Idea INDEPENDENTLY when those
Assets originated from an actual two-Recipe production (not merely a hand-seeded ledger fixture): each
Asset's `metrics`/`performance_score` SHALL be computed from its OWN `post_url`'s scraped data, relative
to the Brand's ONE Channel baseline, and written via `AssetStore.writeAsset` to THAT Asset alone — never
touching its sibling Recipe's Asset. When the two Posts' engagement genuinely differs, their
`performance_score`s SHALL differ (never coincidentally equal, never collapsed onto one number).

#### Scenario: Two genuinely different Posts' engagement yields two different Performance Scores

- **GIVEN** the wired Recipe's Asset and the News Carousel Asset, each logged with its own
  `facebook.com` Post URL, and a fake Apify port returning materially different engagement for each URL
- **WHEN** `/track-performance <brand>` is run once
- **THEN** the two Assets' `performance_score`s differ, the higher-engagement Post scores higher, and
  each Asset's `metrics` reflect ONLY its own scraped reading

#### Scenario: /report surfaces both logged Posts, keeping predicted Fit Score and measured Performance Score distinct

- **GIVEN** the same Idea with both Assets scored
- **WHEN** `/report <brand>` is run
- **THEN** its output lists both Assets' Post URLs in the Posts section and states the Fit-Score-is-
  predicted / Performance-Score-is-measured distinction explicitly
