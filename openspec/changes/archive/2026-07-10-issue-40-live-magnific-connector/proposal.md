## Why

Every Space interaction the Producer drives (`src/space-driver/port.ts::SpaceMcpPort`) currently has
exactly one implementation: the in-memory `FakeSpace` (`src/space-driver/fixtures/fake-space.ts`). That
is correct for a hermetic build, but it means nothing in the repo can actually drive the **real**
Magnific Space — the epic tracking production runtime (#39) calls this out as the first missing piece
(C2). Issue #40 closes that gap by adding the **live** `SpaceMcpPort` implementation, built and
contract-tested against a one-time **sanctioned live capture** already recorded in the repo at
`src/space-driver/fixtures/live-captures/` (README + fixtures `00`–`11`) — never against invented
shapes (audit design-tension #4).

The build stays hermetic (CLAUDE.md, `.claude/rules/always/`): the `developer` agent has no Magnific MCP
tools, so this slice cannot make a single live `spaces_*`/`creations_*` call. It instead builds a
**record/replay harness** — an injectable MCP transport seam the live adapter calls, and a
`ReplayMcpTransport` test double that returns the captured fixture files verbatim — so the adapter's
parsing/mapping/polling logic runs against **real recorded response shapes** in tests, with zero
credits, zero board mutation, zero network.

The captured fixtures also surface real-world facts the fake could never teach us, and this slice must
honor them rather than silently assume otherwise:

- The live board's node **names have drifted** from the fake's constants (`Character #2` → `Selected
  Character`, etc. — README gotcha #3). `verifyPinned` must be implemented against the **real** node
  name, not the fake's `PINNED:` marker convention.
- The live `Producer Protocol` node currently holds a **richer, pre-canonical `steps` schema** (with a
  stray leading `f{` byte), not yet the `run_points` shape `execution-protocol/parse.ts` expects — this
  is real evidence that `parse()` legitimately fails against today's live board, which is exactly the
  scenario the existing **Fallback Protocol** recovery path (ADR-0003) exists for. This slice does not
  change `execution-protocol/parse.ts`'s schema (out of scope; a runtime authoring step, not this
  adapter); it documents the real failure and proves the driver still recovers correctly through the
  live adapter.
- The read API **truncates text-node values at ~1,900 characters** (README gotcha #1 /
  `docs/producer-spikes-results.md` Spike 3) — the live capture shows the `JSON Master` node's value
  really does come back cut off mid-JSON. The adapter must detect this rather than silently trust a
  partial read, and implement the documented linked-Google-Doc fallback mechanism (even though this
  particular board has no such link node to exercise it against).
- Two async operations use **different id field names** (`spaces_run` → `workflowRunIdentifier`;
  `spaces_edit` → `operationId`) and **`spaces_run_status` reports node ids, not names** — the port
  wants names, so the adapter must resolve them via a board read.
- Media URLs are **signed and expire** — `fetchCreations` must never cache one.

## What Changes

- **Add an injectable live-MCP transport seam** (`src/space-driver/live/transport.ts`): a narrow
  `LiveMcpTransport` interface — one method per MCP tool the port needs
  (`spacesState`, `spacesGetNodes`, `spacesRun`, `spacesRunStatus`, `spacesEdit`, `spacesEditStatus`,
  `creationsGet`) — each returning the tool's raw textual response. This is the ONLY seam the live
  adapter calls through; it never reaches for the `magnific` MCP tools directly (the `developer` agent
  has none anyway).
- **Add TOON/key-value parsers** (`src/space-driver/live/toon.ts`,
  `src/space-driver/live/space-state.ts`, `src/space-driver/live/creation.ts`) — pure deep modules that
  parse the real captured response shapes: the `nodes[N]{...}:` / `nodeData[N]{elementId,key,value}:`
  tabular TOON (`spaces_state`/`spaces_get_nodes`) into `SpaceStateLike`, and the `creations_get`
  key/value block into `{identifier, url}`. A node's resolved `.value` is its `text` key (text nodes) or
  `creationIdentifier`/`currentCreationIdentifier` key (creation/generator nodes), per the README's
  field-mapping table.
- **Add the ~1,900-char truncation guard** (`src/space-driver/live/text-truncation.ts`) —
  `looksTruncated(text)` plus a `readNodeTextRobust` fallback that fetches a linked Google-Doc URL
  (injectable fetcher) when a value looks truncated and a link is available, or else returns the
  truncated text explicitly flagged `truncated: true` — never silently trusted as complete.
- **Add the live `SpaceMcpPort` adapter** (`src/space-driver/live/adapter.ts`, `LiveSpaceAdapter`) —
  implements every port method by calling the injected `LiveMcpTransport` and parsing its raw response:
  `readState` (board inventory + scoped key-node values, merged), `edit`/`editStatus` (`operationId`,
  `workflowStatus`), `run`/`runStatus` (`workflowRunIdentifier`, node-id→name resolution via a board
  read, `allTerminal`), `fetchCreations` (one id at a time, never cached), `verifyPinned` (reads the
  real `Selected Character` creation node's `creationIdentifier`).
- **Add the record/replay test double** (`src/space-driver/live/replay/transport.ts`) — a
  `ReplayMcpTransport` implementing `LiveMcpTransport` by reading the captured fixture files verbatim
  (never mutating them), sequencing the two-call running→terminal poll for `run` from the real `05`→`06`
  captures, and switching `JSON Master`'s scoped read from `02` (pre-inject) to the real `11`
  (post-inject) once an inject edit targeting it has completed — modelling the readback exactly as the
  live capture recorded it. A clearly-labelled `synthetic.ts` module provides the **not-captured**
  failure/recovery shapes (a failed `runStatus`, a `startNodeMissing` `runStatus`, a failed
  `editStatus`, and an agent-recovery `editStatus` carrying `creationIdentifiers`) as explicit,
  documented extrapolations from the real success shapes — never presented as captured.
- **Add a shared, parameterized port-contract test** (`src/space-driver/live/contract.test.ts`) that
  runs the same behavioral battery (readState shape, edit→editStatus terminal, run→runStatus terminal
  with fired names + creation ids, fetchCreations, verifyPinned true/false) against **both** the
  existing `FakeSpace` (unmodified) and the new `LiveSpaceAdapter` over `ReplayMcpTransport` — one
  contract, two implementations (AC2/AC5).
- **Add live-adapter-over-replay tests for the existing driver** (`src/space-driver/live/*.test.ts`) —
  the unmodified `driver.ts` functions (`injectSpec`, `pinCharacter`, `runRunPoint`, `composeAndCast`)
  run with `port = new LiveSpaceAdapter(replay, LIVE_SPACE_ID)` instead of the fake, proving the
  existing Phase-A/Phase-B driver logic works unchanged against a real-shaped port.
- **No change to `src/space-driver/fixtures/fake-space.ts`** (the Magnific fake stays the test double
  for the driver's own existing test suite) and no change to `src/execution-protocol/parse.ts` (the
  real board's protocol schema mismatch is documented and exercised through the existing Fallback
  Protocol, not patched around).

## Capabilities

### Added Capabilities

- `live-space-adapter`: the live `SpaceMcpPort` implementation — parses real captured `spaces_state` /
  `spaces_get_nodes` / `spaces_run(_status)` / `spaces_edit(_status)` / `creations_get` response shapes
  behind an injectable MCP transport seam, resolves node names from ids, guards against the ~1,900-char
  read truncation, treats creation URLs as expiring/never-cached, and implements `verifyPinned` against
  the real `Selected Character` node — proven by a record/replay harness over the sanctioned live
  capture, with the not-captured failure shapes clearly synthesized and labeled.

## Impact

- **New code, all under `src/space-driver/live/`:** `transport.ts`, `toon.ts` (+`toon.test.ts`),
  `space-state.ts` (+ test), `creation.ts` (+ test), `text-truncation.ts` (+ test), `adapter.ts` (+
  test), `contract.test.ts`, plus `replay/transport.ts` and `replay/synthetic.ts` (record/replay test
  doubles, clearly documented as such).
- **No changes** to `src/space-driver/port.ts` (the interface this slice implements), `driver.ts` (the
  Phase A/B orchestration this slice proves still works over the live adapter), `fixtures/fake-space.ts`
  (the Magnific fake), or `execution-protocol/parse.ts`/`protocol.ts` (the run-points schema; the real
  board's current mismatch is documented, not patched).
- **Hermetic:** every test in this slice runs through `ReplayMcpTransport` (static fixture files) or a
  hand-rolled stub transport — zero `spaces_*`/`creations_*` calls, zero credits, zero board mutation,
  zero network. `npm test` stays green.
- **Always-rules upheld:** generate-never-publish (the adapter has no publish primitive — same port
  surface as before); ledger-as-source-of-truth (n/a — this slice writes no ledger fields); the adapter
  never fabricates a Cast/Asset — an unresolvable/truncated read is surfaced, never guessed.
- **Known, documented limits (see the slice handoff):** the live board's `Producer Protocol` node does
  not yet hold the canonical `run_points` schema (a deferred runtime-authoring step, not this adapter's
  job); `driver.ts`'s hard-coded `CHARACTER_NODE_NAME` ("Character #2") still differs from the live
  board's real "Selected Character" node in the Fallback Protocol's natural-language pin goal text —
  `verifyPinned`'s own readback is correct against the real name, but the edit goal text itself is
  unchanged by this slice (out of scope; flagged for a follow-up); the failure/recovery MCP shapes
  (`startNodeMissing`, failed `editStatus`, agent-recovery `editStatus` with `creationIdentifiers`) were
  not exercised in the one sanctioned live capture and are synthesized, clearly labeled as such.
