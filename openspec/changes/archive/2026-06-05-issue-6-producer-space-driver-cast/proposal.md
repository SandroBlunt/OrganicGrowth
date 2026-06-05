## Why

Slice 1 stood up the runtime and auto-enqueues accepted Ideas; Slice 2 turns a Brief into a strict
**Production Spec** saved beside the Brief; Slice 3 (Slice 4 in the build order) gave the Producer a
parsed **Execution Protocol** so it knows *how* to drive a Space; and the prior slice gave the
**Production Queue** its scheduler. What is still missing is the piece that actually drives the Space to
a visible result: **Phase A — Compose & Cast** (ADR-0003). For an accepted Idea that already has a
validated Production Spec on disk (`ideas/<run>/idea-NN.spec.json`), the Producer must inject that Spec
into the Space, run the **cast** run-point, return the candidate **Cast** image URLs to the Operator,
and **pause** at the Cast gate — moving the Idea `accepted → casting`.

ADR-0003 splits production into two phases around the human **Cast gate** and names the two state
mutations the run API cannot do directly (inject the Spec, pin the Character) as the **Fallback
Protocol** — a natural-language `spaces_edit` delegated to the Space's in-canvas agent. The feasibility
spikes (`docs/producer-spikes-results.md`) proved the load-bearing mechanisms this slice depends on:

- **Spike 1 — PASS.** `spaces_edit` (delegated to the in-canvas agent, polled to terminal via
  `spaces_edit_status`) reliably sets the `JSON Master` *text* node; a readback matched exactly. So the
  Fallback Protocol's inject step works.
- **Spike 2 — PASS.** `spaces_run("Character Variants Generator", downstream)` terminates after exactly
  **6 Cast-phase nodes** and produces **6 new creations (the Cast)** — and fires **zero** clip
  generators, **zero** video generators, and **no** Video Combiner. It stops cleanly at the Cast because
  the clip generators take their reference from the manually-pinned `Character` creation node, which is
  not a downstream output of the variant generators. The human Cast pin is the natural cut between Phase
  A and Phase B.

This slice builds the **Space driver** (`src/space-driver/`) that wraps those operations behind a narrow
port, plus the `ledger.cast` write that records the candidate identifiers/URLs alongside the
`accepted → casting` transition (ADR-0003 adds the `cast` field). The real adapter that calls the live
Magnific MCP tools is deferred to the worker slice; nothing here touches the live Space.

**Hermetic build (no live Space).** Per CLAUDE.md's build pipeline and `project.md`, this slice depends
only on a **narrow injected port** — a TypeScript interface for exactly the MCP operations the driver
needs (read state, natural-language `spaces_edit` + poll `spaces_edit_status` to terminal, `spaces_run`
+ poll `spaces_run_status` to terminal, fetch creations). Tests pass a **FAKE** implementing that port
(the Magnific fake), composed from the existing fake `spaces_state` in
`src/execution-protocol/fixtures/space-state.ts`. There are **no** live `spaces_*`/`creations_*` calls,
no credits, no board mutation, and no network anywhere in the slice or its tests.

## What Changes

- **Add a narrow Space MCP port** (`src/space-driver/port.ts`): a TypeScript interface
  (`SpaceMcpPort`) for the exact operations the driver needs — `readState()`, `edit(goal)` +
  `editStatus(id)` polled to terminal, `run(startNodeId, mode)` + `runStatus(id)` polled to terminal,
  and `fetchCreations(ids)`. This is the seam the fake stands in for; the live adapter (worker slice)
  implements the same interface.
- **Add the Space driver deep module** (`src/space-driver/driver.ts`):
  - **`injectSpec(port, spec)`** — injects the Production Spec into the `JSON Master` text node via the
    **Fallback Protocol** (a natural-language `edit`), polls the edit to terminal, then **reads back**
    the node and confirms the text changed. Returns the new node text on success; an identifiable
    failure otherwise.
  - **`runRunPoint(port, startNodeId, mode)`** — starts a `spaces_run` at the resolved node ID in the
    given mode, polls `runStatus` to terminal, and returns the run's terminal result (which nodes fired
    and which creations were produced). On a missing/stale run-point (the run reports the start node is
    gone/stale, or the start ID cannot be found) it returns an identifiable failure so the caller can
    invoke the Fallback Protocol.
  - **`fetchCast(port, creationIds)`** — resolves Cast creation identifiers to their image URLs.
  - **`composeAndCast(port, spaceState, spec)`** — the Phase-A orchestrator: resolve the cast run-point
    from the parsed Execution Protocol (the run-point whose `gate === "cast"`, via the existing
    `parse()` from `src/execution-protocol/parse.ts`), inject the Spec, run that run-point `downstream`,
    fetch the Cast URLs, and return them. **Recovery:** if the named cast run-point cannot be resolved
    (parse fails to find it) or the run reports it missing/stale, it **falls back to the in-canvas
    agent** (a natural-language run-by-goal `edit`) rather than hard-failing.
- **Add the Magnific fake** (`src/space-driver/fixtures/fake-space.ts`): a `FakeSpace` implementing
  `SpaceMcpPort`, composed from the existing `fakeSpaceState()`. It models a successful inject + readback
  showing changed `JSON Master` text; a `downstream` cast run that fires exactly the **6 Cast-phase
  nodes** and yields **6 Cast creations** while firing **no** clip/video nodes (Spike 2); and a
  missing/stale run-point variant that makes the run report the start node gone, exercising recovery via
  the agent fallback. It records the goals/edits issued so tests can assert the Fallback Protocol was
  used. No network, no credits, no live Space.
- **Extend the ledger writer** (`src/ledger/ledger.ts`): add a pure `applyIdeaCast(ideas, ideaId, cast)`
  and a thin `writeIdeaCast(ideaId, cast, options)` shell that records the candidate Cast
  identifiers/URLs into the Idea's new `cast` field (ADR-0003). The Phase-A completion writes both the
  `casting` status (via the existing `writeIdeaStatus` from the prior slice) and the `cast` field, so the
  ledger stays the source of truth.
- **Tests** (`src/space-driver/driver.test.ts`, additions to `src/ledger/ledger.test.ts`) — inject +
  readback confirms changed text; the cast run yields the Cast AND fires no clip/video nodes; the Cast
  URLs surface and the Idea transitions `accepted → casting` with `ledger.cast` populated; a
  missing/stale run-point falls back to the in-canvas agent rather than hard-failing; and each of
  `injectSpec` / `runRunPoint` / `fetchCast` is unit-tested against the faked MCP boundary (issue the
  right edit + verify; poll a run to terminal; return the expected creations).

## Capabilities

### Added Capabilities

- `cast-render`: the Producer's **Space driver** for **Phase A — Compose & Cast** (ADR-0003): inject the
  validated Production Spec into the `JSON Master` node via the Fallback Protocol and confirm the change
  by readback; run the cast run-point `downstream`, which stops cleanly at the Cast (no clip/video nodes
  fire); surface the candidate Cast image URLs to the Operator; transition the Idea `accepted → casting`
  with `ledger.cast` populated; and recover via the in-canvas agent (Fallback Protocol) when the named
  cast run-point is missing/stale rather than hard-failing. Phase B (pin the Character, render the
  Asset) is a later slice.

## Impact

- **New code:** `src/space-driver/port.ts`, `src/space-driver/driver.ts`,
  `src/space-driver/fixtures/fake-space.ts`, `src/space-driver/driver.test.ts`; additions to
  `src/ledger/ledger.ts` (pure `applyIdeaCast` + thin `writeIdeaCast`) and `src/ledger/ledger.test.ts`.
- **Reuses, does not duplicate:** the Execution Protocol parser (`src/execution-protocol/parse.ts`),
  the existing fake `spaces_state` (`src/execution-protocol/fixtures/space-state.ts`), the Production
  Spec contract (`src/production-spec/contract.ts`) and its valid-spec fixture, and the ledger
  status-write shell (`src/ledger/ledger.ts`).
- **No new dependencies.** The ledger Idea record gains a `cast` field on disk; `data/queue.json`'s
  shape is unchanged (the queue→ledger status reflection from the prior slice still applies).
- **Hermetic / no live Space:** no `spaces_*`/`creations_*` calls, no credits, no board mutation, no
  network. The driver depends only on the injected `SpaceMcpPort`; tests supply the **Magnific fake**.
  The live adapter is deferred to the worker slice.
- **Always-rules upheld:** **generate-never-publish** — the slice renders candidate Cast images and
  **pauses for a human** (it never posts to Facebook; publication stays a human act). **Ledger-as-
  source-of-truth** — the `accepted → casting` status and the `cast` field are written to
  `data/ledger.json` from the Phase-A completion, never inferred. Public-metrics-only,
  relative-not-absolute, and explicit-attribution are n/a in this slice (no metrics, no scoring, no
  Post↔Idea linkage). Nothing is fabricated — a missing/stale run-point recovers via the documented
  Fallback Protocol rather than inventing a Cast.
