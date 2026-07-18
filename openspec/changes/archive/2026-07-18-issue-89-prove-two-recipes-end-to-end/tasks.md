## 0. Pre-flight

- [x] 0.1 Confirm the issue is `ready-for-agent` and every "Blocked by" issue (#86, #88, #84) is
  closed/merged.
- [x] 0.2 Confirm the stale `issue-60-second-recipe-carousel` branch is already deleted
  (`git branch -a` — absent) and its salvage tag `archive/issue-60-second-recipe-carousel` exists.
  Inspect the tag's tree for anything not yet ported forward by #81-#88 — found
  `src/commands/two-recipes.test.ts`'s tracer-bullet SHAPE, salvaged (rewritten against the current
  API) as this slice's `src/producer/two-recipes-end-to-end.test.ts`; nothing else in the tag is still
  needed.
- [x] 0.3 Read the live capture (`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`
  + its `README.md`) — record the Operator's node-name-alignment decision (2026-07-18).

## 1. Node-name alignment to the live canvas (test-first)

- [x] 1.1 Update `execution-protocol/protocol.test.ts`'s carousel-protocol assertions to expect
  `start: "JSON Master"` (was `"Slides Prompts"`) — confirms they fail against the OLD value first.
- [x] 1.2 Update `canonicalCarouselProtocol()` (`execution-protocol/protocol.ts`) to declare
  `start: "JSON Master"`; update its doc comment.
- [x] 1.3 Update `recipe/registry.test.ts`'s News Carousel assertions to expect `promptNode`/
  `space.nodes.clipRunPoint === "JSON Master"` and `canvasInputs.mediaSlots` keyed `"Brand_Logo"`.
- [x] 1.4 Update `recipe/registry.ts`'s `NEWS_CAROUSEL_SLIDES_NODE_NAME` to `"JSON Master"` and the
  `mediaSlots` map key from `"Brand Logo"` to `"Brand_Logo"` (the `brandAssetKey` store key is
  UNCHANGED); update doc comments (including the shared `MediaSlotMap`/`BrandAssetMediaSlot` doc
  explaining a brand-asset slot's map key doubles as its physical canvas node).
- [x] 1.5 Update every other dependent test/fixture/doc: `producer/bind-media.test.ts`,
  `recipe/phase-contract.test.ts`, `space-driver/driver.test.ts` (relabel its two GENERIC
  "prove-genericity" tests with an explicitly synthetic node name, since the real News Carousel node
  now coincides with the wired Recipe's own literal "JSON Master" — the old assertion that it was
  NOT "JSON Master" would otherwise become misleading), `production-spec/news-carousel-contract.ts`
  (doc comments), `.claude/skills/produce-news-carousel/SKILL.md`.
- [x] 1.6 Confirm the SKILL.md edit does not trip
  `produce-news-carousel-skill.docs-test.ts`'s "never hardcodes a Brand/Format's logo reference name"
  guard (it forbids `Brand_Logo`/`Straw_Motion_Logo` — the SKILL never binds media, so this is
  unaffected by the canvas-node rename).
- [x] 1.7 Run the full suite; confirm green with the node names aligned everywhere.

## 2. Rebuild the FAKE Carrousel to the real, captured shape (test-first)

- [x] 2.1 Design the fake's exported node/connection/settings/creation-id inventory from the capture
  (`00-spaces_show.fullboard.json`): 7 nodes (names + real Magnific `type`s), 5 connections (source/
  target names + ports + data type), the Image Generator's real settings, the 7 real slide creation
  identifiers from "Generated slides".
- [x] 2.2 Write failing test `src/producer/fixtures/fake-carousel-space.test.ts`: parses the capture
  file directly (never a hand-typed copy) and asserts the fake's exported constants equal it exactly —
  node names+types+order, connections (ids resolved to names), the Producer Protocol's parsed
  run_points (`start: "JSON Master"`, zero gates) equal to `canonicalCarouselProtocol()`, the Image
  Generator settings, the "Generated slides" creation-id list, and that the OLD placeholder names are
  NOT present on the real canvas at all.
- [x] 2.3 Rebuild `src/producer/fixtures/fake-carousel-space.ts`: seed all 7 named nodes in
  `readState()`; `edit()` distinguishes the inject goal (targets "JSON Master") from the media-bind
  goal (targets "Brand_Logo") by name, exactly as before but with the real names; `runStatus()` reports
  the real downstream chain's fired node names and the real 7 slide creation ids; `fetchCreations()`
  resolves them to synthetic media URLs (never a real, expiring signed URL). Drop the constructor's
  `logoReferenceNodeName` parameter (no longer needed — the logo node name is now a fixed, real
  constant, `CARROUSEL_BRAND_LOGO_NODE_NAME`).
- [x] 2.4 Run `fake-carousel-space.test.ts`; confirm green (AC1).
- [x] 2.5 Update `src/producer/carousel-end-to-end.test.ts`'s call sites for the new export names and
  the dropped constructor parameter (reads the bind-target node name off the Recipe's own
  `canvasInputs.mediaSlots` map key, never re-typed as a literal); confirm still green, byte-identical
  behaviour (same edit/run call counts).

## 3. The tracer bullet — one Idea, two Recipes, two Assets, end-to-end (test-first)

- [x] 3.1 Write failing test `src/producer/two-recipes-end-to-end.test.ts`, Step 1: seed one accepted
  Idea (Straw Motion's real idea-01 subject, with a pre-established Channel baseline so the two
  Recipes' later, genuinely different engagement can diverge into two different scores) in a temp
  ledger; `enqueueOnAccept` with both chosen Recipes; assert TWO jobs, one per Recipe, the wired job's
  gate `"cast"` and the carousel job's gate `null` (AC3's gate-count contrast, at the queue level).
- [x] 3.2 Step 2: drive the News Carousel job's SOLE leg against the rebuilt `FakeCarouselSpace` —
  author (the real, committed Straw Motion Spec fixture, self-audited both generically and against the
  graduated checklist) -> bind the real committed Brand Asset logo -> `driveToNextGate` (zero gates,
  FINISHES immediately) -> compose Copy (this Recipe's own 2200/0-2 shape) -> `writeAsset` `produced` ->
  `markDone`. Assert it never visits `awaiting_pick`.
- [x] 3.3 Step 3: drive the Cast job's FIRST leg against `FakeSpace` to a pause; `writeAsset`
  `in_production`/`pending_gate: "cast"`; `markAwaitingPick`. Assert `/queue`'s output shows the SAME
  Idea's two Recipes at genuinely DIFFERENT stages (`awaiting_pick` vs `done`) and `/report`'s rolled-up
  Idea status is the EARLIEST Asset stage (`in_production`) even though the carousel sibling is already
  `produced` (AC3, AC4).
- [x] 3.4 Step 4: resolve the Operator's pick (`enqueueNextLeg` + `markPickConsumed`, mirroring
  `commands/pick.ts`'s own `resumeGate` mechanics), drive the resumed leg to FINISHED, compose the
  wired Recipe's OWN distinct Copy (different `mediaContext`, different shape), `writeAsset` `produced`,
  `markDone`. Assert both Assets now exist with distinct `asset_url`s and distinct composed captions,
  each within its OWN Recipe's copy-shape bound. Log BOTH Posts via `/log-post` with distinct URLs;
  assert explicit, non-collapsed `(idea, recipe)` attribution (AC2).
- [x] 3.5 Step 5: run `/track-performance` once, with a fake Apify port returning DIFFERENT engagement
  for the two logged URLs; assert the two Assets' `performance_score`s and `metrics` diverge and are
  written independently (never touching the sibling Asset), and `/report` surfaces both logged Post
  URLs plus the predicted-vs-measured distinction (AC4).
- [x] 3.6 Run the whole file; confirm all 5 steps green, sequentially dependent via `before`/`after`
  shared temp-file state (mirrors `brand-asset/store.test.ts`'s own convention).

## 4. Self-review + full green

- [x] 4.1 Re-read every changed/new file for dead code, unused exports, drifted docstrings.
- [x] 4.2 Confirm the character Recipe's behaviour is provably unchanged — the untouched
  `driver.test.ts` wired-Recipe describe blocks all still pass, byte-identical assertions.
- [x] 4.3 Run `npx tsc --noEmit`, `npm test`, `npm run test:docs`, `npm run build`, and
  `openspec validate --all --strict`; all green.
- [x] 4.4 Write the Build Report into `handoff.md`, mapping every issue #89 acceptance criterion to its
  proving test(s), flagging the Magnific fakes used (`FakeSpace` + the rebuilt `FakeCarouselSpace`) and
  the fake `PerformanceScrapePort`, the node-name alignment + why, the stale-branch confirmation,
  self-review notes, and known limits.
