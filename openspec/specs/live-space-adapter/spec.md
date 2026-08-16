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

### Requirement: The live spaces_edit write limit is modelled explicitly and checked before every write

The system SHALL model the live `spaces_edit` tool's write limit as an explicit, named constant
(`SPACES_EDIT_WRITE_LIMIT_CHARS`) rather than an assumed/undocumented number, citing the measured value
established across prior live Producer sessions. `LiveSpaceAdapter.edit(goal)` SHALL check `goal`
against this limit BEFORE the injected `LiveMcpTransport` is ever called. A goal at or under the limit
SHALL be forwarded to the transport unchanged. A goal over the limit SHALL be refused with a clear,
typed error citing the goal's actual length and the modelled cap, and the transport SHALL NOT be called
at all for that goal — no live call, no credit spent, no board mutation, and never a silently truncated
write.

#### Scenario: A goal at or under the limit is forwarded to the transport unchanged

- **GIVEN** a natural-language edit goal at or under `SPACES_EDIT_WRITE_LIMIT_CHARS`
- **WHEN** `LiveSpaceAdapter.edit(goal)` is called
- **THEN** the injected transport's `spacesEdit` is called once, with that exact goal text

#### Scenario: A goal over the limit is refused before any transport call

- **GIVEN** a natural-language edit goal one character over `SPACES_EDIT_WRITE_LIMIT_CHARS`
- **WHEN** `LiveSpaceAdapter.edit(goal)` is called
- **THEN** it rejects with a `WriteLimitExceededError` naming the goal's actual length and the limit
- **AND** the injected transport's `spacesEdit` is never called

#### Scenario: A ~17 KB single-shot goal (a whole carousel Spec) is refused, never silently truncated

- **GIVEN** a natural-language edit goal roughly 17,000 characters long
- **WHEN** `LiveSpaceAdapter.edit(goal)` is called
- **THEN** it rejects with `WriteLimitExceededError`
- **AND** the transport is never called — the goal is never sent partially or truncated

### Requirement: A fresh threadId is generated for every live edit, never reused

`LiveMcpTransport.spacesEdit` SHALL take an explicit `threadId` parameter. `LiveSpaceAdapter` SHALL
generate a fresh thread id for EVERY `edit()` call (default: `crypto.randomUUID()`; injectable for
deterministic tests) and SHALL NOT reuse a thread id across calls — a shared thread reused across many
edits was found, live, to truncate the JSON node after roughly 40 edits.

#### Scenario: Two consecutive edits receive two different thread ids

- **GIVEN** a `LiveSpaceAdapter` with its default thread-id generator
- **WHEN** `edit()` is called twice in succession
- **THEN** the transport's `spacesEdit` receives two DIFFERENT `threadId` values, each a real generated
  identifier (never empty, never a placeholder)

#### Scenario: An injected thread-id generator is threaded through verbatim, never reused

- **GIVEN** a `LiveSpaceAdapter` constructed with an injected thread-id generator producing a distinct
  value on each call
- **WHEN** `edit()` is called three times
- **THEN** the transport receives the three generated values, in order, none repeated

### Requirement: A ~17 KB News Carousel Spec reaches the canvas intact via chunked, within-limit writes

The system SHALL provide a way to get a News Carousel Production Spec (`{ slides: [...] }`, typically
15-30 KB in real production data) onto its target canvas node intact even though a single `spaces_edit`
write cannot carry it whole. A Spec whose single-shot inject goal already fits within
`SPACES_EDIT_WRITE_LIMIT_CHARS` SHALL be injected exactly as today (delegating to the existing
single-shot inject, unchanged). A Spec whose single-shot goal exceeds the limit SHALL be planned as an
ORDERED sequence of within-limit writes: one "skeleton" write establishing an empty, right-length
`slides` placeholder array, followed by one SURGICAL write per slide that replaces ONLY that slide's own
array element — leaving every other slide and field untouched — never an append and never a whole-node
replace carrying more than one slide's data. Planning SHALL fail clearly, before any edit is issued,
when the Spec cannot be chunked within the limit at all (no `slides` array to chunk by, or a single
slide's own surgical goal alone still exceeds the limit). Execution SHALL stop immediately on the first
edit that fails, never continuing to issue further edits past a failure.

#### Scenario: A Spec that already fits is injected in exactly one edit, unchanged

- **GIVEN** a News Carousel Spec whose single-shot inject goal is under the write limit
- **WHEN** the chunked-injection entry point is called
- **THEN** it issues exactly ONE edit, identical to today's single-shot `injectSpec`

#### Scenario: A ~17 KB Spec is chunked into one skeleton write plus one write per slide, all within limit

- **GIVEN** a realistic ~17 KB, 7-slide News Carousel Spec whose single-shot goal exceeds the write limit
- **WHEN** the chunked-injection entry point is called
- **THEN** it issues exactly 8 edits (1 skeleton + 1 per slide)
- **AND** every single issued edit's goal is at or under the write limit
- **AND** no single edit ever embeds the Spec's FULL data
- **AND** reassembling the per-slide edits' embedded JSON reproduces the ORIGINAL slides array exactly,
  in order — no slide's data is lost or corrupted across the sequence

#### Scenario: A single oversized slide fails planning before any edit is issued

- **GIVEN** a News Carousel Spec whose overall size exceeds the write limit AND whose surgical
  replace-goal for one specific slide, alone, ALSO exceeds the write limit
- **WHEN** the chunked-injection entry point is called
- **THEN** it fails, naming that specific slide and its size against the limit
- **AND** zero edits are ever issued

#### Scenario: A mid-sequence edit failure stops immediately, never issuing the remaining edits

- **GIVEN** a chunked injection plan of 8 edits, where the 3rd edit fails at the agent
- **WHEN** the chunked-injection entry point executes the plan
- **THEN** it reports the failure
- **AND** only the first 3 edits were ever issued — the remaining 5 are never attempted

### Requirement: A manual smoke script exercises the live-adapter write-limit boundary, never run by npm test

The system SHALL provide a manual, one-off smoke script (mirroring the shape of the existing
`media-host` live smoke script: not a `*.test.ts` file, imported by no other module, never matched by
the `npm test`/`npm run test:docs` globs) that runs standalone with zero live calls and proves the
write-limit refusal genuinely happens at the `LiveSpaceAdapter` boundary — a within-limit goal reaches
the transport with a real generated thread id; an oversized goal is refused by a transport that would
throw if ever called at all. The script SHALL also print the exact runbook for the portion that
genuinely requires a real, attended live session (a real edit + readback + thread-freshness
confirmation), since a spawned script process has no way to invoke the `magnific` MCP tools itself.

#### Scenario: The smoke script is excluded from both test suites

- **GIVEN** the full repository test suite (`npm test`) and the docs-conformance suite
  (`npm run test:docs`)
- **WHEN** either runs
- **THEN** neither matches or executes `src/space-driver/live/smoke.ts`

#### Scenario: The smoke script's standalone part proves the write-limit refusal with zero live calls

- **GIVEN** `src/space-driver/live/smoke.ts` run directly (`npx tsx` / `npm run space-driver-smoke`)
- **WHEN** it exercises a within-limit goal and an oversized goal against `LiveSpaceAdapter`
- **THEN** the within-limit goal reaches its (recording, non-live) transport with a real thread id
- **AND** the oversized goal is refused before its (poisoned) transport is ever invoked
- **AND** the script prints the manual runbook for the Operator's own attended-session verification

