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
