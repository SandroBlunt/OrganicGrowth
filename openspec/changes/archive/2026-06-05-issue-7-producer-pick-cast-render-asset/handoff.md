# Slice Handoff — issue-7-producer-pick-cast-render-asset

> Bidirectional developer ⇄ qa channel for this slice. The developer writes the Build Report; qa appends
> a Verdict; retries append Round-N blocks. Nothing is overwritten.

## Build Report (developer)

### What changed

Delivered the Producer's **Phase B — Render** (ADR-0003): on the Operator's Character pick, the **Space
driver** pins the chosen **Character** into the Space via the Fallback Protocol (readback-confirmed),
runs the **clip** run-point `downstream` so the clip → Video Combiner → Final Output chain renders
**unattended** to one combined **Asset**, then surfaces that Asset's media URL. The ledger gains the
Phase-B fields (`character`, `asset_url`, `produced_at`) and the Idea transitions `casting → produced`.
The Producer **publishes nothing** — the Asset waits for the Operator (generate-never-publish; ADR-0002).
Plus the `/pick-cast <idea-id> <n>` command shell that selects the nth (1-based) Cast member as the
Character. This **extends** the prior slice's `cast-render` capability with Phase B.

Everything runs through the **existing narrow injected Magnific port** (`SpaceMcpPort`) — the Phase-B
operations fit the existing five methods, so **the port was NOT extended**: pinning is an `edit`
(Fallback Protocol transport), the render is `run`/`runStatus`, the Asset fetch is `fetchCreations`.
Tests pass a **FAKE** implementing the port. There is **no** live `spaces_*`/`creations_*` call, no
credits, no board mutation, no network anywhere in the slice or its tests. The live-MCP adapter is
deferred to the worker slice.

- **Space driver — Phase B** (`src/space-driver/driver.ts`):
  - **`pinCharacter(port, character)`** — Fallback Protocol: a natural-language `edit` naming the chosen
    Character (the `Character #2` creation node) + the candidate identifier, polled to terminal, then a
    **readback** that confirms the chosen Character is pinned (Spike 1 re-pin). Returns the confirmed
    Character on success; an identifiable failure (`pin_edit_failed` / `pin_unconfirmed`) otherwise.
    Mirrors `injectSpec`'s edit → poll → readback shape exactly.
  - **clip `runRunPoint`** — the **reused** Phase-A `runRunPoint` primitive drives the clip run-point
    (`Clip extractor`, `downstream`); the fake fires the clip → Video Combiner → Final Output chain and
    yields one Asset. No new run primitive was added.
  - **`fetchAsset(port, creationId)`** — resolves the finished Asset's creation identifier to its media
    URL (reuses `fetchCreations`).
  - **`pickAndRender(port, spaceState, character)`** — the Phase-B orchestrator: pin the Character →
    resolve the clip run-point **by name** from the parsed Execution Protocol (the run-point whose
    `gate === null`, never hard-coded) → run it `downstream` → fetch the Asset URL. Renders the Asset and
    **stops** — it never publishes. Failures are returned as `{ ok:false, error:{ code, message } }`,
    never thrown (mirrors `parse.ts` / Phase A).
- **Magnific fake — Phase-B mode** (`src/space-driver/fixtures/fake-space.ts`) — extended `FakeSpace`
  (composing the existing `fakeSpaceState()`, which already carries `Clip extractor`, `Video Combiner`,
  `Final Output`, and the two duplicate `Character #2` nodes). Models: a Character-pin `edit` whose
  readback marks the first `Character #2` node `PINNED:<character>` (so the driver's readback confirms the
  pin and a test can assert the Fallback Protocol was used via the recorded `editGoals`); a `downstream`
  clip run started at the resolved `Clip extractor` node that fires the clip render chain and yields
  exactly **one** Asset creation (`asset-1`); the Asset's media URL via `fetchCreations`; and a
  `pinNoOp` fault variant that does not record the pin (readback-fails the pin).
- **`/pick-cast` command shell** (`src/commands/pick-cast.ts`) — mirrors `src/commands/queue.ts`: a
  testable `pickCastCommand(ideaId, n, ledgerPath)` returning a string + an `import.meta.url`-guarded
  `main()`, plus a pure `selectCharacter(cast, n)` that indexes the Idea's `ledger.cast` 1-based (the
  issue's `<n>`). An unknown Idea, an Idea with no recorded Cast, or an out-of-range `<n>` returns an
  identifiable, non-crashing message and selects no Character. Added a `"pick-cast"` npm script.
- **Ledger extension** (`src/ledger/ledger.ts`) — `applyIdeaAsset` (pure) + `writeIdeaAsset` (thin shell)
  record `character` / `asset_url` / `produced_at` onto the Idea record (ADR-0003), mirroring
  `applyIdeaCast`/`writeIdeaCast`. `produced_at` is **injected** by the caller (never read from the clock
  in the pure function — like `enqueue(state, ideaId, now)`). The existing `ledgerStatusForTransition`
  (`render → done ⇒ produced`) is **reused** so the `casting → produced` status is derived from the queue
  transition, never inferred. Also added `loadIdeaCast(ideaId, path)` — a focused, defensive reader of an
  Idea's recorded Cast for the `/pick-cast` shell.

### Files touched (all under `/Users/CaxtonTaylor/Subtext`)

- `src/space-driver/driver.ts` — **edited.** Added `pinCharacter` / `fetchAsset` / `pickAndRender` (+
  `pinGoal`, `isPinnedToCharacter`, the new error codes, `CHARACTER_NODE_NAME`, and the Phase-B result
  types `PinResult` / `AssetResult` / `PickAndRenderResult`). Reuses `runRunPoint`, `fetchCreations`,
  `parse()`, the polling helpers, and the Result convention.
- `src/space-driver/fixtures/fake-space.ts` — **edited (MAGNIFIC FAKE).** Added the Phase-B render mode:
  Character pin + readback confirmation, the clip-render chain → one Asset, the `pinNoOp` fault, and the
  Phase-B constants (`CHARACTER_NODE_NAME`, `CLIP_START_NODE_NAME`, `CLIP_PHASE_NODE_NAMES`,
  `ASSET_CREATION_ID`, `ASSET_URL`, `PINNED_MARKER`, `isPinnedTo`).
- `src/space-driver/driver.test.ts` — **edited.** Added 12 Phase-B driver tests (pinCharacter ×4, clip
  runRunPoint ×1, fetchAsset ×1, pickAndRender ×4 — plus the two clip/asset helper resolvers).
- `src/ledger/ledger.ts` — **edited.** Added `LedgerAsset` / `LedgerIdeaWithAsset` types, `applyIdeaAsset`
  (pure), `writeIdeaAsset` (thin shell), and `loadIdeaCast` (focused reader).
- `src/ledger/ledger.test.ts` — **edited.** Added 7 tests (pure Asset-set ×3, write-shell ×4 incl. the
  both-status-and-asset `casting → produced` round-trip and the unknown-Idea no-op).
- `src/commands/pick-cast.ts` — **new.** The `/pick-cast` shell + pure `selectCharacter`.
- `src/commands/pick-cast.test.ts` — **new.** 7 command tests.
- `package.json` — **edited.** Added the `"pick-cast"` script mirroring `"queue"`.
- `openspec/changes/issue-7-producer-pick-cast-render-asset/proposal.md` — **new.**
- `openspec/changes/issue-7-producer-pick-cast-render-asset/tasks.md` — **new.**
- `openspec/changes/issue-7-producer-pick-cast-render-asset/specs/cast-render/spec.md` — **new** (spec
  deltas — Phase-B additions to the `cast-render` capability).
- `openspec/changes/issue-7-producer-pick-cast-render-asset/handoff.md` — **new** (this file).

No changes to `port.ts` (the existing five methods suffice), `parse.ts`, the queue/scheduler, the
Production Spec contract/validator, or the `/queue` command — all reused as-is.

### How to run

```
npm test          # tsc -p tsconfig.json --noEmit (type-check) + node --import tsx --test "src/**/*.test.ts"   (159 pass)
npm run build     # tsc -p tsconfig.build.json   (exit 0)
npx openspec validate issue-7-producer-pick-cast-render-asset --strict   # valid

# just this slice's tests:
node --import tsx --test "src/space-driver/driver.test.ts"
node --import tsx --test "src/ledger/ledger.test.ts"
node --import tsx --test "src/commands/pick-cast.test.ts"
```

Suite: **tests 159, pass 159, fail 0** (prior baseline 136; this slice adds 23 — driver.test.ts +12,
ledger.test.ts +7, pick-cast.test.ts +4 command tests... = 12 + 7 + 4 = 23, with the remaining 3
pick-cast tests under `selectCharacter`). Build exit 0. OpenSpec:
`Change 'issue-7-producer-pick-cast-render-asset' is valid`.

### Acceptance-criteria self-assessment (each AC → the specific named test)

1. **`/pick-cast <idea-id> <n>` selects the nth Cast member and pins it as the Character (readback
   confirms the pin).**
   → Selection: `pick-cast.test.ts` › "selectCharacter …" › **"returns the nth Cast member's identifier
   as the chosen Character"** + **"selects the FIRST member for n=1 (the indexing is 1-based…)"**, and
   `pickCastCommand …` › **"selects the nth Cast member as the Character and names it in the output"**.
   → Pin + readback: `driver.test.ts` › "pinCharacter …" › **"issues a natural-language edit naming the
   chosen Character and confirms the pin by readback"** — one Fallback-Protocol edit naming the
   `Character #2` node and the candidate identifier, and a readback asserting a node is `PINNED:<cast-3>`.
   The negative is **"reports an identifiable failure when the readback does NOT confirm the pin"**
   (`pinNoOp` ⇒ `pin_unconfirmed`).

2. **After the pick, clips render and combine into one Asset with no further input.**
   → `driver.test.ts` › "runRunPoint — run the clip run-point downstream …" › **"polls the clip run to
   terminal, fires the Video Combiner + Final Output, and yields one Asset"** (render chain fires;
   exactly `[asset-1]` produced) AND `pickAndRender …` › **"pins the chosen Character, runs the clip
   run-point, and surfaces one finished Asset URL"** (one pin edit, one clip run at the resolved clip
   node, one Asset) — the orchestrator runs unattended end-to-end with no further input. Resolution is
   proven by-name by **"resolves the clip run-point by name as the non-cast-gate run-point (never
   hard-coded)"**.

3. **The Idea record gains `character`, `asset_url`, `produced_at` and transitions `casting → produced`.**
   → `ledger.test.ts` › "writeIdeaAsset …" › **"records BOTH produced status and the Asset fields for an
   Idea moving casting → produced"** — `ledgerStatusForTransition(render, "done") === "produced"` (status
   derived, not inferred), then `writeIdeaStatus` + `writeIdeaAsset` land `status: "produced"` and
   `character`/`asset_url`/`produced_at` on disk. Plus **"writes character / asset_url / produced_at for
   the target Idea, preserving unrelated fields"** (only that Idea changes; `cast`/`title`/`post_url`/
   `baseline.note` preserved) and the pure **applyIdeaAsset** trio. `produced_at` is the injected value.

4. **Nothing is published; the Producer takes no Facebook/publish action.**
   → `driver.test.ts` › "pickAndRender …" › **"renders the Asset and takes NO publish action (no publish
   path exists)"** — after a full render the only Space calls were the pin `edit` and the single clip
   `run`; the driver returns the Asset URL and stops. There is no publish/post/Facebook primitive on the
   port or the driver (verified by grep — see hermetic check). The Asset waits for the Operator.

5. **`pinCharacter` / clip `runRunPoint` / `fetchAsset` are unit-tested against the faked MCP boundary.**
   → `pinCharacter`: the AC1 suite + **"makes no call outside the injected port"** (only the pin edit ran;
   no run started). → clip `runRunPoint`: **"polls the clip run to terminal …"** (the fake returns
   `running` once then terminal, so the poll loop genuinely runs; it asserts the run started at the
   resolved clip node in `downstream`). → `fetchAsset`: **"returns the finished Asset's media URL for the
   Asset creation identifier"**. All against `FakeSpace : SpaceMcpPort`.

### Fakes / fixtures used

- **MAGNIFIC FAKE (flagged explicitly) — `src/space-driver/fixtures/fake-space.ts`.** `FakeSpace`
  implements the narrow `SpaceMcpPort` entirely in memory. For Phase B it models the Character pin +
  readback confirmation (the first `Character #2` node becomes `PINNED:<character>`), the `downstream`
  clip render chain (clip → Video Combiner → Final Output → one `asset-1` creation), the Asset's media
  URL, and the `pinNoOp` fault. **No live Space is touched: no `spaces_*` / `creations_*` calls, no
  credits, no board mutation, no network.** The `magnific` MCP tools present in this environment were
  **NOT** used by me or by the code.
- **Reused (not duplicated):** the existing `fakeSpaceState()` (which already carries `Clip extractor`,
  `Video Combiner`, `Final Output`, and the duplicate `Character #2` nodes); the `parse()` parser and the
  canonical protocol's clip run-point; the Phase-A driver primitives (`runRunPoint`, `fetchCreations`,
  the polling helpers); `ledgerStatusForTransition` (`render → done ⇒ produced`); the `/queue` shell as
  the `/pick-cast` template.
- **Temp-dir ledger fixtures:** the `writeIdeaAsset` and `pick-cast` tests seed a JSON ledger in an OS
  temp dir (`mkdtemp`), write/read back, and clean up — never the repo's `data/ledger.json`.

### Self-review notes

- **The port was NOT extended.** I confirmed each Phase-B operation fits the existing five `SpaceMcpPort`
  methods (pin = `edit`, render = `run`/`runStatus`, fetch = `fetchCreations`), so `port.ts` is untouched
  — the narrowest possible seam, matching the proposal's justification.
- `pinCharacter` is a deliberate twin of `injectSpec` (edit → `pollEdit` → readback → confirm), reusing
  the same private `pollEdit` helper, so the Fallback-Protocol transport is single-sourced.
- The clip render reuses the Phase-A `runRunPoint` verbatim — no second poll-loop, no duplicated run
  logic; `pickAndRender` only adds the pin + by-name resolution + fetch around it.
- Clip run-point resolution is **by name** (`gate === null` from `parse()`); the driver hard-codes **no**
  clip node ID. The test re-derives the clip node ID from `parse(fakeSpaceState())`, so it would catch any
  accidental ID-coupling.
- `produced_at` is injected (the pure `applyIdeaAsset` and the shell take it as a value); no `Date.now()`/
  `new Date()` anywhere in the new code (grep-verified), mirroring `enqueue(..., now)`.
- The `PINNED:`/`CHARACTER_NODE_NAME` contract is duplicated between the driver and the fake by necessity
  (the driver cannot import a test fixture) — this mirrors the existing `injectGoal`/`extractInjectedText`
  coordination and keeps the driver fixture-free.
- Failures are returned, never thrown, for every expected shape; the command never crashes on a bad Idea,
  missing Cast, or out-of-range pick.

### Known limits

- **The live-MCP adapter is the worker slice.** This slice ships the driver against the narrow
  `SpaceMcpPort`; the real adapter that calls live `spaces_*`/`creations_*` (and the unattended worker's
  permission/allowlist path) is **deferred and not built or tested here**.
- **`/pick-cast` records the pick; it does not itself drive the live render.** Mirroring `/queue`, the
  command is a thin, hermetic shell: it selects the Character from the ledger and reports that production
  resumes. Wiring the command to enqueue the `render` job, run `pickAndRender` against the live adapter,
  and perform the `writeIdeaStatus`+`writeIdeaAsset` pair on completion belongs to the worker/wiring
  slice. The driver's `pickAndRender` and both ledger writers are unit-tested here in isolation.
- **The fake's render model is deterministic, not a timing model.** It returns `running` once then
  terminal and reports a fixed single Asset; it does not model variable latency, partial renders, or
  mid-render cancellation — those belong to the live-adapter slice if they prove relevant.
- **Authoring the Execution Protocol / Character node on the live canvas is deferred to runtime.** This
  slice resolves the clip run-point from the committed canonical protocol via the fake; it does not write
  the protocol onto a live Space.
- **Phase A is unchanged.** Inject/cast/Cast-gate behavior from the prior slice is reused as-is and not
  re-verified here beyond the existing Phase-A tests still passing.

## QA Verdict — Round 1

**Overall verdict: PASS.**

The slice is genuinely green, every acceptance criterion is exercised by a real test against the
Magnific fake, the OpenSpec deltas faithfully match issue #7, the build is hermetic (no live Space, no
network), and the always-rules hold. Verified independently — not on the Build Report's word.

### Suite result

- **`npm test`** (= `tsc -p tsconfig.json --noEmit` typecheck THEN `node --import tsx --test "src/**/*.test.ts"`):
  **tests 159, pass 159, fail 0, cancelled 0, skipped 0, todo 0** (suites 66). Typecheck clean; the
  poll loops in the fake genuinely run (one `running` poll then terminal), so the driver tests are not
  one-shot stubs.
- **`npm run build`** (`tsc -p tsconfig.build.json`): **exit 0.**
- **`npx openspec validate issue-7-producer-pick-cast-render-asset --strict`**:
  **`Change 'issue-7-producer-pick-cast-render-asset' is valid`** (exit 0).

### Per-criterion results

| # | Acceptance criterion | Result | Evidence |
|---|---|---|---|
| 1 | `/pick-cast <idea-id> <n>` selects the nth Cast member and pins it as the Character (readback confirms the pin) | PASS | Selection 1-based: `src/commands/pick-cast.ts:27-35` (`selectCharacter`, `cast[n-1]`), tested `src/commands/pick-cast.test.ts:32-44` + shell `:56-65`. Pin + readback: `src/space-driver/driver.ts:369-387` (`pinCharacter`: edit → poll → `readState` → `isPinnedToCharacter` confirm), tested `src/space-driver/driver.test.ts:250-266` (asserts a node reads `PINNED:cast-3`) and negative `:276-282` (`pin_unconfirmed`). |
| 2 | After the pick, clips render and combine into one Asset with no further input | PASS | Clip run renders chain: `src/space-driver/driver.test.ts:294-310` asserts `Video Combiner` + `Final Output` fired and `creationIds === [asset-1]` (exactly one). End-to-end unattended: `pickAndRender` `src/space-driver/driver.ts:411-453` (pin → resolve clip run-point → one run → fetch), tested `:326-340` — one pin edit, one clip run, one Asset, no further input. |
| 3 | The Idea record gains `character`, `asset_url`, `produced_at` and transitions `casting → produced` | PASS | `applyIdeaAsset`/`writeIdeaAsset` `src/ledger/ledger.ts:172-224` write all three fields; status derived via `ledgerStatusForTransition(render,"done")==="produced"` `:91-95`. Full round-trip tested `src/ledger/ledger.test.ts:341-368`: status reads `produced` AND `character`/`asset_url`/`produced_at` land on disk; preservation of unrelated fields `:302-338`; unknown-Idea no-op `:371-382`. |
| 4 | Nothing is published; the Producer takes no Facebook/publish action | PASS | No publish/post/Facebook primitive on `SpaceMcpPort` (`src/space-driver/port.ts:70-95`) or the driver. `pickAndRender` returns the Asset URL and stops (`src/space-driver/driver.ts:452`). Tested `src/space-driver/driver.test.ts:356-366` — only Space calls were the pin edit + the single clip run. Grep confirms no publish path (see hermetic check). |
| 5 | `pinCharacter` / clip `runRunPoint` / `fetchAsset` are unit-tested against the faked MCP boundary | PASS | `pinCharacter` `driver.test.ts:249-289` (incl. "makes no call outside the injected port" `:268-274`); clip `runRunPoint` `:293-311`; `fetchAsset` `:315-321`. All against `FakeSpace : SpaceMcpPort` (`src/space-driver/fixtures/fake-space.ts`), in-memory only. |

### Per-scenario results (spec deltas — `specs/cast-render/spec.md`)

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| Pin via Fallback Protocol → Pinning is confirmed by readback | PASS | `driver.test.ts:250-266` |
| Pin via Fallback Protocol → Unconfirmed pin reported as failure | PASS | `driver.test.ts:276-282` (`pin_unconfirmed`) |
| Clip run → renders chain to one combined Asset | PASS | `driver.test.ts:294-310` |
| Clip run → resolved by name as the non-cast-gate (`gate: null`) run-point, never hard-coded | PASS | `driver.test.ts:342-354` (re-derives clip node id from `parse(fakeSpaceState())`) |
| Asset persisted → Phase B returns the finished Asset URL | PASS | `driver.test.ts:326-340` |
| Asset persisted → ledger records Asset fields + produced status, no other field changed | PASS | `ledger.test.ts:341-368`, `:302-338` |
| Phase B publishes nothing → renders Asset, takes no publish action | PASS | `driver.test.ts:356-366` |
| `/pick-cast` → selects the nth Cast member as the Character | PASS | `pick-cast.test.ts:32-44`, `:56-65` |
| `/pick-cast` → out-of-range/unknown reported without crashing, no Character | PASS | `pick-cast.test.ts:46-51`, `:67-93` |
| Phase B fits the narrow port → pinCharacter issues edit + verifies via port | PASS | `driver.test.ts:268-274` |
| Phase B fits the narrow port → clip runRunPoint polls a run to terminal via port | PASS | `driver.test.ts:294-310` (fake returns `running` then terminal) |
| Phase B fits the narrow port → fetchAsset returns the Asset URL via port | PASS | `driver.test.ts:315-321` |

All scenarios trace back to issue #7's acceptance criteria; no scenario encodes anything the issue did
not ask for. The clip run-point is resolved BY NAME (`gate === null`) from the parsed protocol
(`driver.ts:423-435`), never hard-coded — matching the issue and ADR-0003.

### Hermetic-build (no live Space) check — PASS

- `grep -rn "spaces_\|creations_\|mcp__magnific" src/` → every hit is a **comment, docstring, or string
  literal** (run-point/tool names in documentation). **No live MCP tool invocation.**
- `grep -rn "fetch(|http|axios|node:net|XMLHttpRequest" src/` → **none.** No network anywhere.
- `grep -rn "callTool|mcpClient|.call(|invoke" src/space-driver/` → **none.** The driver depends only on
  the injected `SpaceMcpPort` (`port.ts`); tests supply `FakeSpace` (`fixtures/fake-space.ts`), which is
  pure in-memory state composing the existing `fakeSpaceState()`.
- I (qa) did **not** call any `magnific` MCP tool; no credits spent, no board mutated.

### Always-rules check

- **generate-never-publish — PASS.** No publish/post/Facebook primitive exists on the port or driver;
  `pickAndRender` returns the Asset URL and stops (`driver.ts:452`), asserted by `driver.test.ts:356-366`.
- **ledger-as-source-of-truth — PASS.** `character`/`asset_url`/`produced_at` and the `casting → produced`
  status are written to the ledger from render completion (`ledger.ts:172-224`); status is **derived**
  from the queue's `render → done` transition via `ledgerStatusForTransition` (`:91-95`), never inferred.
  `produced_at` is **injected** by the caller — `grep` confirms **no** `Date.now()`/`new Date()` in any
  slice file; the pure `applyIdeaAsset` takes the timestamp as a value.
- **public-metrics-only / relative-not-absolute / explicit-attribution — n/a (PASS).** This slice adds no
  metrics, no scoring, and no Post↔Idea linkage; `post_url` is untouched (preservation asserted in the
  ledger tests). Nothing violated.

### Defect list

None.

