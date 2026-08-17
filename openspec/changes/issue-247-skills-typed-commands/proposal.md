## Why

Issue #211 ("Agents call typed commands, not file paths") was split in advance into two halves at
triage. #246 (merged, PR #248) shipped the **first half** — the six `.claude/agents/*.md` definitions.
This change (#247) is the **second half**: the **prose sweep across everything that is not one of the
six agent definitions** — the Recipe Skills under `.claude/skills/`, the commands under
`.claude/commands/`, and any remaining doc citing a module path or a `data/brands/<slug>/` path as an
interface (the two always-rules files and `CLAUDE.md` itself).

Re-measured on `main` at `4d023e9` (after #246 merged), across `.claude/` + `CLAUDE.md`:

| | Count |
|---|---|
| Files citing `data/brands/<slug>/` | 22 |
| Distinct `src/**/*.ts` paths cited | 96 |
| Total module-path mentions | 227 |

By area: `.claude/agents` 89, `.claude/commands` 70, `.claude/skills` 55, `CLAUDE.md` 10, `.claude/rules`
3. #246 improved the six agents' *interface* (a typed function instead of a folder read) but
*increased* their own module-path mentions (28 added, 7 removed) — a genuine, Operator-reviewed
trade-off, not a defect, addressed further below.

## The Operator's decision this change builds to (not re-litigated)

A fork surfaced after #246 (recorded on issue #211): what should a citation look like when **no
command-surface command exists** for the described operation? The `src/command-surface/` surface only
covers the SQL-backed stores (issue #205's eight operations); `ledger.json`/`data/queue.json` remain the
live, file-backed source of truth per rule 7, and no production caller in this doc set is wired onto the
SQL surface yet (the one exception, the unattended worker's `runOneJob`, is out of scope — none of the
files this change touches describe driving the worker directly).

**Operator decision (Option A), taken 2026-08-17:**
- **Where a typed command exists in `src/command-surface/`, name the command.** Covers Trends, Ideas,
  Jobs, Assets, Posts, Performance, gates, Copy.
- **Where no command exists, cite the typed function and its module** (e.g. FormatStore's
  `loadFormat(brand, format)`, `src/format/store.ts`) — accurate today, will drift when a module moves;
  that cost is accepted deliberately.

This change applies Option A uniformly across every file in its scope, mirroring the exact citation
pattern #246 already established (and QA already passed) for the one case where no file-backed accessor
exists at all: name the command-surface function as the sanctioned target once that operation's data
moves onto the SQL-backed pipeline, while stating plainly (citing rule 7) that today's operative write is
the file (ledger/queue) itself. This is never a silent claim that the SQL write happens today.

## What Changes

### The Recipe Skills (`.claude/skills/`) — plumbing rewritten, craft rules untouched

Five Skill files carried a `data/brands/<slug>/` citation as an interface: `produce-character-explainer`,
`produce-news-carousel`, `produce-news-short-script` (each: the Brand's `brand-profile.yaml`, the Idea
brief's path, and the saved Spec's path — all three converted to their existing typed accessors:
`loadBannedWords`/`loadCopyRules`, `resolveBriefPathCandidates` (`src/format/brief-path.ts`), and
`specPathFor` (already named — the raw path echo beside it was simply dropped)); `write-social-copy` (one
`brand-profile.yaml` mention); `fetch-curated-source` (the Apify RSS actor slug, now cited via
`resolveBrand(brand).seeds`, `src/brand/resolver.ts`).

**The eleven other Skill files (`chatgpt-image-2`, `grok-imagine`, `grok-imagine-1-5`, `happy-horse`,
`kling-3-0`, `kling-3-0-omni`, `nano-banana-2`, `seedance-2-0`, `seedream-4-5`, `seedream-5-0-pro`,
`veo-3-1`) carry no `data/brands/` or module-path citation at all — model-prompting references only —
and are untouched, confirmed by `git diff main --stat -- .claude/skills/`.**

**The anti-rhetoric caption rules — `.claude/skills/write-social-copy/SKILL.md` — received exactly one
edit, on the single sentence that was pure plumbing** ("Brand hard rules — `data/brands/<slug>/
brand-profile.yaml`, read via..." → "Brand hard rules — the Brand's own `brand-profile.yaml`, read
via..."). Every writing rule in that file — the fresh-CTA-every-time rule, the banned canned "Swipe
through the 7-slide breakdown" example, the grounded-companies rule, the dash-tell ban, the LinkedIn
`@mention` mechanics, the per-platform tone/length rules — is untouched, byte-for-byte. Confirmed by
`git diff main -- .claude/skills/write-social-copy/SKILL.md` showing exactly one changed line pair.

The placeholder-frame phrasing and the real-source-imagery rule (`produce-news-carousel/SKILL.md`'s
Subject rules, its `card_style`/`kind`/`source_url` sections) are likewise untouched — every edit to that
file lives in its `## Inputs` section only (the three plumbing citations named above).

### The commands (`.claude/commands/`)

All 12 command docs that carried a `data/brands/<slug>/` citation (`backup-media`,
`cleanup-schedule-media`, `export-schedule`, `log-post`, `pick`, `pick-cast`, `queue`, `report`,
`review-ideas`, `run-pipeline`, `run-trends`, `track-performance` — `build-issue.md` carried none and is
untouched) now cite a typed accessor instead of a bare path. Where the described operation is one of the
eight command-surface categories, the doc also names the command-surface function as the sanctioned
future target, honestly scoped exactly like idea-strategist.md's own precedent:

- `run-trends.md`: Trends (`createTrend`) and Ideas (`createIdea`, mirroring `idea-strategist.md`'s own
  language) for its two writes; `loadFormat`/`resolveBrand` for its reads.
- `review-ideas.md`: Ideas (`recordReviewDecision`) for both the accept and reject writes.
- `pick.md` / `pick-cast.md`: gates (`resolveGate`), stated alongside the existing, deliberate
  explanation that this command only ever writes the file-based Production Queue, never the SQL `job`
  table.
- `log-post.md`: Posts (`logPost`).
- `track-performance.md`: Performance (`recordPerformanceSnapshot`/`recordPerformanceScore`).
- `export-schedule.md`: Assets (`saveAsset`), for its `scheduled_at` stamp.
- `queue.md`: Jobs (`enqueueJob`/`claimJob`/`releaseJob`), stated as the SQL-backed `job` table's own
  operations — a genuinely separate store from the file queue this command reads.
- `backup-media.md`, `cleanup-schedule-media.md`, `report.md`, `run-pipeline.md`: no command-surface
  category applies (media-file backup, S3 manifest cleanup, and read-only ledger reporting); each
  bare-path citation is replaced with the existing typed accessor (`listBrands`/
  `src/media-backup/produced-media-tree.ts`, `resolveBrand`, `src/ledger/ledger.ts`) per Option A's "no
  command exists" branch. `pick-cast.md`'s own downloaded-candidate mention is likewise re-pointed at
  `castCandidatesDirFor` (`src/asset/cast-candidates.ts`), alongside its gates note above.

### The always-rules and CLAUDE.md

`.claude/rules/always/data-handling.md`: the Apify-actor-config rule, the Meta-export rule, and the
"ledger is canonical" rule now name `resolveBrand`/`src/ledger/ledger.ts` instead of a bare
`data/brands/<slug>/...` path.

`.claude/rules/always/organicgrowth-rules.md` rule 7: its one `data/brands/<slug>/` citation (the "Per
Brand under..." lead-in) now names `resolveBrand(slug)` (`src/brand/resolver.ts`). Its three existing
`src/*.ts` module-path mentions (`src/production-spec/store.ts`, `src/commands/run-worker.ts`,
`src/command-surface/worker.ts`) were already correct, illustrative citations of which module implements
a named guard/mechanism — left untouched. **Deliberately not touched:** rule 7's "no production caller is
wired onto it yet either" clause — pinned verbatim by `src/db/adr.docs-test.ts`'s issue #201 suite, and
outside this change's actual scope (it names no bare path or module citation needing conversion; it is a
currency/accuracy question for a different, prior slice, not this ticket's AC).

`CLAUDE.md`'s weekly-loop narrative (`/run-trends` step, the `/track-performance` step, the Meta-export
bullet) now name `loadFormat`/`runIdeasDirFor`/`src/ledger/ledger.ts`/`resolveBrand(...).yourData`
instead of bare paths. **One `data/brands/<slug>/` mention is deliberately kept**: the `## State`
section's own lead sentence ("All state is plain files... Per Brand under `data/brands/<slug>/`: ...")
is the section's own scaffold for a reference table of the whole on-disk layout — not an instruction to
read/write a path directly, and every item in the list beneath it that has a typed accessor already
names it (e.g. `loadBaselinePrompt`, `BrandAssetStore`, `runIdeasDirFor`). Rewriting this one sentence
would strip the one piece of context ("everything below is under the Brand's own directory") the whole
table depends on, for no accuracy gain.

### One correction from #246, checked and found already clean

The build brief for this change directed a check of the six agent files for the one regression Option A
identifies as unacceptable: a citation naming a store module where a real command-surface command already
covers that exact operation. Every citation in `developer.md`, `idea-strategist.md`,
`performance-tracker.md`, `producer.md`, `qa.md`, and `trend-scout.md` was checked against the eight
command-surface categories: `idea-strategist.md` already names `createIdea` for its Idea-ledger append
(Ideas); `qa.md` already states the exact Option A pattern verbatim ("`src/command-surface/` where the
operation is one of its own, `src/ledger/ledger.ts`/`AssetStore`/`src/production-queue/queue.ts`
otherwise"); every other file's citations (`AssetStore.writeAsset`, `src/production-queue/queue.ts`,
`src/production-spec/store.ts`, `src/mention-handle/store.ts`, `src/brand-asset/store.ts`) name
file-backed stores with **no SQL command-surface equivalent actually wired to the same data** (the file
queue and the SQL `job` table are a genuinely separate store per rule 7/ADR-0030, and Production Spec/
Brand Asset/Mention Handle are not among the eight command-surface categories at all). No wrong citation
was found; the six agent files are unchanged by this slice.

## Doc-conformance stays in lockstep

`npm run test:docs` was 327 assertions / 84 suites green before this change and is 327/84 green after —
**no check was removed.** Two pre-existing pinned regexes in `src/format/format-docs.test.ts` and
`src/commands/export-schedule.docs-test.ts` targeted the exact literal path text this change legitimately
rewrites (`formats/<format>.yaml` bare, and a line-wrap that split `status stays "produced"` across two
physical lines after an edit); both were re-pinned to the SAME substantive claim they always proved
(`run-trends.md` reads the Format file's `sources`/`voice`/`ideas_per_run`/`cadence`; `review-ideas.md`'s
Brief-path fallback prefers the Format-namespaced shape over the legacy one) rather than weakened —
`format-docs.test.ts`'s regex for the fallback-path Scenario now checks `ideas/<Idea.format>/<run>/
idea-NN.md` instead of requiring the now-removed `data/brands/<slug>/` prefix; the same substantive
claim, same specificity, adapted to the citation this change legitimately makes. No assertion was
deleted; the total assertion count is unchanged (327).

`npm test` was 3401/893/0-fail on `main` at `4d023e9` and is 3401/893/0-fail after this change — same
totals, all green, no regression.

## Impact

- **Modified:** the 5 in-scope `.claude/skills/*/SKILL.md` files, all 12 `.claude/commands/*.md` files
  except `build-issue.md`, `.claude/rules/always/{organicgrowth-rules,data-handling}.md`, `CLAUDE.md`,
  and `src/format/format-docs.test.ts` (one re-pinned assertion, same count).
- **Untouched:** the six `.claude/agents/*.md` files (checked, no correction needed — see above), the 11
  model-prompting Skill files, every other doc, and every production module under `src/` (this is a
  documentation-prose change; no runtime behavior changes).
- **Hermetic.** No live Magnific/Apify/Zoho call; this slice touches no runtime code path.
- **Always-rules upheld, deliberately not extended onto SQL.** Ledger-as-source-of-truth is honored by
  never claiming a command-surface write happens today where the operative write is still a file — every
  added command-surface citation is paired with the honest "today's operative write is X" clause.
