## MODIFIED Requirements

### Requirement: A second canonical protocol artifact exists for the single-lane Carrousel Space

The system SHALL provide a second canonical Execution Protocol artifact, `canonicalCarouselProtocol()`,
for the News Carousel Recipe's rebuilt, single-lane "Carrousel" Space — the replacement for the old
multi-lane "AI News" board (whose per-lane "Image Prompt Slide 1..7" run-points are dead). It SHALL
declare exactly ONE run-point: `start: "JSON Master"`, `mode: "downstream"`, `gate: null`. This one node
is BOTH the Producer's injectable prompt node and the Execution Protocol's sole run-point start —
running it downstream fires the Space's whole chain (Assistant -> List -> Image Generator -> Generated
slides) to the finished carousel, with no gate to pause at (mirroring how the wired Recipe's own
`canonicalProtocol()` is the single source of truth for its cast/clip run-point names). Like the wired
protocol, it SHALL serialize comfortably under the Magnific read API's ~1,900-character truncation cap.

`"JSON Master"` is the REAL, captured node name (issue #86,
`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`) — the earlier
placeholder `"Slides Prompts"` named no real canvas node at all. This is a DIFFERENT node, on a
DIFFERENT Space, than the wired *Character Explainer with Cast* Recipe's own `"JSON Master"` node
(`driver.ts`'s `JSON_MASTER_NODE_NAME`) — the two share only a name.

#### Scenario: The carousel protocol has exactly one run-point

- **GIVEN** the canonical carousel `Producer Protocol` artifact
- **WHEN** it is read
- **THEN** it has exactly one run-point, starting at `"JSON Master"`, mode `"downstream"`, with no gate
  (`gate: null`)

#### Scenario: The carousel protocol references its node only by name

- **GIVEN** the canonical carousel `Producer Protocol` artifact, serialized
- **WHEN** the serialized JSON is inspected
- **THEN** it names `"JSON Master"` and contains no hard-coded node ID

#### Scenario: The serialized carousel protocol round-trips without truncation

- **GIVEN** the canonical carousel `Producer Protocol` artifact serialized to the string the node would
  hold
- **WHEN** its length is measured
- **THEN** it is comfortably under the ~1,900-character read-API truncation cap
