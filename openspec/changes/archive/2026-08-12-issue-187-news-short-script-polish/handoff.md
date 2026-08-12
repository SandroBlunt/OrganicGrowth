# Slice Handoff — issue #187: News Short Script polish

Bidirectional channel between `developer` and `qa` for this slice. Developer writes the Build Report;
`qa` appends its Verdict below (nothing is overwritten); a retry appends a new Round-N Build block.

---

## Build Report (developer, Round 1)

### What changed

Five decisions from the 2026-08-12 Unhypped Daily grilling session (already recorded as `CONTEXT.md`
terms — Sign-off, Curiosity Queries, a sharpened Shot List) are now built into the News Short Script
Recipe's code and docs:

1. **Sign-off family rewritten** — the script's closing `cta` beat now picks, verbatim, from a small
   fixed family of lines that invite a comment/question about the viewer's own life and how AI is
   affecting them, replacing the old "Follow Straw Motion" family. Ritual repetition (rotate within the
   family, never invent a new one per script) is unchanged.
2. **Copy CTA direction rewritten, scoped to this Recipe only** — `write-social-copy`'s title +
   description section now aims the News Short Script Recipe's own description CTA at the viewer's own
   life/work (fresh wording every time, unlike the Sign-off), leaving every other Recipe's caption
   direction unchanged.
3. **No explicit calendar date, mechanically checked** — a new, universal, reject-only calendar-date
   scanner (`calendar-date-scan.ts`) scoped to each beat's spoken `text` only, wired into a new author-
   phase checklist.
4. **No repeated Shot List source site, mechanically checked** — a new `shot-list-variety` check
   (site/host-level, `www.`-stripped, case-insensitive), mirroring the News Carousel Recipe's own
   `placement-variety` item (issue #106), in the same new checklist.
5. **Curiosity Queries** — every beat's Spec shape now carries a required `curiosity_queries` array
   (3-5 non-empty entries), checked by the core structural validator (the same gate as `source_url`/
   `show_cue`) and surfaced on the Shot List manifest.
6. **`[Next shot]` marker** — the produced `script.txt` now shows a `[Next shot]` marker between every
   pair of consecutive beats' spoken lines — a document annotation computed at render time; no beat's own
   `text` field is ever touched by it.

### Files touched

**New:**
- `src/production-spec/calendar-date-scan.ts` (+ `.test.ts`)
- `src/production-spec/news-short-script-author-checklist.ts` (+ `.test.ts`)
- `src/production-spec/fixtures/news-short-script-author-checklist-specs.ts`
- `src/production-spec/news-short-script-straw-motion-baseline.test.ts`
- `openspec/changes/issue-187-news-short-script-polish/` (proposal.md, tasks.md, specs deltas, this file)

**Modified:**
- `src/production-spec/news-short-script-contract.ts` — `MIN_CURIOSITY_QUERIES`/`MAX_CURIOSITY_QUERIES`
  constants; `NewsShortScriptBeat.curiosity_queries` (required field).
- `src/production-spec/news-short-script-validate.ts` (+ `.test.ts`) — `curiosity_queries_invalid` check.
- `src/production-spec/fixtures/news-short-script-specs.ts` — every beat now carries 3 Curiosity Queries
  and a distinct source-site; the `cta` beat is a genuine, budget-sized Sign-off line; new mutation
  fixtures (`missingCuriosityQueries`, `curiosityQueriesTooFew`, `curiosityQueriesTooMany`,
  `curiosityQueriesBlankEntry`).
- `src/asset/news-short-script-output.ts` (+ `.test.ts`) — `NEXT_SHOT_MARKER` export; `scriptText` joins
  beats with it; `shotListText` renders each beat's Curiosity Queries.
- `src/recipe/registry.ts` (+ `.test.ts`) — `NEWS_SHORT_SCRIPT_PHASES`'s author phase references the new
  checklist module for its three new mechanical items.
- `src/producer/news-short-script-end-to-end.test.ts` — additionally asserts
  `auditNewsShortScriptAuthorPhase(spec, []).ok` on the authored Spec.
- `.claude/skills/produce-news-short-script/SKILL.md` (+ its `.docs-test.ts`) — Curiosity Queries,
  calendar-date ban, Shot List variety, picking the Sign-off from the fixed family, self-audit via
  `auditNewsShortScriptAuthorPhase`.
- `.claude/skills/write-social-copy/SKILL.md` (+ its `.docs-test.ts`) — the News-Short-Script-scoped CTA
  direction clause.
- `data/brands/straw-motion/baseline-prompts/unhypped-daily/news-short-script.md` — Sign-off family
  rewrite (beat map, §12, the 3 sample scripts' `[cta]` lines, the Shot List illustration section).

### How to run

```
cd /Users/CaxtonTaylor/Developer/OrganicGrowth
npx tsc -p tsconfig.json --noEmit          # type-check
npm test                                    # full unit suite (type-checks first)
npm run test:docs                           # Skill/doc-conformance suite
openspec validate --strict issue-187-news-short-script-polish
```

Run a single new file directly, e.g.:
```
node --import tsx --test src/production-spec/news-short-script-author-checklist.test.ts
node --import tsx --test src/production-spec/news-short-script-straw-motion-baseline.test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | Spoken Sign-off family + caption CTA rewritten toward a personal comment/question tied to AI's effect on the viewer's life; Sign-off still rotates within a small fixed family | `src/production-spec/news-short-script-straw-motion-baseline.test.ts` (all 4 tests — reads the REAL committed baseline-prompt document: no `Follow Straw Motion` anywhere, names the viewer's own life + how AI affects it, keeps "rotate within the family"/"ritual repetition", 3 worked sample lines each 6-11 words); `produce-news-short-script-skill.docs-test.ts`'s "documents the closing cta beat as the Sign-off..." block; `write-social-copy-skill.docs-test.ts`'s "the News Short Script Recipe's own CTA aims at the viewer's own life..." block |
| 2 | An explicit calendar date anywhere in a script's beats fails validation the same reject-only way as the banned-word scan | `calendar-date-scan.test.ts` (12 tests proving the scanner itself); `news-short-script-author-checklist.test.ts`'s "fails the 'no-calendar-dates' item when a beat's spoken text states an explicit calendar date" test |
| 3 | A Shot List with two beats pointing at the same source page, or the same site/company, fails validation the same way | `news-short-script-author-checklist.test.ts`'s `checkShotListVariety` describe block (5 tests: distinct sites pass, `www.` stripped, case-insensitive, malformed/missing URL never throws, empty list passes) + its "fails the 'shot-list-variety' item..." and "...EXACT same source page..." tests |
| 4 | Every produced Shot List beat carries a non-empty list of 3-5 Curiosity Queries | `news-short-script-validate.test.ts`'s "Curiosity Queries: 3-5 non-empty entries per beat" block (5 tests: missing, too few, too many, blank entry, valid fixture passes); `news-short-script-author-checklist.test.ts`'s curiosity-queries item tests; `news-short-script-output.test.ts`'s "renders each beat's role, show cue, source, Curiosity Queries..." test |
| 5 | The produced script file shows a `[Next shot]` marker between beats; the underlying spoken-text field is untouched | `news-short-script-output.test.ts`'s `scriptText` describe block: "joins every beat's text... separated by the [Next shot] marker", "shows exactly one [Next shot] marker between every pair of consecutive beats", "never includes a beat-role label, show cue, source URL, or Curiosity Query", "the [Next shot] marker is a document annotation only — no beat's own text field is ever touched by it", "skips a beat whose text is blank/whitespace-only... never leaving a stray marker" |
| 6 | Full test suite green; docs stay accurate to shipped behavior | `npm test`: 2185/2186 pass — the 1 failure is the confirmed pre-existing, unrelated `src/format/store.test.ts` `listFormatSlugs` count assertion (stale since commit `eb76882`, flagged in issue #185's own build report; untouched by this slice). `npm run test:docs`: 232/232 pass. `openspec validate --strict`: passes for this change AND `--all` across the whole repo |

### Fakes / fixtures used

- **No Magnific/Space fake needed.** The News Short Script Recipe is Space-less (ADR-0021) — confirmed
  again this slice: nothing touched here imports a `SpaceMcpPort`/`FakeSpace`/`FakeCarouselSpace`, and no
  file calls a `spaces_*`/`creations_*` tool (checked mechanically by the Skill's own docs-test, unchanged
  assertion, still green). Every new/touched test is plain-file + pure-function testing.
- Fixtures: `src/production-spec/fixtures/news-short-script-specs.ts` (the shared valid Spec + focused
  broken variants) and the new `fixtures/news-short-script-author-checklist-specs.ts` (calendar-date and
  duplicate-site mutations). `src/production-spec/news-short-script-straw-motion-baseline.test.ts` reads
  the REAL, committed Straw Motion baseline-prompt document (read-only, never mutated) via
  `loadFormat`/`loadBaselinePrompt` — the same "assert against the real document, never by fiat" pattern
  `news-carousel-straw-motion-fixture.test.ts` already established for issue #106.

### Self-review notes

- Kept `curiosity_queries` validation in the CORE structural validator (`beatShapeError`), alongside
  `source_url`/`show_cue`, rather than folding it into the new checklist module — it is a fixed, always-
  true shape rule (no per-Format parameterization), the same category as every other required beat field,
  and putting it there avoids a second, competing "is this beat well-formed" gate.
- Kept the calendar-date scan and the Shot List variety check OUT of the core structural validator and
  in the new, separate `news-short-script-author-checklist.ts` module instead — mirroring exactly where
  the News Carousel Recipe's own later-added `placement-variety` check lives (`news-carousel-author-
  checklist.ts`, not `news-carousel-validate.ts`), keeping the core validator's contract stable and the
  "checks added after the Spec shape was already frozen" pattern consistent across both Recipes.
  `checkShotListVariety` needed no per-Format parameters at all (unlike `placement-variety`), since "no
  repeated source site" is universal, not something a Baseline Prompt tunes — simpler than its Carousel
  counterpart for exactly that reason.
- Fixed the shared valid Spec fixture's `cta` beat, which previously mixed an engagement question AND a
  "follow us" line into one 34-word beat — inconsistent with the Baseline Prompt's own stated 6-11-word
  Sign-off budget. It is now a genuine, budget-sized Sign-off line; the extra ~30 words needed to keep the
  Spec's total inside 120-150 were folded into the second story beat's own content (an "honest catch"
  sentence), never padding.
- Gave every fixture beat a DISTINCT source-site (previously all four beats used `example.com`, one of
  them an exact duplicate URL) so the shared fixture doubles as the "baseline-adherent" positive case for
  the new `shot-list-variety` check too, rather than needing a second, parallel "good" fixture.
  `news-short-script-output.test.ts`'s one hardcoded-string assertion that depended on the old uniform
  hostname was rewritten to read the fixture's own URLs dynamically instead, so it can never silently
  drift from the fixture again.
- Phrased the SKILL.md's reject-only sentence for calendar dates so it still contains the literal
  substring `"banned word is REJECT-ONLY"` (the docs-test's own pinned regex), while extending the SAME
  contract to dates in a following clause, rather than editing the regex — keeps the existing pinned
  assertion meaningful (a real reject-only banned-word statement) instead of loosening it.
- Ran a check for every other test file that constructs a `NewsShortScriptBeat`/`NewsShortScriptSpec`
  literal directly (bypassing the shared fixture) so the new required `curiosity_queries` field wouldn't
  silently break `tsc --noEmit` elsewhere; the one hand-rolled case
  (`news-short-script-output.test.ts`'s blank-beat test) was updated.

### Known limits

- The calendar-date scanner is a heuristic regex set (month+day, day-of-month, ISO, slash-date),
  case-sensitive on month names to avoid flagging "may"/"march" as verbs — like the existing dash-tell
  scanner, it is not a full natural-language date parser and could in principle miss an unusual phrasing;
  this mirrors the existing banned-word/dash-tell scanners' own known-limits posture (a fixed, reviewable
  pattern set, not an ML classifier).
- `checkShotListVariety` compares registrable hostnames only (lowercased, `www.` stripped) — it does not
  attempt to resolve "the same company across two different domains" (e.g. a company's blog on a
  third-party platform vs. its own site); CONTEXT.md's own wording ("the same source page, or the same
  site/company") is satisfied at the site/host level, the same level of rigor the News Carousel Recipe's
  own `placement-variety` check operates at (data already on the Spec, no external lookup).
  `checkShotListVariety` applies uniformly across ALL beats including the closing `cta`/Sign-off beat —
  the SKILL.md and baseline prompt now instruct pointing a beat with no distinct external source (like an
  end-card Sign-off) at a stable, distinct reference (e.g. the Channel's own URL) rather than reusing
  another beat's `source_url`, which the rewritten fixture now demonstrates.
- No migration was written or run for already-produced `.spec.json` files on disk (e.g. the 2026-08-11
  launch run) that predate `curiosity_queries` — per the CLAUDE.md legacy-layout convention, nothing in
  the pipeline re-validates a saved Spec after the fact, and this was explicitly out of scope (see the
  proposal's Non-Goals).
- `write-social-copy`'s CTA-direction rewrite is prose-only (an LLM instruction) — there is no
  deterministic, testable proof of the actual generated wording the way `validateNewsShortScriptSpec`
  proves the Spec shape, matching how the Skill's existing "fresh CTA every time" instruction (2026-07-22)
  was already unverified by a deterministic test; `skillDraftCopy`/`newsShortScriptDraftCopy` deliberately
  never encode CTA wording (confirmed unchanged by this slice — see their own module docs).

---

## QA Verdict — Round 1: PASS

### Suite result

- `npx tsc -p tsconfig.json --noEmit` — green, no errors.
- `npm test` — **2185/2186 passing**. The 1 failure is `src/format/store.test.ts` → "mundotip and
  straw-motion are migrated to their own Format files (issue #53 AC2)" → subtest "listFormatSlugs finds
  both real Brands' migrated Format". Confirmed pre-existing and unrelated: `src/format/store.test.ts` is
  **not** in this branch's diff at all (`git status --porcelain` shows no changes to it; its last commit
  touching it is `dfb91b2`, "Issue #172: per-Format cadence field..." — unrelated to this slice), so the
  failure is the same one already independently confirmed pre-existing during issue #185's QA pass. Not a
  regression introduced by this diff.
- `npm run test:docs` — **232/232 passing**.
- `npx openspec validate --strict issue-187-news-short-script-polish` — `Change 'issue-187-news-short-
  script-polish' is valid`.
- `npx openspec validate --strict --all` — 40/40 items passed, including this change, no cross-spec
  breakage.

Commands run exactly as documented in the Build Report's "How to run" section; all results are actual
green, not assumed.

### Per-criterion results (issue #187 acceptance criteria, verbatim)

| # | Criterion | Result | Proving test(s) |
|---|---|---|---|
| 1 | Spoken Sign-off family + caption CTA rewritten toward a personal comment/question tied to AI's effect on the viewer's life; Sign-off still rotates within a small fixed family | **PASS** | `news-short-script-straw-motion-baseline.test.ts` (4/4 tests, reads the REAL committed doc: no `Follow Straw Motion`, names viewer's own life + how AI affects it, keeps "rotate within the family"/"ritual repetition", 3 sample lines each 6-11 words); `write-social-copy-skill.docs-test.ts`'s new describe block (3/3 tests: names News Short Script Recipe specifically, "viewer's OWN life", "paraphrased fresh every time", distinct from Sign-off, every other Recipe unchanged); `produce-news-short-script-skill.docs-test.ts`'s new describe block (5/5 tests) |
| 2 | A script containing an explicit calendar date anywhere in its beats fails validation the same reject-only way as the banned-word scan | **PASS** | `calendar-date-scan.test.ts` (12/12 tests: month+day, month+day+ordinal+year, abbreviated month, day-of-month, ISO, slash-date all caught; lowercase "may"/"march" never flagged; multi-field scan; empty list passes; never rewrites); `news-short-script-author-checklist.test.ts`'s "fails the 'no-calendar-dates' item..." test (isolates the mutation, confirms other items stay `ok: true`) |
| 3 | A Shot List with two beats pointing at the same source page, or the same site/company, fails validation the same way | **PASS** | `news-short-script-author-checklist.test.ts`'s `checkShotListVariety` describe block (5/5 tests: distinct sites pass, `www.` stripped, case-insensitive, malformed/missing `source_url` never throws, empty list passes) + the two `auditNewsShortScriptAuthorPhase` tests for "same site, different page" and "EXACT same source page" |
| 4 | Every produced Shot List beat carries a non-empty list of 3-5 Curiosity Queries | **PASS** | `news-short-script-validate.test.ts`'s new describe block (5/5 tests: missing entirely, too few, too many, blank entry all rejected with `curiosity_queries_invalid`; valid fixture with 3 passes); `news-short-script-author-checklist.test.ts`'s curiosity-queries item tests; `news-short-script-output.test.ts`'s `shotListText` "renders each beat's role, show cue, source, Curiosity Queries, and media outcome" test — confirmed the rendered `queries: ...` line is present and the marker/queries never leak into `scriptText`'s spoken output |
| 5 | The produced script file shows a `[Next shot]` marker between beats; the underlying spoken-text field is untouched | **PASS** | `news-short-script-output.test.ts`'s `scriptText` describe block: joins with exactly N-1 markers, no cues/URLs/queries leak in; a direct test inspects each beat's own `text` field and confirms `"[Next shot]"` never appears in it (proves the marker is render-time-only, never written into the beat data); blank-beat-in-the-middle case never leaves a stray/doubled marker |
| 6 | Full test suite green; docs stay accurate to shipped behavior | **PASS** | See Suite result above — 2185/2186 (1 pre-existing unrelated failure), 232/232 docs tests, `openspec validate --strict` clean |

### Per-scenario results (OpenSpec spec deltas)

**`specs/production-spec/spec.md`**

| Scenario | Result | Covering test |
|---|---|---|
| A well-formed Spec validates ok (with 3-5 Curiosity Queries per beat) | PASS | `news-short-script-validate.test.ts` "accepts the valid fixture" |
| First-not-hook / last-not-cta rejected | PASS | `news-short-script-validate.test.ts` (pre-existing, unchanged, still green) |
| No story beat between hook/cta rejected | PASS | same file, pre-existing |
| Bad `source_url`/`media_url` rejected | PASS | same file, pre-existing |
| `media_url` optional | PASS | same file, pre-existing |
| Word count out of range rejected | PASS | same file, pre-existing |
| Beat with <3 or >5 Curiosity Queries rejected | PASS | `curiosityQueriesTooFew`/`curiosityQueriesTooMany` tests |
| Blank entry or missing `curiosity_queries` rejected | PASS | `curiosityQueriesBlankEntry`/`missingCuriosityQueries` tests |
| `scanTextFieldsForDates` catches month+day (+ordinal/year) | PASS | `calendar-date-scan.test.ts` (3 tests) |
| Catches day-of-month, ISO, slash-date | PASS | `calendar-date-scan.test.ts` (3 tests) |
| Lowercase month-shaped verb never flagged | PASS | `calendar-date-scan.test.ts` "does NOT flag..." |
| Empty fields list passes; never rewrites | PASS | `calendar-date-scan.test.ts` (2 tests) |
| `auditNewsShortScriptAuthorPhase` — baseline-adherent Spec passes every item | PASS | `news-short-script-author-checklist.test.ts` first test |
| Beat missing/short on Curiosity Queries fails ONLY that item | PASS | same file |
| Calendar date in beat text fails ONLY `no-calendar-dates` | PASS | same file |
| Two beats sharing a site fail ONLY `shot-list-variety` | PASS | same file (both "same site" and "exact same page" cases) |
| Banned word fails ONLY `banned-words` | PASS | same file |
| Never throws on malformed input | PASS | same file |
| Baseline Prompt doc never states old Follow-Straw-Motion family | PASS | `news-short-script-straw-motion-baseline.test.ts` |
| Doc's Sign-off guidance names viewer's own life + keeps rotate-family instruction | PASS | same file |
| Worked Sign-off sample lines fall inside 6-11 words | PASS | same file |

**`specs/news-short-script-recipe/spec.md`**

| Scenario | Result | Covering test |
|---|---|---|
| `scriptText` joins with `[Next shot]` marker, N-1 occurrences, no cues/URLs/queries | PASS | `news-short-script-output.test.ts` |
| Marker never appears inside a beat's own `text` field | PASS | same file |
| `scriptText` skips blank beat, never a stray/doubled marker | PASS | same file |
| `shotListText` renders role, show cue, source, Curiosity Queries, media outcome | PASS | same file |
| `shotListText` never crashes on omitted/incomplete `results` | PASS | same file (pre-existing behavior, still green) |

**`specs/producer-skill/spec.md`**

| Scenario | Result | Covering test |
|---|---|---|
| Skill file exists, declares slug, references contract/validator/scanner | PASS | `produce-news-short-script-skill.docs-test.ts` (pre-existing, still green) |
| Skill STOPs on missing Baseline Prompt / unreadable brief | PASS | same file, pre-existing |
| Skill never calls a Magnific tool, never publishes | PASS | same file, pre-existing |
| Skill points at graduated checklist; documents Curiosity Queries, calendar-date ban, Shot List variety | PASS | new describe block, 4/4 tests |
| Skill documents cta-beat-as-Sign-off, picked verbatim from fixed family | PASS | new test, plus `doesNotMatch(/follow us/i)` |
| `write-social-copy` Skill names `titleMaxChars`/`Copy.title`/`newsShortScriptDraftCopy` | PASS | pre-existing, still green |
| Skill states title check is opt-in, no-op for other Recipes | PASS | pre-existing, still green |
| Skill scopes viewer's-own-life CTA to News Short Script only, distinct from Sign-off | PASS | new describe block, 3/3 tests |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | Grepped every touched/new file for `ledger`, `post_url`, `publish`, `Insights`/`insights` — zero matches. No production/publish-flow code touched; this slice only touches script authoring, validation, and rendering of an already-generated Asset's bundle. |
| Public-metrics-only | PASS | No metrics/Apify code touched (not in the diff file list at all). |
| Relative-not-absolute | PASS | No scoring/baseline-comparison code touched. |
| Explicit-attribution | PASS | `/log-post` and attribution code untouched (not in diff). |
| Ledger-as-source-of-truth | PASS | No file under `src/asset/*ledger*`, `src/queue/*`, or any ledger-writing module appears in the diff; grep for the literal word "ledger" across every touched/new file returned zero hits. |
| No live-Space calls (Magnific fake / hermetic) | PASS | This Recipe is Space-less (ADR-0021). Ran `grep -n "spaces_\|creations_"` across every file in `git status --porcelain` (new + modified, excluding the `openspec/` prose) — zero matches. No `SpaceMcpPort`/`FakeSpace` import anywhere in the diff. Every new/touched test is plain-file + pure-function testing (JSON fixtures, one real markdown document read read-only, deterministic modules) — nothing reaches a live or fake Magnific Space, credits, or board. |

### OpenSpec-vs-issue faithfulness (job c)

Read `proposal.md` and all three spec deltas against the issue body and `CONTEXT.md`'s Sign-off /
Curiosity Queries / Shot List entries:

- The proposal's "Why"/"What Changes" map 1:1 onto the issue's 5 bullets and 6 acceptance criteria — no
  criterion is dropped, no criterion is silently narrowed or widened.
- The spec deltas' Scenarios trace back to specific issue language: "same style as the existing
  banned-word scan" → the `no-calendar-dates` item is explicitly reject-only, mirroring
  `scanNewsShortScriptForBannedWords`; "same style as the News Carousel's placement-variety check (issue
  #106)" → `shot-list-variety` explicitly mirrors that item and the module doc/tests cross-reference it
  directly.
- CONTEXT.md fidelity confirmed: Sign-off entry ("rotates within a small fixed family... a daily show
  earns recognition through ritual repetition... invites a comment/question about the viewer's own life
  and how AI is affecting them") matches the rewritten `cta` beat guidance and the `write-social-copy`
  Skill's explicit "unlike Copy's own CTA, which must be fresh every time, a Sign-off deliberately
  rotates" distinction (the code makes the exact same distinction the developer's SKILL.md diff shows).
  Shot List entry ("No two beats in one script repeat the same source page or the same site/company")
  matches `checkShotListVariety`'s site-level check exactly, and its known-limit note (site-level, not a
  company-across-domains resolver) is a reasonable, explicitly-flagged scope call consistent with the
  Carousel Recipe's own precedent at the same rigor level. Curiosity Queries entry ("meant to help the
  Operator find better real source material... not content that appears in the video itself") matches the
  `curiosity_queries` field's placement in the Spec (never spoken by `scriptText`, only surfaced on the
  separate `shotListText` manifest).
- No misread found: nothing in the spec deltas asks for anything the issue didn't, and nothing the issue
  asked for is missing from the deltas.
- `openspec validate --strict` on the change: green (see Suite result above).

### Scope check (job 6 of the QA brief)

- `git diff main --stat` confirms the diff touches only News Short Script Recipe files (contract,
  validate, output, author-checklist, its fixtures, its two Skills' docs/docs-tests, the Straw Motion
  News Short Script baseline-prompt doc, `registry.ts`'s `NEWS_SHORT_SCRIPT_PHASES` only) plus this
  change's own `openspec/` directory.
- `write-social-copy/SKILL.md`'s diff is a single new clause explicitly scoped to "For the News Short
  Script Recipe specifically" and explicitly states "every other Recipe's caption keeps that general
  direction unchanged" — confirmed no other Recipe's copy-drafting code (`news-carousel-draft.ts`,
  `character-explainer-draft.ts` or equivalents) was touched (not present in the diff file list).
- `src/recipe/registry.ts`'s diff is scoped entirely to the `NEWS_SHORT_SCRIPT_PHASES` constant's
  `author` phase — no other Recipe's phase contract in that file was touched.
- `docs/adr/0025-recipe-declares-its-copy-platforms.md` and
  `docs/adr/0026-linkedin-mention-aid-moves-out-of-caption.md` — confirmed untouched (`git diff main
  --stat -- docs/adr/` returns empty for this branch).
- No News Carousel production code was modified: `git status --porcelain` shows zero files under any
  `*carousel*` path; `news-short-script-author-checklist.ts` only *references* `news-carousel-author-
  checklist.ts` in a code comment (by name, as a pattern precedent) — it does not import from or edit
  that module.

### Defect list

- **[low] Documentation-only inconsistency, not test-covered.** The Baseline Prompt doc's "How a script
  pairs with its Shot List (illustration, Sample 2)" table
  (`data/brands/straw-motion/baseline-prompts/unhypped-daily/news-short-script.md`, the pre-existing
  `hook`/`beat 1`/`beat 2` rows, untouched by this diff) still shows `hook` and `beat 2` pointing at the
  *exact same URL* (`bfl.ai/blog/flux-3-mimic`), and `beat 1`/`beat 2` sharing the same site (`bfl.ai`) —
  directly violating the new "no two beats may point at the same site" rule that this same slice's new
  closing sentence, added immediately below that table, explicitly states. Repro: open
  `data/brands/straw-motion/baseline-prompts/unhypped-daily/news-short-script.md` and read the table at
  (around) line 284-290 next to the paragraph the developer added just below it. This is not exercised by
  any test (the `news-short-script-straw-motion-baseline.test.ts` suite doesn't inspect this illustration
  table), does not affect any code path, and the table predates this issue — but since this slice chose to
  edit the very paragraph directly beneath it to assert the new rule, the result reads as self-contradictory
  to anyone reading the document. Recommend a follow-up cleanup (not blocking this slice): update the
  illustration table's `hook`/`beat 1`/`beat 2` rows to distinct sites, consistent with the rest of the
  doc's rewritten `cta` row and the shared code fixture.

No other defects found. This single item is documentation polish only, does not affect any acceptance
criterion, spec scenario, always-rule, or the hermetic test suite, and does not block PASS.

### Overall

**PASS.** All 6 acceptance criteria are met and proven by real, passing tests (not merely claimed).
Every spec-delta Scenario traces to a covering test. The OpenSpec change faithfully represents issue #187
and CONTEXT.md's Sign-off/Curiosity-Queries/Shot-List entries — no misread, no dropped criterion, no
scope creep into News Carousel or Character Explainer with Cast. The suite is genuinely green (2185/2186,
the 1 failure pre-existing and unrelated; 232/232 docs tests; `openspec validate --strict` clean). No
live-Space calls anywhere in the diff — this Recipe is Space-less and every test is hermetic. All five
always-rules hold. The slice may proceed to a PR.
