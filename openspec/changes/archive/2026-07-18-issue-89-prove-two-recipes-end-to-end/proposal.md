## Why

Issues #81/#82/#83/#84/#85/#86/#87/#88 built every piece the recipe architecture (map #70, ADRs
0015-0018) needs — the typed registry, the Brand Asset store, the Baseline Prompt pointer, the
per-Asset performance tracker, the checkable Phase Contracts, the live "Carrousel" capture, and the
thin recipe-generic Producer — but nothing has yet PROVEN they all work together, on one Idea, at once.
This slice is the tracer bullet: it rebuilds the FAKE Carrousel canvas to the REAL single-lane shape
(replaying #86's sanctioned live capture) and drives ONE accepted Idea through BOTH wired Recipes —
*Character Explainer with Cast* (one gate) and *News Carousel* (zero gates) — to TWO independent
Assets, each with its own composed Copy, each independently attributable, each independently tracked.
It also closes a real correctness gap #86's capture exposed: the News Carousel Recipe's declared canvas
node names (`"Slides Prompts"`, `"Brand Logo"`) do not exist on the real, captured canvas at all — the
Operator chose (2026-07-18, recorded in the capture's own README) to align the BUILD to the canvas
(`"JSON Master"`, `"Brand_Logo"`) rather than rename the canvas. Without this fix the thin Producer
would inject into a node that does not exist.

This slice also retires the stale, never-merged `issue-60-second-recipe-carousel` branch: it was
already deleted (tagged `archive/issue-60-second-recipe-carousel` for salvage) before this slice began;
its most reusable artifact — `src/commands/two-recipes.test.ts`'s tracer-bullet shape — is salvaged here
as `src/producer/two-recipes-end-to-end.test.ts`, rewritten against the CURRENT (post map-#70) API
surface (`driveToNextGate`, the rebuilt `FakeCarouselSpace`, the per-Asset ledger grain) rather than the
pre-redesign one the tag carries (`driveSelectedRunPoints`, `asset_urls` arrays — both retired).

## What Changes

- **Node-name alignment to the live canvas (issue #86 decision, applied here):**
  - `src/execution-protocol/protocol.ts`'s `canonicalCarouselProtocol()` now declares its sole
    run-point at `start: "JSON Master"` (was the placeholder `"Slides Prompts"`, which named no real
    canvas node).
  - `src/recipe/registry.ts`'s `NEWS_CAROUSEL` Recipe now declares `canvasInputs.promptNode: "JSON
    Master"` and its brand-asset media slot's map key (which doubles as its physical canvas node,
    mirroring how `promptNode` already works — a brand-asset slot has no separate
    `pinnedReference`-style field) is `"Brand_Logo"` (was `"Brand Logo"`). The Brand Asset STORE key
    (`brandAssetKey: "brand-logo"`) is UNCHANGED — only the on-canvas node name changes. This is a
    DIFFERENT node, on a DIFFERENT Space, than the wired Recipe's own `"JSON Master"` — the two share
    only a name, never a canvas.
  - Every dependent test/fixture/doc that named the old placeholders is updated:
    `execution-protocol/protocol.test.ts`, `recipe/registry.test.ts`, `producer/bind-media.test.ts`,
    `recipe/phase-contract.test.ts`, `space-driver/driver.test.ts` (its two GENERIC "proves genericity"
    tests, which never claimed to model the real News Carousel node, are re-labelled with an explicitly
    synthetic node name so they stay honest now that the real name coincides with the wired Recipe's
    own literal "JSON Master"), `production-spec/news-carousel-contract.ts`'s doc comments, and
    `.claude/skills/produce-news-carousel/SKILL.md`.
- **The FAKE Carrousel (`src/producer/fixtures/fake-carousel-space.ts`) is REBUILT to the real,
  captured single-lane shape** — all 7 nodes (`Producer Protocol`, `Assistant`, `Generated slides`,
  `Image Generator #21`, `JSON Master`, `List`, `Brand_Logo`) and all 5 connections from
  `src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`, plus the real
  Image Generator settings (`imagen-nano-banana-2-flash`, `3:4`, `1k`) and the real 7 slide creation
  identifiers from the capture's "Generated slides" list. A NEW test,
  `src/producer/fixtures/fake-carousel-space.test.ts`, parses the capture file directly and asserts the
  fake's exported node/connection/protocol/settings constants equal it exactly — so the fake can never
  silently drift from the live canvas it stands in for (AC1).
- **`src/producer/two-recipes-end-to-end.test.ts`** — the tracer bullet: ONE accepted Idea
  (`idea-2026-W29-01`, Straw Motion's real idea-01 subject) enqueued with BOTH chosen Recipes
  (`enqueueOnAccept`), driven through the zero-gate News Carousel job straight to a `produced` Asset
  (no pause, ever) and through the one-gate Cast job's pause -> Operator pick -> resumed render, each
  composing its OWN distinct Copy (different `copyShape`, different `mediaContext`), each logged via
  `/log-post` with explicit `(Idea, Recipe)` attribution, each shown at its OWN independent stage by
  `/queue` and `/report` (proving the SAME Idea's two Recipes sit at genuinely different points in the
  pipeline mid-flight), and each scored INDEPENDENTLY by `/track-performance` against the ONE Channel
  baseline. Every Space call goes through a Magnific fake (`FakeSpace` for the wired Recipe, the
  rebuilt `FakeCarouselSpace` for News Carousel); `/track-performance`'s Apify call goes through a fake
  `PerformanceScrapePort`. No live call anywhere; the real, committed Straw Motion `brand-profile.yaml`
  and `assets/brand-logo.png` are read ONLY (never mutated) for authenticity.
- **The stale `issue-60-second-recipe-carousel` branch** was already deleted before this slice began
  (confirmed: absent from `git branch -a`); its salvage lives in git tag
  `archive/issue-60-second-recipe-carousel`. This slice deliberately salvages its
  `src/commands/two-recipes.test.ts` tracer-bullet SHAPE (rewritten against the current API — see
  above); nothing else in the tag is still needed (its other files are earlier snapshots of modules
  already superseded byte-for-byte by #81-#88's real, merged versions).

## Non-Goals (explicitly deferred)

- **Driving either Recipe against the LIVE Magnific Space.** As with every prior recipe-architecture
  slice, this proves the wiring against the FAKE only — no live Space, no Magnific MCP tools (the
  `developer` agent holds none).
- **A multi-image carousel Asset representation.** The driver's `AssetResult` still carries one
  representative creation id/URL per finished leg (`space-driver/driver.ts`'s `finishLeg`) — this slice
  does not change that shape; the carousel's produced Asset's `asset_url` is the first of the real 7
  captured slide identifiers, mirroring the existing (#88) simplification.
- **Renaming the media slot's product-facing name away from its physical node name.** The `MediaSlotMap`
  design already allows a slot's name to differ from its canvas target (as the character Recipe's
  `"Selected Character"` -> `"Character #2"` already does); this slice does not add a NEW field for a
  brand-asset slot's physical target — it aligns the EXISTING map-key-is-the-node-name convention to the
  real captured name.

## Capabilities

### Added Capabilities

- `two-recipe-tracer`: the end-to-end proof that one accepted Idea, run through BOTH wired Recipes
  against their respective Magnific fakes, yields two independent Assets with distinct composed Copy,
  each independently attributable via `/log-post`, each shown at its own stage by `/queue`/`/report`,
  and each scored independently by `/track-performance` — the integration guarantee no single prior
  slice proved on its own.

### Modified Capabilities

- `recipe-registry`: the News Carousel Recipe's `canvasInputs.promptNode` and its brand-asset media
  slot's map key/canvas-node name are now `"JSON Master"`/`"Brand_Logo"` — the REAL, captured names
  (issue #86) — replacing the placeholders `"Slides Prompts"`/`"Brand Logo"`, which named no real canvas
  node.
- `execution-protocol`: `canonicalCarouselProtocol()`'s sole run-point now targets `"JSON Master"`.
- `producer-conductor`: the `FakeCarouselSpace` fake is rebuilt to the real, captured 7-node/5-connection
  single-lane shape (gains a new Requirement: the fake replays the live capture's exact node inventory,
  proven by a test that parses the capture file directly), and its existing "gate-free Recipe runs
  end-to-end" Requirement is updated to reference the real node names.

## Impact

- **New code:** `src/producer/fixtures/fake-carousel-space.test.ts`,
  `src/producer/two-recipes-end-to-end.test.ts`.
- **Rebuilt:** `src/producer/fixtures/fake-carousel-space.ts` (full node inventory + wiring rebuild).
- **Modified (node-name alignment):** `src/execution-protocol/protocol.ts` (+test),
  `src/recipe/registry.ts` (+test), `src/producer/bind-media.test.ts`, `src/recipe/phase-contract.test.ts`,
  `src/space-driver/driver.ts` (doc comments only), `src/space-driver/driver.test.ts`,
  `src/producer/carousel-end-to-end.test.ts`, `src/production-spec/news-carousel-contract.ts` (doc
  comments only), `.claude/skills/produce-news-carousel/SKILL.md`,
  `src/space-driver/fixtures/live-captures/carrousel/README.md` (Status note appended).
- **Hermetic:** every Space call in the new/changed tests goes through a Magnific fake — `FakeSpace`
  (character Recipe, untouched) and the rebuilt `FakeCarouselSpace` (News Carousel Recipe). The
  `/track-performance` proof uses a fake `PerformanceScrapePort`. No live `spaces_*`/`creations_*` or
  Apify call anywhere; no credits; no board mutation. The `developer` agent was not given the Magnific
  MCP tools and never reached for them.
- **Always-rules upheld:** generate-never-publish (both Recipes' Assets are rendered and logged, never
  auto-published — `/log-post` only records a URL the Operator already published); public-metrics-only
  and relative-not-absolute (the tracer bullet's `/track-performance` step scores both Assets against
  the ONE seeded Channel baseline, never a raw count); explicit-attribution (`/log-post`'s own
  `(idea, recipe)` match — never inferred, proven again here with two REAL, driven Assets rather than a
  hand-seeded ledger); ledger-as-source-of-truth (every status change — `in_production` ->
  `produced` -> `posted` -> `tracking`/`scored` — is written via `AssetStore.writeAsset`).
