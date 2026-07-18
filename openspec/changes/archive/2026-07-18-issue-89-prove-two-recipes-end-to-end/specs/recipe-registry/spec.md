## MODIFIED Requirements

### Requirement: The registry is seeded with a second Recipe: News Carousel, zero gates

The registry SHALL seed a second Recipe — **"News Carousel"** (`slug: "news-carousel"`) — proving the
registry's per-Recipe shapes generalize to a genuinely different production plan: its `gates` SHALL be
`[]` (a zero-gate Recipe renders unattended end-to-end); its `space` SHALL target the single-lane
"Carrousel" Space, whose `nodes.clipRunPoint` SHALL be read from `execution-protocol/protocol.ts`'s
`canonicalCarouselProtocol()` (its sole, gateless run-point) and whose `nodes.pinnedReference`/
`castRunPoint` SHALL be absent (it has no pick-gate to pin or render a paused Cast for); its
`specShape.validate`/`scanBannedWords` SHALL be the SAME functions (reference equality) as
`production-spec/news-carousel-validate.ts`'s `validateNewsCarouselSpec` and
`production-spec/news-carousel-brand-safety.ts`'s `scanNewsCarouselForBannedWords`; its `copyShape`
SHALL be `{ maxChars: 2200, minEmojis: 0, maxEmojis: 2 }` — DIFFERENT from the Character Explainer with
Cast Recipe's `180`/`1`/`3`; its `canvasInputs` SHALL declare exactly one `brand-asset` media slot named
`"Brand_Logo"` (image, required, `brandAssetKey: "brand-logo"`) whose `promptNode` equals its sole
run-point's name; and its `phases` SHALL declare all six phases in order, with its `author` phase's
checklist carrying exactly 8 items (7 mechanical, 1 agent-judged — the "grounded subject" item), its
`gate` phase's checklist EMPTY (it declares zero gates), and its `copy` phase's checklist carrying
exactly one mechanical item referencing `copy/validate.ts`'s `validateCopy` under this Recipe's own
`copyShape`.

`"Brand_Logo"` and `"JSON Master"` (the run-point/prompt-node name below) are the REAL canvas node
names, verified against the live "Carrousel" Space capture (issue #86,
`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`). The earlier
placeholders (`"Brand Logo"`, `"Slides Prompts"`) named no real canvas node at all; the Operator chose
(2026-07-18, recorded in the capture's own README) to align the BUILD to the canvas rather than rename
the canvas (issue #89). A brand-asset media slot has no separate `pinnedReference`-style field (unlike
an idea-pick slot) — its map key IS its physical canvas node, mirroring how `promptNode` already works.
This is a DIFFERENT node, on a DIFFERENT Space, than the wired *Character Explainer with Cast* Recipe's
own `"JSON Master"` node — the two share only a name, never a canvas.

#### Scenario: The News Carousel Recipe declares zero gates

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `gates` is inspected
- **THEN** it is `[]` — a gate count different from the Character Explainer with Cast Recipe's `["cast"]`

#### Scenario: The News Carousel Recipe targets the single-lane Carrousel Space with no pick-gate nodes

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `space` is inspected
- **THEN** `space.name` is `"Carrousel"`, `space.id` differs from the Character Explainer with Cast
  Recipe's Space id
- **AND** `space.nodes.pinnedReference` and `space.nodes.castRunPoint` are both absent (`undefined`)

#### Scenario: The News Carousel Recipe's run-point comes from its own canonical protocol

- **GIVEN** the seeded `news-carousel` Recipe and `execution-protocol/protocol.ts`'s
  `canonicalCarouselProtocol()`
- **WHEN** the Recipe's `space.nodes.clipRunPoint` is compared to the protocol's sole run-point's
  `start` name
- **THEN** they are equal (`"JSON Master"`) — the REAL, captured node name (issue #86/#89)

#### Scenario: The News Carousel Recipe's spec-shape is its own validator and scanner, not a re-implementation

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `specShape.validate` and `specShape.scanBannedWords` are compared to
  `news-carousel-validate.ts`'s `validateNewsCarouselSpec` and `news-carousel-brand-safety.ts`'s
  `scanNewsCarouselForBannedWords`
- **THEN** they are the SAME functions (`===`) respectively

#### Scenario: The News Carousel Recipe's copy-shape differs from the wired Recipe's

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `copyShape` is compared to the Character Explainer with Cast Recipe's `copyShape`
- **THEN** News Carousel's is `{ maxChars: 2200, minEmojis: 0, maxEmojis: 2 }`, different from the
  other Recipe's `{ maxChars: 180, minEmojis: 1, maxEmojis: 3 }`

#### Scenario: The News Carousel Recipe's canvasInputs describe its Brand_Logo slot and its sole prompt node

- **GIVEN** the seeded `news-carousel` Recipe
- **WHEN** its `canvasInputs` is inspected
- **THEN** `mediaSlots["Brand_Logo"]` is `{ kind: "brand-asset", media: "image", required: true,
  brandAssetKey: "brand-logo" }` — the map key IS the real, captured canvas node name (issue #86/#89)
- **AND** `promptNode` equals `space.nodes.clipRunPoint` (`"JSON Master"`)

#### Scenario: The News Carousel Recipe's author-phase checklist has 8 items, 7 mechanical + 1 agent-judged

- **GIVEN** the seeded `news-carousel` Recipe's `author` phase
- **WHEN** its `checklist` is inspected
- **THEN** it has exactly 8 items
- **AND** exactly 1 of them is `agent-judged` (the "grounded subject" item) and the remaining 7 are
  `mechanical`

#### Scenario: The News Carousel Recipe's gate-phase checklist is empty — it declares zero gates

- **GIVEN** the seeded `news-carousel` Recipe's `gate` phase
- **WHEN** its `checklist` is inspected
- **THEN** it is `[]`
