# Tasks — issue #273: accept-idea Spec authoring is placeholder filler

Test-first throughout: write the failing test, then the code that passes it. All Space interaction
(none needed here — this ticket never touches a Space) stays through the existing Magnific fakes;
`author-at-review.ts`/`news-carousel-generate.ts`/`news-short-script-generate.ts` remain pure,
deterministic, hermetic modules — no model call, no I/O, no clock, anywhere in this ticket's code.

## 1. Fix the deterministic generators' mechanically-detectable filler defects

- [x] `news-carousel-generate.ts`: cycle `card_style` through a small, distinct set (`CARD_STYLE_CYCLE`)
      instead of hardcoding `"full_width"` for all 7 slides. Test-first:
      `news-carousel-generate.test.ts` — "varies card_style across the 7 slides — never one style
      repeated on every slide."
- [x] `news-carousel-generate.ts`: join on-card `text` without a spaced em dash/en dash/hyphen (issue
      #108's rule). Test-first: `news-carousel-generate.test.ts` — "never joins on-card text with a
      spaced dash."
- [x] `news-carousel-generate.ts`: when `brief.companies` is non-empty, cite every named company in
      every slide's `image_prompt`. Test-first: `news-carousel-generate.test.ts` — "when the Brief names
      companies, every slide's image_prompt cites them."
- [x] `news-short-script-generate.ts`: cycle each beat's `source_url` host through 3 distinct,
      IANA-reserved documentation hosts (`HOST_CYCLE`) instead of colliding on `example.com` for every
      beat. Test-first: `news-short-script-generate.test.ts` — "no two beats' source_url share the same
      site/host."
- [x] Confirm every EXISTING test in both generators' test files stays green, unmodified — proves the
      fix is additive (structural, not a content-shape break).

## 2. A Baseline-Prompt-INDEPENDENT standalone author-phase subset for News Carousel

- [x] `news-carousel-author-checklist.ts`: new exported `auditNewsCarouselStandaloneAuthorPhase(
      candidateSpec, bannedWords): PhaseAuditResult` — reuses the SAME referenced checks
      (`validateNewsCarouselSpec`, `scanNewsCarouselForBannedWords`, `scanTextFieldsForDashes`,
      `companiesCitedInPrompt`) as items `spec-shape`/`banned-words`/`no-dash-tells`/`companies-cited`,
      plus a NEW `card-style-distinctness` item — at least 2 distinct `card_style` values across the
      slides, needing NO `NewsCarouselBaselineParams`. Never throws. Test-first:
      `news-carousel-author-checklist.test.ts` — happy path (reuses `baselineAdherentCarouselSpec`),
      each item's isolated failure (reuses existing `dashInText`/`companyNotCitedInPrompt`/
      `bannedWordInText` fixtures plus a NEW `allSlidesSameCardStyle` fixture reproducing the issue #273
      pattern), and confirms the new floor is weaker than the Format-tuned `placement-variety` item
      (`tooFewDistinctPlacements` passes the new item while still failing the full checklist's own).

## 3. Widen the accept-time self-check via a per-Recipe refinement seam

- [x] `author-at-review.ts`: new `AUTHOR_PHASE_REFINERS` map (Recipe slug -> a standalone-runnable
      author-phase auditor) registering `news-carousel` -> `auditNewsCarouselStandaloneAuthorPhase` and
      `news-short-script` -> the EXISTING, already-standalone `auditNewsShortScriptAuthorPhase`.
      `character-explainer-with-cast` has no entry — unchanged generic-only behavior.
- [x] `author-at-review.ts`: new exported `auditAuthoredSpec(recipe, candidateSpec, bannedWords):
      PhaseAuditResult` — the refiner when one is registered, else the generic `auditAuthorPhase`
      (`recipe/phase-contract.ts`), unchanged.
- [x] `authorSpecForRecipe` now calls `auditAuthoredSpec` instead of `auditAuthorPhase` directly. Test-
      first: `author-at-review.test.ts` — the default news-carousel/news-short-script author's own audit
      now carries the widened checklist's items and still passes (proves the generator fix from task 1
      clears the new bar); an injected filler author (uniform `card_style` for news-carousel, colliding
      `source_url` hosts for news-short-script) is REJECTED loudly, naming the failing item;
      `character-explainer-with-cast` keeps exactly the two generic items, unaffected.

## 4. The unattended worker's defense-in-depth check stays the SAME bar

- [x] `command-surface/worker.ts`: `runOneJob`'s author-phase check calls `auditAuthoredSpec`
      (`production-spec/author-at-review.ts`) instead of `auditAuthorPhase` directly. Test-first:
      `worker.test.ts` — a new regression test proves a filler Spec (`allSlidesSameCardStyle`) fails the
      job with ZERO Space calls, mirroring the existing banned-word regression test; every EXISTING
      `worker.test.ts` assertion (including the News Carousel happy-path AC2 test, which already used a
      genuinely-varied hand-authored fixture) stays green, unmodified.

## 5. Close out (round 1)

- [x] `openspec validate --strict` green.
- [x] Full suite (`npm test`) green — 4110/4110.
- [x] `npm run build` (tsc, strict) green.
- [x] `npm run test:docs` green — unaffected (no doc-pinned prose was touched).
- [x] Self-review / simplify pass — dead code removed, module boundaries tight, every acceptance
      criterion mapped to a specific test.
- [x] Write the Build Report into `handoff.md`.

## 6. Round 2 — QA round 1's defect: root-cause the filler, not just the checklist (issue #273 round 2)

QA round 1's finding: round 1's widened check could never reject the DEFAULT generators' own output for
ANY Brief, because every item it checked was satisfied by construction, independent of content
(`accept-idea.ts` never read the Idea's real Brief markdown — only its ledger `title`). Fix: thread real
Brief content through, AND make the checks impossible to satisfy vacuously.

- [x] `src/idea/brief-content.ts` (NEW, pure): `extractTalkingPoints`/`extractAngle`/`parseBriefContent`
      — parses a Brief markdown's `## Talking Points`/`## Angle` sections; reuses (never re-implements)
      `src/importer/source-urls.ts`'s `extractSourceUrls` for `## Source(s)`. Test-first:
      `brief-content.test.ts`, 14 tests against a REALISTIC Brief sample (mirroring a real straw-motion
      `idea-NN.md`), including both heading capitalizations and wrapped-bullet folding.
- [x] `src/production-spec/generate.ts`: `Brief` gains OPTIONAL `talkingPoints`/`sourceUrls` fields
      (never fabricated — omitted when the Brief has none, mirroring `companies`' own convention).
- [x] `src/commands/accept-idea.ts`: `acceptIdeaCommand` now loads the Idea's REAL on-disk Brief markdown
      (`loadBrief`, trying the ledger's own `brief_path` first) and parses it via `parseBriefContent`
      BEFORE authoring — threading `angle`/`talkingPoints`/`sourceUrls` onto the `Brief`. A missing Brief
      file degrades to the title-only Brief, reported plainly, never blocking the accept.
- [x] `news-carousel-generate.ts`: the "hook" slide stays title-grounded; every OTHER slide's `text` now
      draws from a DISTINCT `brief.talkingPoints` entry (role-label-prefixed, so a cycled repeat when
      there are fewer than 6 points is never verbatim-identical), falling back to the OLD template only
      when the Brief has none at all.
- [x] `news-short-script-generate.ts`: the "story" beat's words now draw from `brief.talkingPoints` FIRST
      (falling back to `FILLER_WORDS` only for the shortfall); `source_url` now prefers a real,
      distinct-site URL from `brief.sourceUrls` before falling back to the synthetic `HOST_CYCLE`.
- [x] `news-carousel-author-checklist.ts`: new `slide-text-variety` item on
      `auditNewsCarouselStandaloneAuthorPhase` — `ok: true` iff (a) at most 3 content words are common to
      EVERY one of the 7 slides' `text`, AND (b) no two slides share a 20+-char verbatim leading
      substring (the length-independent floor a short title's word-count-based measure alone would miss).
- [x] `news-short-script-author-checklist.ts`: new `checkNoRepeatedPhrases`/`no-repeated-phrases` item on
      `auditNewsShortScriptAuthorPhase` — `ok: true` iff no beat's own spoken text repeats the same
      4-word phrase more than once (the exact live padding pattern QA reproduced).
- [x] `src/recipe/registry.ts` + `registry.test.ts`: the News Short Script Recipe's documented
      author-phase checklist metadata gains the new item (6 mechanical + 1 agent-judged, was 5+1).
- [x] Direct, hand-verifiable proof mirroring QA's own repro: `author-at-review.test.ts`'s new "issue
      #273 round 2" describe block calls the REAL `authorSpecForRecipe` with a title-only Brief (the
      exact shape `accept-idea.ts` built before this round) for BOTH Recipes and asserts `ok: false`,
      naming `slide-text-variety`/`no-repeated-phrases` respectively — proving the fix survives the exact
      hand-verification QA performed, not just hand-crafted synthetic fixtures.
- [x] Every "happy path" test across `author-at-review.test.ts`/`accept-idea.test.ts`/
      `accept-to-produced-e2e.test.ts`/`carousel-end-to-end.test.ts` now authors against a REALISTIC
      Brief (real Talking Points), not a title-only one — proving the fix keeps production usable, not
      just that it can reject filler.
- [x] `openspec validate --strict` green (this change + all 73 specs).
- [x] Full suite (`npm test`) green — 4130/4130 (20 net new tests).
- [x] `npm run build` green; `npm run test:docs` green — 351/351, unaffected.
- [x] Self-review / simplify pass — see `handoff.md`'s Round-2 Build block.
- [x] Append the Round-2 Build block to `handoff.md`.
