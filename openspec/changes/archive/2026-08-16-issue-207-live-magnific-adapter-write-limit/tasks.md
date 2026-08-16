## 1. The write-limit guard — pure deep module (test-first)

- [x] 1.1 Write failing tests (`write-limit.test.ts`) for `exceedsWriteLimit`/`assertWithinWriteLimit`:
  at-the-limit is OK (boundary inclusive), one char over throws, an injected (non-default) limit is
  respected, the thrown `WriteLimitExceededError` carries the exact `length`/`limit` and cites both
  numbers in its message, `SPACES_EDIT_WRITE_LIMIT_CHARS` is 4000.
- [x] 1.2 Implement `src/space-driver/live/write-limit.ts`, mirroring `text-truncation.ts`'s shape.

## 2. Fresh threadId per live edit + the write limit checked FIRST in the adapter (test-first)

- [x] 2.1 Extend `LiveMcpTransport.spacesEdit` to take an explicit `threadId`; update
  `replay/transport.ts` and the `adapter.test.ts` stub(s) to match (recording the thread ids received).
- [x] 2.2 Write failing tests (`adapter.test.ts`): a within-limit goal is forwarded unchanged; an
  oversized goal is refused with `WriteLimitExceededError` and the transport is called ZERO times; a
  ~17 KB-sized goal is refused, never silently truncated; two consecutive edits receive two DIFFERENT
  thread ids (default `crypto.randomUUID()`); an injected thread-id generator is threaded through
  verbatim, never reused.
- [x] 2.3 Implement: `LiveSpaceAdapter.edit()` calls `assertWithinWriteLimit` BEFORE the transport call;
  constructor takes an injectable `newThreadId` (default `crypto.randomUUID`), passed fresh to every
  `spacesEdit` call.
- [x] 2.4 Confirm the full `contract.test.ts`/`driver-over-live.test.ts` batteries still pass unchanged
  (both existing fixtures' goals are well under the limit).

## 3. Chunked News Carousel injection — the ~17 KB Spec reaches the canvas intact (test-first)

- [x] 3.1 Add two realistic fixtures to `production-spec/fixtures/news-carousel-specs.ts`:
  `largeCarouselSpec()` (~16.5 KB, 7 slides, each individually well under the write limit; also valid
  per `validateNewsCarouselSpec`) and `oversizedSlideCarouselSpec()` (one slide alone over the limit).
- [x] 3.2 Write failing tests (`carousel-inject.test.ts`) for `planCarouselInject`: a Spec that already
  fits plans exactly the existing single-shot goal; a ~17 KB Spec plans one skeleton + one goal per
  slide, every goal at/under the limit, and reassembling every per-slide goal's embedded JSON reproduces
  the ORIGINAL slides array exactly; fails clearly (before any edit) when a single slide's own goal
  alone exceeds the limit; fails clearly when the oversized Spec has no `slides` array to chunk by.
- [x] 3.3 Write failing tests for `injectLargeCarouselSpec`: a Spec that fits issues exactly ONE edit,
  identical to `injectSpec`; a ~17 KB Spec issues exactly 8 edits (skeleton + 7 slides), all within the
  limit, no single edit ever embeds the whole Spec, reassembling the issued edits round-trips the
  original slides exactly, and the final readback confirms the node's text changed; planning failure
  issues ZERO edits; a mid-sequence edit failure (3rd of 8) stops immediately, never issuing the
  remaining edits.
- [x] 3.4 Implement `src/space-driver/live/carousel-inject.ts`: `skeletonGoal`, `slideReplaceGoal`,
  `extractSlideFromGoal`, `planCarouselInject`, `injectLargeCarouselSpec`. Export `pollEdit`/`nodeText`
  (additive) from `driver.ts` for reuse; `driver.ts`'s own behavior and `driver.test.ts` untouched.

## 4. The manual live smoke script (never run by `npm test`)

- [x] 4.1 Implement `src/space-driver/live/smoke.ts`, mirroring `media-host/live/smoke.ts`'s shape (not
  a `*.test.ts` file, no other module imports it, real entry-point guard via
  `fileURLToPath(import.meta.url) === resolve(entryPoint)`). Part A runs standalone (zero live calls):
  proves a within-limit goal reaches a recording transport with a real generated threadId, and an
  oversized goal is refused by a POISONED transport that throws if ever called at all. Part B prints the
  exact runbook the Operator performs by hand in an attended session with the `magnific` MCP tools
  (spawned Node processes have no bridge into that tool-calling channel), with explicit PASS/FAIL
  criteria.
- [x] 4.2 Add the `space-driver-smoke` script to `package.json`, in the style of `media-host-smoke`.
- [x] 4.3 Manually run `npx tsx src/space-driver/live/smoke.ts` and confirm Part A passes and Part B
  prints a complete runbook.

## 5. OpenSpec + full-suite green + self-review + Build Report

- [x] 5.1 Author the spec delta (`specs/live-space-adapter/spec.md`, `## ADDED Requirements`); run
  `openspec validate --strict` until green.
- [x] 5.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, and `npm run test:docs` — all green, more
  tests than both baselines (2411/598 and 259/66), zero doc drift.
- [x] 5.3 Self-review pass: confirm no dead code, tighten module boundaries, confirm every issue #207
  acceptance criterion maps to a specific test (or is explicitly named as the Operator's own manual
  step, for the two that cannot run inside a hermetic build).
- [x] 5.4 Write the Build Report into `handoff.md`, explicitly separating what the fake/replay harness
  covers from the Operator's own manual live-smoke steps.
