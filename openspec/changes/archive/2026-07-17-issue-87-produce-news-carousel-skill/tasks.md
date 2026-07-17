## 1. Read the source material and ground the Skill's content (no code yet)

- [x] 1.1 Read the issue (#87), the parent map (#70), ADR-0018, ADR-0015, and map tickets #75/#77.
- [x] 1.2 Read the #77 prototype artifacts (Skill, generator, checker, authored spec JSON) preserved
  in the prior session's scratchpad, and the #77 issue's own resolution comment (the validated
  10/10 run + the logo-name-reconciliation finding).
- [x] 1.3 Read the now-landed modules the Skill must reference by name: `news-carousel-contract.ts`,
  `news-carousel-validate.ts`, `news-carousel-brand-safety.ts` (#81); `format/store.ts`,
  `format/baseline-prompt.ts`, and the real, committed
  `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` (#83);
  `news-carousel-author-checklist.ts` (#85); `production-spec/store.ts`, `brand-profile.ts`.
- [x] 1.4 Read an existing project Skill (`nano-banana-2`) and the docs-test convention
  (`producer-agent.docs-test.ts`, `report.docs-test.ts`) to mirror repo structure.

## 2. Author the Skill (test-first: docs-test written alongside)

- [x] 2.1 Write `.claude/skills/produce-news-carousel/SKILL.md`: front-matter slug
  `produce-news-carousel`; inputs (Brand rules / Baseline Prompt document / Idea brief) with STOP
  semantics for a missing baseline document (any of the loader's three not-found reasons) or a
  missing brief; the grounded-not-invented leading idea; the four steps (derive the narrative,
  assemble the prompt, self-audit, emit through the spec store); the author-phase checklist restated
  for a human reader; an explicit "what this Skill does not do" section (no Space-driving, no Copy
  composition, no publishing). Reference every pointed-at module/function by its EXACT name so a
  docs-test can pin it. Never write any one Brand/Format's own pill text or logo reference name
  (ADR-0015) — only ever describe reading them FROM the document.
- [x] 2.2 Write `src/production-spec/produce-news-carousel-skill.docs-test.ts`: the Skill exists and
  declares its slug; it references the validator/checklist/spec-store/baseline-prompt-loader by
  exact module+function name; its STOP rules (missing baseline document — all three reasons;
  missing brief; a banned word) stay true; its grounded-not-invented leading idea is stated; it
  states it does not run the Space (and never itself contains a `spaces_*`/`creations_*` call) and
  never publishes; it never hardcodes Straw Motion's (or any) Brand/Format's own pill text or logo
  reference name.
- [x] 2.3 Run `npm run test:docs` — green.

## 3. Prove AC2 with a committed fixture (test-first)

- [x] 3.1 Write `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`:
  `STRAW_MOTION_BASELINE` (a `NewsCarouselBaselineParams` built from Straw Motion's REAL committed
  `news-carousel.md` strings — the real logo reference name, the real pill text, the real
  never-all-caps sentence, five clauses verbatim from the document's reusable template, its two
  confirmed card styles) and `strawMotionIdeaOneCarouselSpec()` (idea-01's 7 on-contract prompts,
  graduated from the map-#77 prototype's validated authored content, assembled the same way the
  Skill's step 2 does — swap only the bracketed parts, keep every fixed clause verbatim).
- [x] 3.2 Write `src/production-spec/news-carousel-straw-motion-fixture.test.ts` (written before/
  alongside the fixture, exercised against it): the fixture passes `validateNewsCarouselSpec`; the
  fixture passes `auditNewsCarouselAuthorPhase` parameterized with `STRAW_MOTION_BASELINE` (`ok:
  true`, 8 items, exactly one agent-judged and un-blocking); every slide's `image_prompt` names
  idea-01's real companies (grounded, not invented, checked concretely); `STRAW_MOTION_BASELINE`'s
  own strings are genuinely present in the real document (loaded via `loadFormat` +
  `loadBaselinePrompt`, normalized, checked by substring containment — never asserted by fiat); the
  baseline is genuinely different from the stand-in `TEST_BASELINE` (issue #85's own fixture).
- [x] 3.3 Run `npx tsc -p tsconfig.json --noEmit` and the new test file directly — green (fix the
  `noUncheckedIndexedAccess` tuple-typing issue on the fixed-clauses array along the way).

## 4. Self-review + full-suite green

- [x] 4.1 Re-read the Skill and both new test files for dead code, drifted references, and
  fragile/brittle regexes in the docs-test (loosen any assertion that depended on exact markdown
  formatting that isn't load-bearing).
- [x] 4.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --all --strict` — all green.
- [x] 4.3 Write the Build Report into `handoff.md`, mapping every issue #87 acceptance criterion to
  its proving test(s), explicitly flagging that no Magnific fake was needed (no Space/driver code
  touched), and listing known limits (the Skill does not run the Space — #88; the thin Producer
  invoking it by slug — #88).
