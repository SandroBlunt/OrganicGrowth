# Slice Handoff — issue #247: the Recipe Skills and commands cite typed commands, not module paths

## Build Report (Round 1)

### What changed

Rewrote the prose sweep across everything issue #211's second half covers: the five in-scope Recipe/
curated-source Skills under `.claude/skills/` (`produce-character-explainer`, `produce-news-carousel`,
`produce-news-short-script`, `write-social-copy`, `fetch-curated-source`), all 12 command docs under
`.claude/commands/` except `build-issue.md` (which carried no citation), both always-rules files, and
`CLAUDE.md` — so every remaining `data/brands/<slug>/...` citation names a typed accessor instead of a
bare filesystem path, per the Operator's Option A decision on issue #211:

- **Where a `src/command-surface/` command exists for the described operation** (Trends, Ideas, Jobs,
  Assets, Posts, Performance, gates, Copy), the doc now names it as the sanctioned future target, while
  stating plainly (citing rule 7) that today's operative write is still the file (ledger/queue) — never
  silently claiming the SQL write happens today. This mirrors the exact pattern #246 already established
  and QA already passed for `idea-strategist.md`'s `createIdea` note.
  - `run-trends.md`: `createTrend` (Trends) + `createIdea` (Ideas).
  - `review-ideas.md`: `recordReviewDecision` (Ideas), both the accept and reject writes.
  - `pick.md` / `pick-cast.md`: `resolveGate` (gates), alongside the existing, deliberate distinction
    that these commands only ever write the file-based Production Queue, never the SQL `job` table.
  - `log-post.md`: `logPost` (Posts).
  - `track-performance.md`: `recordPerformanceSnapshot`/`recordPerformanceScore` (Performance).
  - `export-schedule.md`: `saveAsset` (Assets), for its `scheduled_at` stamp.
  - `queue.md`: `enqueueJob`/`claimJob`/`releaseJob` (Jobs), stated as the SQL job table's own separate
    operations from the file queue this command reads.
- **Where no command exists**, the doc now cites the typed function and its module instead
  (`resolveBrand`, `FormatStore`'s `loadFormat`, `runIdeasDirFor`, `src/ledger/ledger.ts`,
  `resolveBriefPathCandidates`, `specPathFor`, `castCandidatesDirFor`, `listBrands`,
  `src/media-backup/produced-media-tree.ts`) — `backup-media.md`, `cleanup-schedule-media.md`,
  `report.md`, `run-pipeline.md`, and every Skill's Brand-hard-rules/Idea-brief/Spec-save citation.

**The six `.claude/agents/*.md` files are unchanged.** The build brief called for one specific check: a
citation in those six files naming a store module where a real command-surface command already covers
that exact operation (the one regression #246 itself introduced, per #211's own comment). Every citation
in all six files was checked against the eight command-surface categories — `idea-strategist.md` already
names `createIdea`; `qa.md` already states the exact Option A pattern verbatim
("`src/command-surface/` where the operation is one of its own, `src/ledger/ledger.ts`/`AssetStore`/
`src/production-queue/queue.ts` otherwise"); every other citation (`AssetStore.writeAsset`,
`src/production-queue/queue.ts`, `src/production-spec/store.ts`, `src/mention-handle/store.ts`,
`src/brand-asset/store.ts`) names a genuinely separate file-backed store with no SQL command-surface
equivalent wired to the same data. No regression found; no agent file edited (`git diff --stat --
.claude/agents/` is empty).

**Every craft rule moves through untouched.** `write-social-copy/SKILL.md` — the anti-rhetoric caption
rules' real home, confirmed untouched by #246's own QA — received exactly one changed line pair (the
`brand-profile.yaml` plumbing citation). The three `produce-*` Skills' edits are confined to their
`## Inputs` sections and one save-path sentence each; every writing rule, checklist, and craft
instruction (placeholder-frame phrasing, real-source-imagery rule, card-placement variety rule, dash
bans) is byte-for-byte unchanged.

**Two pre-existing pinned regexes were re-pinned, not weakened**, after they broke against the legitimate
prose change (`format-docs.test.ts`'s literal `formats/<format>.yaml` check — fixed by adding a light
illustrative mention alongside `loadFormat`, mirroring the six agents' own convention; and its Brief-
fallback-path check, which required the now-removed `data/brands/<slug>/` prefix — re-pinned to the same
substantive claim, `ideas/<Idea.format>/<run>/idea-NN.md`, at the same specificity). No assertion was
deleted.

### Files touched

- `.claude/skills/produce-character-explainer/SKILL.md`
- `.claude/skills/produce-news-carousel/SKILL.md`
- `.claude/skills/produce-news-short-script/SKILL.md`
- `.claude/skills/write-social-copy/SKILL.md`
- `.claude/skills/fetch-curated-source/SKILL.md`
- `.claude/commands/backup-media.md`
- `.claude/commands/cleanup-schedule-media.md`
- `.claude/commands/export-schedule.md`
- `.claude/commands/log-post.md`
- `.claude/commands/pick.md`
- `.claude/commands/pick-cast.md`
- `.claude/commands/queue.md`
- `.claude/commands/report.md`
- `.claude/commands/review-ideas.md`
- `.claude/commands/run-pipeline.md`
- `.claude/commands/run-trends.md`
- `.claude/commands/track-performance.md`
- `.claude/rules/always/organicgrowth-rules.md`
- `.claude/rules/always/data-handling.md`
- `CLAUDE.md`
- `src/format/format-docs.test.ts` (two re-pinned assertions, same count)
- `openspec/changes/issue-247-skills-typed-commands/proposal.md` (new)
- `openspec/changes/issue-247-skills-typed-commands/tasks.md` (new)
- `openspec/changes/issue-247-skills-typed-commands/specs/skill-command-surface/spec.md` (new)
- `openspec/changes/issue-247-skills-typed-commands/handoff.md` (this file)

No other production code under `src/` was touched (this is a documentation-prose change only).

### How to run

- `openspec validate issue-247-skills-typed-commands --strict` — green.
- `openspec validate --all --strict` — green, 64 passed, 0 failed.
- `npm run test:docs` — green, 327/84, 0 failed (same totals as `main` at `4d023e9`).
- `npm test` — green, 3401/893, 0 failed (same totals as `main` at `4d023e9`).

### Acceptance-criteria self-assessment (issue #247)

| # | Acceptance criterion | How it is satisfied / proof |
|---|---|---|
| 1 | Every remaining `data/brands/<slug>/` citation names a command instead | Re-measured: 22 files -> 3 (`git grep -l 'data/brands/' -- '.claude' 'CLAUDE.md'`). The 3 remaining: `.claude/agents/developer.md` and `.claude/agents/producer.md` (out of this ticket's scope — #246's territory, checked and found clean, see "one correction" above) and `CLAUDE.md`'s one deliberately-kept `## State` section lead-in (a reference-table scaffold, not an instruction to read/write a path — reasoned explicitly in `proposal.md`). Every citation in every file this ticket's scope actually covers (the 5 Skills, the 12 commands, both rules files) now names a typed accessor or a command. |
| 2 | Every remaining prose mention of a TypeScript module path names a command instead | Applied Option A precisely: where a `src/command-surface/` command exists for the operation, it is named (7 commands' docs now do this — see "What changed"); where none exists, the existing/added typed-function citation stands, per the Operator's own explicit ruling that this is the accepted, deliberate cost. Module-path *mentions* rose (96 -> 103 distinct, 227 -> 277 total) because naming a command is itself a `src/*.ts` citation — the same expected trade-off #246 made and the Operator's decision already anticipated. |
| 3 | Doc-conformance checks stay in lockstep: no accumulated rule quietly dropped, count does not fall without an explicit note | `npm run test:docs` 327/84 before and after (0 dropped). `npm test` 3401/893 before and after (0 dropped). Two assertions were *re-pinned* (not dropped) — see "What changed" and Round 1's task 6.1/6.2 in `tasks.md` — both proving the exact same substantive claim they always did, at the same specificity. No rule anywhere in the five Recipe/curated-source Skills was tidied, compressed, or paraphrased — confirmed by diff (`write-social-copy/SKILL.md`: exactly one line pair changed; the three `produce-*` Skills: every changed line lives in `## Inputs` or one save-path sentence). |

### Fakes / fixtures used

None — this is a pure documentation-prose change. No test fixtures, no Magnific fake, and **no live
Magnific/Apify/Zoho call of any kind** — the entire slice is `.md` prose edits plus one test-assertion
re-pin, verified via `npm test`/`npm run test:docs`/`openspec validate`, none of which reach any live
service.

### Self-review notes

- Audited the six agent files against the eight command-surface categories before touching anything, to
  confirm (rather than assume) whether the "one correction from #246" applied — it did not; recorded
  that finding explicitly in `proposal.md` rather than silently skipping the check.
- Verified the constraint the Operator's decision rests on (that `src/command-surface/`'s Jobs/gates
  categories genuinely operate on a *different* store than the file-based Production Queue `pick`/
  `pick-cast`/`queue.md` describe) by reading `src/command-surface/jobs.ts`, `src/command-surface/
  gates.ts`, and `src/production-queue/queue.ts` directly, rather than assuming the easier "just add a
  command name" path was accurate — this is what shaped the "stated as a genuinely separate store"
  phrasing added to `queue.md`/`pick.md`/`pick-cast.md`, instead of implying the pick is already visible
  to the SQL-backed worker.
- Deliberately did NOT strip `CLAUDE.md`'s `## State` section's own `data/brands/<slug>/` lead-in, and
  did NOT touch `organicgrowth-rules.md` rule 7's pinned "no production caller is wired onto it yet
  either" clause (`src/db/adr.docs-test.ts`) — both reasoned explicitly in `proposal.md` rather than
  silently left alone or silently rewritten.
- Simplify pass: removed a raw-path echo that sat redundantly beside an already-correct typed-accessor
  citation in three places (the three `produce-*` Skills' Spec-save paths already named `specPathFor`;
  the trailing literal path was pure duplication, not new information).

### Known limits

- The eleven model-prompting Skill files (`chatgpt-image-2`, `grok-imagine`, `grok-imagine-1-5`,
  `happy-horse`, `kling-3-0`, `kling-3-0-omni`, `nano-banana-2`, `seedance-2-0`, `seedream-4-5`,
  `seedream-5-0-pro`, `veo-3-1`) carried no citation to convert and are untouched — confirmed, not
  merely assumed (`git diff --stat -- .claude/skills/` lists only the 5 in-scope files).
- Per the Operator's own recorded decision, the "no command exists" citations (module + typed function)
  will drift if that module is ever moved or renamed — an accepted, deliberate cost, not a defect of
  this slice.
- `#211`'s own closing comment states its AC "cannot fully close until the file-backed stores have a
  surface of their own" (issue #238, deferred). This slice does not change that — it completes the
  achievable half (every doc in its scope names a typed interface, and a real command wherever one
  exists), matching the Operator's own framing of what #211 closes on.

## QA Verdict — Round 1: PASS

### Suite result

- `npx openspec validate issue-247-skills-typed-commands --strict` → `Change 'issue-247-skills-typed-commands' is valid`.
- `npx openspec validate --all --strict` → **64 passed, 0 failed** (main's 63 + this change = 64, as claimed).
- `npm run test:docs` → **327 tests / 84 suites, 0 failing** — identical to `main` at `4d023e9`.
- `npm test` → **3401 tests / 893 suites, 0 failing** — identical to `main` at `4d023e9`.

All four commands were actually run in `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-247-skills-typed-commands` (branch `issue-247-skills-typed-commands`, HEAD `f59bcab`); none touched the live Magnific/Apify/Zoho services (this slice is `.md` prose + one test re-pin, no runtime code under `src/` beyond the test file).

### The central question — is Option A applied, or used as cover?

Re-measured myself:
- `git grep -l 'data/brands/' -- '.claude' 'CLAUDE.md' | wc -l` → **3** (`.claude/agents/developer.md`, `.claude/agents/producer.md`, `CLAUDE.md`).
- `git grep -ohE 'src/[A-Za-z0-9._/-]+\.ts' -- '.claude' 'CLAUDE.md' | sort -u | wc -l` → **103** distinct.
- `git grep -ohE 'src/[A-Za-z0-9._/-]+\.ts' -- '.claude' 'CLAUDE.md' | wc -l` → **277** total.

All match the Build Report exactly.

I extracted every newly-added `src/*.ts` citation (`git diff main -- .claude CLAUDE.md | grep '^+' | grep -ohE 'src/[A-Za-z0-9._/-]+\.ts' | sort -u`) and checked each against `src/command-surface/`'s eight exported categories (read every file: `trends.ts`, `ideas.ts`, `jobs.ts`, `assets.ts`, `posts.ts`, `performance.ts`, `gates.ts`, `copy.ts`):

- **`createTrend`/`createIdea`/`recordReviewDecision`/`resolveGate`/`logPost`/`recordPerformanceSnapshot`/`recordPerformanceScore`/`saveAsset`/`enqueueJob`/`claimJob`/`releaseJob`** — all confirmed to exist exactly as named, in the modules cited, with the signatures the docs imply. Every one of these command-surface writes is named honestly, paired with an explicit "today's operative write is the file" clause (verified in `run-trends.md`, `review-ideas.md`, `pick.md`/`pick-cast.md`, `log-post.md`, `track-performance.md`, `export-schedule.md`, `queue.md`) — never presented as already live.
- **`resolveBrand`, `FormatStore`'s `loadFormat`, `runIdeasDirFor`, `resolveBriefPathCandidates`, `specPathFor`, `castCandidatesDirFor`, `listBrands`, `src/ledger/ledger.ts`, `src/media-backup/produced-media-tree.ts`, `src/production-spec/brand-profile.ts`'s `loadBannedWords`/`loadCopyRules`, `src/apify/platform.ts`, `src/schedule-batch/select.ts`** — all confirmed to exist with the exported names cited (spot-checked every one against its module's actual exports). None of these operations (Brand/Format/Brief/Spec-path resolution, ledger reads, media-tree walks, Apify actor slug lookup) is one of the eight command-surface categories — the "no command exists" branch is correctly applied in every case I checked.
- **`AssetStore.writeAsset`** appears three times (`log-post.md`, `track-performance.md`, `export-schedule.md`) *alongside* an honest naming of the actual matching command-surface write (`logPost`/`recordPerformanceSnapshot`+`recordPerformanceScore`/`saveAsset` respectively) — this is not a missed citation, it is the file being named as today's real write and the command being named as the future one, exactly per Option A's stated shape. I confirmed `recordPerformanceSnapshot`/`recordPerformanceScore` write to a *separate* `metric_snapshot`/`performance_score` table keyed on `postId`, genuinely distinct from the Asset's own `metrics`/`performance_score`/`status` fields `AssetStore.writeAsset` sets — so the "genuinely separate store" framing in `track-performance.md` holds up, not just asserted.

**No citation names a store module where a real command-surface command was preferred over an available one, on any write path.** Option A is applied, not used as cover, on every write-shaped citation in this diff.

One soft observation, not a violation: `log-post.md` describes a read ("Loads the Idea's recorded Assets… and finds the Asset whose `recipe` matches `<recipe>` EXACTLY") that is structurally identical to `src/command-surface/assets.ts`'s `getAssetByRecipe` (an Assets-category read), yet cites `src/ledger/ledger.ts` instead of naming `getAssetByRecipe`. I don't treat this as a defect: the developer's applied rule — command-surface named for *writes* with a real command-surface equivalent, `src/ledger/ledger.ts` named uniformly for *every* multi/bulk read across all 12 command docs — is consistently applied everywhere I checked (never selectively skipped to shrink the visible count), and matches the proposal's own stated rationale ("today's operative *write* is the file"). `getAssetByRecipe`'s own doc comment states it was added narrowly for the one-shot importer, not as a general lookup API. Worth a note for a future slice, not a fail here.

### Per-criterion results (issue #247)

| # | Acceptance criterion | Result | Evidence |
|---|---|---|---|
| 1 | Every remaining `data/brands/<slug>/` citation names a command instead | PASS | `git grep -l 'data/brands/' -- '.claude' 'CLAUDE.md'` → 3 files, all out-of-scope-or-deliberate (verified each, see above and "Always-rules" below) |
| 2 | Every remaining prose mention of a TS module path names a command instead (where one exists) | PASS | Every write-shaped citation checked against `src/command-surface/`'s 8 categories; all 11 named commands (`createTrend` … `releaseJob`) verified to exist as cited; no wrong-store-over-available-command case found |
| 3 | Doc-conformance checks stay in lockstep | PASS | `npm run test:docs` 327/84/0-fail and `npm test` 3401/893/0-fail, both identical to `main` at `4d023e9` |

### Per-scenario results (`specs/skill-command-surface/spec.md`)

| Scenario | Result | Covering evidence |
|---|---|---|
| Brand hard-rules input names `loadBannedWords`/`loadCopyRules` | PASS | Verified by diff in all 4 files (`produce-character-explainer`, `produce-news-carousel`, `produce-news-short-script`, `write-social-copy`); `loadBannedWords`/`loadCopyRules` confirmed exported at `src/production-spec/brand-profile.ts:123,132` |
| Idea-brief input names `resolveBriefPathCandidates` | PASS | Verified by diff in all 3 `produce-*` Skills; confirmed exported at `src/format/brief-path.ts:80` |
| `run-trends.md` names `createTrend`/`createIdea` | PASS | Diff shows both named, each with the "today's operative write is the file" clause; both confirmed exported in `src/command-surface/{trends,ideas}.ts` |
| `review-ideas.md` names `recordReviewDecision` for both accept and reject | PASS | Diff shows step 5.6 and step 6 both cite it |
| `log-post`/`pick`/`pick-cast`/`track-performance`/`export-schedule`/`queue` each name their command-surface category | PASS | Diffed each file; `logPost`, `resolveGate` (×2, with the file-queue-vs-SQL-job-table distinction stated), `recordPerformanceSnapshot`/`recordPerformanceScore`, `saveAsset`, `enqueueJob`/`claimJob`/`releaseJob` all present and all confirmed to exist |
| `backup-media`/`cleanup-schedule-media`/`report`/`run-pipeline` cite existing typed accessors, no wrong command-surface name | PASS | Diffed all 4; `listBrands`, `produced-media-tree.ts`, `resolveBrand`, `src/ledger/ledger.ts` all confirmed to exist; none names a command-surface function |
| `write-social-copy`'s anti-rhetoric rules untouched, one changed line pair only | PASS | `git diff main --stat -- .claude/skills/write-social-copy/SKILL.md` → `1 file changed, 1 insertion(+), 1 deletion(-)`; fresh-CTA, banned-closer, grounded-companies, dash-ban, LinkedIn `@mention` rules all present and outside the diff |
| `produce-news-carousel`'s placeholder-frame + real-source-imagery rules untouched | PASS | `git diff -U0` shows only the 3 Inputs/save-path lines changed; REAL MEDIA CLAUSE, `card_style`/`kind`/`source_url`, `placement-variety`, dash-ban text all confirmed present, outside the diff |
| The 11 model-prompting Skills carry no citation, untouched | PASS | `git diff main --stat -- .claude/skills/` lists exactly the 5 in-scope files, none of the 11 |
| `npm run test:docs`/`npm test` hold pre-change totals | PASS | Both run live, exact match to `main` at `4d023e9` |
| The two re-pinned regexes assert the same substantive claim | PASS | `format-docs.test.ts`'s Brief-fallback regex diffed: only the `brands/<slug>/` prefix dropped, `ideas/<Idea.format>/<run>/idea-NN.md` + "legacy Brand-level path" check intact; the `formats/<format>\.yaml` regex was NOT touched — the doc text was adjusted instead to keep a literal, accessor-adjacent mention (`run-trends.md` line 25), which the spec's own text explicitly permits |
| Six agent files audited, found already correct | PASS | `git diff main --stat -- .claude/agents/` empty; manually re-audited every `src/*.ts`/store citation in all 6 files against the 8 categories myself — no case found where a real command-surface command was available but a store module was cited instead |

### Always-rules + craft-rule checks

- **Generate-never-publish, public-metrics-only, relative-not-absolute, explicit-attribution, ledger-as-source-of-truth** — PASS. This is a documentation-only change; no runtime code path changed. `.claude/rules/always/organicgrowth-rules.md` and `data-handling.md` diffed line-by-line: every rule's substantive text (the numbered policy statements) is untouched — only bare-path citations were rewritten to name `resolveBrand`/`src/ledger/ledger.ts`/`src/brand/resolver.ts`. Verified `resolveApifyActor` (`src/apify/platform.ts:66`) and `resolveBrand(...).yourData` (`src/brand/resolver.ts:71,180`) both exist as newly cited.
- **Craft rules preserved byte-for-byte** — PASS. Verified directly by diff, not by trusting the Build Report: `write-social-copy/SKILL.md` — exactly 1 line pair changed (the `brand-profile.yaml` plumbing sentence); `produce-character-explainer`/`produce-news-carousel`/`produce-news-short-script` — every changed line lives in the numbered Inputs items (Brand hard rules, Idea brief) or the Spec-save sentence; the per-Recipe writing rules, checklists, dash bans, placeholder-frame phrasing, and real-source-imagery rule are outside every diff hunk in all four files. No rule was reworded, compressed, or "improved" anywhere in this diff.
- **Magnific fake / no live calls** — PASS. `grep -rn "spaces_\|creations_" .claude/skills/produce-*/SKILL.md .claude/commands/*.md` returns only pre-existing prose describing the boundary ("does not call any `spaces_*`/`creations_*` tool" — the Skills explicitly DON'T call the Space) and `build-issue.md`'s existing hermetic-build guardrail line; no new live-call reference was introduced. This slice contains no test code and no fixtures — it is `.md` prose plus one re-pinned regex in `format-docs.test.ts`, which itself only reads static doc text via `readDoc`, never touching Magnific/Apify/Zoho.
- **Three remaining `data/brands/` citations genuinely justified** — PASS. `.claude/agents/developer.md` (2 mentions) and `.claude/agents/producer.md` (2 mentions) are out of #247's scope (agent files belong to #246, already merged/QA-passed) and both instances I checked sit as illustrative examples right beside an already-named accessor (`castCandidatesDirFor(...)`'s folder: `data/brands/...`; `outputDirFor(...)` — `data/brands/...`), matching the spec's own "MAY appear as an illustrative example" allowance. `CLAUDE.md`'s one remaining mention is the `## State` section's own scaffold line ("Per Brand under `data/brands/<slug>/`: ...") introducing a reference table whose own list items already name their typed accessors (`loadBaselinePrompt`, `BrandAssetStore`, `runIdeasDirFor`) — reasoned explicitly in `proposal.md`, and legitimate: rewriting it would strip the sentence the whole table depends on for no accuracy gain.

### Defect list

1. **[medium] Zero new docs-tests pin any of the ~15 substantive new command-surface citations this slice introduces**, despite the sibling slice #246 setting a precedent of adding new pinning tests for its own new invariants (`src/claude-agents/tool-boundary.docs-test.ts` gained assertions, moving `npm test` from 3395→3401). Concretely: nothing in the automated suite would catch a future accidental revert of, e.g., `run-trends.md`'s `createTrend`/`createIdea` citation, `pick.md`'s `resolveGate` citation, or `queue.md`'s `enqueueJob`/`claimJob`/`releaseJob` citation — only the (non-automated) OpenSpec Scenario text describes them, and `openspec validate` checks spec *format*, not that the `.md` files actually say what the Scenario claims. This does not violate AC3's literal text (the check *count* did not fall, which is all AC3 requires), and I verified every one of these new claims by hand this round — but it is a genuine gap in future regression protection for a 25-file sweep. **Repro:** hand-revert `run-trends.md`'s `createTrend`/`createIdea` sentence to the pre-#247 text and re-run `npm test`/`npm run test:docs` — both still pass, 0 failures, because nothing pins that sentence.
2. **[low] `log-post.md`'s Asset-lookup read cites `src/ledger/ledger.ts` rather than `src/command-surface/assets.ts`'s `getAssetByRecipe`**, which structurally matches the described operation (look up one Idea's Asset for a named Recipe) and is a real, existing Assets-category command-surface export. Judged not a violation this round (see "central question" analysis above — the read/write distinction is applied consistently across the whole sweep, and `getAssetByRecipe`'s own doc comment scopes it to importer use), but flagging it in case a future slice wants command-surface reads named too, for symmetry with the writes.

Neither defect blocks this round: both are advisory findings about future regression coverage and stylistic symmetry, not violations of issue #247's stated acceptance criteria, the Operator's Option A decision, the always-rules, or any craft rule. Every criterion, every spec Scenario, and every always-rule check above is a genuine PASS backed by a command I ran or a diff I read myself this round — not a restatement of the Build Report's own claims.

### Ruling on #211

#211's own closing comment (per the Build Report) already scopes its achievable half to "every doc in its scope names a typed interface, and a real command wherever one exists" — deferring the file-backed-stores-get-their-own-surface half to issue #238. This slice (#247) plus its merged sibling (#246) together satisfy that achievable half: every `.claude/agents/*.md`, `.claude/skills/*/SKILL.md` (in scope), `.claude/commands/*.md` (except `build-issue.md`, which cites nothing), both always-rules files, and `CLAUDE.md` now name a typed accessor or command everywhere a command-surface command exists, with the three remaining `data/brands/` mentions all independently justified. **#211 can close on its achievable half**, with issue #238 tracking the deferred remainder.

## Build Report (Round 2)

The coordinator asked for one more round despite QA's Round-1 PASS, to close both advisory defects
before this closes: they name a real failure pattern this epic keeps hitting (an unenforced invariant
staying true only until someone reverts it), and the sibling slice (#246) already set the precedent of
pinning its own new invariants.

### What changed

**Defect 2 (low) — fixed, not reasoned around.** `log-post.md`'s Asset-lookup step now ALSO names
`getAssetByRecipe` (`src/command-surface/assets.ts`) as the sanctioned future read, alongside its
existing `src/ledger/ledger.ts` citation for today's operative read. QA's own analysis was right that
the read/write distinction applied in Round 1 was consistent, not selective — but on reflection
`getAssetByRecipe`'s own doc comment ("Looks up one Idea's Asset for a given Recipe") is a structural
match for exactly what this call site does, and naming it is the more complete application of the same
additive pattern (name the command-surface function, keep the honest "today's operative [write/read] is
the file" clause) already used for every write in this sweep. This is not a departure from the
read/write distinction — it is the read/write distinction extended to the one read that genuinely has a
command-surface equivalent; every OTHER read across all 12 command docs (bulk ledger loads, Format
reads, Brief-path resolution) still correctly has none.

**Defect 1 (medium) — fixed with a dedicated docs-test, following #246's own shape.** New file:
`src/claude-commands/command-surface-citations.docs-test.ts` (20 assertions / 7 suites). One `describe`
per command doc Round 1 added a command-surface citation to (`run-trends.md`, `review-ideas.md`,
`pick.md`, `pick-cast.md`, `log-post.md`, `track-performance.md`, `export-schedule.md`, `queue.md`),
each with: a positive assertion that the command name AND its module both appear, and a "revert guard"
(`assert.doesNotMatch`) against the exact raw `data/brands/<slug>/...` (or bare-path) text that citation
replaced. Every read runs through the same `collapseWhitespace` helper `src/db/adr.docs-test.ts` uses,
so a literal substring check survives this repo's own line-wrapping.

**The revert guards are proven non-vacuous, not just written to look right — this was the exact
discipline the coordinator's message called for.** Before writing a single assertion into the test
file, I wrote a throwaway Node script (`verify-guards-247.mjs`, in the scratchpad) that ran every
candidate positive/negative regex against BOTH the real pre-#247 text of each file
(`git show 4d023e9:.claude/commands/<file>.md`) and the current text — confirming every negative
pattern MATCHES the old text (so a revert is genuinely caught) and does NOT match the current text
(so the guard isn't already failing), and every positive pattern matches the current text. All 8 files,
all patterns, verified before the real test file was written. I then went one step further and proved
it live, exactly reproducing QA's own named repro: hand-reverted `run-trends.md` to its byte-for-byte
pre-#247 text, ran the new suite — 17 pass / 3 fail, the 3 failures being exactly the 3 assertions
guarding that file — then restored the file (`git status --short` confirmed byte-identical to the
committed Round-1 version) and re-ran green (20/20).

### Files touched (Round 2)

- `.claude/commands/log-post.md` (defect 2 — adds the `getAssetByRecipe` citation)
- `src/claude-commands/command-surface-citations.docs-test.ts` (new — defect 1)
- `openspec/changes/issue-247-skills-typed-commands/proposal.md` (Round 2 section + Impact update)
- `openspec/changes/issue-247-skills-typed-commands/tasks.md` (section 8, Round 2)
- `openspec/changes/issue-247-skills-typed-commands/specs/skill-command-surface/spec.md` (one new
  Requirement + 3 Scenarios covering the new docs-test, the live-revert proof, and the
  `getAssetByRecipe` fix)
- `openspec/changes/issue-247-skills-typed-commands/handoff.md` (this block)

### How to run

- `openspec validate issue-247-skills-typed-commands --strict` — green.
- `openspec validate --all --strict` — green, **64 passed, 0 failed** (unchanged from Round 1 — this
  round edits the same change's own spec delta, it does not add a new capability).
- `npm run test:docs` — green, **347 tests / 91 suites, 0 failing** (up from 327/84 by exactly the new
  suite's own 20/7).
- `npm test` — green, **3421 tests / 900 suites, 0 failing** (up from 3401/893 by the same 20/7).
- The new suite alone: `node --import tsx --test src/claude-commands/command-surface-citations.docs-test.ts`
  — 20/20 green.

### Defect self-assessment (QA Round 1)

| # | Defect | Severity | Fixed how | Proof |
|---|---|---|---|---|
| 1 | Zero docs-tests pin the ~15 new command-surface citations | medium | New `src/claude-commands/command-surface-citations.docs-test.ts`, 20 assertions / 7 suites, one per touched command doc | Live-reverted `run-trends.md` to its exact pre-#247 text and watched the new suite fail on exactly the 3 assertions guarding it, then restored and re-ran green |
| 2 | `log-post.md` names `src/ledger/ledger.ts` where `getAssetByRecipe` exists | low | Added `getAssetByRecipe` (`src/command-surface/assets.ts`) as an additional citation, additive to the existing ledger one | `command-surface-citations.docs-test.ts`'s `log-post.md` describe block asserts both `getAssetByRecipe` and `src/command-surface/assets.ts` are present |

### Fakes / fixtures used

None, same as Round 1 — this remains a pure documentation-prose change plus one new docs-test. No
Magnific fake needed; **no live Magnific/Apify/Zoho call of any kind**, this round included. The one new
test file reads static `.md` files from disk via `node:fs/promises`' `readFile` — never a network call,
never a live service.

### Self-review notes (Round 2)

- Deliberately did NOT add revert guards for the "no command exists" typed-accessor citations
  (`resolveBrand`, `loadFormat`, `resolveBriefPathCandidates`, etc.) added across the Skills, the
  always-rules files, and `CLAUDE.md` — QA's defect 1 was scoped specifically to the ~15 new
  command-surface citations (the SQL command names), and the coordinator's message frames the ask the
  same way ("Pin the new citations: that the commands named actually appear... and that a revert to a
  `data/brands/<slug>` path fails" — read in context of "the ~15 new command-surface citations"
  earlier in the same message). Widening scope to every citation in the whole sweep was not asked for
  and would have meant re-deriving revert guards for citations QA's own Round-1 review already verified
  correct without flagging as unpinned. Noting this choice explicitly rather than silently narrowing.
- Considered putting the new test under `src/claude-agents/` (reusing #246's directory) but created
  `src/claude-commands/` instead — the existing directory name is specific to `.claude/agents/`, and
  this suite pins `.claude/commands/`, a different subtree; a misleadingly-named directory would cost a
  future reader more than a new, accurately-named one costs now.

### Known limits (Round 2)

- Same as Round 1's "Known limits" — unchanged by this round's fixes.
- The new docs-test pins command NAMES and MODULE PATHS only, never the surrounding free prose — by
  design (the coordinator's own stated caution: "Do not pin free prose... a test pinned to a sentence
  rots the first time someone rewords it"). A future doc edit that keeps every command name and module
  citation intact while rewording the surrounding sentence will not trip this suite, and should not.

## QA Verdict — Round 2: PASS

### Suite result

- `npx openspec validate issue-247-skills-typed-commands --strict` → `Change 'issue-247-skills-typed-commands' is valid`.
- `npx openspec validate --all --strict` → **64 passed, 0 failed** — unchanged from Round 1 (this round edits the same change's own spec delta, adds no new capability).
- `npm run test:docs` → **347 tests / 91 suites, 0 failing**.
- `npm test` → **3421 tests / 900 suites, 0 failing**.

All four commands run live in the same worktree, branch `issue-247-skills-typed-commands`, HEAD `ffb2edf`. `git diff f59bcab ffb2edf --stat` confirms exactly the 6 files the Round-2 Build Report claims changed (`log-post.md`, the new docs-test, `handoff.md`, and the 3 OpenSpec change files) — nothing else moved.

**Deltas confirmed exact, nothing else moved.** `npm test` 3401→3421 (+20), `npm run test:docs` 327→347 (+20); suites 893→900 (+7), 84→91 (+7). Both match the new test file's own count precisely (`node --import tsx --test src/claude-commands/command-surface-citations.docs-test.ts` → 20/20, 7 `describe` blocks) — 20 `it` blocks counted directly in the file (3+4+4+3+2+2+2 = 20 across `run-trends`/`review-ideas`/`pick`+`pick-cast`/`log-post`/`track-performance`/`export-schedule`/`queue`). No other test count moved anywhere in the suite.

### Defect 1 (medium, Round 1) — FIXED, verified independently

**Static verification (all 8 files, all 11 revert-guard regexes, not just the one the developer walked through).** I wrote my own scratch script (`verify.mjs`, scratchpad-only) that ran every negative (`doesNotMatch`) regex in the new test file against BOTH the real pre-#247 text (`git show 4d023e9:.claude/commands/<file>.md`) and the current text, collapsing whitespace the same way the real test does. Result: **all 11 guards match the old text and do NOT match the current text** — every guard is genuinely non-vacuous, not just the `run-trends.md` one the developer already demonstrated live.

**Independent live reproduction — a DIFFERENT file than the developer's own repro, done in a scratch copy, zero real files touched.** Per the coordinator's specific ask, I did not touch any file under `.claude/commands/` in the real worktree (my only write grant is `handoff.md`). Instead:
1. Copied all 13 real `.claude/commands/*.md` files into a scratchpad directory (`.../scratchpad/commands-repro/`).
2. Overwrote only `export-schedule.md` in that scratch copy with its exact `git show 4d023e9:.claude/commands/export-schedule.md` text (byte-diffed to confirm — `diff` reported no difference).
3. Copied the real test file into the scratchpad and repointed its `COMMANDS_DIR` constant at the scratch directory (the only edit made, and only to the scratch copy).
4. Ran it: `node --import tsx --test <scratch-test-file>` → **18 pass / 2 fail** — the 2 failures were exactly `export-schedule.md`'s own describe block (`names saveAsset...` and `never reverts the Idea-load step...`); all other 6 describe blocks (18 assertions, covering `run-trends.md`, `review-ideas.md`, `pick.md`/`pick-cast.md`, `log-post.md`, `track-performance.md`, `queue.md`) stayed green, confirming the failure was scoped precisely to the reverted file, for the right reason (old text has no `saveAsset`/`assets.ts` citation and does contain the raw `data/brands/<slug>/ledger.json` path the guard checks for).
5. Restored the scratch file to the current text and re-ran → **20/20 green**, confirming the harness itself (not a broken scratch setup) was the cause of the 2 failures above.
6. `git status --short` in the real worktree, both before and after this reproduction, showed **no changes** — the real repo was never touched.

This reproduces the developer's own claimed discipline on a file they didn't demonstrate (`export-schedule.md` vs their `run-trends.md`), confirming it wasn't cherry-picked.

**Anchoring check — command names and path shapes, not free prose.** Read every assertion in the file. Every *positive* assertion (`assert.match`) targets a bare command name (`createTrend`, `resolveGate`, `getAssetByRecipe`, …) or a bare module path (`src/command-surface/trends.ts`, …) — none pins a sentence. The *negative* (revert-guard) assertions are anchored on the raw path shape (`data/brands/<slug>/ledger.json`) plus, in a few cases, a short proximity anchor using literal ledger-status tokens (`status: accepted`/`status: rejected` — schema vocabulary, not prose) to distinguish the accept vs. reject write sites; a guard's failure mode from prose rewording is the opposite of a positive assertion's (it would silently stop firing, not falsely break a legitimate rewording), so this does not reproduce the coordinator's named risk. No assertion in the file pins a full sentence as its match target.

### Defect 2 (low, Round 1) — FIXED

`git diff f59bcab ffb2edf -- .claude/commands/log-post.md` shows exactly one hunk: the Asset-lookup bullet now also names `getAssetByRecipe` (`src/command-surface/assets.ts`) as the sanctioned future read, alongside the existing `src/ledger/ledger.ts` citation, with the honest "today's operative read is the ledger itself (rule 7)" clause — the same additive shape used for every write-shaped citation elsewhere in this slice. I independently confirmed `getAssetByRecipe`'s own doc comment ("Looks up one Idea's Asset for a given Recipe") is a precise structural match for what this step describes ("finds the Asset whose `recipe` matches `<recipe>` EXACTLY"). No other line in `log-post.md` changed — this is a pure, additive, honest fix, not a reasoned-around dismissal.

### Craft rules — reconfirmed untouched this round

`git diff f59bcab ffb2edf --stat` touches exactly one prose file, `log-post.md` (+3/-1 lines), and `log-post.md` carries no craft rule (writing rules, dash bans, placeholder-frame phrasing, real-source-imagery rule) — it is a mechanical command doc, not a Recipe Skill. No Skill file changed in Round 2 (`git diff f59bcab ffb2edf --stat -- .claude/skills/` is empty). The always-rules files and `CLAUDE.md` are also untouched in Round 2. Craft-rule preservation stands exactly as certified in the Round-1 Verdict, with nothing this round to re-litigate.

### New defects found this round

None. Both Round-1 defects are genuinely fixed, not reasoned around; the new test's guards are proven non-vacuous by both static cross-check (all 11 guards, all 8 files) and an independent live reproduction on a file the developer had not themselves demonstrated; no craft rule, always-rule, or acceptance criterion regressed.

### Ruling on #211

Unchanged from Round 1: #211 can close on its achievable half. Round 2 removes both advisory gaps QA raised — every new command-surface citation this slice introduces is now regression-guarded, and the one asymmetric read (`log-post.md`'s Asset lookup) now names its command-surface equivalent for symmetry with every write-shaped citation elsewhere in the sweep. Issue #238 continues to track the deferred remainder (the file-backed stores getting their own surface). **Ready to merge.**
