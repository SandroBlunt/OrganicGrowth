## Why

Issue #122 (issue #120's scoped slice) threaded the News Carousel Recipe's per-slide `companies` field
into the Copy step's own narrative input (`CopySlideBeat.companies`), so a composed caption can name the
real companies/products a slide's own, already-verified data records instead of re-guessing from the
brief's prose. Issue #125 (also tracked under epic #120) asks for the SAME outcome for the *Character
Explainer with Cast* Recipe — but that Recipe starts from a genuinely different position: unlike News
Carousel, its Production Spec (3 `character_concepts` + 3 `clips` + 3 top-level `thumbnails`,
`src/production-spec/contract.ts`) has **no** structured "which companies/products does this concern"
field at all today. A composed caption for this Recipe can therefore only name a company/product by
accident, when the copywriter happens to restate it from the brief's prose.

This slice does two things in one pass that #120/#122 could do in two, because the field itself already
existed for News Carousel before #122 threaded it downstream: it (1) ADDS the structured field to the
Character Explainer Production-Spec contract, has the `produce-character-explainer` Skill populate it
from the Idea brief, and (2) threads it into the Copy step's own narrative input, mirroring
`CopySlideBeat.companies`'s wiring exactly.

## What Changes

**Add a structured, OPTIONAL, top-level `companies` field to the Character Explainer Production-Spec
contract, and thread it into the Copy step, end to end.**

- `src/production-spec/contract.ts`'s `ProductionSpec` gains a FOURTH field, `companies?: readonly
  string[]` — OPTIONAL and TOP-LEVEL, unlike the News Carousel Recipe's per-SLIDE, always-present field.
  This Recipe's 3 clips render ONE continuous narrative about the SAME picked Character (unlike News
  Carousel's 7 independently-labeled slides), so a named company/product belongs to the Asset as a
  whole — the same "not everything is per-clip" precedent `thumbnails` already set. Absent is a valid,
  passing state (never required to fabricate a mention to satisfy validation).
- `src/production-spec/validate.ts`'s `validate()` gains an additive rule: when `companies` IS present,
  it must be an array of non-empty strings (possibly `[]`); when absent, no error at all. A new
  `ValidationCode`, `"companies_shape"`, names the one new failure mode.
- `src/production-spec/generate.ts`'s `Brief` (the deterministic author-phase stand-in's own input)
  gains a matching optional `companies` field, carried through UNCHANGED onto the generated Spec —
  proving "populated when named, absent when not, never invented" mechanically, at the deep-module
  layer, the same way `newsCarouselSlideNarrative` proved its own carry-through mechanically for #120.
- `.claude/skills/produce-character-explainer/SKILL.md` (the real, LLM-driven author phase) gains a new
  step: read the Idea brief for real companies/products; when it names any, author the TOP-LEVEL
  `companies` field; when it names none, OMIT the field entirely — never invent one. Mirrors the SAME
  "grounded, never invented" standard the News Carousel author phase's own `companies-cited` checklist
  item already holds its own field to.
- A new, pure wiring module, `src/copy/character-explainer-companies.ts`, exports
  `characterExplainerCompanies(spec: ProductionSpec): readonly string[]` — the ONE place a saved
  Character Explainer Spec's `companies` becomes the Copy step's input, normalized to `[]` when absent
  (never fabricated). No I/O, no model call, no clock, never mutates its input — the same shape
  `newsCarouselSlideNarrative` already established for News Carousel.
- `src/copy/draft.ts`'s `CopyInput` gains a new optional, Recipe-agnostic field, `companies?: readonly
  string[]` — the WHOLE-Asset-grain sibling of `CopySlideBeat.companies`'s per-slide/per-beat grain,
  for a single-media Recipe like Character Explainer with Cast (which has no per-clip narrative to
  attach a per-beat company list to). Purely additive: every existing `CopyInput` caller that omits it
  is unaffected, and neither `defaultDraftCopy` nor `skillDraftCopy`'s deterministic output changes
  because of its presence, emptiness, or absence.
- `.claude/skills/write-social-copy/SKILL.md` is updated to draw on `CopyInput.companies` for the
  Character Explainer Recipe the SAME way it already draws on `CopySlideBeat.companies` for News
  Carousel: name the real companies/products the data actually records, wherever the Format's voice
  naturally allows it; empty/absent — at either grain — contributes NO mention, never invented or
  re-guessed from other material.

**What is mechanically provable vs. agent-judged, made explicit (mirroring #120/#122's own framing):**
the DATA threading through correctly — the field exists on the contract, is optional and additive at
every layer, the wiring function carries it through unchanged including absence, and it survives being
passed into a drafter without breaking anything — is fully covered by tests. "The Idea brief genuinely
names this company" and "the caption reads well and names it naturally" are agent judgment calls, never
hard-coded into a template; this slice does not attempt to mechanically grade brief-reading or caption
prose.

## Non-Goals (explicitly deferred / out of scope)

- **A per-clip `companies` field.** The issue explicitly allows "per-clip or per-Asset, whichever fits
  the Recipe's existing shape" — per-Asset (top-level) is the better fit here, mirroring `thumbnails`'s
  own top-level precedent and the fact that all 3 clips share one continuous narrative about the SAME
  picked Character. No per-clip variant is added.
- **A News-Carousel-style `companies-cited` mechanical checklist item** (verifying every named company
  is cited verbatim in an `image_prompt`). This Recipe's `companies` field carries no image-rendering
  role (unlike News Carousel's per-slide logo row) — it exists purely to reach the Copy step. The one
  new author-phase check this slice adds is agent-judged prose in the Skill (mirroring `grounded-subject`
  precedent), not a new mechanical item in `src/recipe/registry.ts`'s `CHARACTER_EXPLAINER_PHASES`
  (which would change that Recipe's PINNED checklist-item COUNT and break an existing test — AC6 asks
  for additive-only changes to existing tests).
- **Multiple Channels per Brand, per-channel Copy variants, per-channel `CopyShape`/validation rules,
  LinkedIn handle lookup/tagging.** Unrelated to this slice; tracked on the parent epic #120.
- **Rewriting or migrating any already-produced Asset's Copy or Spec.** Forward-only; no ledger data is
  touched.
- **`.claude/agents/producer.md`.** Its Copy-phase prose already describes sharpening "the saved
  Production Spec's own narrative" generically; the Skill-level instruction update (this slice's own
  scope, matching the issue's own framing) is where the field-specific guidance belongs, mirroring
  #120/#122's own precedent of leaving `producer.md` untouched.
- **Adding company-name scanning to the banned-word scanner.** `news-carousel-brand-safety.ts`'s own
  `SLIDE_TEXT_KEYS` deliberately does not scan `companies` (proper nouns, not banned-word material);
  this slice mirrors that precedent for `brand-safety.ts` rather than inventing a new rule.

## Capabilities

### Modified Capabilities

- `production-spec`: `ProductionSpec` gains an optional, top-level `companies` field; `validate()`
  accepts it when absent and enforces its shape when present; `generate()`'s `Brief` carries a matching
  optional field through unchanged.
- `copy-composition`: `CopyInput` gains an optional, Recipe-agnostic `companies` field (the whole-Asset
  sibling of `CopySlideBeat.companies`); a new pure wiring function, `characterExplainerCompanies`,
  threads a saved Character Explainer Spec's `companies` into it, normalized to `[]` when absent.
- `producer-skill`: the `produce-character-explainer` Skill's documented Steps/Inputs are updated to
  author the companies field, grounded, never invented; the `write-social-copy` Skill's documented
  Inputs/Steps are updated to read and draw on `CopyInput.companies` for this Recipe too.

## Impact

- **Added:**
  - `src/copy/character-explainer-companies.ts`
  - `src/copy/character-explainer-companies.test.ts`
- **Modified:**
  - `src/production-spec/contract.ts` — `ProductionSpec.companies?: readonly string[]` (additive).
  - `src/production-spec/validate.ts` — new optional-shape check + `"companies_shape"` code (additive).
  - `src/production-spec/validate.test.ts` — new tests for the companies shape check.
  - `src/production-spec/fixtures/specs.ts` — new fixture functions (additive).
  - `src/production-spec/generate.ts` — `Brief.companies?: readonly string[]`, carried through
    unchanged onto the generated Spec (additive).
  - `src/production-spec/generate.test.ts` — new tests proving the carry-through.
  - `src/production-spec/compose.test.ts` — new end-to-end tests: a Brief's companies surviving the
    full `composeSpec` pipeline to disk, with and without companies.
  - `src/copy/draft.ts` — `CopyInput.companies?: readonly string[]` (additive).
  - `src/copy/draft.test.ts` — new test proving `companies` is available to both drafters without
    changing their deterministic output.
  - `src/copy/compose.test.ts` — new end-to-end test: a saved Character Explainer Spec's `companies`
    threaded via `characterExplainerCompanies` through `composeCopy`/`skillDraftCopy`/`validateCopy`.
  - `.claude/skills/write-social-copy/SKILL.md` — Inputs item 4 and Steps section 1 updated to cover
    the Character Explainer Recipe's own companies wiring.
  - `src/copy/write-social-copy-skill.docs-test.ts` — new pinned assertions for the Character
    Explainer companies guidance.
  - `.claude/skills/produce-character-explainer/SKILL.md` — Inputs item 2, a new authoring step, the
    self-audit checklist, and the emit step's shape description updated.
  - `src/production-spec/produce-character-explainer-skill.docs-test.ts` — new pinned assertions for
    the companies authoring guidance.
- **Not touched:** `src/recipe/registry.ts` (no change to `CHARACTER_EXPLAINER_PHASES`'s pinned
  checklist-item counts — AC6), `src/production-spec/brand-safety.ts` (no company-name banned-word
  scanning, mirroring News Carousel's own precedent), `src/copy/compose.ts`, `src/copy/inject.ts`,
  `src/copy/validate.ts`, `src/copy/contract.ts`, `src/production-spec/news-carousel-contract.ts`,
  `src/production-spec/news-carousel-validate.ts`, `.claude/agents/producer.md`, any ledger/
  Asset-storage code, any Channel/Brand-profile code, the live Magnific canvas.
- **Hermetic:** no Space/MCP call anywhere in this diff — the Production Spec and Copy modules touched
  have none of their own (`compose.ts`'s own module doc: "No Magnific, no Apify, no network"). The
  `developer` agent was not given the Magnific MCP tools and did not use them. No live `spaces_*`/
  `creations_*` call.
- **Always-rules upheld:** generate-never-publish (no publish-path file touched); public-metrics-only /
  relative-not-absolute (no metrics code touched); explicit-attribution (no Post/attribution code
  touched); ledger-as-source-of-truth (no ledger-write code path touched); never-fabricate (the whole
  point of this slice — an empty/absent `companies` field, at every layer, is carried through as such,
  never invented into a mention).
