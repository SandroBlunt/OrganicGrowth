## Why

The 2026-08-12 Unhypped Daily grilling session recorded five decisions for the News Short Script Recipe
(issue #174), already captured as new/sharpened `CONTEXT.md` terms (**Sign-off**, **Curiosity Queries**,
a sharpened **Shot List**): its spoken close and its caption's CTA both currently point at a generic
"follow us" family instead of inviting the viewer to say something about their OWN life; nothing stops a
script from stating an explicit calendar date (the platform already shows it); nothing stops the Shot
List from reusing the same source page/site across two beats (a monotone, low-effort Shot List); the
Operator gets no help finding better real source material per beat; and the produced script file gives
no visual cue for where one beat's spoken line ends and its paired Shot List entry's next beat begins.
This slice makes the code match those already-recorded decisions.

## What Changes

- **The Sign-off family is rewritten** (`data/brands/straw-motion/baseline-prompts/unhypped-daily/
  news-short-script.md`): the fixed, rotating family of ≤11-word closing lines the `cta` beat picks from
  now invites a comment/question about the viewer's own life and how AI is affecting them, replacing the
  old "Follow Straw Motion" family — ritual repetition is UNCHANGED (CONTEXT.md "Sign-off": it still
  rotates within a small fixed family, never freshly written per script). The `produce-news-short-script`
  Skill documents picking it, verbatim, from that family.
- **The Copy CTA direction is rewritten, scoped to this Recipe only** (`write-social-copy` Skill, section
  3): for a Recipe whose `copyShape` declares `titleMaxChars` (today: News Short Script alone), the
  description's closing CTA now aims at the viewer's own life/work (fresh wording every time, unlike the
  Sign-off) instead of the general "comment their thoughts or follow for more" direction every OTHER
  Recipe's caption keeps unchanged.
- **A new, universal calendar-date "tell" scanner** (`src/production-spec/calendar-date-scan.ts`,
  `scanTextFieldsForDates`), mirroring `dash-safety.ts`'s own reject-only, `TextField[]`-generic shape:
  catches a month name + day, a day-of-month phrasing, an ISO date, and a numeric slash date, matched
  case-sensitively on the month name to avoid false-flagging an unrelated lowercase word ("may", "march").
- **A new News Short Script author-phase checklist**
  (`src/production-spec/news-short-script-author-checklist.ts`, `auditNewsShortScriptAuthorPhase`),
  mirroring `news-carousel-author-checklist.ts`'s own graduated pattern: REFERENCES this Recipe's own
  `validateNewsShortScriptSpec`/`scanNewsShortScriptForBannedWords` (never duplicates them) and layers
  three NEW mechanical items — every beat carries 3-5 Curiosity Queries, no beat's SPOKEN `text` states an
  explicit calendar date (scoped to `text` only — never `source_url`/`media_url`, which legitimately carry
  a publication date in their own URL path, and never `show_cue`, a document annotation), and no two
  beats' `source_url` repeat the same site/company (`checkShotListVariety`, mirroring the News Carousel
  Recipe's own `placement-variety` item, issue #106 — needs no per-Format parameters, since "no repeated
  source site" is a fixed, universal rule). `src/recipe/registry.ts`'s `NEWS_SHORT_SCRIPT_PHASES` author
  phase now references this graduated module for its three new mechanical items, alongside its two
  existing `specShape`-referencing items.
- **Curiosity Queries join the Spec's own beat shape** (`src/production-spec/news-short-script-
  contract.ts`/`-validate.ts`): every `NewsShortScriptBeat` gains a required `curiosity_queries: readonly
  string[]` field — `MIN_CURIOSITY_QUERIES`(3)-`MAX_CURIOSITY_QUERIES`(5) non-empty entries — checked by
  `validateNewsShortScriptSpec` (the SAME structural gate as `source_url`/`show_cue`), with a new
  `curiosity_queries_invalid` error code. `shotListText` (`src/asset/news-short-script-output.ts`) renders
  them on the Shot List manifest (`shot-list.txt`) as a `queries: ...` line per beat — a research aid,
  never spoken.
- **`scriptText` shows a `[Next shot]` marker between beats** (`src/asset/news-short-script-output.ts`,
  new export `NEXT_SHOT_MARKER`): one marker line between every pair of consecutive beats' spoken lines in
  the produced `script.txt` — a document annotation only, computed at RENDER time; no beat's own `text`
  field is ever touched by it (still only speakable words — no stage directions read aloud), making the
  data's already-existing 1:1 beat-to-Shot-List-entry pairing visible when reading the file.
- **Fixture realism**: the shared valid Spec fixture (`fixtures/news-short-script-specs.ts`) now carries a
  distinct source-site per beat and 3 Curiosity Queries per beat, and its `cta` beat is a genuine,
  budget-sized Sign-off line rather than a mixed engagement-question-plus-follow-CTA line.

## Non-Goals (explicitly out of scope for this slice)

- The News Carousel Recipe's own production code (its author-checklist is read only as a pattern
  reference) — owned by a separate slice (issue #188).
- Any change to ADR-0025/ADR-0026 (a Recipe's declared Copy platforms; the LinkedIn mention-aid move) —
  separate, unrelated issues (#183, #186).
- Live YouTube publishing, per-Channel performance tracking, and the Schedule Batch/Zoho path — all
  untouched, exactly as issue #174 already scoped them out.
- Auto-migrating any already-produced Spec on disk (e.g. the 2026-08-11 launch run's `.spec.json` files)
  to carry `curiosity_queries` — those are historical, read-only records; nothing in the pipeline
  re-validates a saved Spec after the fact.

## Capabilities

### Modified Capabilities

- `production-spec`: the News Short Script Spec's structural validator gains the `curiosity_queries`
  field/check; a new graduated author-phase checklist (calendar-date scan + Shot List source variety +
  Curiosity Queries, referencing — never duplicating — the existing validator/scanner) is added.
- `news-short-script-recipe`: `scriptText` gains the `[Next shot]` marker between beats; `shotListText`
  renders each beat's Curiosity Queries.
- `producer-skill`: the `produce-news-short-script` Skill documents Curiosity Queries, the calendar-date
  rule, the Shot List variety rule, and picking the Sign-off from the Baseline Prompt's fixed family;
  `write-social-copy` documents the News-Short-Script-scoped CTA direction change.

## Impact

- **New code:** `src/production-spec/calendar-date-scan.ts` (+`.test.ts`),
  `src/production-spec/news-short-script-author-checklist.ts` (+`.test.ts`),
  `src/production-spec/fixtures/news-short-script-author-checklist-specs.ts`,
  `src/production-spec/news-short-script-straw-motion-baseline.test.ts`.
- **Modified code:** `src/production-spec/news-short-script-contract.ts` (+`.test.ts` untouched, no new
  assertions needed — pure constants/types), `-validate.ts` (+`.test.ts`),
  `fixtures/news-short-script-specs.ts`; `src/asset/news-short-script-output.ts` (+`.test.ts`);
  `src/recipe/registry.ts` (+`.test.ts`); `src/producer/news-short-script-end-to-end.test.ts`;
  `.claude/skills/produce-news-short-script/SKILL.md` (+its `.docs-test.ts`);
  `.claude/skills/write-social-copy/SKILL.md` (+its `.docs-test.ts`);
  `data/brands/straw-motion/baseline-prompts/unhypped-daily/news-short-script.md`.
- **Hermetic, no live Space anywhere.** This Recipe has no Space at all (ADR-0021) — no Magnific fake is
  added or needed; every new/touched test is plain-file + pure-function testing (JSON fixtures, a
  markdown document, deterministic deep modules).
- **Always-rules upheld:** generate-never-publish (the Asset is still written, never posted);
  public-metrics-only/relative-not-absolute (no metrics code touched); explicit-attribution (`/log-post`
  untouched); ledger-as-source-of-truth (no ledger-writing code touched by this slice).
