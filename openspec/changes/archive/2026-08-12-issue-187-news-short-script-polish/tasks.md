## 1. Curiosity Queries join the Spec's own beat shape (test-first)

- [x] 1.1 Add `MIN_CURIOSITY_QUERIES`/`MAX_CURIOSITY_QUERIES` constants and the required
  `curiosity_queries: readonly string[]` field to `NewsShortScriptBeat`
  (`src/production-spec/news-short-script-contract.ts`).
- [x] 1.2 Write failing tests (`news-short-script-validate.test.ts`): a beat missing `curiosity_queries`,
  with fewer than 3, with more than 5, or with a blank entry each fail with a new
  `curiosity_queries_invalid` error code; the valid fixture (3 per beat) passes.
- [x] 1.3 Implement the check in `beatShapeError` (`news-short-script-validate.ts`).
- [x] 1.4 Update the shared fixture (`fixtures/news-short-script-specs.ts`): every beat carries 3
  Curiosity Queries, a DISTINCT source-site per beat (issue #187's variety rule), and a genuine,
  budget-sized `cta` Sign-off line; add `missingCuriosityQueries`/`curiosityQueriesTooFew`/
  `curiosityQueriesTooMany`/`curiosityQueriesBlankEntry` fixture mutations.

## 2. A universal calendar-date "tell" scanner (test-first)

- [x] 2.1 Write failing tests (`calendar-date-scan.test.ts`) for `scanTextFieldsForDates`: a month+day, a
  month+day+year, an abbreviated month, a day-of-month phrasing, an ISO date, and a numeric slash date
  are each caught; a lowercase month-shaped word used as an ordinary verb is NOT flagged; multiple fields
  are scanned independently; an empty fields list always passes; the result never carries a "corrected"
  text (reject-only).
- [x] 2.2 Implement `src/production-spec/calendar-date-scan.ts`, mirroring `dash-safety.ts`'s own
  `TextField[]`-generic, reject-only shape.

## 3. The News Short Script Recipe's own graduated author-phase checklist (test-first)

- [x] 3.1 Write failing tests (`news-short-script-author-checklist.test.ts`) for
  `auditNewsShortScriptAuthorPhase`: a baseline-adherent Spec passes every mechanical item; a malformed
  Spec fails the structural item (referencing, not duplicating, `validateNewsShortScriptSpec`); a beat
  missing/short on Curiosity Queries fails ONLY the `curiosity-queries` item; a beat whose `text` states
  an explicit calendar date fails ONLY the `no-calendar-dates` item; two beats sharing the same
  `source_url` site fail ONLY the `shot-list-variety` item; a banned word fails ONLY the `banned-words`
  item (referencing, not duplicating, `scanNewsShortScriptForBannedWords`); the function never throws on
  a malformed candidate. Also test `checkShotListVariety` directly: distinct sites pass; a shared host
  (with/without `www.`, case-insensitive) fails; a malformed/missing `source_url` never throws.
- [x] 3.2 Implement `src/production-spec/news-short-script-author-checklist.ts`.
- [x] 3.3 Add `src/production-spec/fixtures/news-short-script-author-checklist-specs.ts`
  (`calendarDateInBeatText`, `duplicateSourceSite`, `exactDuplicateSourcePage`), derived from the shared
  valid fixture by one focused mutation each.
- [x] 3.4 Wire the three new mechanical items into `src/recipe/registry.ts`'s `NEWS_SHORT_SCRIPT_PHASES`
  author phase, referencing the new module; update `registry.test.ts`'s checklist-count assertions.

## 4. The produced script shows a [Next shot] marker; the Shot List manifest shows Curiosity Queries (test-first)

- [x] 4.1 Write failing tests (`news-short-script-output.test.ts`): `scriptText` joins beats' `text` with
  a `NEXT_SHOT_MARKER` line between every pair of consecutive beats (one fewer marker than beats); the
  marker never appears inside a beat's own `text` field; a blank/whitespace-only beat is still skipped,
  never leaving a stray marker; `shotListText` renders each beat's Curiosity Queries as a `queries: ...`
  line.
- [x] 4.2 Implement in `src/asset/news-short-script-output.ts`: export `NEXT_SHOT_MARKER`; join
  `scriptText`'s lines with it; add `queriesLine` to `shotListText`'s per-beat block.
- [x] 4.3 Update `news-short-script-end-to-end.test.ts` to additionally assert
  `auditNewsShortScriptAuthorPhase(spec, []).ok` on the authored Spec.

## 5. The Sign-off family and the Copy CTA direction are rewritten (docs + a real-document test)

- [x] 5.1 Rewrite `data/brands/straw-motion/baseline-prompts/unhypped-daily/news-short-script.md`'s
  Sign-off family (beat-map row 5, §12, the 3 sample scripts' `[cta]` lines) to invite a comment/question
  about the viewer's own life and how AI is affecting them — dropping every "Follow Straw Motion" line —
  while keeping the "rotate within the family, ritual repetition" instruction unchanged. Add Curiosity
  Queries + `[Next shot]` marker notes to the beat map and the Shot List illustration section.
- [x] 5.2 Write a failing-then-passing test (`news-short-script-straw-motion-baseline.test.ts`) against
  the REAL, committed document (via `loadFormat`/`loadBaselinePrompt`, never asserted by fiat): no
  "Follow Straw Motion" anywhere; the Sign-off instruction names the viewer's own life + how AI affects
  it; "rotate within the family"/"ritual repetition" still present; the 3 worked Sign-off sample lines
  each fall inside the 6-11 word budget.
- [x] 5.3 Update `.claude/skills/produce-news-short-script/SKILL.md`: document `curiosity_queries`
  authoring, the calendar-date ban, the Shot List site-variety rule, picking the Sign-off verbatim from
  the Baseline Prompt's fixed family, and self-auditing via `auditNewsShortScriptAuthorPhase`. Add
  additive assertions to `produce-news-short-script-skill.docs-test.ts`.
- [x] 5.4 Add a scoped clause to `.claude/skills/write-social-copy/SKILL.md`'s title+description section:
  for the News Short Script Recipe ONLY, the description's CTA aims at the viewer's own life (fresh
  wording every time), distinct from the script's own fixed-family Sign-off; every other Recipe's caption
  direction is unchanged. Add additive assertions to `write-social-copy-skill.docs-test.ts`.

## 6. OpenSpec + full-suite green + self-review + Build Report

- [x] 6.1 Author spec deltas (`specs/production-spec`, `specs/news-short-script-recipe`,
  `specs/producer-skill`) as Requirements + Scenarios; run `openspec validate --strict` until green.
- [x] 6.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs` — all green except the
  confirmed pre-existing, unrelated `src/format/store.test.ts` `listFormatSlugs` failure (issue #185,
  stale since commit `eb76882`).
- [x] 6.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #187
  acceptance criterion maps to a specific test.
- [x] 6.4 Write the Build Report into `handoff.md`.
