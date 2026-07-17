## Why

ADR-0017 (map #70, tickets #71/#77) decided the target shape for **Phase Contracts** — every production
phase (author the prompt -> bind media -> gate -> render -> copy -> save) declares a checklist of what
a valid output for that phase looks like, so the Producer can self-audit before advancing and a QA pass
can re-run the SAME checklist against saved artifacts. Nothing has been built yet. Issue #81 (merged)
already made two of a Recipe's fields uniform across BOTH wired Recipes — `specShape`
(`validate`/`scanBannedWords`) and `copyShape` — and issue #82 (merged) built the `BrandAssetStore` a
media-slot binding check can lean on. This slice turns ADR-0017's decision into code: the `Recipe` type
gains an ordered, six-phase `phases` field; both wired Recipes populate it; the News Carousel Recipe's
author-phase checklist — the map-#77 prototype's headline result (validated 10/10) — graduates from a
scratch `.mjs` script into tested, parameterized production code; and three small generic auditors prove
the checklist mechanism itself, not just its declaration, generalizes across ANY wired Recipe.

## What Changes

- **`Recipe` gains an ordered `phases` field** (`src/recipe/phase-contract.ts`'s `PhaseContract[]`): six
  entries, always in `PHASE_ORDER`'s fixed order (`author`, `bind-media`, `gate`, `render`, `copy`,
  `save`), each carrying a `description` and a `checklist` of `ChecklistItem`s. A checklist item is
  either **mechanical** (`{ kind: "mechanical", description, reference }` — `reference` is a human-facing
  pointer string naming the existing module/function that runs it; NEVER a re-implementation) or
  **agent-judged** (`{ kind: "agent-judged", description }` — prose only, flagged for review, never
  auto-failed). `declaresAllPhasesInOrder(phases)` is the pure shape guard both wired Recipes are
  checked against at import time (mirroring the existing `CAST_RUN_POINT`/`CLIP_RUN_POINT` defensive
  pattern in `recipe/registry.ts`).
- **Both wired Recipes populate all six phases.** The character Explainer with Cast Recipe's `author`
  phase checklist references its existing `specShape.validate`/`specShape.scanBannedWords`
  (`production-spec/validate.ts`, `production-spec/brand-safety.ts`); its `copy` phase references
  `copy/validate.ts`'s `validateCopy`. The News Carousel Recipe's `author` phase checklist is the
  slice's headline case (see below); its `gate` phase is declared with an EMPTY checklist (it has zero
  gates — nothing pauses there). Where no generic mechanical auditor exists yet (`gate`/`render`/`save`
  for both Recipes today), the checklist item is `agent-judged` prose — a known, documented limit, not a
  fabricated check.
- **The News Carousel author-phase checklist graduates from the #77 prototype INTO tested, parameterized
  code** (`src/production-spec/news-carousel-author-checklist.ts`'s `auditNewsCarouselAuthorPhase`),
  covering, as CODE, every item the prototype validated 10/10: exactly 7 slides in fixed role order;
  each on-card `text` at most 140 chars; each `image_prompt` references the logo reference name; each
  `image_prompt` carries the pill text AND its never-all-caps instruction; each `image_prompt` keeps
  every other fixed Baseline Prompt clause (logo guardrail, card, card-text, closing style line);
  `card_style` is one of the confirmed styles and `stat_callout` is non-empty; no banned word anywhere
  (REJECT-only, never a silent swap). "Grounded subject" stays `agent-judged` — flagged, never
  code-checked, exactly as the prototype itself concluded. The two count/order/length items and the
  banned-word item are derived by READING `validateNewsCarouselSpec`'s/`scanNewsCarouselForBannedWords`'s
  own results (never re-deriving those rules); the remaining checks (logo reference, pill text +
  never-all-caps, fixed clauses, card style) are the module's genuinely NEW code.
- **Parameterized, never hardcoded (the core ask).** The prototype hardcoded the pill text
  (`"Unhypped News"`) and the logo reference name (`"Brand_Logo"`) as literals. This module instead
  takes a `NewsCarouselBaselineParams` argument (`logoReferenceName`, `pillText`,
  `neverAllCapsInstruction`, `fixedClauses`, `confirmedCardStyles`) — the Format's Baseline Prompt
  document is their eventual source of truth (ADR-0015); here the check only ACCEPTS them as inputs,
  and tests supply deliberately DIFFERENT values than Straw Motion's real strings, proving the check
  cannot silently pass on a literal baked into the code.
- **Three small generic Phase-Contract auditors** (`src/recipe/phase-contract.ts`) prove the checklist
  MECHANISM — not just its declaration — already generalizes across ANY wired Recipe, because the
  fields they read (`Recipe.specShape`, `Recipe.copyShape`, `Recipe.canvasInputs.mediaSlots`) are
  themselves already uniform, per-Recipe fields (issue #81): `auditAuthorPhase` (via `specShape`),
  `auditBindMediaPhase` (via `canvasInputs.mediaSlots` — every REQUIRED slot needs a bound asset before
  render, ADR-0016), and `auditCopyPhase` (via `copyShape` + `copy/validate.ts`'s `validateCopy`). A
  single dispatcher, `auditPhase(recipe, request)`, is the literal "auditor" issue #85 AC4 asks for:
  given a Recipe, a saved artifact, and which phase it's in, it returns one pass/fail
  `PhaseAuditResult` — tested identically against BOTH wired Recipes.

## Non-Goals (explicitly deferred)

- **`gate`/`render`/`save` phase auditors.** These three phases are DECLARED (a checklist per Recipe)
  but have no generic, code-backed auditor in this slice — the driving/saving code that would give
  them one is later work (issues #57, #87, #88; the `gate`/`render` phases need a second Recipe's Space
  actually driven end-to-end, and `save` needs the ledger-write path re-pointed at a second Recipe).
  Their checklist items are honest `agent-judged` prose today, not a fabricated mechanical check.
- **Reading the Baseline Prompt document to DERIVE `NewsCarouselBaselineParams`.** This slice's checker
  ACCEPTS the pill text / logo reference name / fixed clauses / confirmed card styles as a parameter;
  actually parsing them out of a Format's Baseline Prompt document end-to-end is the producer Skill's
  job (issue #87/#88), explicitly out of scope here.
- **The `produce-news-carousel` Skill itself** (issue #87) and **the thin, recipe-generic Producer**
  that would actually call these auditors at runtime (issue #88) — both out of scope; this slice ships
  the checkable contract and its auditors, not the runtime that drives them.

## Capabilities

### Added Capabilities

- `phase-contracts`: the generic Phase-Contract vocabulary (`PhaseName`, `ChecklistItem`,
  `PhaseContract`, `PhaseAuditResult`) and three generic auditors (`auditAuthorPhase`,
  `auditBindMediaPhase`, `auditCopyPhase`) plus the single dispatcher `auditPhase` — all proven generic
  across BOTH wired Recipes.

### Modified Capabilities

- `recipe-registry`: `Recipe` gains an ordered `phases: readonly PhaseContract[]` field; both wired
  Recipes populate all six phases, checked at import time by `declaresAllPhasesInOrder`.
- `production-spec`: gains the News Carousel Recipe's graduated author-phase checklist
  (`news-carousel-author-checklist.ts`'s `auditNewsCarouselAuthorPhase`), parameterized from a
  `NewsCarouselBaselineParams` argument, referencing (never duplicating) the existing
  `validateNewsCarouselSpec`/`scanNewsCarouselForBannedWords`.

## Impact

- **New code:** `src/recipe/phase-contract.ts` (+`.test.ts`),
  `src/production-spec/news-carousel-author-checklist.ts` (+`.test.ts`),
  `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts`.
- **Modified code:** `src/recipe/registry.ts` (+`.test.ts`) — the `phases` field on `Recipe`, populated
  for both seeded Recipes, plus the import-time `declaresAllPhasesInOrder` guard.
- **Not touched:** `src/production-spec/validate.ts`, `src/production-spec/brand-safety.ts`,
  `src/production-spec/news-carousel-validate.ts`, `src/production-spec/news-carousel-brand-safety.ts`,
  `src/copy/validate.ts` (all REFERENCED, never modified — issue #85 AC3); `src/space-driver/**`,
  `src/execution-protocol/**`, `src/production-queue/**` (no driving/queue code touched — this slice is
  purely the checkable contract + its auditors, never the runtime that would call them at production
  time); `.claude/agents/producer.md` (the attended producer's own behavior is unchanged).
- **Hermetic:** no Magnific fake is needed for this slice — no driver/Space-interaction code is touched;
  every new module is a pure, deterministic deep module tested with plain in-memory fixtures. No live
  `spaces_*`/`creations_*` call anywhere; no credits, no board mutation.
- **Always-rules upheld:** generate-never-publish (no publish code touched); the banned-word hard
  filter (rule 9) is REFERENCED, not weakened or duplicated — `auditNewsCarouselAuthorPhase`'s
  banned-word item is REJECT-only, exactly mirroring `scanNewsCarouselForBannedWords`'s own contract
  (never a silent swap); public-metrics-only/relative-not-absolute are unaffected (no metrics code
  touched); explicit-attribution is unaffected (no Post/attribution code touched); ledger-as-source-of-
  truth is referenced (the `save` phase's prose checklist item cites it) but no ledger-write code path
  is touched.
