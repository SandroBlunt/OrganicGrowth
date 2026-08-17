# skill-command-surface Specification

## Purpose
TBD - created by archiving change issue-247-skills-typed-commands. Update Purpose after archive.
## Requirements
### Requirement: Every Recipe Skill and command doc names a typed accessor instead of a raw `data/brands/<slug>/` path

Every stateful read or write described in `.claude/skills/{produce-character-explainer, produce-news-carousel, produce-news-short-script, write-social-copy, fetch-curated-source}/SKILL.md` and in `.claude/commands/*.md` (excluding `build-issue.md`, which names none) SHALL name the specific typed function that performs it — a `src/command-surface/` export where that surface covers the exact operation (Trends, Ideas, Jobs, Assets, Posts, Performance, gates, or Copy); the matching file-backed typed store/resolver otherwise (`resolveBrand`, `FormatStore`'s `loadFormat`, `src/ledger/ledger.ts`, `resolveBriefPathCandidates`, `specPathFor`, `castCandidatesDirFor`, `listBrands`) — rather than instructing a direct read or write of a bare `data/brands/<slug>/...` path. A bare relative path MAY still appear as an illustrative example of what an already-named accessor returns or is backed by, but SHALL NOT stand alone as the interface.

#### Scenario: a Recipe Skill's Brand hard-rules input names loadBannedWords/loadCopyRules, not a raw brand-profile.yaml path

- **GIVEN** any of `.claude/skills/{produce-character-explainer, produce-news-carousel,
  produce-news-short-script, write-social-copy}/SKILL.md`'s Inputs section
- **WHEN** it describes reading the Brand's banned words / required CTA / hashtags
- **THEN** it names `src/production-spec/brand-profile.ts`'s `loadBannedWords`/`loadCopyRules` as the
  accessor
- **AND** it does not instruct a direct read of `data/brands/<slug>/brand-profile.yaml` as the interface

#### Scenario: a Recipe Skill's Idea-brief input names resolveBriefPathCandidates, not a raw idea-NN.md path

- **GIVEN** any of `.claude/skills/{produce-character-explainer, produce-news-carousel,
  produce-news-short-script}/SKILL.md`'s Inputs section
- **WHEN** it describes reading the accepted Idea's brief
- **THEN** it names `src/format/brief-path.ts`'s `resolveBriefPathCandidates` as the accessor
- **AND** it does not instruct a direct read of `data/brands/<slug>/ideas/<format>/<run>/idea-NN.md` as
  the interface

#### Scenario: run-trends.md names createTrend and createIdea as the sanctioned future targets for its two writes

- **GIVEN** `.claude/commands/run-trends.md`'s Steps section, describing trend-scout's `trends.json`
  write and idea-strategist's ledger append
- **WHEN** it is read
- **THEN** it names `src/command-surface/trends.ts`'s `createTrend` and `src/command-surface/ideas.ts`'s
  `createIdea` as the sanctioned commands for those two operations once the Brand's data is on the
  SQL-backed pipeline
- **AND** it states, citing rule 7, that today's operative write is the file (`trends.json` / the ledger
  append) itself — never silently presenting the SQL write as already live

#### Scenario: review-ideas.md names recordReviewDecision for both the accept and reject writes

- **GIVEN** `.claude/commands/review-ideas.md`'s Steps section, describing the accept and reject writes
- **WHEN** it is read
- **THEN** both the accept path (step 5.6) and the reject path (step 6) name
  `src/command-surface/ideas.ts`'s `recordReviewDecision` as the sanctioned future command
- **AND** each states today's operative write is the Brand's own ledger, via `src/ledger/ledger.ts`

#### Scenario: log-post.md, pick.md, pick-cast.md, track-performance.md, export-schedule.md, and queue.md each name their own command-surface category

- **GIVEN** `.claude/commands/{log-post, pick, pick-cast, track-performance, export-schedule, queue}.md`
- **WHEN** each is read
- **THEN** `log-post.md` names `src/command-surface/posts.ts`'s `logPost` (Posts)
- **AND** `pick.md`/`pick-cast.md` name `src/command-surface/gates.ts`'s `resolveGate` (gates), stated
  alongside the existing distinction that this command only ever writes the file-based Production Queue,
  never the SQL-backed `job` table
- **AND** `track-performance.md` names `src/command-surface/performance.ts`'s
  `recordPerformanceSnapshot`/`recordPerformanceScore` (Performance)
- **AND** `export-schedule.md` names `src/command-surface/assets.ts`'s `saveAsset` (Assets) for its
  `scheduled_at` stamp
- **AND** `queue.md` names `src/command-surface/jobs.ts`'s `enqueueJob`/`claimJob`/`releaseJob` (Jobs),
  stated as the SQL-backed `job` table's own operations, a genuinely separate store from the file queue
  this command reads

#### Scenario: commands with no command-surface category cite the existing typed accessor instead of a bare path

- **GIVEN** `.claude/commands/{backup-media, cleanup-schedule-media, report, run-pipeline}.md`, none of
  which describes an operation covered by `src/command-surface/`
- **WHEN** each is read
- **THEN** every former `data/brands/<slug>/...` citation names its existing typed accessor instead
  (`listBrands`, `src/media-backup/produced-media-tree.ts`, `resolveBrand`, `src/ledger/ledger.ts`)
- **AND** none names a command-surface function that does not actually cover the described operation

### Requirement: The Recipe Skills' craft rules move through the citation rewrite byte-for-byte

The per-Recipe writing rules, the baseline-prompt discipline, the placeholder-frame phrasing, the real-source-imagery rule, and the anti-rhetoric caption rules SHALL be preserved byte-for-byte across this change — never tidied, compressed, or paraphrased while a nearby citation is rewritten. Where a protected sentence and a plumbing citation share one sentence, the citation half SHALL be rewritten and the rule half left untouched, rather than the whole sentence being paraphrased.

#### Scenario: write-social-copy's anti-rhetoric caption rules are untouched

- **GIVEN** `.claude/skills/write-social-copy/SKILL.md` as shipped after this change
- **WHEN** it is diffed against `main`
- **THEN** the only changed line pair is the single `brand-profile.yaml` plumbing citation in its Inputs
  section
- **AND** the fresh-CTA-every-time rule, the banned canned "Swipe through the 7-slide breakdown" example,
  the grounded-companies rule, the em-dash/en-dash/hyphen-as-sentence-dash ban, and the LinkedIn
  `@mention` mechanics are byte-for-byte unchanged

#### Scenario: produce-news-carousel's placeholder-frame phrasing and real-source-imagery rule are untouched

- **GIVEN** `.claude/skills/produce-news-carousel/SKILL.md` as shipped after this change
- **WHEN** it is diffed against `main`
- **THEN** every changed line lives in its `## Inputs` section only
- **AND** the Subject rules, the `card_style`/`kind`/`source_url` sections, the REAL MEDIA CLAUSE
  reserved-frame phrasing, and the author-phase checklist are byte-for-byte unchanged

#### Scenario: the eleven model-prompting Skill files carry no citation and are untouched

- **GIVEN** the eleven Skill files that are not one of the five Recipe/curated-source Skills this change
  edits (`chatgpt-image-2`, `grok-imagine`, `grok-imagine-1-5`, `happy-horse`, `kling-3-0`,
  `kling-3-0-omni`, `nano-banana-2`, `seedance-2-0`, `seedream-4-5`, `seedream-5-0-pro`, `veo-3-1`)
- **WHEN** `git diff main --stat -- .claude/skills/` is read
- **THEN** none of these eleven files appears in the diff

### Requirement: Doc-conformance checks stay in lockstep through the rewrite

Every pre-existing test or docs-test that pins content in a file this change touches SHALL still pass
after the rewrite, with the SAME or a greater number of assertions — never fewer, and never weakened to
pass by asserting less. Where a pinned regex targets the exact literal path text this change legitimately
rewrites, the regex SHALL be re-pinned to the SAME substantive claim it always proved, never simply
deleted.

#### Scenario: npm run test:docs and npm test hold their pre-change totals

- **GIVEN** `npm run test:docs` measured at 327 assertions / 84 suites, 0 failing, and `npm test`
  measured at 3401 tests / 893 suites, 0 failing, both on `main` at `4d023e9`
- **WHEN** both are run against this change's edited files
- **THEN** both report the SAME totals, 0 failing — no assertion removed, no suite dropped

#### Scenario: the two regexes that targeted literal path text this change rewrites are re-pinned, not weakened

- **GIVEN** `src/format/format-docs.test.ts`'s Brief-fallback-path Scenario, which previously required
  the literal substring `brands/<slug>/ideas/<Idea.format>/<run>/idea-NN.md` in `review-ideas.md`
- **WHEN** `review-ideas.md`'s fallback-path illustration drops its `data/brands/<slug>/` prefix per this
  change
- **THEN** the test's regex is updated to require `ideas/<Idea.format>/<run>/idea-NN.md` — the SAME
  substantive claim (the Format-namespaced shape is tried before the legacy Brand-level one), at the
  same specificity, never merely asserting the old text's absence with nothing to replace it

### Requirement: The six agent files are checked for #246's own citation regression, and corrected if found

Every citation in `.claude/agents/{developer, idea-strategist, performance-tracker, producer, qa, trend-scout}.md` SHALL be checked against the eight `src/command-surface/` categories (Trends, Ideas, Jobs, Assets, Posts, Performance, gates, Copy): a citation naming a file-backed store module where a real command-surface command already covers that exact operation is the one regression Option A identifies as unacceptable, and SHALL be corrected to name the command. Where no such regression is found, the six agent files SHALL remain unedited by this change, and the check's outcome SHALL be recorded explicitly rather than silently assumed.

#### Scenario: the six agent files are audited and found already correct

- **GIVEN** the six `.claude/agents/*.md` files as merged by #246
- **WHEN** every citation in them is checked against the eight command-surface categories
- **THEN** `idea-strategist.md` is confirmed to already name `createIdea` for its Ideas operation, and
  `qa.md` is confirmed to already state the exact Option A pattern for ledger-as-source-of-truth
- **AND** every other citation (`AssetStore.writeAsset`, `src/production-queue/queue.ts`,
  `src/production-spec/store.ts`, `src/mention-handle/store.ts`, `src/brand-asset/store.ts`) is confirmed
  to name a file-backed store with no SQL command-surface equivalent wired to the same data
- **AND** `git diff main --stat -- .claude/agents/` is empty for this change

### Requirement: Every new command-surface citation this change introduces is pinned by a dedicated docs-test, and every revert guard is verified non-vacuous

Every command-surface citation this change adds to `.claude/commands/{run-trends, review-ideas, pick, pick-cast, log-post, track-performance, export-schedule, queue}.md` SHALL be pinned by a docs-test asserting BOTH that the command name and its module appear, AND that the exact raw `data/brands/<slug>/...` (or equivalent bare-path) text it replaced does not reappear. Each revert-guard assertion SHALL be verified, before being committed, to actually match the pre-change text of the file it guards — a negative assertion that could never have matched its own target (e.g. because the guarded text spans a markdown wrap boundary the regex does not tolerate) is not a guard.

#### Scenario: a hand-revert of run-trends.md's createTrend/createIdea citation is caught

- **GIVEN** `run-trends.md` reverted, by hand, to its exact pre-#247 text (the `data/brands/<slug>/ideas/<format>/<run>/trends.json` and `data/brands/<slug>/ledger.json` paths, with no `createTrend`/`createIdea` mention)
- **WHEN** `src/claude-commands/command-surface-citations.docs-test.ts` is run against the reverted file
- **THEN** its `run-trends.md` describe block fails — proving the guard is not vacuous, exactly the repro QA's Round-1 Verdict named

#### Scenario: log-post.md names getAssetByRecipe for its Asset-lookup read, for symmetry with its Posts write

- **GIVEN** `log-post.md`'s Steps section describes finding the Idea's Asset whose `recipe` matches `<recipe>` exactly — the same lookup shape as command-surface's `getAssetByRecipe` (an Assets-category read)
- **WHEN** it is read
- **THEN** it names `getAssetByRecipe` (`src/command-surface/assets.ts`) as the sanctioned future read, alongside its existing `src/ledger/ledger.ts` citation for today's operative read, matching the same additive pattern used for every write-shaped citation in this change

#### Scenario: npm test and npm run test:docs rise by exactly the new suite's own assertion count

- **GIVEN** `npm test` at 3401/893 and `npm run test:docs` at 327/84, both 0 failing, before this Requirement's own docs-test is added
- **WHEN** `src/claude-commands/command-surface-citations.docs-test.ts` (20 assertions, 7 suites) is added
- **THEN** `npm test` reports 3421/900, 0 failing, and `npm run test:docs` reports 347/91, 0 failing — the floor rises by exactly the new suite's own count, never by an unrelated or accidental amount

