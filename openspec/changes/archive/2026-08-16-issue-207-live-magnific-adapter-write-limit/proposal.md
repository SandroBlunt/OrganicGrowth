## Why

Issue #207 (parent #195). `src/space-driver/driver.ts` — the generic run-until-gate engine — is real,
typed, and covered, and the live `SpaceMcpPort` adapter behind it (`src/space-driver/live/adapter.ts`,
issue #40) already implements every port method against real captured shapes. Neither has a production
caller yet; the live pipeline today is driven by an attended agent following English SKILL instructions
(ADR-0008). This slice is a shim on the existing adapter, not a build from scratch — but it closes a
real gap the record has flipped on twice: does the live `spaces_edit` tool accept a whole ~17 KB
carousel Production Spec in one call, or does it cap the query far below that?

**The `developer` build agent cannot re-measure this live** — it has no Magnific MCP tools by design
(hermetic build, CLAUDE.md) — so this slice does not re-derive the cap itself. It models the value
already established across prior live Producer sessions (recorded operational knowledge: the MCP
`spaces_edit` query caps at ~4,000 characters; a shared edit thread truncates the JSON node after
roughly 40 edits; append-style multi-call chunking is broken; "one slide per run, full replace" is what
actually works) **explicitly in code**, checked **before** any write is attempted, so an oversized goal
is refused clearly rather than silently truncated — the exact failure mode ("a spec that looked
injected but lost its tail") this project has already been bitten by once. A fresh, first-party live
re-measurement, posted as a comment on issue #207, remains a separate task only the Operator can run
(they have live Magnific access; this agent does not).

## What Changes

- **The write limit is modelled explicitly, mirroring the existing read-side pattern.** A new
  `src/space-driver/live/write-limit.ts` (parallel to the existing `text-truncation.ts`) exports
  `SPACES_EDIT_WRITE_LIMIT_CHARS` (4000) and `assertWithinWriteLimit`, which throws a clear, typed
  `WriteLimitExceededError` — citing the actual length and the cap — for any goal over the limit.
- **`LiveSpaceAdapter.edit()` checks the limit FIRST**, before the transport is ever called — an
  oversized goal makes zero live calls, spends zero credits, mutates no board.
- **A fresh `threadId` is generated for every single live edit.** `LiveMcpTransport.spacesEdit` gains an
  explicit `threadId` parameter; `LiveSpaceAdapter` generates one (`crypto.randomUUID()` by default,
  injectable for tests) per call — never reusing one across edits, per the established ~40-edit shared-
  thread truncation finding.
- **A ~17 KB News Carousel Spec reaches the canvas intact under the modelled limit.** A new
  `src/space-driver/live/carousel-inject.ts` provides a pure planner (`planCarouselInject`) and an
  executor (`injectLargeCarouselSpec`): a Spec that already fits in one write delegates straight to the
  existing, unchanged `injectSpec` (no behavior change for the wired Character Explainer Recipe or a
  small carousel Spec); an oversized Spec is planned as one skeleton write (establishes an empty,
  right-length `slides` placeholder) plus one surgical, full-replace-of-one-element write per slide — the
  "one slide per run, full replace" pattern, modelled generically as a full replace of exactly one
  `slides[i]` array element, never an append and never the whole node. Planning fails clearly — before
  any edit is issued — when the Spec cannot be chunked within the limit at all (no `slides` array, or a
  single slide alone still too big). Execution stops immediately on the first edit failure, never
  continuing past it.
- **A manual, one-off smoke script**, `src/space-driver/live/smoke.ts` (mirroring
  `src/media-host/live/smoke.ts`'s shape: not a `*.test.ts` file, imported by nothing, never run by
  `npm test`). Its Part A runs standalone (zero live calls, zero credentials) and proves the write-limit
  refusal genuinely happens at the `LiveSpaceAdapter` boundary; it prints Part B, the exact runbook the
  Operator performs by hand inside an attended session with the `magnific` MCP tools, since a spawned
  Node process has no bridge into that tool-calling channel (see the Build Report for the full
  explanation and the exact PASS/FAIL criteria).
- **The existing Magnific fake and the driver test suite are untouched.** `src/space-driver/driver.ts`
  gains two additive exports (`pollEdit`, `nodeText` — both already-existing private helpers, now reused
  by `carousel-inject.ts`) and nothing else; `src/space-driver/fixtures/fake-space.ts` is not modified at
  all.

## Non-Goals (explicitly out of scope for this slice)

- **A fresh live re-measurement of the write cap, posted as an issue #207 comment.** The `developer`
  build agent has no live Magnific MCP tools; this is the Operator's own action, documented as a Known
  Limit in the Build Report.
- **Wiring `injectLargeCarouselSpec`/chunked injection into `driveToNextGate`'s "first" leg.** That would
  change the generic run-until-gate engine's behavior for every Recipe and is a separate, deliberately
  deferred decision — this slice adds the capability without wiring it in yet.
- **Any live `spaces_*`/`creations_*` MCP call from this agent, at any point.** Every test runs against
  the existing `FakeSpace` or the record/replay `ReplayMcpTransport`/hand-rolled stubs — hermetic
  throughout.

## Capabilities

### Modified Capabilities (ADDED Requirements only — no existing requirement text changes)

- `live-space-adapter`: adds the write-limit-checked-first requirement, the fresh-thread-per-injection
  requirement, the chunked News Carousel injection requirement, and the manual smoke-script requirement.

## Impact

- **New code:** `src/space-driver/live/write-limit.ts` (+`.test.ts`),
  `src/space-driver/live/carousel-inject.ts` (+`.test.ts`), `src/space-driver/live/smoke.ts` (manual,
  never run by `npm test`). `src/production-spec/fixtures/news-carousel-specs.ts` gains two new fixture
  builders (`largeCarouselSpec`, `oversizedSlideCarouselSpec`).
- **Modified code:** `src/space-driver/live/adapter.ts` (write-limit check + fresh threadId in `edit()`),
  `src/space-driver/live/transport.ts` (`spacesEdit` gains a `threadId` parameter),
  `src/space-driver/live/replay/transport.ts` and `src/space-driver/live/adapter.test.ts` (stub
  signatures updated to match), `src/space-driver/driver.ts` (`pollEdit`/`nodeText` exported, both
  unchanged in behavior), `package.json` (new `space-driver-smoke` script).
- **Untouched:** `src/space-driver/port.ts` (`SpaceMcpPort` itself — no new port method),
  `src/space-driver/fixtures/fake-space.ts`, `src/space-driver/driver.test.ts`.
- **Hermetic, no live Space call anywhere in the suite.** Every test runs against `FakeSpace`,
  `ReplayMcpTransport`, or a hand-rolled `LiveMcpTransport` stub/poison; `smoke.ts`'s own standalone Part
  A makes zero network calls of any kind.
- **Always-rules upheld:** generate-never-publish/public-metrics-only/relative-not-absolute/explicit-
  attribution are untouched (no content-generation, metrics, or attribution logic here);
  ledger-as-source-of-truth is untouched (this slice writes no ledger).
