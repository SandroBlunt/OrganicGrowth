## Why

ADR-0010 named the target shape — a Recipe owns its gates, canvas, Spec/copy shapes; the Producer is a
thin, recipe-generic conductor — and issues #81/#82/#85/#87 built every piece that shape needs: the
typed registry (canvas inputs, phase contracts), the `BrandAssetStore`, the checkable Phase Contracts,
and the `produce-news-carousel` Skill. What remained undone was the Producer itself: today's
`.claude/agents/producer.md` still hard-codes the ONE wired Recipe's own procedure inline (compose a
Pixar-3D Spec, inject into `JSON Master`, pin `Character #2`, read `production.space_id` off the Brand
Profile) — a second Recipe literally could not run through it. This slice does the last piece of
plumbing ADR-0018 asked for: extract the wired Recipe's own authoring craft into its own Skill
(`produce-character-explainer`, mirroring `produce-news-carousel` byte-for-byte in shape), rewrite the
Producer as a thin conductor that resolves everything Recipe-specific from the registry + that Recipe's
Skill, and — the one piece of REAL production code still missing — generalize the Space driver so it
actually injects into a RECIPE'S OWN prompt node (`Recipe.canvasInputs.promptNode`) instead of the
hard-coded `JSON Master` constant, and can bind a Recipe's brand-asset media slots at all. Without that
last fix the "generic" driver could still never actually run the News Carousel Recipe (it has no `JSON
Master` node) — this slice closes that gap and proves it end-to-end against the fake.

## What Changes

- **`injectSpec`/`DriveLegInput`'s first leg take the Recipe's OWN prompt node**
  (`src/space-driver/driver.ts`): `injectSpec(port, spec, promptNode, poll)` and
  `DriveLegInput.first.promptNode` replace the hard-coded `JSON_MASTER_NODE_NAME` read inside
  `injectSpec` — the wired Recipe still passes `JSON_MASTER_NODE_NAME` (byte-identical value, zero
  behaviour change, proven by the untouched assertions in `driver.test.ts`), while the News Carousel
  Recipe can now pass `"Slides Prompts"`. The `json_master_missing` error code is renamed
  `prompt_node_missing` (never asserted by name in any existing test — safe, generalizing rename).
- **New `bindMediaAsset`/`bindMediaGoal`** (`src/space-driver/driver.ts`): binds a Brand Asset's local
  media file into a named canvas reference node via the Fallback Protocol, REUSING the exact same
  `port.edit`/`port.verifyPinned` primitives `pinPick` already uses — no new `SpaceMcpPort` method, no
  live-adapter/transport change. Mirrors `pinPick`'s shape and failure modes with its own error codes.
- **New `src/producer/` package** — the thin conductor's deep modules:
  - `resolve-format.ts`: `resolveIdeaFormat(idea, ideaId)` — resolves an Idea's Format from the
    ledger's `LedgerIdea.format` field (newly added to `src/ledger/ledger.ts`, defensive/omitted on an
    old pre-multi-format record), returning a clear STOP result when absent — never a crash, never a
    guessed default.
  - `bind-media.ts`: `bindMediaSlots(recipe, resolutions)` — walks `Recipe.canvasInputs.mediaSlots` and
    STOPS the whole bind (a clear, actionable message) the instant a REQUIRED slot has no resolved
    asset (ADR-0016) — never returns a partially-bound "ok" result.
  - `fixtures/fake-carousel-space.ts` (**the Magnific fake**, a second one purpose-built for the News
    Carousel Recipe's genuinely different canvas shape) + `carousel-end-to-end.test.ts`: proves a
    gate-free News Carousel job — author (the real, committed Straw Motion Spec fixture from #87) ->
    bind-media -> bind the Brand Logo -> `driveToNextGate` (zero gates, runs straight through) -> copy
    — all self-audited via `recipe/phase-contract.ts`'s generic auditors, end-to-end against the fake;
    and proves a missing required Brand Asset STOPS before any Space call (`edit`/`run` call counts
    stay zero).
- **`.claude/agents/producer.md` becomes a thin, recipe-generic conductor.** It carries NO
  recipe-specific procedure: it resolves a queue job's Recipe from `src/recipe/registry.ts`, resolves
  the Idea's Format via `resolveIdeaFormat`, runs that Recipe's own producer Skill BY SLUG for the
  author phase, binds media via `bindMediaSlots`/`bindMediaAsset`, drives the canvas via the (already
  generic) `driveToNextGate`, self-audits each phase (`auditAuthorPhase`/`auditBindMediaPhase`/
  `auditCopyPhase`), composes Copy out-of-canvas, and saves the Asset (ledger grain unchanged). The
  canvas id comes ONLY from `Recipe.space.id` — **no Brand Profile field is ever read for it again**.
- **`.claude/skills/produce-character-explainer/SKILL.md`** — the wired Recipe's own authoring craft
  (3 character concepts, 3 Pixar-3D clips ending in the 9:16 line, 3 top-level thumbnails), extracted
  from what `producer.md` did inline, **byte-behaviour-identical**: same contract
  (`production-spec/contract.ts`), same validator/banned-word scan, same author-phase checklist. It does
  NOT drive the Space, pin the Character, or compose Copy — those stay the thin conductor's job,
  unchanged from today's actual behaviour (proven by the untouched, all-green `space-driver/driver.test.ts`
  wired-Recipe suite).
- **`production.space_id`/`production.space_url` are retired** from
  `data/brands/mundotip/brand-profile.yaml`, with a migration-note comment pointing at
  `Recipe.space.id` as the sole source of truth. Grep-verified: no code or agent doc reads
  `production.space_id` any more (only historical ADR prose and this change's own migration-note/test
  strings mention it).

## Non-Goals (explicitly deferred)

- **Driving the News Carousel Recipe live.** As with #81/#87, this slice proves the wiring against the
  FAKE only — no live Space, no Magnific MCP tools (the `developer` agent holds none).
- **Parsing `logoReferenceName` out of a Format's Baseline Prompt document automatically.** The bind
  phase's brand-asset target node name is supplied to `bindMediaAsset` by the caller (the attended
  Producer, reading the Format's Baseline Prompt document as it already does for authoring) — this
  slice does not add a document-parsing capability for it (matches the pattern #85/#87 already
  established: reading structured values out of the document is the LLM Skill's job, not code's).
- **`gate`/`render`/`save` phase auditors.** Still no generic mechanical auditor for these three phases
  (issue #85's own documented limit) — their checklists stay honest prose today.
- **A second live adapter capability.** `LiveSpaceAdapter`/`LiveMcpTransport` are untouched — the new
  `bindMediaAsset` reuses existing port primitives, so no live-adapter change was needed or made.

## Capabilities

### Added Capabilities

- `producer-conductor`: the thin Producer's own deep modules — `resolveIdeaFormat` (Format resolution
  from the ledger, STOP-on-absent) and `bindMediaSlots` (media-slot resolution, STOP-on-missing-required)
  — plus the proof that a gate-free Recipe (News Carousel) runs end-to-end against a purpose-built
  second Magnific fake, and that a missing required Brand Asset stops the run before any Space call.

### Modified Capabilities

- `generic-gate-driver`: `injectSpec`/`DriveLegInput`'s first leg take the Recipe's own `promptNode`
  (no longer hard-coded to `JSON Master`); a new `bindMediaAsset`/`bindMediaGoal` pair binds a Brand
  Asset into a named node via the Fallback Protocol, reusing existing port primitives.
- `producer-skill`: gains the `produce-character-explainer` Skill — the wired Recipe's own authoring
  craft, extracted from `producer.md`, behaviour-identical.
- `docs-conformance`: `producer.md` is rewritten as a thin, recipe-generic conductor with no
  recipe-specific procedure and no `production.space_id` read; `producer-agent.docs-test.ts` pins the
  new shape.

## Impact

- **New code:** `src/producer/resolve-format.ts` (+test), `src/producer/bind-media.ts` (+test),
  `src/producer/fixtures/fake-carousel-space.ts`, `src/producer/carousel-end-to-end.test.ts`,
  `.claude/skills/produce-character-explainer/SKILL.md`,
  `src/production-spec/produce-character-explainer-skill.docs-test.ts`.
- **Modified:** `src/space-driver/driver.ts` (+test updates), `src/space-driver/port.ts` (doc comment
  only), `src/ledger/ledger.ts` (+test) — `format` field, `src/recipe/registry.ts` (doc comments only —
  no type/behaviour change), `.claude/agents/producer.md`,
  `src/production-spec/producer-agent.docs-test.ts`, `src/space-driver/live/driver-over-live.test.ts`
  (call-site updates for the new `promptNode` param — no behaviour change, same `JSON_MASTER_NODE_NAME`
  value), `data/brands/mundotip/brand-profile.yaml` (retire `production.space_id`/`space_url`).
- **Hermetic:** every new/changed test drives the narrow `SpaceMcpPort` through a fake — the existing
  character-Recipe `FakeSpace` (untouched) and the new `FakeCarouselSpace`. No live `spaces_*`/
  `creations_*` call anywhere; no credits; no board mutation. The `developer` agent was not given the
  Magnific MCP tools and never reached for them.
- **Always-rules upheld:** generate-never-publish (the driver still never publishes; the rewritten
  `producer.md` states this explicitly); the banned-word hard filter (rule 9) stays reject-only,
  referenced not duplicated, in both the extracted Skill and the unchanged shared copy step;
  ledger-as-source-of-truth is unaffected (the Asset grain/save shape is untouched — `asset/asset.ts`
  not modified); public-metrics-only/relative-not-absolute are unaffected (no metrics code touched);
  explicit-attribution is unaffected (no Post/attribution code touched).
