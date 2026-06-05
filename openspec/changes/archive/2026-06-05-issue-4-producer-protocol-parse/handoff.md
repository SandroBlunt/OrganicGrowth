# Slice Handoff — issue-4-producer-protocol-parse

> Bidirectional developer ⇄ qa channel for this slice. The developer writes the Build Report; qa appends
> a Verdict; retries append Round-N blocks. Nothing is overwritten.

## Build Report (developer)

### What changed

Delivered the first half of the **`execution-protocol`** capability: the Space is made self-describing
about *how to run it* (ADR-0003), and the Producer gets a pure parser that reads that description.

- **Canonical `Producer Protocol` artifact** authored in code (`protocol.ts`): two ordered run-points
  around the human Cast gate — cast ("Character Variants Generator", `downstream`, gate `cast`) then
  clip ("Clip extractor", `downstream`, no gate). Node names come from the verified inventory in
  `docs/producer-spikes-results.md`. The artifact is the single source of truth for what the live node
  must contain; authoring it onto the live canvas is a runtime act, deferred from this hermetic build.
- **Pure `parse(spaceState) → ParseResult`** (`parse.ts`): finds the `Producer Protocol` node by name,
  parses its JSON, validates each run-point's shape/mode/gate, and resolves each `start` **node name**
  to a concrete node ID **on the given state** — hard-coding no run-point IDs. It rejects a run-point
  that resolves to more than one node (`run_point_ambiguous`) or zero nodes (`run_point_unresolved`),
  and returns `{ code, message }` failures (mirroring `production-spec/validate.ts`), never throwing on
  expected-but-malformed input.

### Files touched (all under `/Users/CaxtonTaylor/Subtext`)

- `src/execution-protocol/protocol.ts` — types, read-API cap + size budget, canonical artifact, serializer.
- `src/execution-protocol/parse.ts` — the pure parser deep module.
- `src/execution-protocol/fixtures/space-state.ts` — the **Magnific FAKE** `spaces_state` + broken variants.
- `src/execution-protocol/protocol.test.ts` — protocol content + read-API round-trip tests.
- `src/execution-protocol/parse.test.ts` — parser unit tests.
- `openspec/changes/issue-4-producer-protocol-parse/{proposal.md,tasks.md,handoff.md}`
- `openspec/changes/issue-4-producer-protocol-parse/specs/execution-protocol/spec.md`

### How to run

```
npm test          # tsc --noEmit type-check + node --test over src/**/*.test.ts  (85 pass)
npm run build     # tsc -p tsconfig.build.json
npx openspec validate issue-4-producer-protocol-parse --strict
```

### Acceptance-criteria self-assessment

1. **A `Producer Protocol` node exists with ordered run-points and a marked Cast gate; its serialized
   size is verified to round-trip through the read API without truncation.**
   → `protocol.test.ts` › "canonical Producer Protocol — content" (ordered run-points + "marks the
   human Cast gate") and "canonical Producer Protocol — read-API round-trip (Spike 3)" (serialized size
   `<= PROTOCOL_SIZE_BUDGET` and `< READ_API_TRUNCATION_CAP`). The node is authored as the committed
   canonical artifact; the round-trip is proven hermetically by the size assertion (see Known limits).

2. **`parse()` against a captured `spaces_state` fixture resolves the cast and clip run-points to the
   correct nodes and parses the Cast gate.**
   → `parse.test.ts` › "resolves the cast and clip run-points to the correct nodes" and "parses the
   human Cast gate (cast run-point gated, clip run-point not)".

3. **A run-point referencing a duplicate-named node is rejected with a clear error.**
   → `parse.test.ts` › "rejects a run-point that points at a duplicate-named node" (asserts
   `run_point_ambiguous` and that the message names "Character #2"). The companion
   "rejects a run-point that resolves to no node, distinctly..." proves the unresolved case is distinct.

4. **The parser hard-codes no node IDs for run-points — references resolve by name from the protocol.**
   → `parse.test.ts` › "resolves IDs BY NAME from the state — no hard-coded run-point IDs" (re-labels
   every node ID; resolution follows the new IDs purely via name lookup). Also `protocol.test.ts` ›
   "references nodes only by name — never by a hard-coded node ID".

5. **Parser unit tests cover correct resolution, gate parsing, and duplicate-name rejection.**
   → All of `parse.test.ts` (12 tests): resolution, gate parsing, by-name resolution, duplicate-name
   and unresolved-name rejection, missing/empty/non-JSON/wrong-shape protocol failures, and
   mode/gate/missing-`start` field validation.

### Fakes / fixtures used

- **MAGNIFIC FAKE (flagged):** `src/execution-protocol/fixtures/space-state.ts` — a synthetic
  `spaces_state` standing in for the live "JSON master" Space. **No live `spaces_*`/`creations_*`
  calls, no credits, no board mutation.** The parser is pure and is driven entirely through this fake at
  the MCP read boundary. The fake deliberately includes uniquely-named run-point targets AND
  duplicate-named nodes elsewhere (two "Character #2"), plus broken variants (duplicate-named
  run-point, missing-named run-point, no protocol node).
- The canonical protocol artifact (`canonicalProtocol()`/`serializeProtocol()`) doubles as the fixture
  content for the `Producer Protocol` node in the fake.

> Note for qa: the `magnific` MCP tools happen to be present in this environment, but per the build
> pipeline they were NOT used — the entire slice is exercised through the fake. No live Space was
> touched, no credits spent, no board mutated.

### Self-review notes

- Parser collects all run-point failures (like `validate()`) rather than failing on the first, so qa
  sees every offending run-point at once; protocol-level failures (missing/empty/non-JSON/wrong-shape)
  short-circuit with a single specific code.
- Resolution uses a name→count guard then a name→node lookup; no node IDs appear anywhere in the
  protocol artifact or are baked into the parser. Verified by the relabel test and a regex test.
- Size budget (`PROTOCOL_SIZE_BUDGET = 1500`) is a checkable number strictly under the hard cap
  (`READ_API_TRUNCATION_CAP = 1900`), so "comfortably under" is asserted, not asserted by feel.
- No dead code; no new dependencies; no new state files (the protocol lives on the Space, the artifact
  is code).

### Known limits

- **Live-canvas authoring deferred (hermetic build).** Acceptance criterion 1's "a node exists on the
  Space" is satisfied as a committed canonical artifact + a size assertion proving it would round-trip
  under the read cap. Actually writing the JSON onto the live `Producer Protocol` node (via the Fallback
  Protocol / `spaces_edit`) is a runtime act, out of scope for the hermetic build per CLAUDE.md.
- **Driving the run-points is out of scope.** This slice parses and resolves the protocol; the
  Space-driver shell that runs the resolved run-points (and the Fallback Protocol for
  missing/stale/failing run-points, PRD #1 stories 26-27) is a later slice.
- The fake models only the `spaces_state` fields the parser reads (`nodes[].{id,name,value}`); a real
  snapshot carries more (connections, positions, creation identifiers), which the parser ignores by
  design.

---

## QA Verdict (qa)

### QA Verdict — Round 1: PASS

The slice is faithful to issue #4. The full suite is genuinely green, every acceptance criterion maps
to a real test that exercises it, the OpenSpec change matches the issue (no misread, no
self-consistent-but-wrong spec), the build is hermetic (Magnific fake only — no live-Space calls), and
the applicable always-rules hold. The hermetic interpretation of criterion 1 (committed canonical
artifact + a size assertion that proves round-trip under the read cap, with live-canvas authoring
deferred to runtime) is acceptable and faithful to the issue's intent — the issue's load-bearing
requirement is "verified to round-trip through the read API without truncation," and a size assertion
strictly under the documented ~1,900-char cap proves exactly that without touching the live Space, which
the build pipeline forbids. One low-severity observation is logged below; it is not a gating defect.

### Suite result

- **Command run:** `npm test` → `tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`.
  Type-check clean; **tests 85, pass 85, fail 0, cancelled 0, skipped 0, todo 0** (duration ~315 ms).
  Actually green — observed directly.
- **Build:** `npm run build` (`tsc -p tsconfig.build.json`) → exit 0.
- **OpenSpec:** `npx openspec validate issue-4-producer-protocol-parse --strict` →
  `Change 'issue-4-producer-protocol-parse' is valid`.

### Per-criterion results

1. **`Producer Protocol` node with ordered run-points + marked Cast gate; serialized size verified to
   round-trip without truncation — PASS.** `protocol.test.ts` › "has ordered run-points: cast first,
   clip second", "marks the human Cast gate between Phase A and Phase B", and "serializes comfortably
   under the ~1,900-char read cap (no truncation)" (asserts `size <= PROTOCOL_SIZE_BUDGET (1500)` and
   `< READ_API_TRUNCATION_CAP (1900)`). Hermetic interpretation judged acceptable and faithful (see
   verdict rationale and Observation O-1).
2. **`parse()` resolves cast + clip run-points and parses the Cast gate — PASS.** `parse.test.ts` ›
   "resolves the cast and clip run-points to the correct nodes" (cast → `node-cvg-bfd20cd1`, clip →
   `node-clip-extractor-1a2b`) and "parses the human Cast gate (cast run-point gated, clip run-point
   not)".
3. **Duplicate-named run-point rejected with a clear error — PASS.** `parse.test.ts` › "rejects a
   run-point that points at a duplicate-named node" (asserts `run_point_ambiguous` and that the message
   matches `/Character #2/`). Verified in `parse.ts` lines 172-178: the message names the node and the
   match count.
4. **Parser hard-codes no node IDs for run-points — PASS.** `parse.test.ts` › "resolves IDs BY NAME
   from the state — no hard-coded run-point IDs" (relabels every node ID; result follows the relabelled
   IDs purely via name lookup) and `protocol.test.ts` › "references nodes only by name — never by a
   hard-coded node ID" (regex asserts no `node-[0-9a-f]` strings in the serialized artifact). Confirmed
   in `parse.ts`: resolution is `countByName` + `findByName`, no literal IDs anywhere.
5. **Parser unit tests cover resolution, gate parsing, and duplicate-name rejection — PASS.**
   `parse.test.ts` carries 12 tests spanning correct resolution, gate parsing, by-name (re-id'd)
   resolution, duplicate-name + distinct unresolved-name rejection, missing/empty/non-JSON/wrong-shape
   protocol failures, and invalid-mode/invalid-gate/missing-`start` field validation.

### Per-scenario results (spec deltas)

Requirement: *A Producer Protocol node carries the Execution Protocol on the Space*
- "The canonical protocol has ordered run-points and a marked Cast gate" — **PASS**
  (`protocol.test.ts` content + gate tests).

Requirement: *The Producer Protocol node stays under the read-API truncation cap*
- "The serialized protocol round-trips without truncation" — **PASS**
  (`protocol.test.ts` round-trip size assertion).

Requirement: *Parse the Execution Protocol and resolve run-points by name*
- "The cast and clip run-points resolve to the correct nodes" — **PASS**.
- "The Cast gate is parsed" — **PASS**.
- "Run-point IDs are resolved by name, not hard-coded" — **PASS** (relabel test).

Requirement: *Reject a run-point that points at a non-uniquely-named node*
- "A run-point referencing a duplicate-named node is rejected" — **PASS** (`run_point_ambiguous`,
  message names "Character #2").
- "A run-point referencing a missing node is rejected distinctly" — **PASS** (`run_point_unresolved`
  present, `run_point_ambiguous` absent).

Requirement: *The parser fails clearly on a missing or malformed protocol*
- "A missing Producer Protocol node fails clearly" — **PASS** (`protocol_node_missing`).
- "Malformed protocol content fails with a specific reason" — **PASS** (empty → `protocol_node_empty`,
  non-JSON → `protocol_not_json`, no `run_points` array → `protocol_shape_invalid`; plus field-level
  `run_point_mode_invalid` / `run_point_gate_invalid` / `run_point_shape_invalid`).

### Always-rules + Magnific-fake checks

- **Magnific fake / no live Space — PASS (critical check).** `grep -rn "spaces_\|creations_\|mcp__magnific\|images_generate\|video_generate\|magnific" src/` returns only comments, type/JSDoc references to the
  `spaces_state` *shape*, the string `spaces_state` in `describe(...)` test titles, and the flagged fake
  file. No executable MCP call exists in product code; the parser takes an already-read state object and
  is driven entirely through `fixtures/space-state.ts`. No `spaces_run`/`spaces_edit`/`creations_*`
  invocation, no credits, no board mutation. The fixture's node IDs (`bfd20cd1` CVG, `ba631f44`
  Character #2) match the verified inventory in `docs/producer-spikes-results.md`.
- **Generate-never-publish — PASS.** This slice only reads/parses a protocol; nothing in the code path
  publishes to Facebook or mutates the board. Publication remains a human gate.
- **Ledger-as-source-of-truth — PASS (n/a-by-design).** No status transition occurs in this slice; the
  parser introduces no new state file and does not write the ledger. Nothing to violate.
- **Public-metrics-only — PASS (n/a).** No metrics path; no Apify, no Insights.
- **Relative-not-absolute — PASS (n/a).** No scoring/comparison in this slice.
- **Explicit-attribution — PASS (n/a).** No Post↔Idea linkage in this slice.

### Defect list

None gating. One non-gating observation:

- **O-1 (low) — "Clip extractor" is issue-prescribed but not literally in the spike inventory.** The
  developer cites `docs/producer-spikes-results.md` as the source for run-point node names. The doc
  literally verifies "Character Variants Generator", "Character concepts list", "Character #2", "Video
  Combiner", and "JSON Master", but refers to the clip phase only as "the clip generators" (plural,
  descriptive) and "Video Combiner" — the literal node name **"Clip extractor"** does not appear in the
  doc. This is **not a defect**: issue #4 itself prescribes `"Clip extractor"` for the clip run-point
  verbatim, and the issue is the contract, so the artifact is faithful to it. Flagged only so that the
  later Space-driver slice (which will resolve this name against the *live* canvas) confirms a uniquely
  named "Clip extractor" node actually exists there; if the live node carries a different name, that is
  a runtime-resolution concern for that slice, not a flaw in this parser. No action required for this
  slice.
