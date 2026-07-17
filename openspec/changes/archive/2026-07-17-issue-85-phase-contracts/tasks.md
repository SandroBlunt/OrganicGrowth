## 1. Generic Phase-Contract types + shape guard (test-first)

- [x] 1.1 Write failing tests (`phase-contract.test.ts`): `PHASE_ORDER` is exactly `author`,
  `bind-media`, `gate`, `render`, `copy`, `save`; `declaresAllPhasesInOrder` is true for a well-ordered,
  complete 6-phase list, false for a short list, and false for an out-of-order list.
- [x] 1.2 Implement `PHASE_ORDER`, `PhaseName`, `MechanicalChecklistItem`, `AgentJudgedChecklistItem`,
  `ChecklistItem`, `PhaseContract`, `declaresAllPhasesInOrder` in `src/recipe/phase-contract.ts`.

## 2. Three generic Phase-Contract auditors + the single dispatcher (test-first)

- [x] 2.1 Write failing tests: `auditAuthorPhase` passes/fails identically in SHAPE for the character
  Recipe (referencing `production-spec/validate.ts`'s `validate` + `production-spec/brand-safety.ts`'s
  `scanForBannedWords` via `specShape`) and the News Carousel Recipe (referencing
  `news-carousel-validate.ts`/`news-carousel-brand-safety.ts` via `specShape`) — the SAME function,
  proving genericity (issue #85 AC4).
- [x] 2.2 Write failing tests: `auditBindMediaPhase` passes when a Recipe's REQUIRED media slot is
  bound and fails (STOPS, ADR-0016) when it is not — for both Recipes' own `canvasInputs.mediaSlots`.
- [x] 2.3 Write failing tests: `auditCopyPhase` passes/fails per each Recipe's OWN `copyShape` (the
  character Recipe's 180/1-3 vs the News Carousel Recipe's 2200/0-2), via `copy/validate.ts`'s
  `validateCopy`.
- [x] 2.4 Write failing tests: `auditPhase(recipe, request)` dispatches to each of the three auditors
  above and returns an IDENTICAL result to calling them directly, for either Recipe.
- [x] 2.5 Implement `ChecklistItemAudit`, `PhaseAuditResult`, `auditAuthorPhase`, `auditBindMediaPhase`,
  `auditCopyPhase`, `auditPhase` in `src/recipe/phase-contract.ts`.

## 3. Recipe registry — both wired Recipes populate all six phases (test-first)

- [x] 3.1 Write failing tests (`registry.test.ts`): both `character-explainer-with-cast` and
  `news-carousel` declare `phases` satisfying `declaresAllPhasesInOrder`; the character Recipe's
  `author` checklist has 2 mechanical items + 1 agent-judged item; the News Carousel Recipe's `author`
  checklist has 8 items (7 mechanical + 1 agent-judged, the "grounded subject" item); the News
  Carousel Recipe's `gate` checklist is empty (zero gates); both Recipes' `bind-media`/`copy` checklists
  are each exactly 1 mechanical item.
- [x] 3.2 Add the `phases: readonly PhaseContract[]` field to the `Recipe` interface in
  `src/recipe/registry.ts`.
- [x] 3.3 Implement `CHARACTER_EXPLAINER_PHASES` (all six phases, referencing this Recipe's own
  `specShape`/`copyShape` functions by name in each mechanical item's `reference`) and wire it onto
  `CHARACTER_EXPLAINER_WITH_CAST.phases`; add the `declaresAllPhasesInOrder` import-time guard
  (mirroring the existing `CAST_RUN_POINT`/`CLIP_RUN_POINT` defensive pattern).
- [x] 3.4 Implement `NEWS_CAROUSEL_PHASES` (all six phases; the `author` phase's 8-item checklist
  mirrors `auditNewsCarouselAuthorPhase`'s own item order) and wire it onto `NEWS_CAROUSEL.phases`; add
  the matching import-time guard.

## 4. News Carousel author-phase checklist — graduated from the #77 prototype (test-first)

- [x] 4.1 Write failing tests (`news-carousel-author-checklist.test.ts`): a baseline-adherent Spec
  passes every mechanical item, with the "grounded subject" item present, `agent-judged`, `ok: null`,
  and never blocking `ok`; a short/mis-ordered/over-length Spec fails the referenced-validator items;
  a Spec missing the parameterized logo reference name, pill text, never-all-caps instruction, a fixed
  clause, or a confirmed card style each fails its OWN specific item, isolated from the others; a
  banned word fails the banned-word item, reject-only, and names the word + field, without rewriting
  the Spec; the function never throws on a malformed/non-object Spec; swapping in a DIFFERENT (Brand x
  Format)'s real strings against a Spec authored for the test fixture's strings FAILS — proving the
  checklist is genuinely parameterized, not hardcoded (issue #85's core ask).
- [x] 4.2 Add the `NewsCarouselBaselineParams` fixture (`TEST_BASELINE`) + a baseline-adherent Spec
  builder + focused broken-variant builders (missing logo reference / pill text / caps guardrail /
  one fixed clause / a confirmed card style; a banned word in text) to
  `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts`.
- [x] 4.3 Implement `NewsCarouselBaselineParams` + `auditNewsCarouselAuthorPhase` in
  `src/production-spec/news-carousel-author-checklist.ts`, reading
  `validateNewsCarouselSpec`'s/`scanNewsCarouselForBannedWords`'s own results for the referenced items
  and adding the new logo-reference/pill-text/fixed-clauses/card-style checks, parameterized from
  `baseline`.

## 5. Self-review + full-suite green

- [x] 5.1 Re-read every new/changed module for dead code, unused exports, and drifted docstrings;
  confirm no existing mechanical check (spec validator, banned-word scan, copy check) is
  re-implemented anywhere in this slice — only referenced.
- [x] 5.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --strict` for this change; all green.
- [x] 5.3 Write the Build Report into `handoff.md`, mapping every issue #85 acceptance criterion to its
  proving test(s), flagging the fakes/fixtures used (none touch the Magnific fake — no driver code is
  exercised by this slice), and listing known limits (the `gate`/`render`/`save` phases' auditors, and
  end-to-end sourcing of `NewsCarouselBaselineParams` from the Baseline Prompt document, both deferred
  to #87/#88).
