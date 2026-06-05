## ADDED Requirements

### Requirement: Inject the Production Spec into JSON Master via the Fallback Protocol and confirm by readback

The Space driver SHALL inject a validated Production Spec into the `JSON Master` text node via the
**Fallback Protocol** — a natural-language `spaces_edit` delegated to the Space's in-canvas agent — then
**read back** the node and confirm the text **changed** (ADR-0003; `docs/producer-spikes-results.md`
Spike 1). The driver SHALL poll the edit to terminal before reading back. If the readback shows the text
did not change, the driver SHALL report an identifiable failure rather than proceeding as if the inject
succeeded. The driver SHALL depend only on a narrow injected Magnific port, never on the live Space.

#### Scenario: Injecting the Spec changes the JSON Master text

- **GIVEN** a fake Space whose `JSON Master` node holds placeholder content and a validated Production Spec
- **WHEN** the driver injects the Spec
- **THEN** it issues a natural-language edit targeting `JSON Master` (the Fallback Protocol)
- **AND** after polling the edit to terminal it reads back the `JSON Master` node
- **AND** the readback text differs from the pre-inject content (the change is confirmed)

#### Scenario: An inject whose readback is unchanged is reported as a failure

- **GIVEN** a fake Space whose edit does not actually change the `JSON Master` text
- **WHEN** the driver injects the Spec and reads back
- **THEN** it reports an identifiable failure rather than treating the inject as successful

### Requirement: Running the cast run-point yields the Cast and stops at the Cast

The Space driver SHALL run the cast run-point (`Character Variants Generator`, mode `downstream`) by
starting a `spaces_run` at the resolved node ID, polling the run to terminal, and returning which nodes
fired and which creations were produced. The run SHALL stop cleanly at the Cast: it SHALL yield exactly
the **6 Cast-phase creations** and SHALL fire **no** clip or video nodes (no clip image generators, no
video generators, no Video Combiner) — the human Character pin is the natural cut between Phase A and
Phase B (`docs/producer-spikes-results.md` Spike 2). The cast run-point SHALL be resolved by name from
the parsed Execution Protocol (the run-point whose gate is the Cast gate), never hard-coded.

#### Scenario: The cast run yields the 6 Cast creations

- **GIVEN** a fake Space with the Spec injected and the cast run-point resolved from the Execution Protocol
- **WHEN** the driver runs the cast run-point `downstream` and polls to terminal
- **THEN** it returns 6 candidate Cast creations

#### Scenario: The cast run fires no clip or video nodes

- **GIVEN** the same cast run
- **WHEN** the run reaches terminal
- **THEN** none of the fired nodes is a clip generator, a video generator, or the Video Combiner

### Requirement: The Cast URLs are surfaced and the Idea transitions to casting

The Space driver SHALL surface the candidate **Cast** image URLs to the Operator and, on a successful
Phase-A completion, the producer SHALL transition the Idea `accepted → casting` and populate the ledger
Idea's `cast` field with the candidate identifiers/URLs (ADR-0003). The status and the `cast` field SHALL
be written to `data/ledger.json`, which remains the source of truth (the values are written from the
Phase-A completion, never inferred). The driver SHALL NOT publish anything — Phase A pauses for a human
(generate-never-publish).

#### Scenario: A successful Phase A returns the Cast image URLs

- **GIVEN** a fake Space and a validated Production Spec
- **WHEN** the driver composes and casts (inject → run cast → fetch Cast)
- **THEN** it returns the candidate Cast image URLs for the Operator to judge

#### Scenario: The ledger records casting and the cast candidates

- **GIVEN** a ledger whose Idea is `accepted` and the Cast candidates from a successful Phase A
- **WHEN** the casting transition is written
- **THEN** the Idea's status reads `casting`
- **AND** the Idea's `cast` field holds the candidate Cast identifiers/URLs
- **AND** no other Idea and no unrelated field is changed

### Requirement: A missing or stale cast run-point falls back to the in-canvas agent

The Space driver SHALL recover via the **Fallback Protocol** — delegating to the Space's in-canvas agent
with a natural-language run-by-goal `spaces_edit` — rather than hard-failing when the named cast run-point
cannot be resolved (it is absent or ambiguous in the parsed Execution Protocol) or the run reports the
start node missing/stale (ADR-0003; PRD #1 story 27). The fallback SHALL still surface a Cast.

#### Scenario: A missing/stale cast run-point recovers via the agent fallback

- **GIVEN** a fake Space whose cast run-point is missing/stale (the run reports the start node gone, or it
  cannot be resolved from the Execution Protocol)
- **WHEN** the driver composes and casts
- **THEN** it falls back to the in-canvas agent with a natural-language run-by-goal edit (the Fallback
  Protocol) instead of hard-failing
- **AND** a Cast is still surfaced

### Requirement: The driver depends only on a narrow injected Magnific port

The Space driver SHALL depend only on a narrow injected port for the exact Magnific operations it needs —
read state, natural-language edit + poll edit-status to terminal, run + poll run-status to terminal, and
fetch creations. It SHALL NOT call the live Magnific MCP tools directly. Each driver operation
(`injectSpec`, `runRunPoint`, `fetchCast`) SHALL be unit-testable against a fake implementing that port,
with no credits spent, no board mutation, and no network. The live adapter implementing the port is
deferred to a later slice.

#### Scenario: injectSpec issues the edit and verifies via the port

- **GIVEN** a fake implementing the Magnific port
- **WHEN** `injectSpec` runs
- **THEN** it issues the edit and polls edit-status to terminal through the port, then reads back to verify
- **AND** it makes no call outside the injected port

#### Scenario: runRunPoint polls a run to terminal through the port

- **GIVEN** a fake implementing the Magnific port
- **WHEN** `runRunPoint` runs the cast run-point
- **THEN** it starts the run and polls run-status to terminal through the port, returning the run result

#### Scenario: fetchCast returns the expected creations through the port

- **GIVEN** a fake implementing the Magnific port holding the 6 Cast creations
- **WHEN** `fetchCast` is called with the Cast creation identifiers
- **THEN** it returns the 6 Cast image URLs through the port
