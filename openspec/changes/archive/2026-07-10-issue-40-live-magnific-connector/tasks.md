## 1. Injectable live-MCP transport seam

- [x] 1.1 Define `LiveMcpTransport` in `src/space-driver/live/transport.ts`: one method per MCP tool
  the port needs (`spacesState`, `spacesGetNodes`, `spacesRun`, `spacesRunStatus`, `spacesEdit`,
  `spacesEditStatus`, `creationsGet`), each returning the tool's raw textual response (a string). This
  is the ONLY seam the live adapter calls through — never the live `magnific` MCP tools directly.

## 2. TOON / key-value parsers (pure deep modules, test-first)

- [x] 2.1 Write failing tests (`toon.test.ts`): a generic `nodes[N]{col,...}:` / `nodeData[N]{...}:`
  table parser handles quoted fields (JSON-string-escaped, embedding commas/newlines/quotes), `null`
  literals, and bare tokens — against the REAL captured `01`/`02`/`11` text.
- [x] 2.2 Implement `parseToonTables`/`splitToonRow`/`parseToonField` in `toon.ts`.
- [x] 2.3 Write failing tests (`space-state.test.ts`): `parseSpaceStateNodes(toonText)` builds
  `SpaceStateLike` nodes from the `nodes`+`nodeData` tables — a node's `.value` is its `text` key (text
  nodes) or `creationIdentifier`/`currentCreationIdentifier` key (creation/generator nodes); nodes with
  neither carry no `.value` — against `01` (structural only), `02` (6 valued key nodes), `11`
  (post-inject `JSON Master`).
- [x] 2.4 Implement `parseSpaceStateNodes` in `space-state.ts`.
- [x] 2.5 Write failing tests (`creation.test.ts`): `parseCreationBlock(text)` extracts
  `{identifier, url}` (plus optional `kind`) from the top-level key/value block, ignoring nested
  `metadata`/`mediaCollection` lines — against the REAL `07` (image) and `08` (video) captures.
- [x] 2.6 Implement `parseCreationBlock` in `creation.ts`.

## 3. Truncation guard (test-first)

- [x] 3.1 Write failing tests (`text-truncation.test.ts`): `looksTruncated` flags the REAL captured
  `JSON Master` value from `02` (truncated mid-JSON) as truncated, and the REAL captured `Producer
  Protocol` value as NOT truncated (reads whole, per the README). `readNodeTextRobust` fetches a linked
  doc when truncated + a link/fetcher are supplied, and otherwise returns the truncated text explicitly
  flagged rather than silently trusted.
- [x] 3.2 Implement `looksTruncated`/`readNodeTextRobust` in `text-truncation.ts`, reusing
  `READ_API_TRUNCATION_CAP` from `execution-protocol/protocol.ts`.

## 4. Live `SpaceMcpPort` adapter (test-first)

- [x] 4.1 Write failing tests (`adapter.test.ts`) against a hand-rolled `LiveMcpTransport` stub
  returning the REAL captured fixture text verbatim: `readState` merges the whole-board inventory (`01`)
  with scoped key-node values (`02`); `run`/`runStatus` map `workflowRunIdentifier`/`allTerminal`/
  `creationIdentifiers` and resolve `nodeRuns[].nodeId` to NAMES via a fresh board read (`04`/`05`/`06`);
  `edit`/`editStatus` map `operationId`/`workflowStatus` (`09`/`10`); `fetchCreations` parses `07`/`08`
  and NEVER caches a url across two calls returning different values; `verifyPinned` reads the real
  `Selected Character` node's `creationIdentifier` and matches only the true pinned value.
- [x] 4.2 Implement `LiveSpaceAdapter` in `adapter.ts` satisfying `SpaceMcpPort`.
- [x] 4.3 Write failing tests for the synthesized (NOT captured, clearly labeled) failure shapes: a
  `runStatus` reporting `phase:"failed"` with `startNodeMissing:true` (the Fallback-Protocol trigger), a
  generic failed `runStatus`, and a failed `editStatus` — proving the adapter maps each to the port's
  documented failure shape.
- [x] 4.4 Confirm the mapping logic (already implemented in 4.2) satisfies 4.3 without adapter changes
  beyond what's needed; adjust if a gap is found.

## 5. Record/replay test double (fixtures, not the adapter under test)

- [x] 5.1 Add `replay/transport.ts`: `ReplayMcpTransport` reads the captured files under
  `fixtures/live-captures/` verbatim; sequences `spacesRunStatus` `05`→`06` (running→terminal);
  switches `spacesGetNodes`'s `JSON Master` row from `02` to the REAL post-inject `11` once an inject
  edit targeting it has completed (both are real captures — never invented); serves `creationsGet` for
  the two really-captured ids (`9RwKMfINYZ` from `07`, `IaAOyRntvE` from `08`) and, for any other id,
  templates the SAME real `07` schema with the identifier substituted — clearly commented as templated,
  not independently captured.
- [x] 5.2 Add `replay/synthetic.ts`: clearly-labeled, NOT-captured failure/recovery JSON builders (a
  failed/`startNodeMissing` `runStatus`, a failed `editStatus`, and an agent-recovery `editStatus`
  carrying `creationIdentifiers`, reusing the two REAL creation ids so no creation data is invented).

## 6. Shared port contract — one contract, two implementations (test-first)

- [x] 6.1 Write `contract.test.ts`: a single parameterized battery (readState shape; edit→editStatus to
  terminal; run→runStatus to terminal with fired names + creation ids; fetchCreations; verifyPinned
  true/false after issuing the SAME `pinGoal` edit) run against BOTH the existing `FakeSpace`
  (unmodified) and `LiveSpaceAdapter` over `ReplayMcpTransport` — proving one contract, two
  implementations (AC2/AC5). `verifyPinned` is asserted against the REAL `Selected Character` node
  value (`VdPHh9JMMU`) for the live side (AC bullet 3).

## 7. The existing driver over the live adapter (proves ADR-0003 logic is port-agnostic)

- [x] 7.1 Write `driver-over-live.test.ts`: the unmodified `injectSpec`/`pinCharacter` from `driver.ts`
  run against `LiveSpaceAdapter` over `ReplayMcpTransport` — inject confirms the REAL `02`→`11`
  readback change; pin confirms via `verifyPinned` against the real board.
- [x] 7.2 Write a `composeAndCast`-over-the-live-adapter test using the board EXACTLY as captured (the
  real, pre-canonical `Producer Protocol` text) — document that `parse()` legitimately fails
  (schema mismatch) so the driver takes the Fallback-Protocol recovery path, and (via the synthesized
  agent-recovery `editStatus`, §5.2) still surfaces a real, non-empty Cast.
- [x] 7.3 Write a second `composeAndCast`-over-the-live-adapter test using the board WITH the canonical
  `run_points` protocol substituted onto the `Producer Protocol` node (modelling the deferred runtime
  authoring step) — proving the NAMED cast run-point path runs through 100% real `04`/`05`/`06` data.

## 8. Self-review

- [x] 8.1 `npx openspec validate issue-40-live-magnific-connector --strict` green.
- [x] 8.2 `npm test` green (type-check + full suite); `npm run build` exit 0.
- [x] 8.3 Simplify / dead-code pass; confirm each of issue #40's 6 acceptance criteria maps to a
  specific named test.
- [x] 8.4 Write the Build Report into `handoff.md`, explicitly flagging the Magnific fake, the
  live-capture replay fixtures, and every synthesized (not-captured) shape.
