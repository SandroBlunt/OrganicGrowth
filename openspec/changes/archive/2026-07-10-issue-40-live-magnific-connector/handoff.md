# Slice Handoff — issue-40-live-magnific-connector

> Bidirectional developer ⇄ qa channel for this slice. The developer writes the Build Report; qa appends
> a Verdict; retries append Round-N blocks. Nothing is overwritten.

## Build Report (developer)

### What changed

Added the **live** `SpaceMcpPort` implementation (`LiveSpaceAdapter`) — the real counterpart to the
in-memory `FakeSpace` — built and contract-tested against the one-time sanctioned live capture already
recorded in the repo at `src/space-driver/fixtures/live-captures/` (fixtures `00`–`11` + README). The
build stayed fully hermetic: this slice adds an injectable `LiveMcpTransport` seam (one method per
`magnific` MCP tool the port needs) plus a `ReplayMcpTransport` test double that replays the captured
fixture files verbatim, so every parsing/mapping/polling code path in `LiveSpaceAdapter` runs against
**real recorded response shapes** in tests — zero live `spaces_*`/`creations_*` calls, zero credits,
zero board mutation, zero network.

Key real-world findings this slice surfaced and handled honestly (never papered over):

- The live board's node names have drifted from the fake's constants (`Selected Character`, not
  `Character #2`) — `verifyPinned` is implemented against the real name.
- The live board's `Producer Protocol` node currently holds a pre-canonical `steps` document (with a
  stray leading `f{`), not yet the `run_points` shape `execution-protocol/parse.ts` expects. Rather than
  patch that shared parser (out of this slice's scope), the handoff proves the EXISTING Fallback
  Protocol recovery path in `driver.ts` (unmodified) correctly activates when driven against the live
  adapter's honest `readState()` output — exactly the scenario ADR-0003 built it for.
- The `JSON Master` node's captured value really is truncated mid-JSON by the read API (~1,900-char
  cap); a truncation guard detects this and — only when a linked document URL + fetcher are supplied —
  resolves the full text, otherwise flags it rather than trusting a partial read.
- `spaces_run` and `spaces_edit` use different id fields (`workflowRunIdentifier` vs `operationId`);
  `spaces_run_status` reports node **ids**, which the adapter resolves to **names** via a fresh board
  read; creation URLs are treated as fresh/expiring and never cached.

### Files touched (all new; nothing existing was modified)

- `src/space-driver/live/transport.ts` — the injectable `LiveMcpTransport` interface (the only seam the
  live adapter calls through).
- `src/space-driver/live/toon.ts` (+ `toon.test.ts`) — pure TOON table parser (`splitToonRow`,
  `parseToonField`, `parseToonTables`) for the `spaces_state`/`spaces_get_nodes` tabular format.
- `src/space-driver/live/space-state.ts` (+ `space-state.test.ts`) — `parseSpaceStateNodes(toonText)`:
  TOON tables → `SpaceStateLike`, resolving each node's `.value` from `text` /
  `creationIdentifier`/`currentCreationIdentifier` key.
- `src/space-driver/live/creation.ts` (+ `creation.test.ts`) — `parseCreationBlock(text)`: the
  `creations_get` key/value block → `{identifier, url, kind?}`.
- `src/space-driver/live/text-truncation.ts` (+ `text-truncation.test.ts`) — `looksTruncated`,
  `readNodeTextRobust` (the ~1,900-char guard + linked-doc fallback).
- `src/space-driver/live/adapter.ts` (+ `adapter.test.ts`) — `LiveSpaceAdapter implements SpaceMcpPort`:
  `readState`, `edit`/`editStatus`, `run`/`runStatus`, `fetchCreations`, `verifyPinned`, plus the
  adapter-level `readNodeTextRobust(nodeName, docOptions)` convenience wiring the truncation guard to a
  real node lookup.
- `src/space-driver/live/replay/transport.ts` — `ReplayMcpTransport` (the record/replay test double;
  reads the captured fixture files verbatim; models the real `05`→`06` running→terminal poll sequence
  and the real `02`→`11` pre/post-inject `JSON Master` transition; templates `creations_get` for cast ids
  not individually captured, reusing `07`'s exact real schema).
- `src/space-driver/live/replay/synthetic.ts` — clearly-labeled, **NOT captured** failure/recovery JSON
  builders (`syntheticFailedRunStatus`, `syntheticFailedEditStatus`,
  `syntheticEditStatusWithCreationIds`).
- `src/space-driver/live/contract.test.ts` — the shared, parameterized `SpaceMcpPort` contract battery,
  run against both `FakeSpace` (unmodified) and `LiveSpaceAdapter` over `ReplayMcpTransport`.
- `src/space-driver/live/driver-over-live.test.ts` — the existing, unmodified `driver.ts` functions
  (`injectSpec`, `pinCharacter`, `composeAndCast`) run with the live adapter as their port.
- `openspec/changes/issue-40-live-magnific-connector/{proposal.md,tasks.md,specs/live-space-adapter/spec.md,handoff.md}`
  — this OpenSpec change.

**Not touched:** `src/space-driver/port.ts`, `src/space-driver/driver.ts`,
`src/space-driver/fixtures/fake-space.ts` (the Magnific fake), `src/execution-protocol/parse.ts`,
`src/execution-protocol/protocol.ts`, and every fixture file under
`src/space-driver/fixtures/live-captures/` (read-only in every test).

### How to run

```bash
npm test          # tsc -p tsconfig.json --noEmit  +  node --import tsx --test "src/**/*.test.ts"
npm run build      # tsc -p tsconfig.build.json (exit 0)
npx openspec validate issue-40-live-magnific-connector --strict

# just this slice:
node --import tsx --test "src/space-driver/live/**/*.test.ts"
```

**Test counts:** baseline **634 tests / 191 suites** (pre-slice `main`) → **688 tests / 210 suites**
(this slice adds **54 tests across 19 suites**), all passing. `npm run build` exits 0. `openspec
validate --strict` reports the change valid.

### Acceptance-criteria self-assessment

Issue #40's 6 acceptance criteria, each mapped to the specific test(s) that prove it:

1. **"A one-time sanctioned live capture … is recorded as replay fixtures … (no secrets, no credits in
   CI)."** — Pre-existing (recorded before this slice; not this slice's deliverable). This slice proves
   the capture is actually *usable*: every parser in `toon.test.ts`, `space-state.test.ts`,
   `creation.test.ts`, and `adapter.test.ts` reads the real fixture files (`00`–`11`) directly and
   asserts on their real field values (e.g. `toon.test.ts` › "parses the whole-board nodes[58] table
   from the real 01-spaces_state capture").

2. **"A live SpaceMcpPort implementation satisfies the existing port contract and passes the driver's
   contract tests against the captured fixtures."**
   → `contract.test.ts` — the single parameterized battery ("shared SpaceMcpPort contract — …") runs
   identically against `FakeSpace` and `LiveSpaceAdapter` over `ReplayMcpTransport`: `readState` shape,
   `edit`→`editStatus` to terminal, `run`→`runStatus` to terminal with non-empty fired names + creation
   ids, `fetchCreations`, and `verifyPinned` — all 10 assertions pass for both.
   → `driver-over-live.test.ts` — the **existing, unmodified** `driver.ts` functions run against the live
   adapter: `injectSpec` (confirms the real `02`→`11` readback), `pinCharacter` (confirms via
   `verifyPinned` against the real board), and `composeAndCast` in TWO real scenarios — "as captured"
   (real Producer Protocol content ⇒ legitimate Fallback-Protocol recovery, `cast.length === 2` from two
   real creation ids) and "with the canonical protocol authored" (100% real `04`/`05`/`06` run data,
   `cast.length === 6` matching the real terminal `creationIdentifiers` exactly).

3. **"verifyPinned … is implemented against real Space state, not the fake's `PINNED:` marker."**
   → `adapter.test.ts` › "LiveSpaceAdapter.verifyPinned …" — reads the real `Selected Character` node's
   `creationIdentifier` (`VdPHh9JMMU`) directly from the captured `02` fixture; `true` for the real pin,
   `false` for any other candidate. → `contract.test.ts`'s `verifyPinned` scenario proves this holds even
   when driven through `driver.ts`'s existing `pinGoal()` (whose text still names the fake's
   `"Character #2"` — see Known limits below) — `verifyPinned`'s own readback logic never depends on that
   text, only on the real node.

4. **"Poll timing uses the injected time-budget/backoff (C10) so real multi-minute ops do not time
   out."** — `driver.ts`'s existing `PollOptions` seam (interval/budget/sleep/clock, already proven
   correct for a real multi-minute op in `driver.test.ts`'s C10 suite) is reused **unchanged**; this
   slice proves the live adapter is fully compatible with it: `adapter.test.ts` › "runStatus() reports
   running on the first (05) poll, then succeeded on the terminal (06) poll" and `contract.test.ts` /
   `driver-over-live.test.ts` exercise the genuine real running→terminal transition (mirroring the real
   capture's `poll_after_seconds:3` cadence) through the SAME poll loop the driver already budgets by
   time, not by a raw instant count.

5. **"The ~1,900-char node-read truncation is handled …"**
   → `text-truncation.test.ts` — `looksTruncated` flags the real captured (truncated) `JSON Master` value
   and does NOT flag the real captured (compact) `Producer Protocol` value; `readNodeTextRobust` resolves
   a truncated value from a linked document + injected fetcher, or explicitly flags it when neither is
   available. → `adapter.test.ts` › "LiveSpaceAdapter.readNodeTextRobust …" wires this to a real node
   lookup on the live adapter (not just a disconnected utility).

6. **"No change to the fake; hermetic npm test stays green; live calls happen only behind the
   record/replay boundary."** — `git status` shows only new files added (`src/space-driver/live/**`,
   this OpenSpec change) — `fake-space.ts`, `port.ts`, `driver.ts`, and `execution-protocol/*` are
   byte-for-byte unchanged. `npm test` is green at 688/688. Every test in `src/space-driver/live/` drives
   `LiveSpaceAdapter` through `ReplayMcpTransport` or a hand-rolled `LiveMcpTransport` stub — grep
   confirms no `spaces_*`/`creations_*` MCP tool call anywhere in the new code (the `developer` agent was
   never given those tools, and none were used).

### Fakes / fixtures used

- **The Magnific fake** (`src/space-driver/fixtures/fake-space.ts`, `FakeSpace`) — **unmodified**, used
  as-is in `contract.test.ts` as one of the two parameterized implementations. **Flagging explicitly per
  the build contract: this is the pre-existing in-memory fake; it was not touched.**
- **The live-capture replay fixtures** (`src/space-driver/fixtures/live-captures/00`–`11` +
  `README.md`) — **pre-existing, sanctioned, real captured MCP responses**, read verbatim by
  `ReplayMcpTransport` and directly by several unit tests (`toon.test.ts`, `space-state.test.ts`,
  `creation.test.ts`, `adapter.test.ts`). **Flagging explicitly: these are real recordings, not
  invented — no live Magnific call was made in this slice; the `developer` agent has no `magnific` MCP
  tools and never reached for them.**
- **`ReplayMcpTransport`** (`src/space-driver/live/replay/transport.ts`) — the new record/replay test
  double built by this slice. Two data points are **templated, not independently captured**, and are
  called out in code comments and here: (a) `creations_get` for any of the cast run's 6 real ids other
  than `9RwKMfINYZ` (only that one and the unrelated Asset id `IaAOyRntvE` were individually captured)
  reuses `07`'s exact real schema with only the identifier/url/webUrl substituted; (b) the "canonical
  protocol authored" scenario in `driver-over-live.test.ts` substitutes the canonical `run_points`
  artifact (`execution-protocol/protocol.ts`'s own `canonicalProtocol()`) onto the real `Producer
  Protocol` node's slot, modelling the deferred runtime-authoring step `protocol.ts`'s own docstring
  already describes — every node id/name in that scenario is still the real captured one.
- **`replay/synthetic.ts`** — clearly-labeled **NOT captured** failure/recovery shapes (a failed/
  `startNodeMissing` `runStatus`, a failed `editStatus`, and an agent-recovery `editStatus` carrying
  `creationIdentifiers`), extrapolated from the real success shapes' field names per the README's own
  "NOT captured" section — never presented as captured.

### Self-review notes

- Simplified `editStatus`'s `creationIdentifiers` mapping to a single presence check
  (`"creationIdentifiers" in json`) instead of a redundant double `Array.isArray` check.
- Added the `readNodeTextRobust` adapter method specifically so the truncation guard (item 5) is wired
  into a real, testable adapter code path rather than existing only as a disconnected pure utility.
- Considered but rejected building a `LiveSpaceSession`/queue-worker wiring in this slice — issue #40's
  scope is the `SpaceMcpPort` adapter only; worker/host wiring is issue #41 and permission wiring is
  issue #42 (both blocked by #40, per the parent epic #39), so adding either here would be scope creep.
- Considered patching `execution-protocol/parse.ts` to tolerate the real Producer Protocol node's stray
  leading `f{` and/or its pre-canonical `steps` schema, and rejected it: that module is a shared,
  previously-shipped deep module outside this slice's stated boundary, and the existing Fallback
  Protocol already handles a protocol that doesn't parse — patching around it would mask a real finding
  rather than prove the recovery path. Documented as a known limit instead (below).

### Known limits (explicitly, per the issue's own "NOT captured" section and beyond)

- **Failure/recovery MCP shapes were not exercised in the one sanctioned live capture** (success paths
  only): a `runStatus` reporting `phase:"failed"`/`startNodeMissing`, a failed `editStatus`, and an
  agent-recovery `editStatus` carrying `creationIdentifiers`. All three are **synthesized** in
  `replay/synthetic.ts`, clearly labeled as such, and unit-tested (`adapter.test.ts`). A second live
  capture (out of this slice's scope) would be needed to confirm the exact real shape.
- **A live end-to-end clip render (Phase B) was not captured** (the README's own "NOT captured" note).
  This slice's live-adapter tests exercise Phase A (`composeAndCast`) and the Character pin
  (`pinCharacter`) end-to-end against real data; a full `pickAndRender` clip-render run over the live
  adapter is not exercised (no real `spaces_run`/`spaces_run_status` capture exists for the clip
  run-point) — `pickAndRender` itself is unchanged and remains covered against the fake in
  `driver.test.ts`.
- **The live board's `Producer Protocol` node does not yet hold the canonical `run_points` schema** — it
  currently holds a richer, pre-canonical `steps` document with a stray leading `f{` (README gotcha #2).
  This is a real, documented finding, not a defect in this slice: `driver-over-live.test.ts` proves
  `parse()` legitimately fails against it and the existing Fallback Protocol correctly recovers.
  Authoring the canonical protocol onto the live canvas node is a deferred runtime step (per
  `protocol.ts`'s own docstring), out of this slice's scope.
- **`driver.ts`'s hard-coded `CHARACTER_NODE_NAME` constant (`"Character #2"`) does not match the live
  board's real node name (`"Selected Character"`, README gotcha #3).** `verifyPinned`'s own readback is
  correctly implemented against the real name (AC bullet 3), but the Fallback Protocol's natural-language
  pin-goal TEXT (built by `driver.ts`'s `pinGoal()`, unmodified in this slice) still names `"Character
  #2"`. Whether the live in-canvas agent resolves that fuzzily or needs `driver.ts` updated is a
  follow-up question for a future slice — flagging it here rather than silently patching `driver.ts`
  beyond this slice's stated boundary (the `SpaceMcpPort` adapter).
- **No worker/queue wiring.** This slice implements only the `SpaceMcpPort` adapter, per the issue's
  scope. Wiring it into the Production Queue worker/host is issue #41; unattended-permission wiring is
  issue #42 — both explicitly blocked by this issue (#39's slice breakdown).

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (== `tsc -p tsconfig.json --noEmit` + `node --import tsx --test "src/**/*.test.ts"`):
  **688 tests / 210 suites, 688 pass, 0 fail, 0 cancelled, 0 skipped.** Green.
- Isolated slice run — `node --import tsx --test "src/space-driver/live/**/*.test.ts"`: **54 tests / 19
  suites, all pass** (688 − 634 baseline = 54, 210 − 191 baseline = 19 — matches the Build Report's
  claimed delta exactly).
- `npm run build` (`tsc -p tsconfig.build.json`): exit 0, no output (clean).
- `npx openspec validate issue-40-live-magnific-connector --strict`: `Change 'issue-40-live-magnific-connector' is valid`.

All four commands were actually executed by qa in this session (not taken on the developer's word).

### Per-criterion results (issue #40's 6 acceptance criteria)

1. **Live capture recorded as replay fixtures, no secrets/credits in CI.** — **PASS.** Fixtures `00`–`11`
   + `README.md` under `src/space-driver/fixtures/live-captures/` are already committed on `main` (a
   prior, separate PR — confirmed correct: `git diff main...HEAD --stat` for this branch shows only
   NEW untracked files, i.e. this slice did not need to (and did not) touch the fixtures). Secrets check:
   `grep -rn "token=" *.txt *.json | grep -v "token=REDACTED"` → **no matches**; targeted secret-pattern
   grep (`api[_-]?key|secret|bearer|authorization|password`, case-insensitive) → only one false positive
   (`"SECRET OIL HACK"`, marketing-copy content text inside a captured prompt, not a credential); no
   `.env`/API-token references. All static files, no network calls in CI.
2. **A live `SpaceMcpPort` implementation satisfies the port contract against the captured fixtures.** —
   **PASS.** `src/space-driver/live/contract.test.ts` runs one parameterized battery (`readState`,
   `edit`→`editStatus`, `run`→`runStatus`, `fetchCreations`, `verifyPinned`) against both `FakeSpace` and
   `new LiveSpaceAdapter(new ReplayMcpTransport(), LIVE_SPACE_ID)` — verified by reading the file: both
   fixture-makers are parameterized into the SAME `runSharedPortContract` describe block (lines 98–114),
   and all 5 sub-tests pass for both (confirmed in the green `npm test` run). `driver-over-live.test.ts`
   additionally proves the existing, unmodified `driver.ts` (`injectSpec`, `pinCharacter`,
   `composeAndCast`) works unchanged with the live adapter as its port, across two real scenarios (as
   captured / with the canonical protocol substituted).
3. **`verifyPinned` implemented against real Space state, not the fake's `PINNED:` marker.** — **PASS.**
   Read `adapter.ts:178-182`: `verifyPinned` calls `readState()`, finds the node named
   `SELECTED_CHARACTER_NODE_NAME` ("Selected Character"), and compares `node.value === character` — no
   reference to any `PINNED:` string anywhere in `src/space-driver/live/`. `adapter.test.ts` asserts
   `verifyPinned("VdPHh9JMMU") === true` (the real captured pinned id) and
   `verifyPinned("some-other-candidate") === false`, reading straight off fixture `02`.
4. **Poll timing uses the injected time-budget/backoff (C10).** — **PASS.** `driver.ts`'s pre-existing
   `PollOptions`/`resolvePoll`/`pollEdit`/`pollRun` (interval/budget/sleep/clock, unmodified by this
   slice) is the ONLY polling mechanism in the codebase, and it is proven against a real multi-minute-op
   shape by the pre-existing `driver.test.ts` C10 suite (unchanged, still green). This slice's
   `adapter.test.ts` ("runStatus() reports running on the first (05) poll, then succeeded on the
   terminal (06) poll") and `driver-over-live.test.ts`/`contract.test.ts`'s `pollToTerminal` loops prove
   `LiveSpaceAdapter` is a drop-in-compatible port for that SAME budget/backoff loop, driven by the real
   captured `05`→`06` running→terminal transition. Minor observation (not a defect, see below): no test
   drives a "live adapter that never reaches terminal" through a stepping clock the way `StuckSpace` does
   for the fake in C10 — but the poll loop itself lives entirely in `driver.ts` and is provably
   port-agnostic (it only calls through `SpaceMcpPort`), so this is adequate coverage for this slice's
   scope, not a gap that blocks acceptance.
5. **The ~1,900-char node-read truncation is handled.** — **PASS.** `text-truncation.ts` reuses
   `READ_API_TRUNCATION_CAP = 1900` from `execution-protocol/protocol.ts` (grep-confirmed) —
   `looksTruncated` flags any text `>= 1900` chars. `text-truncation.test.ts` proves it flags the real
   captured (truncated) `JSON Master` value and does NOT flag the real captured (compact) `Producer
   Protocol` value; `readNodeTextRobust` resolves from a linked doc + injected fetcher when available,
   else flags `truncated: true` explicitly — never silently trusts a partial read. Wired to a real node
   lookup via `LiveSpaceAdapter.readNodeTextRobust`, tested in `adapter.test.ts`.
6. **No change to the fake; hermetic `npm test` stays green; live calls only behind record/replay.** —
   **PASS.** `git diff main -- src/space-driver/port.ts src/space-driver/driver.ts src/space-driver/fixtures/fake-space.ts src/execution-protocol/parse.ts src/execution-protocol/protocol.ts`
   → empty (byte-for-byte unchanged). `git status --porcelain` shows only new/untracked files
   (`src/space-driver/live/**`, this OpenSpec change, plus an unrelated pre-existing `docs/audits/`
   directory not touched by this slice). `npm test` green at 688/688. Grep for live MCP tool
   invocations across `src/space-driver/live/` (excluding fixture filenames, error-message strings, and
   comments) found none; the only I/O in the new code is `node:fs.readFileSync` against local fixture
   files (`replay/transport.ts`) — no `fetch`, no MCP client import, no network.

### Per-scenario results (spec deltas, `openspec/changes/issue-40-live-magnific-connector/specs/live-space-adapter/spec.md`)

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| readState parses the real captured board into SpaceStateLike | PASS | `adapter.test.ts` › "returns nodes carrying real ids/names, with JSON Master's truncated value and Selected Character's pin" |
| run and runStatus map the real id field and resolve fired node names | PASS | `adapter.test.ts` › "run() reads the real workflowRunIdentifier…", "runStatus() reports running…then succeeded…", "resolves each fired node id to its real NAME…" |
| edit and editStatus map the real id field and success flag | PASS | `adapter.test.ts` › "edit() reads the real operationId…", "editStatus() reports succeeded only because workflowStatus is 'success'…" |
| fetchCreations parses the real creations_get shape and never caches a url | PASS | `adapter.test.ts` › "resolves the real image and video creation ids…", "never caches a url…" |
| verifyPinned confirms the real pinned character and rejects a different one | PASS | `adapter.test.ts` › "LiveSpaceAdapter.verifyPinned …"; `contract.test.ts`'s shared `verifyPinned` scenario for both fixtures |
| A truncated node value is flagged, not silently trusted | PASS | `text-truncation.test.ts`; `adapter.test.ts` › "flags the real truncated JSON Master value…" |
| The compact Producer Protocol node reads whole | PASS | `text-truncation.test.ts`; `adapter.test.ts` › "does not flag the real compact Producer Protocol value…" |
| A truncated value resolves from a linked document when one is available | PASS | `text-truncation.test.ts`; `adapter.test.ts` › "resolves the real truncated JSON Master value from a linked document…" |
| The live adapter's tests make no live MCP call | PASS | Grep evidence above; every `*.test.ts` under `src/space-driver/live/` injects `ReplayMcpTransport` or a hand-rolled stub |
| The same contract battery passes for both implementations | PASS | `contract.test.ts` — parameterized over `FakeSpace` and `LiveSpaceAdapter`/`ReplayMcpTransport` |
| A synthesized start-node-missing run status maps to the Fallback-Protocol trigger | PASS | `adapter.test.ts` › "maps a synthesized (NOT captured) start-node-missing runStatus…" |
| A synthesized failed editStatus maps to a failed EditStatus | PASS | `adapter.test.ts` › "maps a synthesized (NOT captured) failed editStatus…" |

### OpenSpec-faithfulness check (job c)

Read `proposal.md`, `tasks.md`, and `specs/live-space-adapter/spec.md` against issue #40's body and
acceptance criteria verbatim:

- The proposal's "Why"/"What Changes" sections map 1:1 onto the issue's 6 acceptance criteria (see the
  per-criterion table above) — no criterion is dropped, softened, or reinterpreted.
- The spec deltas' Requirements/Scenarios all trace back either to an explicit AC bullet or to a README
  "gotcha" the issue explicitly demanded be handled (id-field differences, node-id→name resolution,
  truncation, non-cached URLs) — no invented scope, no scope creep into issue #41 (worker wiring) or #42
  (permission wiring), both of which are correctly identified as out-of-scope/blocked-by in the
  proposal's Impact section and the handoff's Known Limits.
- The proposal correctly does NOT claim to fix `driver.ts`'s `CHARACTER_NODE_NAME`/`pinGoal()` text
  mismatch or `execution-protocol/parse.ts`'s schema gap — both are real findings from the live capture,
  both are explicitly flagged as out-of-scope/deferred rather than silently left inconsistent, and both
  are consistent with ADR-0003's Fallback Protocol being the documented recovery mechanism for exactly
  this situation (a protocol/canvas mismatch). This is the correct call: patching either would be
  scope creep beyond "the `SpaceMcpPort` adapter" (the issue's explicit "What to build").
- No misread found: the issue's phrase "the real `SpaceMcpPort` / `SpaceSession` adapter" is read
  narrowly and correctly as "the port adapter only" (not a `SpaceSession`/worker-host object) — the
  proposal's Impact section explicitly scopes out worker/queue wiring, matching the issue's own "Blocked
  by" note that the live capture step is Operator-led and that downstream wiring is a separate issue
  (#41/#42) under the same parent epic (#39). No self-consistent-but-wrong spec found.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No publish/Facebook primitive anywhere in `src/space-driver/live/` (grep for "publish\|facebook" found only an unrelated docstring reference to a "published Google-Doc URL" mitigation, not a publish action). The adapter only reads/edits/runs the Space and fetches creations — same port surface as before. |
| Public-metrics-only | N/A (out of scope) | This slice touches no Apify/metrics path. |
| Relative-not-absolute | N/A (out of scope) | This slice touches no scoring/comparison path. |
| Explicit-attribution | N/A (out of scope) | This slice touches no Post/Idea linkage. |
| Ledger-as-source-of-truth | PASS | Grep for "ledger" in `src/space-driver/live/` (excluding comments) found no matches — this slice writes no ledger fields, consistent with the proposal's own Impact-section claim. |
| No live-Space calls (Magnific fake check) | PASS | Grep for MCP tool invocation patterns (`mcp__magnific`, `spaces_run(`, `spaces_edit(`, `creations_get(` as calls) across `src/space-driver/live/**/*.ts` found none — all matches were fixture filenames, JSON field-name string literals, or error-message text. The only transport is `LiveMcpTransport`, satisfied in tests exclusively by `ReplayMcpTransport` (reads local fixture files via `node:fs`) or hand-rolled stubs. No `fetch`, no network client, no credits, no board mutation. |
| Fake unchanged | PASS | `git diff main -- src/space-driver/fixtures/fake-space.ts src/space-driver/port.ts src/space-driver/driver.ts` → empty. `contract.test.ts` uses the real, unmodified `FakeSpace` class directly (`import { FakeSpace } from "../fixtures/fake-space.ts"`). |

### Defect list

None. No defects found in this round.

### Notes (non-blocking)

- `docs/audits/codebase-audit-2026-07-07.md` appears as an untracked file in this working tree but is
  **not** part of this slice's Build Report file list and was not created or modified by this change —
  flagging only so it is not accidentally swept into this PR's commit by a broad `git add`.
- The minor poll-timing observation under criterion 4 above (no live-adapter-specific "stuck"/never-
  terminates budget-exhaustion test) is judged acceptable for this slice's scope, not a defect: the
  budget/backoff loop lives entirely in `driver.ts`, is unmodified, and is already proven against a
  real multi-minute-op shape in the pre-existing C10 suite; this slice additionally proves the live
  adapter plugs into that same loop correctly for the real running→terminal transition.

**Verdict: PASS.** Slice is ready to proceed to a branch + PR per `/build-issue`'s gate behavior.

---

## Addendum — follow-up fixes (deferred, post-merge)

This adapter-only slice deliberately did **not** fix the following; they are real mismatches the live
capture surfaced, tracked here so the sibling runtime slices pick them up. None blocks this slice's
acceptance (the adapter is correct against the port contract; these are about making a real end-to-end
run work).

1. **Live board `Producer Protocol` node is pre-canonical.** Node `909da70a…` holds a run-plan whose
   text begins with a stray `f{` and does not parse under the canonical run-point schema, so the
   existing Fallback Protocol recovers instead of running the canonical path. **Fix:** update the
   on-board `Producer Protocol` node to the canonical schema (Operator-side board edit), or reconcile
   the parser to accept the current shape. **Owner:** slice **#41** (worker host + wire end-to-end),
   since that is the first slice to drive the canonical path live.

2. **`driver.ts` pin-goal text names the wrong node.** The Character-pin goal in `driver.ts` is
   hard-coded as `"Character #2"`, but the live board renamed that creation node to **"Selected
   Character"** (`ba631f44…`). `verifyPinned` is already correct (it reads the node's
   `creationIdentifier`, not the name), but the *pin edit* goal must be updated or it addresses a node
   name that no longer exists on the live board. **Fix:** parameterize/rename the pin-goal target to
   "Selected Character" (touches `driver.ts`, which this slice keeps unmodified). **Owner:** slice
   **#41**.

3. **Failure/recovery + Phase-B render shapes were never captured live.** `RunStatus.startNodeMissing`,
   a failed `editStatus`, agent-recovery-with-creations, and a full Phase-B clip render are currently
   **synthesized** in the replay double (clearly labeled). **Fix:** a second one-time sanctioned live
   capture of those shapes, folded into `src/space-driver/fixtures/live-captures/`, when #41 exercises
   the render path. **Owner:** slice **#41**.

_Added 2026-07-10 as an addendum to this slice at the Operator's request, immediately before merge._
