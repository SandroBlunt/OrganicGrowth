## Why

The prior slice built **Phase A — Compose & Cast** (ADR-0003): the Producer injects the Production Spec,
runs the **cast** run-point, surfaces the candidate **Cast** image URLs, and pauses at the human Cast
gate (`accepted → casting`). What is still missing is the second half of production: **Phase B —
Render** (ADR-0003). Once the Operator picks the **Character** at the Cast gate, the Producer must resume
*unattended* — pin the chosen Character into the Space, run the **clip** run-point to a single combined
**Asset**, then persist and link that Asset on the Idea (`casting → produced`). The Asset then waits for
the Operator to publish it; the Producer **never publishes** (generate-never-publish; ADR-0002).

ADR-0003 names the two state mutations the run API cannot do directly — injecting the Spec (Phase A) and
**pinning the chosen `Character` creation node** (Phase B) — as the **Fallback Protocol**: a natural-
language `spaces_edit` delegated to the Space's in-canvas agent. Spike 1 confirmed `spaces_edit` re-pins
a creation node with a readback that matches, so the same transport that injected the Spec pins the
Character. ADR-0003's two-phase split puts the human Character pin as the natural cut between Phase A and
Phase B: the clip generators take their reference from the manually-pinned `Character` creation node, so
once it is pinned the clip run-point renders the whole chain (clip → Video Combiner → Final Output)
with no further Operator input.

This slice **extends** the Phase-A Space driver (`src/space-driver/driver.ts`) with the Phase-B
operations — `pinCharacter`, the clip `runRunPoint` usage, and `fetchAsset` — and a `pickAndRender`
orchestrator; adds the `/pick-cast` command shell; and adds the ledger writers for the Asset fields
(`character`, `asset_url`, `produced_at`). The real adapter that calls the live Magnific MCP tools is
still deferred to the worker slice; nothing here touches the live Space.

**Hermetic build (no live Space).** Per CLAUDE.md's build pipeline and `project.md`, the driver depends
only on the **narrow injected `SpaceMcpPort`** from the prior slice — the same five operations
(read state, natural-language `edit` + poll `editStatus`, `run` + poll `runStatus`, `fetchCreations`).
The Phase-B operations fit that existing port without extending it: pinning a creation node is an `edit`
(the Fallback Protocol's transport); running the clip run-point is `run` + `runStatus`; fetching the
finished Asset is `fetchCreations`. Tests pass the **FAKE** implementing the port (the Magnific fake),
extended to model the Character pin (with a readback that confirms the chosen node is pinned) and the
clip-render chain that yields one Asset. There are **no** live `spaces_*`/`creations_*` calls, no
credits, no board mutation, and no network anywhere in the slice or its tests.

## What Changes

- **Extend the Space driver** (`src/space-driver/driver.ts`) with Phase-B operations, reusing the
  existing `runRunPoint`/`fetchCreations` primitives, the `parse()`-based run-point resolution, the
  polling helpers, and the `{ ok, error: { code, message } }` Result convention:
  - **`pinCharacter(port, character)`** — pin the Operator's chosen **Character** (a Cast candidate
    identifier) into the Space via the **Fallback Protocol** (a natural-language `edit`), poll the edit
    to terminal, then **read back** the Space and confirm the chosen `Character` creation node is pinned.
    Returns confirmation on success; an identifiable failure (`pin_edit_failed` / `pin_unconfirmed`)
    otherwise. Mirrors `injectSpec`'s edit→poll→readback shape.
  - **clip `runRunPoint`** — the existing `runRunPoint` primitive is reused to drive the **clip**
    run-point (`Clip extractor`, mode `downstream`) so the clip → Video Combiner → Final Output chain
    fires to one combined Asset. The clip run-point is resolved by **name** from the parsed Execution
    Protocol (the run-point that is **not** the Cast gate — `gate: null`), never hard-coded.
  - **`fetchAsset(port, creationId)`** — resolve the finished Asset's creation identifier to its media
    URL (reuses `fetchCreations`).
  - **`pickAndRender(port, spaceState, character)`** — the Phase-B orchestrator: pin the chosen
    Character → resolve the clip run-point from the parsed Execution Protocol → run it `downstream` →
    fetch the finished Asset URL. Returns the Asset (its identifier + URL) on success, an identifiable
    failure otherwise. It renders to the Asset and **stops** — it never publishes.
- **Extend the Magnific fake** (`src/space-driver/fixtures/fake-space.ts`) with a Phase-B-capable mode,
  composing the existing `fakeSpaceState()` (which already contains `Clip extractor`, `Video Combiner`,
  `Final Output`, and the duplicate `Character #2` nodes). It models: a Character-pin `edit` whose
  readback confirms the chosen `Character` creation node is pinned (and records the pin goal so a test
  can assert the Fallback Protocol was used); a `downstream` clip run started at `Clip extractor` that
  fires the clip → Video Combiner → Final Output chain and yields **one** final Asset creation; and the
  fetch of that Asset's URL. No network, no credits, no live Space.
- **Add the `/pick-cast` command shell** (`src/commands/pick-cast.ts`) — a thin orchestration shell
  mirroring `src/commands/queue.ts`: a testable `pickCastCommand(...)` returning a string plus an
  `import.meta.url`-guarded `main()`. It selects the **nth** Cast member (1-based `<n>`, per the issue)
  from the Idea's `ledger.cast`, which is the **Character** to pin; the chosen candidate's identifier is
  pinned by the driver. Adds a `"pick-cast"` script to `package.json` mirroring `"queue"`.
- **Extend the ledger writer** (`src/ledger/ledger.ts`) — add a pure
  `applyIdeaAsset(ideas, ideaId, asset)` and a thin `writeIdeaAsset(ideaId, asset, options)` shell that
  records `character`, `asset_url`, and `produced_at` onto the Idea record (ADR-0003), mirroring
  `applyIdeaCast`/`writeIdeaCast` exactly. The `produced_at` timestamp is **injected** (never read from
  the clock inside the pure function — like `enqueue(state, ideaId, now)`). The existing
  `ledgerStatusForTransition` already maps a `render`-phase job reaching `done` ⇒ `produced`; that
  mapping is **reused**, not duplicated, so the `casting → produced` status is derived from the queue
  transition, never inferred.
- **Tests** (`src/space-driver/driver.test.ts`, `src/commands/pick-cast.test.ts`, additions to
  `src/ledger/ledger.test.ts`) — pin the Character and confirm by readback; the clip run renders the
  Asset chain to one Asset; the Asset URL surfaces and the Idea gains `character`/`asset_url`/
  `produced_at` and transitions `casting → produced`; the Producer publishes nothing (no publish path);
  `/pick-cast` selects the nth Cast member as the Character; and `pinCharacter` / clip `runRunPoint` /
  `fetchAsset` are each unit-tested against the faked MCP boundary.

## Capabilities

### Modified Capabilities

- `cast-render`: **adds Phase B — Render** (ADR-0003) to the Producer's Space driver. On the Operator's
  Character pick, the driver pins the chosen **Character** into the Space via the Fallback Protocol with
  readback confirmation; runs the **clip** run-point `downstream` so the clip → Video Combiner → Final
  Output chain renders **unattended** to one combined **Asset**; fetches and persists that Asset; and
  transitions the Idea `casting → produced` with `character`, `asset_url`, and `produced_at` written to
  the ledger. The Producer **publishes nothing** — the Asset waits for the Operator (generate-never-
  publish). Phase A (inject the Spec, run the cast, surface the Cast, pause at the Cast gate) is
  unchanged from the prior slice.

## Impact

- **New code:** `src/commands/pick-cast.ts`, `src/commands/pick-cast.test.ts`; additions to
  `src/space-driver/driver.ts` (`pinCharacter`, `fetchAsset`, `pickAndRender` + helpers),
  `src/space-driver/fixtures/fake-space.ts` (Phase-B fake mode), `src/space-driver/driver.test.ts`
  (Phase-B tests), `src/ledger/ledger.ts` (pure `applyIdeaAsset` + thin `writeIdeaAsset`),
  `src/ledger/ledger.test.ts` (Asset-field tests), and a `"pick-cast"` script in `package.json`.
- **Reuses, does not duplicate:** the narrow `SpaceMcpPort` and the Phase-A primitives
  (`runRunPoint`, `fetchCreations`, the polling helpers, `parse()`-based run-point resolution); the
  Execution Protocol parser (`src/execution-protocol/parse.ts`) and the canonical protocol's clip
  run-point; the existing fake `spaces_state` (`src/execution-protocol/fixtures/space-state.ts`), which
  already carries `Clip extractor`, `Video Combiner`, `Final Output`, and the duplicate `Character #2`
  nodes; the ledger's `ledgerStatusForTransition` (`render → done ⇒ produced`) and the
  `applyIdeaCast`/`writeIdeaCast` shape; the `/queue` command shell as the `/pick-cast` template.
- **No new dependencies.** No change to the `SpaceMcpPort` interface (the Phase-B operations fit the
  existing five methods). The ledger Idea record gains `character`, `asset_url`, `produced_at` on disk;
  `data/queue.json`'s shape is unchanged.
- **Hermetic / no live Space:** no `spaces_*`/`creations_*` calls, no credits, no board mutation, no
  network. The driver depends only on the injected `SpaceMcpPort`; tests supply the **Magnific fake**.
  The live adapter is deferred to the worker slice.
- **Always-rules upheld:** **generate-never-publish** — Phase B renders the **Asset** and **stops**;
  there is **no** publish/Facebook/post action anywhere in the driver or the command (publication stays
  a human act; ADR-0002). **Ledger-as-source-of-truth** — `character`, `asset_url`, `produced_at`, and
  the `casting → produced` status are written to `data/ledger.json` from the render completion, never
  inferred (the status is derived from the queue's `render → done` transition; `produced_at` is an
  injected ISO-8601 timestamp). Public-metrics-only, relative-not-absolute, and explicit-attribution are
  n/a in this slice (no metrics, no scoring, no Post↔Idea linkage — `post_url` is untouched). Nothing is
  fabricated — an unconfirmed pin or a failed render returns an identifiable failure rather than
  inventing an Asset.
