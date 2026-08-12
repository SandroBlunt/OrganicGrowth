# Slice Handoff — issue #185: Daily Run ideas layout nests under ISO week + weekday folder

Bidirectional channel between `developer` and `qa` for this slice. Nothing below is ever overwritten;
retries append `Round-N Build` blocks and `qa` appends its Verdict.

## Build Report (Round 1)

### What changed

Implements ADR-0023: a `cadence: daily` Format's Run now writes its trends/briefs/Specs/output
bundles/cast-candidates under a NESTED directory —
`ideas/<format>/<ISO-week>/<weekday>-<DD>-<month>/` (e.g.
`ideas/unhypped-daily/2026-W33/wednesday-12-august/`) — instead of the old flat
`ideas/<format>/<run>/`. The Run's own id is completely unchanged: it stays the plain ISO date
everywhere it is used as a KEY (the ledger's `run:` field, queue job keys, `/run-trends`'s and
`/export-schedule`'s CLI arguments, `defaultRunId`'s return value). Only the FOLDER a daily Run's
files land in changes — this is a pure path-derivation change.

One new deep function pair, `runPathSegments(runId, cadence)` and `runIdeasDirFor(brand, formatSlug,
runId, cadence, brandsRoot?)`, both in `src/format/run-id.ts` (colocated with the module that already
owns cadence-derived Run naming, ADR-0022), is the single place that computes this. `runPathSegments`
returns `[runId]` unchanged for `"weekly"` cadence, and `[isoWeek, weekday-DD-month]` for `"daily"`.
Every module that previously reconstructed `ideas/<format>/<run>/...` now routes through it (or its
shared `runPathSegments` helper):

- `specPathFor` (`src/production-spec/store.ts`), `outputDirFor` (`src/asset/output-bundle.ts`), and
  `castCandidatesDirFor` (`src/asset/cast-candidates.ts`) each gained an OPTIONAL 5th `cadence`
  parameter, defaulting to `"weekly"` — every pre-existing call site (which never knew about cadence)
  keeps producing the exact same flat path, byte-for-byte, with zero migration needed.
- `resolveBriefPathCandidates` (`src/format/brief-path.ts`) gained a THIRD candidate — the nested-daily
  path — tried FIRST, but only when the Idea's `run` is structurally daily-shaped (a new pure
  predicate, `isDailyRunIdShape`, since this module has no I/O and can't load the owning Format's
  `cadence`). A weekly-shaped run's candidate list is completely unaffected. A recorded
  `brief_path`/`spec_path` still wins EXCLUSIVELY over every reconstructed candidate — unchanged; the
  real 2026-08-11 launch run (left on the old flat shape, per the issue's own Timing note) keeps
  resolving via its recorded paths.
- `exportScheduleCommand` (`src/commands/export-schedule.ts`) now resolves `runFolder` via
  `runIdeasDirFor(brand, format, run, cadence, brandsRoot)`, loading the invoked Format's own `cadence`
  when `options.ideasRoot` is not overridden. The existing `options.ideasRoot` testing seam (every
  pre-existing fixture test) is completely unchanged — still flat, bypassing the Format lookup.
- `/log-post` needed **no production-code change at all**: `refreshOutputBundle` already resolves an
  Asset's bundle directory from that Asset's own recorded `asset_paths`, never by reconstructing a
  format/run path — so it already works against a nested daily bundle by construction. A regression
  test proves this.
- `/cleanup-schedule-media`'s manifest scan (`src/schedule-batch/cleanup-runner.ts`) also needed no
  code change — it walks a Brand's `ideas/` tree recursively, so a nested Run's manifest is found one
  directory level deeper automatically. Only its module doc comment was updated to name the shape.

Prose docs for the content agents that actually execute `/run-trends`/`trend-scout`/`idea-strategist`/
`producer`/`/review-ideas` (there is no compiled TS runtime for their file-writing behavior — same
prompt-conformance-testing posture as issues #53/#172) were updated to name `runIdeasDirFor` as the
real path-derivation function, so a live daily Run actually produces the nested shape. `CLAUDE.md` and
the always-rules doc were updated to document the new shape alongside the existing legacy-layout note.

### Files touched

**Production code + tests:**
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/format/run-id.ts` (+`.test.ts`) — new
  `runPathSegments`, `isDailyRunIdShape`, `runIdeasDirFor`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/production-spec/store.ts` (+`.test.ts`) —
  `specPathFor` gains optional `cadence`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/asset/output-bundle.ts` (+`.test.ts`) —
  `outputDirFor` gains optional `cadence`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/asset/cast-candidates.ts` (+`.test.ts`) —
  `castCandidatesDirFor` gains optional `cadence`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/format/brief-path.ts` (+`.test.ts`) —
  `resolveBriefPathCandidates` gains the nested-daily candidate
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/commands/export-schedule.ts` (+`.test.ts`) —
  cadence-aware `runFolder` resolution
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/commands/log-post.test.ts` — new regression test
  only, no production code change
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/schedule-batch/cleanup-runner.ts` — doc comment
  only, no behavior change

**Prose docs:**
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/commands/run-trends.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/agents/trend-scout.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/agents/idea-strategist.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/agents/producer.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/commands/review-ideas.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/rules/always/organicgrowth-rules.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/CLAUDE.md`

**OpenSpec change:**
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/openspec/changes/issue-185-daily-run-nested-folders/proposal.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/openspec/changes/issue-185-daily-run-nested-folders/tasks.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/openspec/changes/issue-185-daily-run-nested-folders/specs/{format-store,production-spec,asset-output-bundle,cast-candidate-bundle,schedule-batch-export,post-attribution}/spec.md`

### How to run

```bash
cd /Users/CaxtonTaylor/Developer/OrganicGrowth
npx tsc -p tsconfig.json --noEmit          # type-check (also runs first inside `npm test`)
npm test                                    # full suite (tsc + node:test, src/**/*.test.ts)
npm run test:docs                           # prose-doc conformance suite (src/**/*.docs-test.ts)
openspec validate issue-185-daily-run-nested-folders --strict
openspec validate --strict --all            # confirm no other spec/change regressed

# This slice's new tests in isolation:
node --import tsx --test src/format/run-id.test.ts src/production-spec/store.test.ts \
  src/asset/output-bundle.test.ts src/asset/cast-candidates.test.ts src/format/brief-path.test.ts \
  src/commands/export-schedule.test.ts src/commands/log-post.test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #185) | Proven by |
|---|---|---|
| 1 | A daily Run named `2026-08-12` writes trends/briefs/specs/bundles under `ideas/unhypped-daily/2026-W33/wednesday-12-august/` | `src/format/run-id.test.ts` — `runIdeasDirFor` "daily Format: nests under ISO week + weekday-DD-month (matches issue #185's AC1 exactly)" and `runPathSegments` "matches issue #185's exact AC1 example for 2026-08-12"; `src/production-spec/store.test.ts` — `specPathFor` "nests a daily Run's Spec under its ISO week + weekday-DD-month leaf"; `src/asset/output-bundle.test.ts` / `src/asset/cast-candidates.test.ts` — matching "nests a daily Run's … under its ISO week + weekday-DD-month leaf" tests; `src/commands/export-schedule.test.ts` — "a daily-cadence Format's Run folder nests under its ISO week + weekday-DD-month leaf" (the REAL, non-override path, proving trends/briefs-adjacent CSV+manifest output actually lands there) |
| 2 | Recorded paths from the 2026-08-11 flat run keep resolving (briefs, specs, bundles readable; `/report` clean) | `src/format/brief-path.test.ts` — "the real, currently-pending straw-motion Ideas resolve to their actual Brief files" (existing, unmodified — still exercises the real 2026-W29 ledger) plus the new "a recorded brief_path still wins EXCLUSIVELY, even for a daily-shaped run (the real 2026-08-11 launch run)" test, which reproduces the ACTUAL recorded shape of `data/brands/straw-motion/ledger.json`'s 2026-08-11 Ideas (verified by hand against the live ledger before writing the test — `brief_path`/`spec_path` both point at the flat `ideas/unhypped-daily/2026-08-11/` shape and are returned verbatim, never reconstructed). `/report` reads only ledger fields (`src/commands/report.ts`), never reconstructs a filesystem path, so it is structurally unaffected — confirmed by inspection, no path-joining code in that module at all |
| 3 | Weekly Format paths byte-identical; full suite + docs tests green | Every "byte-identical"/"omitting cadence" test added to `run-id.test.ts`, `store.test.ts`, `output-bundle.test.ts`, `cast-candidates.test.ts` (comparing the no-cadence-argument call against the explicit `"weekly"` call, and against the literal pre-existing expected string); `brief-path.test.ts`'s "never adds a nested candidate for a weekly-shaped run id" test; `export-schedule.test.ts`'s "a weekly-cadence Format's real Run folder stays flat" test. Full-suite status: `npm test` → 2171/2172 pass (the 1 failure is pre-existing and unrelated — see Known limits); `npm run test:docs` → 224/224 pass |
| 4 | `/export-schedule` and `/log-post` work against a nested daily Run using the plain date Run id | `src/commands/export-schedule.test.ts` — "a daily-cadence Format's Run folder nests…" test calls `exportScheduleCommand(DAILY_BRAND, DAILY_FORMAT, "2026-08-12", …)` with the plain date as the Run id and asserts the CSVs/manifest land under the nested folder and NOTHING is written to the old flat shape; `src/commands/log-post.test.ts` — "works unchanged against a NESTED daily-Run bundle directory" test calls `logPostCommand("straw-motion", "idea-2026-08-12-01", "news-carousel", …)` against an Asset whose `asset_paths` sit under a nested directory and asserts both the ledger status advance (`produced` → `posted`) and the refreshed `post.json` |

### Fakes / fixtures used

- **No live Magnific Space calls anywhere in this slice** — this is pure filesystem-path/string/date
  computation. The `developer` agent was not given (and did not need) the Magnific MCP tools for this
  issue; no test in this slice touches `spaces_*`/`creations_*`.
- **`FakeMediaHost`** (`src/media-host/fixtures/fake-media-host.ts`) — used in the new
  `export-schedule.test.ts` cases (the pre-existing hermetic-test convention for this command; never
  live S3).
- **Real repo fixtures, read-only:** `data/brands/straw-motion/ledger.json`'s real 2026-W29 and
  (via a hand-verified, reproduced test case) 2026-08-11 records — proving AC2 against the actual
  committed data, not just a synthetic fixture. No file under `data/` was modified by this slice.
- **Temp directories** (`mkdtemp`) for every new filesystem-touching test (`export-schedule.test.ts`'s
  new `withRealFormatFixture`, `log-post.test.ts`'s nested-bundle test) — cleaned up in a `finally`.

### Self-review notes

- Chose an **optional, defaulted `cadence` parameter** (rather than changing `specPathFor`/
  `outputDirFor`/`castCandidatesDirFor`'s existing `(ideaId, run, ideasRoot, recipe)` signature shape)
  specifically to avoid unnecessary churn: every pre-existing call site, test, and prose-doc pinned
  substring (e.g. `producer-agent.docs-test.ts`'s exact-sentence pin on
  `` `outputDirFor(ideaId, run, ideasRoot, recipe)` ``) keeps working completely unmodified, and the
  "byte-identical for weekly" acceptance criterion becomes true by construction rather than by a
  separate migration/verification pass.
- Extracted the shared `runPathSegments` helper once, in `src/format/run-id.ts`, and had `specPathFor`/
  `outputDirFor`/`castCandidatesDirFor`/`runIdeasDirFor`/`resolveBriefPathCandidates` all call it —
  rather than duplicating the ISO-week/weekday-leaf computation in each — so the ADR-0023 date-parsing
  exception genuinely lives in exactly ONE place, as both the issue and ADR-0023 require.
- `isDailyRunIdShape` was extracted as its own named predicate (rather than inlining the regex check
  into `brief-path.ts`) so its "genuine calendar date, not just YYYY-MM-DD shaped" behavior is unit
  tested once and reused, and so `brief-path.ts` (which is documented PURE/no-I/O) never needs to know
  about `FormatCadence` or load a Format file just to decide whether to try the nested candidate.
- Found and fixed nothing needing removal — this was a pure-addition slice; no dead code was
  introduced (every new export is exercised by at least one test) and no existing code path needed
  simplification as a side effect.
- Verified every prose-doc edit against `npm run test:docs` after each file change (not just once at
  the end) to catch a broken pinned substring immediately rather than after a large batch of edits.

### Known limits

- **One pre-existing, unrelated test failure**, present on a clean `main` before this slice (confirmed
  via `git stash` + re-run): `src/format/store.test.ts`'s `"listFormatSlugs finds both real Brands'
  migrated Format"` expects `listFormatSlugs("straw-motion")` to equal exactly `["unhypped-news"]`, but
  straw-motion now has TWO Format files on disk (`unhypped-news.yaml` and `unhypped-daily.yaml`, the
  latter added by the prior Unhypped Daily launch commit) — the assertion was never updated for the
  second Format. This is unrelated to path-derivation/nesting and out of this slice's scope; left
  untouched.
- **No migration of the 2026-08-11 launch run** — deliberate, per the issue's own Timing note and
  ADR-0023's explicit Non-Goal. It stays on the flat shape forever, resolved via its recorded
  `brief_path`/`spec_path`.
- The nested-daily candidate in `resolveBriefPathCandidates` is added only when the Idea's `run` is
  STRUCTURALLY daily-shaped (a real `YYYY-MM-DD` calendar date) — this module has no I/O and cannot
  load the owning Format's actual `cadence`. In the extremely unlikely case a WEEKLY Format is ever
  given a Run id that happens to look like a date, this resolver would try (and typically fail to find)
  one extra, harmless candidate before falling through to the correct flat/legacy ones — no real Format
  in this repo does this today, and `defaultRunId` never produces such a collision.

---

## QA Verdict — Round 1: PASS

Verified independently by `qa` on branch `issue-185-daily-run-nested-folders` (repo
`SandroBlunt/OrganicGrowth`), 2026-08-12. All commands below were actually run, not assumed.

### Suite result

- `npm test` (runs `tsc -p tsconfig.json --noEmit` first, then the full `node:test` suite) →
  **2171/2172 pass, 1 fail, 0 cancelled/skipped**. The one failure is
  `src/format/store.test.ts` → `"mundotip and straw-motion are migrated to their own Format files
  (issue #53 AC2)"` → `"listFormatSlugs finds both real Brands' migrated Format"`. **Confirmed
  pre-existing and unrelated to this slice**: `src/format/store.test.ts` is NOT in this branch's
  `git diff main --name-only` (not touched by this slice at all); the assertion is a hardcoded literal
  `assert.deepEqual(await listFormatSlugs("straw-motion"), ["unhypped-news"])` against the real
  `data/brands/straw-motion/formats/` directory, which genuinely has held two files
  (`unhypped-news.yaml` and `unhypped-daily.yaml`) since `git log` commit `eb76882` ("Issue #177: land
  the Unhypped Daily Format file…"), well before this slice's branch point — the assertion was simply
  never updated for the second Format in that prior commit. This is exactly the developer's claimed
  reasoning and it holds up on inspection; no stash/checkout of `main` was needed to confirm it (the
  test file's own untouched status plus the commit history are sufficient proof).
- `npm run test:docs` → **224/224 pass, 0 fail** (prose-doc conformance suite, including the docs
  this slice edited: `format-docs.test.ts`, `producer-agent.docs-test.ts`,
  `export-schedule.docs-test.ts` and others — confirms no pinned substring was broken by this slice's
  prose edits).
- `openspec validate issue-185-daily-run-nested-folders --strict` → `Change
  'issue-185-daily-run-nested-folders' is valid`.
- `openspec validate --strict --all` → `Totals: 40 passed, 0 failed (40 items)` — no other spec/change
  regressed.

### Per-criterion results (issue #185 acceptance checkboxes)

| # | Acceptance criterion | Result | Proving test(s) |
|---|---|---|---|
| 1 | A daily Run named `2026-08-12` writes trends/briefs/specs/bundles under `ideas/unhypped-daily/2026-W33/wednesday-12-august/` | **PASS** | `src/format/run-id.test.ts`'s `runPathSegments`/`runIdeasDirFor` tests assert the exact literal string `data/brands/straw-motion/ideas/unhypped-daily/2026-W33/wednesday-12-august` for `runId: "2026-08-12"`; independently confirmed 2026-08-12 is ISO week 33, Wednesday (`python3 -c "import datetime; print(datetime.date(2026,8,12).isocalendar())"` → week 33, weekday 3). `store.test.ts`/`output-bundle.test.ts`/`cast-candidates.test.ts` each assert the matching nested path for Spec/output-bundle/cast-candidate directories with `cadence: "daily"`. `export-schedule.test.ts`'s new real-path (non-`ideasRoot`-override) test drives `exportScheduleCommand` end-to-end against a real on-disk Format file with `cadence: daily` and asserts the CSV+manifest land under the nested folder AND that nothing is written to the old flat shape. All assertions genuinely exercise the production functions, not just restated literals. |
| 2 | Recorded paths from the 2026-08-11 flat run keep resolving (briefs, specs, bundles readable; `/report` clean) | **PASS** | Verified by hand against the real ledger: `data/brands/straw-motion/ledger.json`'s `idea-2026-08-11-01` record carries `run: "2026-08-11"`, `format: "unhypped-daily"`, `brief_path: "data/brands/straw-motion/ideas/unhypped-daily/2026-08-11/idea-01.md"` (the OLD flat shape) — and `brief-path.test.ts`'s new "a recorded brief_path still wins EXCLUSIVELY, even for a daily-shaped run (the real 2026-08-11 launch run)" test reproduces this exact record and asserts `resolveBriefPathCandidates` returns ONLY that recorded path, never a reconstructed nested one. `src/commands/report.ts` was inspected directly: it reads only ledger fields via `loadIdeas`/`findAsset` and never joins/reconstructs a filesystem path anywhere in the file (confirmed via `grep -n "join\|path"` — the only `join(...)` calls are string-formatting `Array.prototype.join`, not `node:path`'s `join`) — so `/report` is structurally unaffected by this slice by construction, not merely by inspection-based assertion. |
| 3 | Weekly Format paths byte-identical; full suite + docs tests green | **PASS** | Every modified path-builder (`specPathFor`, `outputDirFor`, `castCandidatesDirFor`, `runIdeasDirFor`) has an explicit "byte-identical"/"omitting cadence" test comparing the no-argument call against both the explicit `"weekly"` call and the literal pre-existing expected string; `brief-path.test.ts`'s "record with no brief_path falls back to the Format-namespaced path" scenario (weekly-shaped run) asserts exactly `[flat, legacy]`, unaffected. `export-schedule.test.ts`'s new real-path weekly test confirms the actual command output stays flat. Suite results independently reproduced above: 2171/2172 (1 pre-existing unrelated failure) + 224/224 docs. |
| 4 | `/export-schedule` and `/log-post` work against a nested daily Run using the plain date Run id | **PASS** | `export-schedule.test.ts`'s daily real-path test calls `exportScheduleCommand(DAILY_BRAND, DAILY_FORMAT, "2026-08-12", …)` — the plain ISO date, never a nested string — and asserts the CSVs/manifest land under the nested folder, `scheduled_at` is stamped on the ledger Asset, and the OLD flat folder receives nothing (`readdir` on the flat path returns `null`). `log-post.test.ts`'s new "works unchanged against a NESTED daily-Run bundle directory" test calls `logPostCommand("straw-motion", "idea-2026-08-12-01", "news-carousel", …)` against an Asset whose `asset_paths` sit inside a nested `ideas/unhypped-daily/2026-W33/wednesday-12-august/idea-01.news-carousel.output/` directory and asserts both the ledger status transition (`produced` → `posted`) and the refreshed `post.json` land in that same nested directory — proving `/log-post` needed (and received) no code change, exactly as claimed. |

### Per-scenario results (spec deltas vs. covering tests)

**`format-store` spec** (`resolveBriefPathCandidates` + new `runPathSegments`/`runIdeasDirFor`
Requirement):
- "A recorded brief_path is trusted exclusively, even when the Idea's format is stale or wrong" — PASS, pre-existing test unmodified.
- "The real, currently-pending straw-motion Ideas resolve to their actual Brief files" — PASS, pre-existing test unmodified, still exercises real 2026-W29 ledger.
- "A record with no brief_path falls back to the Format-namespaced path, then the legacy path" — PASS, `brief-path.test.ts`.
- "A garbled format value never crashes the resolver" — PASS, pre-existing test unmodified.
- "A daily-shaped run with no brief_path gains a nested-daily candidate FIRST" — PASS, `brief-path.test.ts` asserts the exact 3-candidate ordered list matching the scenario's literal example.
- "The real 2026-08-11 launch run's recorded brief_path still wins exclusively" — PASS, verified against the real ledger record by hand (see criterion 2 above).
- "A syntactically date-shaped but calendar-invalid run never gains a nested candidate" — PASS, `brief-path.test.ts` tests `run: "2026-02-30"`.
- "A weekly Format's ideas directory is byte-identical to the pre-ADR-0023 flat shape" — PASS, `run-id.test.ts`.
- "A daily Format's ideas directory nests under ISO week + weekday-DD-month (issue #185 AC1)" — PASS, `run-id.test.ts`, matches literal.
- "The ADR-0023 worked example for 2026-08-11 matches exactly" — PASS, `run-id.test.ts` asserts `["2026-W33", "tuesday-11-august"]`, independently reconfirmed correct.
- "A daily-cadence Run id that isn't a real calendar date degrades to the flat shape" — PASS, `run-id.test.ts`.
- "A path-traversal Run id is rejected before any path join" — PASS, `run-id.test.ts`.
- "isDailyRunIdShape recognizes a genuine calendar date and rejects everything else" — PASS, `run-id.test.ts`.

**`production-spec` spec** (`specPathFor` cadence clause): all 3 new scenarios ("Omitting cadence is
byte-identical...", "A daily cadence nests the Spec...") — PASS, `store.test.ts`; pre-existing 3
scenarios (compose+persist, two-Recipe segmentation, refused-Spec, companies pass-through) — PASS,
unmodified.

**`asset-output-bundle` spec** (`outputDirFor` cadence clause): both new scenarios — PASS,
`output-bundle.test.ts`; pre-existing scenarios (id/run/recipe convention, never `.assets`) — PASS,
unmodified.

**`cast-candidate-bundle` spec** (`castCandidatesDirFor` cadence clause): both new scenarios — PASS,
`cast-candidates.test.ts`; pre-existing scenarios — PASS, unmodified.

**`schedule-batch-export` spec** (cadence-aware `runFolder`): both new scenarios ("A real
non-override daily-cadence Format's export nests...", "...weekly-cadence Format's export stays
flat...") — PASS, `export-schedule.test.ts`'s new `withRealFormatFixture`-based describe block, which
genuinely exercises the real (non-`ideasRoot`-override) code path via `loadFormat`; pre-existing
scenarios (happy path, empty run, no Zoho config, 1-hour lead window) — PASS, unmodified, still using
the `options.ideasRoot` fixture seam.

**`post-attribution` spec** (`/log-post` unaffected by cadence): new scenario "/log-post works
unchanged against an Asset whose bundle sits in a nested daily-Run directory (issue #185 AC4)" — PASS,
`log-post.test.ts`; pre-existing scenarios (refresh on log, two-Asset isolation, no-bundle-dir
graceful skip) — PASS, unmodified.

### Always-rules + Magnific-fake checks

- **Ledger-as-source-of-truth** — PASS. `resolveBriefPathCandidates` still returns a recorded
  `brief_path`/`spec_path` VERBATIM and exclusively, with the nested-daily candidate only ever
  considered when no recorded path exists at all — confirmed both by reading `brief-path.ts`'s
  implementation directly (the `idea.briefPath` early-return branch is untouched by this diff) and by
  the "recorded brief_path still wins EXCLUSIVELY" test reproducing the real 2026-08-11 launch record.
  No ledger-writing code path was touched by this slice (`git diff main --stat` shows no changes to
  `src/ledger/`); status transitions are unaffected.
- **Generate-never-publish** — PASS (untouched). This slice is pure path/string/date derivation; no
  publish-adjacent code (`src/commands/export-schedule.ts`'s CSV-writing logic itself, Zoho MCP
  scheduling) was modified beyond the `runFolder` resolution line — confirmed by the diff.
- **Public-metrics-only** — PASS (untouched). No Apify/performance-tracking code was touched by this
  diff (`git diff main --stat` confirms).
- **Relative-not-absolute** — PASS (untouched). No scoring/baseline code touched.
- **Explicit-attribution** — PASS. `/log-post` production code (`src/commands/log-post.ts`) has ZERO
  diff against `main` (only its test file gained a new regression case) — confirmed via
  `git diff main -- src/commands/log-post.test.ts` showing only test additions, and `git diff main
  --name-only` showing no `src/commands/log-post.ts` entry. Attribution still flows exclusively
  through the Operator-logged `post_url`, unchanged.
- **Magnific fake / no live-Space calls** — PASS. `git diff main -- src/ .claude/ CLAUDE.md | grep -i
  "spaces_\|creations_\|magnific"` returns NOTHING — no `spaces_*`/`creations_*` MCP call and no new
  "Magnific" prose reference was introduced by this diff. A broader `grep -l` over the full (not
  diffed) changed files does match "magnific" in `src/asset/cast-candidates.ts`'s doc comment and
  `cast-candidates.test.ts`'s fixture URLs (`https://magnific.example/cast/1.png`) — both are
  PRE-EXISTING content (confirmed: `cast-candidates.ts`/`.test.ts` diff shown above touches only the
  `castCandidatesDirFor` signature and its doc comment, nowhere near those matches) and
  `magnific.example` is an inert fixture domain, never a live call. This issue does not give the
  `developer` agent Magnific MCP tools and none are used.

### Scope check

- `docs/adr/0025-recipe-declares-its-copy-platforms.md` and
  `docs/adr/0026-linkedin-mention-aid-moves-out-of-caption.md` — **confirmed untouched** by this slice:
  both are untracked (`??`) in the repo's initial `git status`, unrelated to issues #183/#186, and
  `git diff main -- docs/adr/0025-*.md docs/adr/0026-*.md` on this branch returns empty (no diff at
  all — the files are not part of this branch's changes).
- `git diff main --name-only` (excluding `openspec/`) lists exactly the 21 files the Build Report
  claims: 7 prose docs + `CLAUDE.md`/always-rules, and 13 `src/` files — no unexpected file touched, no
  changes to `data/queue.json`'s shape or any ledger-writing module.

### Defect list

None. No defects found in this round.
