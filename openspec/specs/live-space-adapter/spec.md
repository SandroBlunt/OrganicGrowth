# live-space-adapter Specification

## Purpose
TBD - created by archiving change issue-40-live-magnific-connector. Update Purpose after archive.
## Requirements
### Requirement: A live SpaceMcpPort adapter implements every port method against real captured shapes

The system SHALL provide a `LiveSpaceAdapter` implementing `SpaceMcpPort` (`src/space-driver/port.ts`)
that drives a live Magnific Space through an injectable `LiveMcpTransport` seam — never the live
`magnific` MCP tools directly. Every method (`readState`, `edit`, `editStatus`, `run`, `runStatus`,
`fetchCreations`, `verifyPinned`) SHALL be implemented by parsing the transport's raw response using the
real field mappings recorded in the sanctioned live capture
(`src/space-driver/fixtures/live-captures/README.md`): a node's resolved value is its `text` key (text
nodes) or `creationIdentifier`/`currentCreationIdentifier` key (creation/generator nodes); a run's id is
`workflowRunIdentifier`; an edit's id is `operationId`; a run/edit is terminal when `allTerminal:true`; a
run succeeds when `status:"completed"`; an edit succeeds when `workflowStatus:"success"`.

#### Scenario: readState parses the real captured board into SpaceStateLike

- **GIVEN** the real captured `spaces_state` (whole-board inventory) and `spaces_get_nodes` (scoped
  key-node values) fixtures
- **WHEN** `LiveSpaceAdapter.readState()` is called
- **THEN** it returns a `SpaceStateLike` whose nodes carry the real ids and names
- **AND** the `JSON Master` node's value is the real captured (truncated) text
- **AND** the `Selected Character` node's value is its real `creationIdentifier` (`VdPHh9JMMU`)

#### Scenario: run and runStatus map the real id field and resolve fired node names

- **GIVEN** the real captured `spaces_run` start response and the real `05` (running) → `06` (terminal)
  `spaces_run_status` responses
- **WHEN** the adapter starts a run and polls its status to terminal
- **THEN** the returned run id is the real `workflowRunIdentifier`
- **AND** the terminal result reports `succeeded` with the 6 real terminal `creationIdentifiers`
- **AND** each fired node id is resolved to its real NAME via a board read (not left as an id)

#### Scenario: edit and editStatus map the real id field and success flag

- **GIVEN** the real captured `spaces_edit` start response and the real terminal `spaces_edit_status`
  response
- **WHEN** the adapter issues an edit and polls its status to terminal
- **THEN** the returned edit id is the real `operationId`
- **AND** the terminal result reports `succeeded` only because `workflowStatus` is `"success"`

#### Scenario: fetchCreations parses the real creations_get key/value shape and never caches a url

- **GIVEN** the real captured `creations_get` responses for an image and a video creation
- **WHEN** `fetchCreations` is called with their identifiers
- **THEN** it returns each creation's real `identifier` and `url`
- **AND** calling it again against a transport that now returns a different url for the same identifier
  returns the NEW url, never a cached one

### Requirement: verifyPinned reads the real Selected Character node, not the fake's marker

`LiveSpaceAdapter.verifyPinned(character)` SHALL determine whether `character` is the pinned Character
by reading the real Space's `Selected Character` creation node's `creationIdentifier` value and
comparing it to `character` — never by looking for the `FakeSpace`-only `PINNED:` marker convention.

#### Scenario: verifyPinned confirms the real pinned character and rejects a different one

- **GIVEN** the real captured board state, whose `Selected Character` node's `creationIdentifier` is
  `VdPHh9JMMU`
- **WHEN** `verifyPinned("VdPHh9JMMU")` is called
- **THEN** it returns `true`
- **WHEN** `verifyPinned` is called with any other identifier
- **THEN** it returns `false`

### Requirement: The ~1,900-char read-API truncation is detected, never silently trusted

The system SHALL detect when a text-node value returned by the read API looks truncated (at or beyond
the real ~1,900-character cap recorded in `docs/producer-spikes-results.md` Spike 3 and confirmed by the
live capture) and SHALL NOT treat a truncated value as complete. When a linked document URL and a
fetcher are available, the system SHALL resolve the full text from the linked document instead; when
neither is available, it SHALL surface the value explicitly flagged as truncated.

#### Scenario: A truncated node value is flagged, not silently trusted

- **GIVEN** the real captured `JSON Master` node value, which is cut off mid-JSON by the read API
- **WHEN** the truncation guard inspects it
- **THEN** it is flagged as truncated

#### Scenario: The compact Producer Protocol node reads whole

- **GIVEN** the real captured `Producer Protocol` node value
- **WHEN** the truncation guard inspects it
- **THEN** it is NOT flagged as truncated (it is comfortably under the cap)

#### Scenario: A truncated value resolves from a linked document when one is available

- **GIVEN** a truncated text value, a linked document URL, and an injected fetcher returning the
  document's full text
- **WHEN** the truncation guard resolves the node's text
- **THEN** it returns the full text from the linked document, not the truncated canvas value

### Requirement: The live adapter is exercised through a record/replay harness, never a live call

The build SHALL remain hermetic: every test of the live adapter SHALL run through an injectable
`LiveMcpTransport` implementation that returns the sanctioned live capture's fixture files (or a
hand-rolled stub for isolated unit tests) — never a live `spaces_*`/`creations_*` MCP call, never
spending credits, never mutating a live board. The one existing Magnific fake
(`src/space-driver/fixtures/fake-space.ts`) SHALL remain unmodified as the driver's own test double.

#### Scenario: The live adapter's tests make no live MCP call

- **GIVEN** the full test suite for `src/space-driver/live/`
- **WHEN** it runs
- **THEN** every Space interaction is served by the injected `LiveMcpTransport` (the replay transport or
  a stub), never a live `spaces_*`/`creations_*` tool call

### Requirement: A shared port contract runs against both the fake and the live adapter

The system SHALL provide a single, parameterized SpaceMcpPort contract test battery that runs against
BOTH the existing `FakeSpace` and the new `LiveSpaceAdapter` (over the replay transport) — proving the
same behavioral contract (state read shape, edit/run polling to terminal, creation fetch,
pin verification) holds for two independent implementations of the port.

#### Scenario: The same contract battery passes for both implementations

- **GIVEN** the shared port-contract test battery
- **WHEN** it is run once against `FakeSpace` and once against `LiveSpaceAdapter` over the replay
  transport
- **THEN** every assertion in the battery passes for both

### Requirement: Not-captured failure/recovery shapes are synthesized and clearly labeled

The system SHALL provide explicit, clearly-labeled synthesized fixtures for every failure/recovery shape
the port's documented contract requires but the sanctioned live capture did not exercise (success paths
only) — a `runStatus` reporting `phase:"failed"` with `startNodeMissing:true`; a generic failed
`runStatus`; a failed `editStatus`; an agent-recovery `editStatus` carrying `creationIdentifiers` — each
documented as extrapolated from the real success shapes, never presented as captured, and SHALL prove
the adapter maps each to the correct port-level failure/recovery result.

#### Scenario: A synthesized start-node-missing run status maps to the Fallback-Protocol trigger

- **GIVEN** a synthesized (clearly labeled, not captured) `runStatus` response with
  `startNodeMissing:true`
- **WHEN** the adapter maps it
- **THEN** the resulting `RunStatus` has `phase:"failed"` and `startNodeMissing:true`

#### Scenario: A synthesized failed editStatus maps to a failed EditStatus

- **GIVEN** a synthesized (clearly labeled, not captured) `editStatus` response whose `workflowStatus`
  is not `"success"`
- **WHEN** the adapter maps it
- **THEN** the resulting `EditStatus` has `phase:"failed"` with an error message

