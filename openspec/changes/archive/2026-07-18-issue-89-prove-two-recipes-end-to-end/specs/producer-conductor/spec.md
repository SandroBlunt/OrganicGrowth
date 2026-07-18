## MODIFIED Requirements

### Requirement: A gate-free Recipe (News Carousel) runs end-to-end against a second, purpose-built Magnific fake

The system SHALL provide a SECOND Magnific fake, `FakeCarouselSpace`
(`src/producer/fixtures/fake-carousel-space.ts`), implementing the SAME narrow `SpaceMcpPort`
(`src/space-driver/port.ts`) as the character-Recipe's existing `FakeSpace`, but modelling the News
Carousel Recipe's genuinely different canvas shape — REBUILT to the REAL, captured single-lane shape
(issue #86/#89, see the new Requirement below): a `"JSON Master"` node that is simultaneously the
prompt node and the sole gateless run-point, plus a named `"Brand_Logo"` reference node — never reusing
the character-Recipe fake's hard-coded node names. Driving a News Carousel job's FIRST (and only) leg
through `driveToNextGate` against this fake SHALL bind the `"Brand_Logo"` media slot (via
`bindMediaAsset`), inject the authored Spec into the Recipe's OWN `canvasInputs.promptNode`, run the
Recipe's sole run-point, and FINISH with the rendered Asset — with NO pause anywhere, since this Recipe
declares zero gates (`Recipe.gates` is `[]`).

#### Scenario: A gate-free News Carousel job runs straight through to a finished Asset

- **GIVEN** the seeded `news-carousel` Recipe (zero declared gates), a `FakeCarouselSpace`, a found
  `Brand_Logo` resolution, and the real, committed Straw Motion carousel Spec fixture (issue #87)
- **WHEN** the `Brand_Logo` slot is bound via `bindMediaAsset`, then `driveToNextGate` is called with
  `{ kind: "first", targetGate: null, spec, promptNode: recipe.canvasInputs.promptNode }`
- **THEN** the result is `ok: true` with `outcome.kind === "finished"`, carrying the rendered Asset's
  id and URL, and the fake recorded exactly one media-bind edit, one Spec-inject edit, and one render
  run — no pause, no publish action anywhere

#### Scenario: A missing required Brand Asset STOPs the run before any Space call

- **GIVEN** the seeded `news-carousel` Recipe and a `found: false` `Brand_Logo` resolution
- **WHEN** `bindMediaSlots` is called with that resolution
- **THEN** it returns `ok: false` naming the `"Brand_Logo"` slot, and a freshly-constructed
  `FakeCarouselSpace` for the same scenario records ZERO edit goals and ZERO runs — the STOP happens
  before any Space interaction is even attempted

## ADDED Requirements

### Requirement: The FakeCarouselSpace replays the live Carrousel capture's exact node inventory

The system SHALL prove `FakeCarouselSpace`'s node inventory matches the sanctioned live capture of the
real "Carrousel" Space (issue #86,
`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`) exactly — never a
hand-typed approximation that could silently drift. A test SHALL parse the capture file directly and
compare it against the fake's exported, typed inventory constants: the 7 node names + their real
Magnific element `type`s (in capture order), the 5 connections (source/target node names + ports + data
type, resolved from the capture's raw element ids), the Producer Protocol node's parsed `run_points`
(equal to `canonicalCarouselProtocol()`: `start: "JSON Master"`, zero gates), the Image Generator's real
settings (`imagen-nano-banana-2-flash` mode, `3:4` aspect ratio, `1k` resolution — the Operator confirmed
flash-vs-non-flash 2026-07-18, no canvas change), and the 7 real slide creation identifiers from the
capture's "Generated slides" list. The test SHALL also assert the OLD placeholder names
(`"Slides Prompts"`, `"Brand Logo"`) are NOT present on the real captured canvas at all.

#### Scenario: The fake's node inventory equals the capture's elements, name-for-name and type-for-type

- **GIVEN** `FakeCarouselSpace`'s exported `CARROUSEL_NODE_INVENTORY` and the parsed capture file
- **WHEN** they are compared
- **THEN** they are deep-equal: 7 entries, same names, same Magnific element types, same order

#### Scenario: The fake's connections equal the capture's wiring, resolved from element ids to names

- **GIVEN** `FakeCarouselSpace`'s exported `CARROUSEL_CONNECTIONS` and the capture's `connections` array
  (with `sourceElementId`/`targetElementId` resolved to node names via the capture's own elements)
- **WHEN** they are compared
- **THEN** they are deep-equal: 5 entries, same source/target names, same ports, same data type

#### Scenario: The capture's Producer Protocol node holds the SAME run_points canonicalCarouselProtocol() declares

- **GIVEN** the capture's `"Producer Protocol"` node's `data.text`, JSON-parsed
- **WHEN** it is compared to `canonicalCarouselProtocol()`
- **THEN** they are deep-equal — one run-point, `start: "JSON Master"`, `gate: null`

#### Scenario: The old placeholder node names are absent from the real captured canvas

- **GIVEN** the capture's 7 element names
- **WHEN** they are checked for `"Slides Prompts"` and `"Brand Logo"`
- **THEN** neither is present — the earlier placeholders named no real canvas node at all
