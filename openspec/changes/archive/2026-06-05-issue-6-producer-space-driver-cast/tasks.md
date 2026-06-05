## 1. Narrow Space MCP port (the fake's seam)

- [x] 1.1 Define `SpaceMcpPort` in `src/space-driver/port.ts`: `readState()`, `edit(goal)` +
  `editStatus(id)`, `run(startNodeId, mode)` + `runStatus(id)`, `fetchCreations(ids)`, with the
  terminal-status and creation shapes the driver reads. Document that this is the ONLY Magnific seam and
  that the live adapter (worker slice) implements it.

## 2. Magnific fake (test-first scaffolding)

- [x] 2.1 Add `src/space-driver/fixtures/fake-space.ts`: a `FakeSpace` implementing `SpaceMcpPort`,
  composed from the existing `fakeSpaceState()`. Model: a successful inject + readback showing the
  `JSON Master` text changed; a `downstream` cast run that fires exactly the 6 Cast-phase nodes and
  yields 6 Cast creations while firing NO clip/video nodes (Spike 2); a missing/stale run-point variant
  whose run reports the start node gone (exercises recovery). Record issued edit goals so tests can
  assert the Fallback Protocol was used. NO network, NO live Space.

## 3. injectSpec — Fallback Protocol inject + readback (test-first)

- [x] 3.1 Write failing tests (`driver.test.ts`): `injectSpec` issues a natural-language `edit` targeting
  `JSON Master`, polls the edit to terminal, reads back the node, and confirms the text CHANGED
  (readback differs from the pre-inject content). A readback that did not change is reported as a failure.
- [x] 3.2 Implement `injectSpec(port, spec)` in `src/space-driver/driver.ts`: edit → poll editStatus to
  terminal → read back `JSON Master` → assert changed. Returns the new text on success, an identifiable
  failure otherwise. Hides the polling.

## 4. runRunPoint — start + poll to terminal (test-first)

- [x] 4.1 Write failing tests: `runRunPoint` starts a `run` at the resolved cast node ID in `downstream`
  mode, polls `runStatus` to terminal, and returns the terminal result — exactly the 6 Cast-phase nodes
  fired and 6 Cast creations produced, with NO clip/video nodes among the fired set (Spike 2). A run that
  reports the start node missing/stale returns an identifiable failure.
- [x] 4.2 Implement `runRunPoint(port, startNodeId, mode)`: start → poll runStatus to terminal → return
  the fired-nodes + creation IDs (or an identifiable missing/stale failure). Hides the polling.

## 5. fetchCast — creations → image URLs (test-first)

- [x] 5.1 Write failing tests: `fetchCast` resolves Cast creation identifiers to their image URLs (the 6
  Cast creations from the run).
- [x] 5.2 Implement `fetchCast(port, creationIds)`: fetch the creations and return their URLs.

## 6. composeAndCast — Phase A orchestration + recovery (test-first)

- [x] 6.1 Write failing tests: `composeAndCast` resolves the cast run-point (gate === "cast") from the
  parsed Execution Protocol, injects the Spec, runs the cast run-point downstream, fetches the Cast URLs,
  and returns them — asserting no clip/video node fired. A second test: when the named cast run-point is
  missing/stale (cannot resolve, or the run reports it gone) the driver FALLS BACK to the in-canvas agent
  (a natural-language run-by-goal `edit`) rather than hard-failing — assert the fallback edit was issued
  and the Cast still surfaces.
- [x] 6.2 Implement `composeAndCast(port, spaceState, spec)`: resolve via `parse()`, inject, run, fetch;
  on a missing/stale run-point fall back to the in-canvas agent (Fallback Protocol) instead of throwing.

## 7. Ledger — populate `ledger.cast` with the casting transition (test-first)

- [x] 7.1 Write failing tests (`ledger.test.ts`): `applyIdeaCast` purely sets one Idea's `cast` field and
  changes no other Idea; the `writeIdeaCast` shell records the candidate Cast identifiers/URLs into the
  Idea's `cast` field, preserving unrelated fields; a round-trip writes BOTH `status: casting` (via the
  existing `writeIdeaStatus`) and the `cast` field for an Idea moving `accepted → casting`.
- [x] 7.2 Implement `applyIdeaCast` (pure, new array) and `writeIdeaCast` (thin shell: load → set `cast`
  → save) in `src/ledger/ledger.ts`, mirroring the existing status shell. The ledger stays canonical.

## 8. Self-review

- [x] 8.1 `npx openspec validate issue-6-producer-space-driver-cast --strict` green.
- [x] 8.2 `npm test` green; `npm run build` (`tsc -p tsconfig.build.json`) exit 0.
- [x] 8.3 Simplify / dead-code pass; confirm each acceptance criterion maps to a specific named test.
- [x] 8.4 Write the Build Report into `handoff.md`.
