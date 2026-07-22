## 1. The dash "tell" scanner — a new pure deep module (test-first)

- [x] 1.1 Write failing tests (`dash-safety.test.ts`): a dash-free field passes; an em dash is
  flagged; an en dash is flagged; a spaced hyphen (" - ") is flagged; an ordinary hyphenated compound
  word ("state-of-the-art", "task-assistant") is NOT flagged; a bare negative number ("-3.7x") is NOT
  flagged; multiple fields are scanned independently, naming only the field(s) with a hit; more than
  one tell in the SAME field is reported as more than one hit; an empty fields list always passes; the
  result never carries a "corrected" text.
- [x] 1.2 Implement `scanTextFieldsForDashes(fields)` in `src/production-spec/dash-safety.ts`, generic
  over `brand-safety.ts`'s shared `TextField[]` shape — reject-only, never rewrites.

## 2. Wire the scanner into the News Carousel author-phase checklist (test-first)

- [x] 2.1 Write failing tests (`news-carousel-author-checklist.test.ts`): a Spec whose "cta" slide's
  `text` carries an em dash fails the new `no-dash-tells` item, reject-only (names the tell, never
  rewrites, every OTHER item stays isolated); a baseline-adherent Spec (already dash-free) passes it
  cleanly; `items.length` is 10 with no `baselineDocumentText` and 11 when it is supplied (bumped from
  9/10).
- [x] 2.2 Add the `dashInText()` fixture to
  `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts`, mirroring
  `bannedWordInText()`'s shape.
- [x] 2.3 Implement the `no-dash-tells` mechanical item in `auditNewsCarouselAuthorPhase`
  (`news-carousel-author-checklist.ts`), via a new `cardTextFields` collector scanning each slide's
  `stat_callout` + `text` ONLY (the Baseline Prompt document's own "Card text" fields) — never
  `image_prompt`, whose FIXED clauses legitimately contain em dashes.

## 3. Fix Straw Motion's real fixture — 4 slides' text already had the "tell" (test-first, reproduction)

- [x] 3.1 Confirm, by running the existing suite before any fix, that
  `news-carousel-straw-motion-fixture.test.ts` newly fails once step 2 lands, because
  `fixtures/news-carousel-straw-motion-specs.ts`'s "shift"/"proof"/"different"/"next" slides' `text`
  fields contain em dashes — a live reproduction of the issue's own motivating defect, not a
  hypothetical.
- [x] 3.2 Rewrite those 4 `text` values as separate short sentences (the issue's own instruction),
  staying within the 140-char limit, meaning preserved; bump
  `news-carousel-straw-motion-fixture.test.ts`'s `items.length` assertion from 9 to 10.

## 4. Wire the scanner into the shared copy validator (test-first)

- [x] 4.1 Write failing tests (`copy/validate.test.ts`): a caption with an em dash is rejected
  (`dash_in_copy`); a caption with an en dash is rejected; a caption with a spaced hyphen is rejected;
  a hashtag containing a dash tell is rejected; a caption using an ordinary hyphenated word
  ("state-of-the-art") passes; the rule is reject-only — no "corrected" Copy is ever returned; the
  error names the exact tell and field.
- [x] 4.2 Implement: `validate.ts` adds `"dash_in_copy"` to `CopyValidationCode`, imports
  `scanTextFieldsForDashes`, and scans the SAME `fields` array already built for the banned-word scan
  (`caption` + each `hashtags[i]`), pushing one `dash_in_copy` error per hit.

## 5. Fix the two now-surfaced real bugs (test-first)

- [x] 5.1 Write a failing test (`copy/draft.test.ts`): `defaultDraftCopy`'s output, with
  `mediaContext` supplied, never contains a dash tell (`scanTextFieldsForDashes` on its caption
  reports `ok: true`).
- [x] 5.2 Implement: `draft.ts`'s `defaultDraftCopy` joins `title`/`mediaContext` with a period, not
  an em dash — separate short sentences, per the issue's own instruction. Confirmed every existing
  `draft.test.ts`/`compose.test.ts` assertion still passes (none assert the literal join character).
- [x] 5.3 Fix `src/producer/carousel-end-to-end.test.ts`'s one literal caption (contained an em dash)
  so its existing `auditCopyPhase` assertion keeps passing once step 4 lands.

## 6. Document the rule (issue AC5)

- [x] 6.1 Update `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s "Card
  text" bullet with the dash-tell prohibition + "separate short sentences" guidance.
- [x] 6.2 Update `.claude/skills/produce-news-carousel/SKILL.md`'s Step 1 `text`/`stat_callout`
  guidance and its "Author-phase checklist" bullet list with the same rule; confirmed
  `produce-news-carousel-skill.docs-test.ts` still passes (no pinned assertion needed changing).
- [x] 6.3 Add a documenting comment (not a new parsed field — the rule is universal, not a per-Brand
  toggle) to `data/brands/straw-motion/brand-profile.yaml`.

## 7. OpenSpec

- [x] 7.1 Author `proposal.md`, this `tasks.md`, and spec deltas: MODIFIED `production-spec`
  (`auditNewsCarouselAuthorPhase` gains the `no-dash-tells` item — same requirement header, item
  count bumped 8->9); MODIFIED `copy-composition` (`validateCopy` gains the dash check — same
  requirement header).
- [x] 7.2 `openspec validate 108-forbid-em-dashes --strict` green.

## 8. Self-review

- [x] 8.1 `npm test` green (type-check + full suite; 1358 baseline -> 1378, only additions, zero
  regressions).
- [x] 8.2 Simplify / dead-code pass; confirmed every issue #108 acceptance criterion maps to a named
  test; confirmed no `spaces_*`/`creations_*` call anywhere in the diff.
- [x] 8.3 Write the Build Report into `handoff.md`, flagging the `FakeCarouselSpace` fake used by the
  untouched-behavior end-to-end test, and listing known limits (including the pre-existing, unrelated
  `test:docs` failure in `producer-agent.docs-test.ts` against `.claude/agents/producer.md` — not
  touched by this slice, not part of the `npm test` gate).
