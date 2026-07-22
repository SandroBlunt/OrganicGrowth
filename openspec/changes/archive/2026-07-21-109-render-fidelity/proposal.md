## Why

Issue #106 (the "carrousel improvements" epic), items 8, 10, 11, 12: live News Carousel renders show
four render-fidelity defects traced to the Straw Motion "Unhypped News" **Baseline Prompt document**
(`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`) under-specifying what it
asks the image model for:

- **(8)** small invented UI text (fake product-screen labels) renders as misspelled gibberish (e.g.
  "ChaGPT Work" for "ChatGPT Work") because the document does not tell the model to prefer a real,
  recognizable product/screen over fine invented UI copy, nor what to do when no real screen exists.
- **(10)** the on-card supporting line beneath the stat callout has no stated minimum size, and reads
  too small in practice.
- **(11)** some placements — the full-width-bottom-card style's cropped photo region, the top-card
  style's photo-below region, and the small-floating-badge style's "nearly the entire frame" — leave
  room for the model to under-fill the photo area, producing black margins/letterboxing; the document
  never says "no black margins" explicitly, and the top-card placement is not reinforced at all.
- **(12)** the logo's and any floating card's own backing is described only as "a vignette," with no
  explicit prohibition on a hard-edged solid black bar/box — leaving the model free to render one.

## What Changes

This is a **documentation + fixture** change — no production code path (validator, checklist, driver,
Skill, registry) changes behavior. The document is the thing the `produce-news-carousel` Skill reads
and interprets every run (ADR-0015/ADR-0018); strengthening its prose is the actual fix. Per the
issue's own framing, "the render effect only fully shows in a live render; the clause + canvas-setting
changes are what's verifiable in the build."

- **The Baseline Prompt document** gains four reinforced instructions, applied at all three of its
  layers (the top "confirmed answer" bullets, the reusable swappable template, and all 7 worked JSON
  examples, so the `produce-news-carousel` Skill — which "starts from the document's own worked
  example for the `card_style` you chose" — cannot pick up the OLD, weaker phrasing from an example):
  1. **Real names over fine fake-UI text** — the `Photo`/`Subject` bullets, the template's `[SUBJECT:
     ...]` bracket, name the specific failure mode (misspelled gibberish) and instruct keeping
     on-screen text minimal where no real screen can be shown.
  2. **Minimum body-text size** — the `Card text` bullet, the template's card-text clause, and all 7
     worked examples now state the supporting line renders at a minimum of roughly 13-14px equivalent,
     never a "small caption-sized afterthought."
  3. **Full-bleed, no letterboxing, for every card style — including the top card** — the `Photo` and
     `Card style` bullets, the template's photo-crop bracket (both graduated styles), and the relevant
     worked examples (full-width crop, top-card, small-badge) each now explicitly say "edge to edge"/
     "no black margins" for their own photo region.
  4. **Soft vignette, never a solid box** — the `Logo` bullet, the template's logo-vignette sentence,
     the template's `[CARD CLAUSE]` bracket, and the floating-card vignette sentence (examples 2, 4, 7)
     now explicitly forbid "a hard-edged solid black bar or filled box."
- **The graduated Straw Motion fixture** (`src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`)
  is kept byte-for-byte in sync with the document's ONE changed pinned clause (the logo-vignette
  sentence, `FIXED_CLAUSES[2]`) — both the constant and the `logoClause()` function that interpolates
  it — plus its `cardClause()`/`cardTextClause()`/`photoClause()` helper strings, so the graduated
  idea-01 example genuinely demonstrates the strengthened document, not a stale mirror of it.
- **A new, automated pin** (`src/production-spec/news-carousel-straw-motion-fixture.test.ts`) reads the
  REAL committed document (never asserts by fiat) and asserts each of the four new instructions is
  present as a normalized substring, plus that the graduated fixture's vignette clause stays in sync —
  "guard the prose clause changes with docs-tests wherever the repo pins Baseline Prompt content," per
  the issue's own instruction. Kept as a regular `.test.ts` (not `.docs-test.ts`) because it extends
  the SAME real-document read this file already does for issues #83/#85's own pins, so it runs under
  `npm test`'s always-on gate, not the separate `npm run test:docs` pass.
- **The canvas output/aspect-ratio setting (AC2) is confirmed live-Space-only, not in-repo** — see
  "Canvas-setting finding" below. No code change results from this; the in-repo clause (full-bleed
  reinforcement, above) is what's covered instead, exactly as the issue's own AC2 anticipates.

## Canvas-setting finding (AC2)

Verified, not assumed: the News Carousel Recipe's Space canvas has an "Image Generator #21" node whose
own settings are `mode: imagen-nano-banana-2-flash`, `aspectRatio: "3:4"`, `resolution: "1k"`
(`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`, README, and the
FAKE's read-only mirror `src/producer/fixtures/fake-carousel-space.ts`'s
`CARROUSEL_IMAGE_GENERATOR_SETTINGS`). This is a **live Magnific canvas node setting**:

- No `SpaceMcpPort` primitive (`src/space-driver/port.ts`) exists to read or write an image generator's
  aspect ratio/resolution — confirmed by a repo-wide grep for `setAspectRatio`/`setResolution`/
  `aspectRatio` (only the read-only fixture/capture hits above).
- `src/recipe/registry.ts`'s `RecipeSpaceTarget`/`RecipeCanvasInputs` types carry node NAMES only (spec
  input, pinned reference, run-points, media slots, watermark node) — no aspect-ratio/output field of
  any kind, for either wired Recipe.
- The `produce-news-carousel` Skill (`.claude/skills/produce-news-carousel/SKILL.md`) already states, in
  its own words: **"Aspect ratio and model are the canvas's own settings — never write them into the
  prompt."** — an existing, in-repo, authoritative statement that this setting is out of the Producer's
  (and this document's) control.

**Conclusion: there is no in-repo output/aspect-ratio setting to verify or correct** — it is purely a
live-canvas node configuration, out of the hermetic build's reach (and already Operator-confirmed
"kept, no canvas change" per the capture README's own 2026-07-18 note). Per the issue's own instruction
("If the setting is purely live-Space and not in-repo, say so explicitly ... and cover the in-repo
clause instead"), this change covers the in-repo clause — the reinforced full-bleed/no-letterboxing
Baseline Prompt prose (item 3 above) — instead.

## Non-Goals (explicitly deferred / out of scope)

- **Expanding the code-level `CardStyle` catalog** (`full_width`/`floating_toast` in
  `news-carousel-straw-motion-specs.ts`, and the same two in the checklist's
  `confirmedCardStyles`/tests) to a third, code-graduated "top card" style. AC1's "including the
  top-card placement" is satisfied at the PROSE level — the document's `Card style` bullet and worked
  Examples 3/6 (which are already confirmed, working, prose-level placements the Skill can start from,
  per SKILL.md step 2) — not by adding a new code-level enum value; that would be a materially larger,
  unrequested architecture change.
- **`.claude/skills/produce-news-carousel/SKILL.md`** — untouched. It already states the generic
  "grounded, not invented"/"never invent a UI" rule and the explicit "aspect ratio... never write them
  into the prompt" line; none of the four render-fidelity asks are Skill-level (they are per-Format
  specifics the Skill already delegates entirely to the document it reads). Its own docs-test suite
  (`produce-news-carousel-skill.docs-test.ts`) stays green, untouched.
- **`src/recipe/registry.ts`'s static, declarative `PhaseContract` checklist prose** — mirrors #108's
  own precedent Non-Goal; the issue's acceptance criteria name the Baseline Prompt document, not this
  registry-level documentation.
- **`format-baseline-prompt`'s pre-existing, already-stale byte-length/SHA-256 Scenario**
  (`openspec/specs/format-baseline-prompt/spec.md`, "The committed document is byte-identical to the
  locked prototype it was imported from") — its covering test was already removed BEFORE this slice
  (`src/format/baseline-prompt.test.ts`'s own comment: "That edit has now happened (2026-07-21 dry run:
  Subject rules, per-role narrative formulas, all 7 card styles confirmed) ... a byte-for-byte pin no
  longer makes sense to keep"). This change adds a NEW Requirement to that same capability for the
  four render-fidelity clauses; it does not touch or attempt to repair the already-stale one — out of
  this issue's scope, exactly like #108 left a similar pre-existing item-count drift in
  `production-spec`'s spec.md untouched.
- **The live Magnific canvas** — out of the hermetic build; see "Canvas-setting finding" above.
- **The leftover, in-progress HITL run files**
  (`data/brands/straw-motion/ideas/2026-W29/idea-0{1,2,3}.news-carousel.spec.json`,
  `data/brands/straw-motion/ledger.json`) — a separate, concurrent run; explicitly left untouched.

## Capabilities

### Added Capabilities

None new — this extends the existing `format-baseline-prompt` capability.

### Modified Capabilities

- `format-baseline-prompt`: gains one ADDED Requirement — the Straw Motion news-carousel Baseline
  Prompt document instructs the four render-fidelity guardrails, each verified as a normalized
  substring of the real, committed document (never asserted by fiat), plus that the graduated
  Straw Motion fixture stays byte-for-byte in sync with the document's one changed pinned clause.

## Impact

- **New code:** none — no new `.ts` source module. One new `describe` block (5 tests) in an existing
  test file.
- **Modified:**
  - `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — the four
    render-fidelity instructions, reinforced across the top bullets, the reusable template, and all 7
    worked examples.
  - `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts` — `FIXED_CLAUSES[2]` (the
    logo-vignette sentence) updated to match the document's new wording, verbatim; `photoClause()`,
    `cardClause()`'s floating-toast branch, and `cardTextClause()` updated in parallel for consistency
    (not required by any test — a self-review simplification so the graduated fixture is genuinely
    representative of the strengthened document, not merely still-passing).
  - `src/production-spec/news-carousel-straw-motion-fixture.test.ts` — factored the repeated
    blockquote-normalizing logic into a shared `normalizeBaselineProse` helper (used by both the
    pre-existing test and the five new ones); added the new `describe` block pinning the four
    render-fidelity clauses plus the doc/fixture vignette-sync check.
- **Docs:** the Baseline Prompt document itself is the primary deliverable (see above).
- **Not touched:** any production code path (`production-spec/validate.ts`,
  `news-carousel-author-checklist.ts`, `news-carousel-validate.ts`, `news-carousel-brand-safety.ts`,
  `dash-safety.ts`, `copy/*`, `space-driver/*`, `recipe/registry.ts`, `producer/*`),
  `.claude/skills/produce-news-carousel/SKILL.md`, `data/brands/straw-motion/brand-profile.yaml`, the
  live Magnific canvas, `data/brands/straw-motion/ideas/2026-W29/**`,
  `data/brands/straw-motion/ledger.json`.
- **Hermetic:** no Magnific fake is needed for this slice — every touched/new test is plain-file +
  pure-function (reads a real markdown file via `loadFormat`/`loadBaselinePrompt`, and a fixture's
  built-in-memory `Record`) — no Space, no MCP tool, no network, no credits, no board mutation. No
  `spaces_*`/`creations_*` call anywhere; the Magnific MCP tools were not given to, and were not used
  by, this build.
- **Always-rules upheld:** generate-never-publish (no publish-path file touched); public-metrics-only/
  relative-not-absolute (no metrics code touched); explicit-attribution (no Post/attribution code
  touched); ledger-as-source-of-truth (no ledger-write code path touched — the two leftover W29/ledger
  files are pre-existing working-tree state from a separate run, confirmed untouched by this session).
