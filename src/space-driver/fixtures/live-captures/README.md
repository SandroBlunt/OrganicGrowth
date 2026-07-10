# Live Magnific Space captures — record/replay fixtures (issue #40)

One-time **sanctioned live capture** of the real `magnific` MCP responses, recorded so the live
`SpaceMcpPort` adapter can be built and contract-tested against **real shapes, not invented ones**
(issue #40; parent epic #39; audit design-tension #4). The `developer` agent has no Magnific MCP tools
by design, so these files are the only source of ground truth for the adapter's parsing.

- **Space:** "Organic Character Explainer" (`a1f05d67-1b98-4d10-9251-6603bea3b578`), 58 nodes,
  single-concurrency — the same cast→clips studio as the June feasibility spike
  (`docs/producer-spikes-results.md`).
- **Captured:** 2026-07-10, one cast `spaces_run` (375 credits) + one `spaces_edit` inject, plus
  read-only reads. Everything else is read-only.
- **Secrets:** none. All signed media URLs (`token=exp=…~hmac=…`) are replaced with `token=REDACTED`
  (they are time-limited access links that expire anyway). No `.env`, no API token, no credits burned
  in CI — these are static files.

## Port ↔ MCP tool ↔ fixture map

The adapter implements `src/space-driver/port.ts::SpaceMcpPort`. Each method maps to one or two MCP
tools; here is the real response for each:

| Port method | MCP tool(s) | Fixture | How to derive the port's fields |
|---|---|---|---|
| `readState()` | `spaces_state` (whole board) / `spaces_get_nodes` (scoped) | `01-spaces_state.board.txt`, `02-spaces_get_nodes.keynodes.txt` | TOON, not JSON. Parse `nodes[…]` (id, name, type) + `nodeData[…]` (per-node key/value). A node's `value` = its `text` key (text node) or `creationIdentifier`/`currentCreationIdentifier` key (creation/generator node). |
| `run(startNodeId, mode)` | `spaces_run` | `04-spaces_run.start.json` | JSON. Run id is `workflowRunIdentifier` (NOT `runId`). `status:"pending"`. |
| `runStatus(runId)` | `spaces_run_status` | `05-…running.json`, `06-…terminal.json` | JSON. Terminal ⇔ `allTerminal:true`. `firedNodeNames` ← map each `nodeRuns[].nodeId` → name via a board read. `creationIds` ← top-level `creationIdentifiers` (or union of the phase nodes' `creationIdentifiers`). `poll_after_seconds` present while running. |
| `edit(goal)` | `spaces_edit` | `09-spaces_edit.start.json` | JSON. Edit id is `operationId` (NOT `editId`). Poll with `operationId`. `poll_after_seconds:10`. |
| `editStatus(editId)` | `spaces_edit_status` | `10-…terminal.json` | JSON. Terminal ⇔ `allTerminal:true`; success ⇔ `workflowStatus:"success"`. Verify the effect with a board read (`11-…after-inject.txt`). |
| `fetchCreations(ids)` | `creations_get` (one id at a time) | `07-…image.txt`, `08-…video.txt` | Key/value (TOON-ish), not JSON. `identifier` + `url`. **`url` is a signed URL that expires — fetch fresh, never persist.** Video creations add `kind:"video"` and a `metadata.mediaCollection[]` (video + start/end frame + audio). |
| `verifyPinned(character)` | `spaces_state` / `spaces_get_nodes` | (in `01`/`02`) | Read the **"Selected Character"** creation node (`ba631f44…`); its `creationIdentifier` value IS the pinned Character. `verifyPinned(c)` ⇔ that value `=== c`. **Not** a `PINNED:` marker — that is the fake's own convention. |
| render output (Asset) | — | `08-creations_get.video.txt` | The finished Asset is the **Video Combiner** node's output creation (node `26aaee96…`, `currentCreationIdentifier`). `08` is a real finished-Asset example. |
| cost preflight | `simulate_spaces` | `03-simulate_spaces.cast.json` | Read-only cost estimate; the cast run = 375 credits (Nano Banana 225 + Seedream 150). |
| full board (reference) | `spaces_show` | `00-spaces_show.fullboard.json` | JSON, machine-exact (authoritative node inventory + connections). Bigger + different shape than `spaces_state`; the adapter calls `spaces_state`/`spaces_get_nodes`, not this — kept as the reference inventory. |

## Gotchas the adapter MUST handle (this is why we captured live)

1. **~1,900-char read truncation is real.** In `02`, the `JSON Master` text node's `value` is cut off
   mid-JSON (`"clip_id": 3,` then nothing). The read API truncates large text-node values. Do **not**
   assume a text node's full content is readable from the canvas. Mitigation (spike doc): the full
   contract lives at a linked Google-Doc URL; keep injected/protocol nodes compact. The `Producer
   Protocol` node (`909da70a…`) IS small enough to read whole — see next point.
2. **The board is the source of truth for run-points, via the `Producer Protocol` node.** Node
   `909da70a…` holds the canonical Execution Protocol JSON (steps: inject → run Character Variants
   Generator (downstream, wait_for the two lists) → gate cast → replace_image Selected Character →
   replace_text Watermark → run Clip extractor (downstream) → run Video Combiner (singular)), each step
   carrying the real `node_id`. The adapter should resolve run-points from THIS, not hardcode names.
   (Data note: its text begins with a stray `f{` — tolerate/strip leading junk before JSON-parsing.)
3. **Live node names have drifted from the fake's constants** — do not hardcode the fake's names:
   | Fake constant (`fake-space.ts`) | Live board | Node id |
   |---|---|---|
   | `Character #2` | **`Selected Character`** | `ba631f44…` |
   | `Nano Banana Style (3 imgs)` | `Nano Banana Style` | `acc945fc…` |
   | `Seedream Style (3 imgs)` | `Seedream Style` | `7a033f4f…` |
   | `Nano Banana list` / `Seedream list` | `List #4` / `List #3` | `b457204d…` / `7ab18bfd…` |
   | `Final Output` (creation node) | no such node — the Asset is the **Video Combiner** output; "FInal Output" is only a *panel* | `26aaee96…` (combiner) |
   | `JSON Master`, `Character Variants Generator`, `Clip extractor`, `Video Combiner` | same names ✅ | `6bc54e3e…`, `bfd20cd1…`, `77cb5df4…`, `26aaee96…` |
4. **`spaces_run_status` gives node *ids*; the port wants node *names*.** Map ids→names with a board
   read. The run also exposes both a top-level aggregated `creationIdentifiers` AND per-node
   `nodeRuns[].creationIdentifiers` — and the aggregated list's **order/contents differ between the
   running and terminal snapshots** (the 6th id `xgqtiBnjfW` only appears at terminal). Don't depend on
   order; wait for `allTerminal:true`.
5. **Two different id field names.** `spaces_run` → `workflowRunIdentifier`; `spaces_edit` →
   `operationId`. Poll each with its own id.
6. **Signed media URLs expire** (`token=exp=…`). Redacted here. `fetchCreations` must return a
   fresh `url` from a live `creations_get`; never cache one.
7. **Poll timing (ties to C10).** Honor `poll_after_seconds` (run: 3s; edit start: 10s) via the
   injected time-budget/backoff. The real cast took ~29s wall-clock (08:11:37 → 08:12:06); a full clip
   render is minutes — the backoff must not time out.
8. **Downstream stops cleanly at the Cast** (confirms Spike 2). `06` shows the cast run fired exactly
   the 6 cast-phase nodes (Character Variants Generator → Character concepts list → Nano Banana Style +
   Seedream Style → List #4 + List #3) and **zero** clip/video nodes.
9. **Permission gate (ties to slice #42).** Every live `spaces_run`/`spaces_edit` is auto-denied by the
   permission classifier as "modifying shared infrastructure" and needs explicit per-action approval —
   the unattended queue worker needs a permission path or it stalls.

## NOT captured (no silent caps — follow-up needed)

These shapes are part of the port contract but were **not** exercised live (cost/scope). The developer
must synthesize them from the success shapes above, or a second capture is needed:

- **Failure / recovery shapes:** a `spaces_run_status` with `status:"failed"` and the
  start-node-missing/stale case that drives `RunStatus.startNodeMissing` (the Fallback-Protocol trigger,
  ADR-0003), and a failed `spaces_edit_status`. Only success paths were captured.
- **A live end-to-end clip render** (the expensive Phase-B `spaces_run` at `Clip extractor` →
  Video Combiner). Skipped to save credits: the `spaces_run_status` shape is identical to the cast run
  (`06`), and a real finished-Asset creation shape is captured from an existing board video (`08`).
- **A live re-pin** of Selected Character (`replace_image` edit). Only the current pinned state was read
  (`ba631f44…` → `VdPHh9JMMU`); the inject edit (`09`/`10`) is the representative `spaces_edit` shape.

## Board state left behind (2026-07-10 capture)

- `JSON Master` (`6bc54e3e…`) overwritten with `{"capture":"ISSUE40-INJECT",…}` — it previously held a
  W23-02 spatula test spec; this node is overwrite-every-run scratch, not load-bearing.
- 6 new cast creations added to the board: `9RwKMfINYZ NZ7kDum6D9 xgqtiBnjfW` (Nano Banana) +
  `swKvZXPl8e jSbm3XOLD0 l7ka2IEgv9` (Seedream).
- `Selected Character` pin unchanged (`VdPHh9JMMU`).
