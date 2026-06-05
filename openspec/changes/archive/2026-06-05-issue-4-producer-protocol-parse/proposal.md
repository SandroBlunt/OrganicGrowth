## Why

Slice 1 stood up the runtime and auto-enqueues accepted Ideas; Slice 2 turns a Brief into a strict
**Production Spec**. To actually *drive* the Magnific Space, the Producer must know HOW to run it —
which node to run, in which mode, and where the human **Cast** gate sits. ADR-0003 decided the Space is
self-describing about this: it carries its own **Execution Protocol** in a `Producer Protocol` text
node, and the Producer reads that protocol at run time. This makes the same thin runner able to drive
any Space that follows the convention (PRD #1 stories 23-25, 31).

This slice delivers the **`execution-protocol`** capability's first half: the canonical `Producer
Protocol` artifact and a pure `parse(spaceState) → runPoints[]` that reads it, resolves each run-point's
by-**name** reference to a concrete node on the Space, and **rejects** a run-point that points at a
non-uniquely-named node (the Space has duplicate names elsewhere; only uniquely-named nodes are valid
run-points).

**Two constraints from the spikes/ADR are load-bearing:**

- **By-name, never by-ID (ADR-0003).** Run-points name their target node (e.g. "Character Variants
  Generator", "Clip extractor"). The parser resolves a name to whatever ID *this* Space uses, so the
  runner generalizes and never hard-codes a node ID. The discipline's cost: a run-point must point at a
  uniquely-named node, and the parser enforces that.
- **Read-API truncation (Spike 3).** The Magnific read API truncates text nodes at ~1,900 chars. A
  larger `Producer Protocol` node would silently lose run-points on read, so the canonical protocol is
  kept compact and a test proves its serialized size stays comfortably under the cap.

**Hermetic build (no live Space).** The parser is pure and is driven entirely through a **fake
`spaces_state`** fixture at the MCP read boundary — no `spaces_*`/`creations_*` calls, no credits, no
board mutation. Authoring the `Producer Protocol` node onto the *live* canvas is a runtime act, deferred
out of this build; the committed canonical artifact is the single source of truth for what that node
must contain, and the size-under-cap round-trip is proven by assertion against the fake.

## What Changes

- **Author the canonical Execution Protocol artifact in code** (`src/execution-protocol/protocol.ts`) —
  types for a run-point `{ start, mode, gate }` and the protocol document, the `Producer Protocol` node
  name, the read-API truncation cap + a tighter size budget, and `canonicalProtocol()`: two ordered
  run-points (cast: "Character Variants Generator" downstream → **Cast gate**; clip: "Clip extractor"
  downstream) plus `serializeProtocol()`. Node names come from the verified inventory in
  `docs/producer-spikes-results.md`.
- **Add a pure `parse(spaceState) → ParseResult` deep module** (`src/execution-protocol/parse.ts`) that
  locates the `Producer Protocol` node by name, parses its JSON, validates each run-point's shape /
  mode / gate, resolves each by-name `start` reference to a node ID **on the given state**, and rejects
  a run-point that resolves to zero nodes (`run_point_unresolved`) or more than one
  (`run_point_ambiguous`). It hard-codes no run-point node IDs. Every failure is a `{ code, message }`,
  mirroring `production-spec/validate.ts`.
- **Add the Magnific FAKE** (`src/execution-protocol/fixtures/space-state.ts`) — a synthetic
  `spaces_state` with the `Producer Protocol` node, uniquely-named run-point targets, and
  duplicate-named nodes elsewhere (two "Character #2" creation nodes), plus broken variants
  (duplicate-named run-point, missing-named run-point, no protocol node).
- **Tests** (`protocol.test.ts`, `parse.test.ts`) — protocol content + read-API size round-trip;
  correct resolution, gate parsing, by-name (not by-ID) resolution, duplicate-name rejection,
  unresolved-name rejection, malformed-protocol failures, and field validation.

This slice reads JSON and resolves names. It has **no live Magnific Space interaction** — the parser is
pure and tests run against the fake. Driving the resolved run-points (the Space-driver shell, the
Fallback Protocol) is a later slice.

## Capabilities

### New Capabilities

- `execution-protocol`: authoring the Space's on-canvas `Producer Protocol` artifact (kept under the
  read-API truncation cap) and parsing the Execution Protocol — resolving each run-point's by-name
  reference to a node, parsing the Cast gate, and rejecting run-points that point at non-uniquely-named
  nodes — so the same thin runner generalizes across conforming Spaces.

## Impact

- **New code:** `src/execution-protocol/` — `protocol.ts`, `parse.ts`, `fixtures/space-state.ts`, plus
  `protocol.test.ts` and `parse.test.ts`.
- **No new dependencies.** No new state files (the protocol lives on the Space; the artifact is code).
- **No external calls:** no Magnific (the fake stands in) and no Apify; the build stays hermetic.
- **Always-rules upheld:** the Producer generates, never publishes — this slice only reads/parses a
  protocol, it never posts and never mutates the board; the canonical artifact and parser stay faithful
  to ADR-0003 and CONTEXT.md "Execution Protocol".
