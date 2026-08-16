# Slice Handoff — issue #207: the live Magnific adapter, with the write limit checked first

Bidirectional document: the `developer` Build Report below, then `qa`'s Verdict appended beneath it.
Nothing here is ever overwritten; a retry round appends a new `Round-N Build` block.

## Build Report (Round 1)

### What changed

The live `SpaceMcpPort` adapter (issue #40) was already ~500 lines against real captured shapes with a
contract test — this slice is a shim on top of it, not a rebuild. It adds exactly the write-limit
handling the ticket is named for:

1. **The write limit is modelled explicitly** (`src/space-driver/live/write-limit.ts`,
   `SPACES_EDIT_WRITE_LIMIT_CHARS = 4000`), mirroring the existing read-side truncation guard
   (`text-truncation.ts`) the issue pointed at as "the pattern to copy". `LiveSpaceAdapter.edit()` checks
   every goal against it **before** the injected transport is ever called — an oversized goal throws a
   clear `WriteLimitExceededError` (citing the exact length and the cap) and the transport is never
   touched: zero live calls, zero credits, zero board mutation, and — the failure mode this project has
   already been bitten by once — never a silent truncation.
2. **A fresh thread id is generated for every live edit.** `LiveMcpTransport.spacesEdit` now takes an
   explicit `threadId`; `LiveSpaceAdapter` generates one (`crypto.randomUUID()` by default, injectable)
   per `edit()` call, never reusing one — the established finding that a shared thread truncates the
   JSON node after ~40 edits.
3. **A ~17 KB News Carousel Spec reaches the canvas intact under the modelled limit**
   (`src/space-driver/live/carousel-inject.ts`). A pure planner (`planCarouselInject`) decides: a Spec
   that already fits in one write plans exactly the existing single-shot goal (delegated straight to the
   unchanged `injectSpec` — zero behavior change for the wired Character Explainer Recipe or a small
   carousel Spec); a Spec too big for one write is planned as one "skeleton" goal (establishes an empty,
   right-length `slides` placeholder) plus one **surgical, full-replace-of-exactly-one-slide** goal per
   slide — the established "one slide per run, full replace" pattern, modelled generically as a full
   replace of one `slides[i]` array element (never an append, never the whole node), mirroring
   `driver.ts`'s existing `watermarkGoal` "replace ONLY X" precedent. Planning fails clearly, before any
   edit is issued, when the Spec cannot be chunked at all (no `slides` array) or when even one slide's
   own surgical goal alone still exceeds the limit. The executor (`injectLargeCarouselSpec`) issues the
   planned goals in order and stops immediately on the first failure — never continuing past it.
4. **A manual, one-off smoke script** (`src/space-driver/live/smoke.ts`), mirroring
   `src/media-host/live/smoke.ts`'s shape. See "Fakes / fixtures used" below for exactly what it can and
   cannot do on its own, and the Operator's manual steps.
5. `src/space-driver/driver.ts` gains two **additive** exports (`pollEdit`, `nodeText` — both
   already-existing private helpers, now reused by `carousel-inject.ts`); no other change to `driver.ts`,
   `port.ts`, or `fixtures/fake-space.ts`.

### Files touched

New:
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/space-driver/live/write-limit.ts`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/space-driver/live/write-limit.test.ts`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/space-driver/live/carousel-inject.ts`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/space-driver/live/carousel-inject.test.ts`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/space-driver/live/smoke.ts` (manual only, never run by `npm test`)
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/openspec/changes/issue-207-live-magnific-adapter-write-limit/` (proposal.md, tasks.md, specs/live-space-adapter/spec.md, this file)

Modified:
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/space-driver/live/adapter.ts` — write-limit check + fresh threadId in `edit()`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/space-driver/live/transport.ts` — `spacesEdit` gains a `threadId` parameter
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/space-driver/live/replay/transport.ts` — signature updated to match (thread id accepted, unused — `_threadId`)
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/space-driver/live/adapter.test.ts` — `StubTransport` records `editCalls`/`editThreadIds`; two new describe blocks
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/space-driver/driver.ts` — `pollEdit`/`nodeText` exported (additive only)
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/src/production-spec/fixtures/news-carousel-specs.ts` — two new fixtures: `largeCarouselSpec()`, `oversizedSlideCarouselSpec()`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit/package.json` — new `space-driver-smoke` script

Untouched (verified): `src/space-driver/port.ts`, `src/space-driver/fixtures/fake-space.ts`,
`src/space-driver/driver.test.ts`, `src/space-driver/live/contract.test.ts`.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-207-live-magnific-adapter-write-limit
npx tsc -p tsconfig.json --noEmit     # typecheck
npm test                               # full suite (hermetic — no live Magnific calls)
npm run test:docs                      # docs-conformance suite
npx openspec validate issue-207-live-magnific-adapter-write-limit --strict
npx openspec validate --all --strict   # whole-repo sanity (44/44 pass)

# the manual smoke script — safe to run any time, makes ZERO live calls (Part A only):
npx tsx src/space-driver/live/smoke.ts
# or: npm run space-driver-smoke
```

Results: `npm test` → **2438 tests / 610 suites / 0 fail** (baseline was 2411/598/0 — +27 tests / +12
suites, all new). `npm run test:docs` → **259 tests / 66 suites / 0 fail** (identical to baseline — zero
doc drift). `openspec validate --strict` on the change → valid. `openspec validate --all --strict` →
44/44 pass.

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #207) | Status | Proof |
|---|---|---|---|
| 1 | The real `spaces_edit` write limit is measured against the live API and posted on the issue **before** design | **Operator-only, not done by this build** | See "Known limits" — the `developer` agent has no live Magnific MCP tools (CLAUDE.md) and cannot re-measure this. The code models the value already established across prior live Producer sessions; a fresh live confirmation + issue comment is the Operator's own action. |
| 2 | The limit is modelled explicitly in code, citing the measured value | **Done** | `write-limit.ts`'s `SPACES_EDIT_WRITE_LIMIT_CHARS`; `write-limit.test.ts` (8 tests, incl. boundary-inclusive-at-4000, error citing both numbers); `adapter.test.ts`'s "the write limit is checked FIRST" describe block (3 tests: within-limit forwarded, over-limit refused with zero transport calls, ~17 KB goal refused). |
| 3 | A ~17 KB carousel Spec reaches the canvas intact under the modelled limit | **Done** | `carousel-inject.test.ts`: "issues exactly 8 edits (1 skeleton + 7 slides), every single one within the modelled limit"; "no single edit ever embeds the FULL spec"; "reassembling the issued per-slide edits reproduces the original slides exactly (round-trips through the port)"; "confirms the node's text changed after the full chunked sequence". |
| 4 | A fresh `threadId` is used per injection | **Done** | `adapter.test.ts`'s "a FRESH threadId is generated for every injection" describe block (2 tests: default `crypto.randomUUID()` gives two distinct real-UUID-shaped ids across two edits; an injected generator is threaded through verbatim, never repeated across 3 edits). |
| 5 | A live adapter implements every `SpaceMcpPort` method | **Pre-existing (issue #40), unaffected** | `adapter.test.ts`/`contract.test.ts` — all 7 port methods still covered; suite green. |
| 6 | A contract test runs the adapter against captured live responses | **Pre-existing, unaffected** | `contract.test.ts` — the shared `FakeSpace`/`LiveSpaceAdapter` battery, still green (its `edit()` calls use small goals well under the limit, so behavior is unchanged). |
| 7 | A manual smoke script, following `media-host/live/smoke.ts`'s shape | **Done** | `src/space-driver/live/smoke.ts` — not a `*.test.ts` file, imported by nothing (`grep` confirmed), excluded from both globs by filename. Manually run: `npx tsx src/space-driver/live/smoke.ts` — Part A passes standalone (see run output below); Part B prints the Operator's runbook. |
| 8 | `npm test` never calls the live Magnific API | **Done** | Full suite run (2438/610/0 fail) — every test runs against `FakeSpace`, `ReplayMcpTransport`, or a hand-rolled stub/poison transport; `smoke.ts` is excluded from the `src/**/*.test.ts` glob by filename and imported nowhere. |
| 9 | `fake-space.ts` still satisfies the port; driver suite unchanged | **Done** | `git diff` shows zero changes to `fake-space.ts` or `driver.test.ts`; both files byte-identical to `main`; the full suite (including `driver.test.ts`'s ~90 tests) is green. |

### Fakes / fixtures used

- **The Magnific fake** (`src/space-driver/fixtures/fake-space.ts`, `FakeSpace`) — used unmodified by
  `carousel-inject.test.ts`'s executor tests (via its already-public `editGoals` recorder) and by the
  small-Spec-passthrough test. **Flag: this is the sanctioned Magnific fake; no live Space was touched.**
- **`ReplayMcpTransport`** (`src/space-driver/live/replay/transport.ts`) — replays the sanctioned live
  capture's fixture files verbatim (`src/space-driver/fixtures/live-captures/`); unaffected by this
  slice's new tests (its signature was updated to match the new `threadId` parameter, ignored/unused).
  **Flag: record/replay of a real captured session, never a live call.**
- **Hand-rolled `LiveMcpTransport` stubs** — `adapter.test.ts`'s `StubTransport` (extended with
  `editCalls`/`editThreadIds` recorders) and `carousel-inject.test.ts`'s `FailingAtNthEditSpace` (a
  `SpaceMcpPort` stub proving mid-sequence-failure stops immediately). **Flag: pure in-memory doubles, no
  network, no credentials.**
- **`smoke.ts`'s own Part A doubles** — a `poisonedTransport()` (throws if ANY method is ever called —
  proves the oversized-goal path makes genuinely zero calls, not just "didn't happen to") and a
  `recordingTransport()` (records the within-limit call + its real generated thread id, returns a
  well-formed fake `operationId`). **Flag: these ARE the Magnific fake/stand-in for this manual script's
  standalone Part A — explicitly not live; no credentials, no network, safe to run any time.**

None of the above ever calls a live `spaces_*`/`creations_*` MCP tool. This build agent does not have
the `magnific` MCP tools and never reached for them.

### The two-part live picture, stated plainly

**(a) Covered by the fake/replay harness (this build, `npm test`):** the write-limit check running
before every transport call; the fresh-thread-id generation; the chunked carousel-injection planner and
executor, including its failure-mode edge cases (oversized single slide, no `slides` array, mid-sequence
failure); all pre-existing `SpaceMcpPort` method coverage against the real captured shapes
(`contract.test.ts`). Every one of these tests is deterministic, offline, and spends nothing.

**(b) The Operator's own manual live-smoke steps (never in the suite):**

1. Run `npx tsx src/space-driver/live/smoke.ts` (or `npm run space-driver-smoke`) — Part A is
   standalone and safe to run any time; confirm it prints "Part A PASSED".
2. Inside an attended Claude Code session **with the `magnific` MCP tools bound** (this build agent
   never has them), against a real, ideally scratch/disposable Space, follow Part B's printed runbook:
   - Call `spaces_state`, note the JSON Master node's current text.
   - Call `spaces_edit` with a small scratch goal (e.g. `{"smoke":"issue-207-A"}`); note the returned
     `operationId`/`thread_id`.
   - Poll `spaces_edit_status` to terminal (`allTerminal:true`, `workflowStatus:"success"`).
   - Call `spaces_state` again; confirm the JSON Master text now reads the scratch marker.
   - Repeat with a second scratch goal (`{"smoke":"issue-207-B"}`); confirm its `thread_id` **differs**
     from the first's.
   - Check Magnific's own credit ledger for no unexpected credit line (an edit-only smoke, no
     `spaces_run`).
   - Restore the node (or leave the scratch marker on a disposable board) — leave no unexplained state.
3. **What a PASS looks like:** all of the above complete exactly as described, with two different
   thread ids and a confirmed-changed readback. A truncated node value at step 4, a shared thread id at
   step 5, or any unexpected credit line at step 6 is a **FAIL** — file it back onto issue #207 with the
   raw tool responses, since that would be exactly the "flipped record" this ticket asked to settle.
4. **Separately, per acceptance criterion #1:** post the actual measured `spaces_edit` cap (and what
   happens when it's exceeded) as a comment on issue #207 — this is the fresh, first-party measurement
   this build could not perform itself.

### Self-review notes

- Initially added an `editThreadIds` recorder to `ReplayMcpTransport` "for completeness"; removed it in
  self-review since nothing read it (the `adapter.test.ts` stub coverage of thread-id freshness is
  already direct and sufficient) — kept the `threadId` parameter (required by the interface) but
  underscore-prefixed it as unused, consistent with the existing `_spaceId` convention in the same
  method.
- `smoke.ts`'s Part A was tightened from a single "prove the refusal" check into two real, load-bearing
  checks (within-limit forwarded WITH a real thread id, over-limit refused with zero calls via a
  poisoned transport) rather than one assertion plus a skipped note — this makes the standalone script
  itself a genuine (if narrow) proof, not just a printed runbook.
- Considered widening `driver.ts`'s exported `DriverErrorCode` union to share error codes with
  `carousel-inject.ts`; decided against it — `carousel-inject.ts` defines its own narrow
  `CarouselInjectErrorCode` (with an explicit `fromInjectError` translator for the delegated single-shot
  path) so `driver.ts`'s own public error taxonomy is completely untouched, keeping the "driver suite
  unchanged" boundary unambiguous.
- Confirmed every acceptance criterion this build can actually prove maps to a named test (table above);
  the two it structurally cannot (#1's live measurement, and the live portion of #7) are named explicitly
  rather than silently skipped.

### Known limits

- **Acceptance criterion #1 (a fresh live measurement posted to issue #207) is NOT done by this build.**
  This agent has no live Magnific MCP tools by design (hermetic build, CLAUDE.md) and cannot perform it.
  The code models the previously-established value (4,000 chars) rather than re-deriving it; the
  Operator's live smoke run (Part B above) is both the verification of this build's modelling AND the
  opportunity to post a fresh, first-party confirmation to the issue.
- **`injectLargeCarouselSpec` is not yet wired into `driveToNextGate`'s "first" leg.** Wiring it in would
  change the generic run-until-gate engine's behavior for every Recipe (when to chunk, whether a
  gateless Recipe's single leg should auto-detect a big Spec, etc.) — a separate, deliberately deferred
  design decision, not assumed here. Today, a caller that wants chunked carousel injection calls
  `injectLargeCarouselSpec` directly instead of `injectSpec`.
- **The chunked executor's final readback confirm is "did the text change", not "does it match
  byte-for-byte"** — deliberately, since a live Space's read API itself truncates large node values at
  ~1,900 chars (`text-truncation.ts`), so a full-content live confirm of a >4 KB node is not obtainable
  by ANY design, chunked or not. This mirrors `injectSpec`'s own existing, accepted confirm semantics.
- **The "one slide per run, full replace" surgical-edit semantics (replacing `slides[i]` while leaving
  the rest of the JSON untouched) rely on the live in-canvas agent correctly interpreting that natural-
  language instruction** — this is exactly the established live practice the ticket names, but it is not
  independently re-verified live by this build (see the Operator runbook above, which is the closest
  available proof point for it: the readback-confirmed round-trip in step 2/4).
