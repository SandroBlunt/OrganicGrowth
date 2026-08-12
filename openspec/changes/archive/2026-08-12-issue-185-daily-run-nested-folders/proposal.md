## Why

**ADR-0023** (`docs/adr/0023-daily-runs-nest-under-their-iso-week-weekday-named.md`), refining
ADR-0022: the Operator flagged, on the first Unhypped Daily launch run (2026-08-11), that a flat
`ideas/unhypped-daily/2026-08-11/` folder doesn't read as "a week of the daily show" the way the
weekly Format's `ideas/unhypped-news/2026-W32/` folder does, and a folder of many single-date
siblings is hard to browse. The fix is a **display-path change only**: a `cadence: daily` Format's Run
now nests under its ISO week, then a weekday-named leaf — `ideas/<format>/<ISO-week>/
<weekday>-<DD>-<month>/`, e.g. `ideas/unhypped-daily/2026-W33/wednesday-12-august/`. The Run's own id
stays the plain ISO date everywhere it is a KEY (the ledger's `run:` field, queue job keys,
`/run-trends`/`/export-schedule` arguments, `defaultRunId`'s own return value) — it already passes
`RUN_ID_PATTERN`, and every existing consumer that treats it as an opaque, exact-match filter keeps
working unchanged. Only the FOLDER a daily Run's files are written under changes.

Straw Motion's 2026-08-11 launch run has already completed its pipeline (trends, 12 briefs, 14
produced Assets' Specs, ledger + queue all recorded — see the "Unhypped Daily 2026-08-11" commit) and
stays on the OLD flat layout, deliberately untouched: its every Idea's `brief_path`/`spec_path` is
recorded verbatim on the ledger and stays canonical, exactly like the pre-existing
Format-namespacing-vs-legacy-layout rule already documented in CLAUDE.md's "Legacy layout note".

## What Changes

- **One new deep function, `runIdeasDirFor(brand, formatSlug, runId, cadence, brandsRoot?)`**
  (`src/format/run-id.ts`, colocated with the module that already owns cadence-derived Run naming) —
  the SINGLE place in this codebase that computes a Run's actual ideas directory:
  `join(formatIdeasRoot(brand, formatSlug, brandsRoot), ...runPathSegments(runId, cadence))`. A new
  pure sibling, `runPathSegments(runId, cadence)`, returns `[runId]` for a weekly cadence
  (BYTE-IDENTICAL to every pre-existing flat shape) or `[isoWeek, weekdayDayMonthLeaf]` for a daily
  cadence — the weekday/month spelled out in lowercase English, the day zero-padded, computed from the
  Run id's OWN date. This is the ONE function ADR-0023 authorizes to parse date semantics out of an
  opaque Run id, for path derivation only — the exception is documented in both ADR-0023 and this
  module's own doc comment. A `cadence: "daily"` Run whose id does not parse as a real calendar date
  (a hand-typed, non-standard run id) degrades to the flat, single-segment shape rather than throwing
  or guessing (data-handling rule 4). A companion pure predicate, `isDailyRunIdShape(runId)`, lets a
  module with no cadence in scope (`resolveBriefPathCandidates`, below) recognize a daily-SHAPED Run
  id structurally.
- **Every module that reconstructs `ideas/<format>/<run>/...` routes through this function or its
  shared `runPathSegments` helper**, with a `cadence` parameter that DEFAULTS to `"weekly"` so every
  existing call site that never knew about cadence keeps producing the exact same flat path it always
  has (byte-identical, no call-site migration needed):
  - `specPathFor(ideaId, run, ideasRoot, recipe, cadence = "weekly")` (`src/production-spec/store.ts`)
  - `outputDirFor(ideaId, run, ideasRoot, recipe, cadence = "weekly")` (`src/asset/output-bundle.ts`)
  - `castCandidatesDirFor(ideaId, run, ideasRoot, recipe, cadence = "weekly")`
    (`src/asset/cast-candidates.ts`)
  - `resolveBriefPathCandidates` (`src/format/brief-path.ts`) gains a THIRD candidate — the nested-daily
    path — tried FIRST, but ONLY when the Idea's `run` is daily-SHAPED (`isDailyRunIdShape`); a
    weekly-shaped run's candidate list is completely unaffected (still exactly `[flat, legacy]`). A
    recorded `brief_path`/`spec_path` still wins EXCLUSIVELY over every reconstructed candidate,
    unchanged (no migration of the 2026-08-11 run's recorded paths).
  - `exportScheduleCommand` (`src/commands/export-schedule.ts`) resolves its `runFolder` via
    `runIdeasDirFor(brand, format, run, cadence, brandsRoot)`, loading the invoked Format's own
    `cadence` (`loadFormat`) when `options.ideasRoot` is not overridden — the existing
    `options.ideasRoot` testing seam (a fixture's Format-parent folder) stays flat, byte-for-byte
    unchanged, exactly as before.
- **`/log-post` needs NO code change.** It already resolves an Asset's output bundle from that Asset's
  OWN recorded `asset_paths` (`refreshOutputBundle`, `src/asset/output-bundle.ts`) — never by
  reconstructing a path from `format`/`run` — so it already works against a nested daily bundle
  directory by construction. This slice adds a regression test proving it.
- **`/cleanup-schedule-media`'s manifest scan needs NO code change either** — it walks a Brand's
  `ideas/` tree recursively (`findManifestFiles`, `src/schedule-batch/cleanup-runner.ts`), so a nested
  daily Run's `zoho-manifest.json` is found automatically, one directory level deeper.
- **Prose docs** (`/run-trends`, `trend-scout`, `idea-strategist`, `producer`, `/review-ideas`,
  CLAUDE.md, the always-rules) are updated to name `runIdeasDirFor` as the actual path-derivation
  function, so the content agents that execute these commands (there is no compiled TS runtime for
  their file-writing behavior — mirrors issue #53's/#172's own prompt-conformance testing approach)
  actually produce the nested shape for a daily Format.

## Non-Goals (explicitly out of scope for this slice)

- **Migrating the 2026-08-11 launch run** (or any other existing run) onto the nested shape. It stays
  flat, deliberately, exactly as the issue's Timing note and ADR-0023 both state — its recorded
  `brief_path`/`spec_path` are canonical and always win over any reconstructed path.
- **Relaxing ADR-0022's "no code parses date semantics out of a Run id" more broadly.** The exception
  is scoped to `runPathSegments`/`runIdeasDirFor` (and `isDailyRunIdShape`, its structural-detection
  sibling) only — every other reader of a Run id (the ledger's `run:` field, `sortEligible`, queue job
  keys) keeps treating it as a fully opaque, exact-match label.
- **Changing the Run id itself.** It stays the plain ISO date for a daily Format everywhere it is a
  KEY — `RUN_ID_PATTERN`, `defaultRunId`, `/run-trends`/`/export-schedule`'s arguments are all
  unchanged.
- **Any live Magnific/Apify/Zoho call.** This is pure filesystem-path/string/date computation — no
  Space, no MCP, no network call is exercised by any new or modified test.

## Capabilities

### Modified Capabilities

- `format-store`: gains a new Requirement documenting `runPathSegments`/`runIdeasDirFor` (ADR-0023);
  the existing "A suggested Idea's Brief path is resolved..." Requirement gains the nested-daily
  candidate.
- `production-spec`: the "Compose and persist a Production Spec..." Requirement's `specPathFor` gains
  a cadence-aware nesting clause.
- `asset-output-bundle`: the "outputDirFor names a new Asset's bundle directory..." Requirement gains
  a cadence-aware nesting clause.
- `cast-candidate-bundle`: the "castCandidatesDirFor names a Recipe's gate-candidate folder..."
  Requirement gains a cadence-aware nesting clause.
- `schedule-batch-export`: the "The command writes CSVs + a manifest..." Requirement gains
  cadence-aware `runFolder` resolution.
- `post-attribution`: the "/log-post refreshes the named Asset's output-bundle post.json..."
  Requirement gains a scenario proving this already works, unmodified, against a nested daily bundle
  directory.

## Impact

- **New code:** none beyond additions to existing modules — `runPathSegments`, `isDailyRunIdShape`,
  `runIdeasDirFor` all land in the existing `src/format/run-id.ts`.
- **Modified code (+ tests):** `src/format/run-id.ts` (+`.test.ts`), `src/production-spec/store.ts`
  (+`.test.ts`), `src/asset/output-bundle.ts` (+`.test.ts`), `src/asset/cast-candidates.ts`
  (+`.test.ts`), `src/format/brief-path.ts` (+`.test.ts`), `src/commands/export-schedule.ts`
  (+`.test.ts`), `src/commands/log-post.test.ts` (new regression test, no production code change),
  `src/schedule-batch/cleanup-runner.ts` (comment only, no behavior change).
- **Modified docs:** `.claude/commands/run-trends.md`, `.claude/agents/trend-scout.md`,
  `.claude/agents/idea-strategist.md`, `.claude/agents/producer.md`, `.claude/commands/review-ideas.md`,
  `.claude/rules/always/organicgrowth-rules.md`, `CLAUDE.md`.
- **Not touched:** the Run id itself (still the plain ISO date, everywhere it is a key); the 2026-08-11
  launch run's files (left exactly as they are); `data/queue.json` / the Production Queue shape (a Run
  id's folder shape is not part of a queue job's key); any Magnific Space driver code; ADR-0025/0026
  (unrelated issues #183/#186).
- **Hermetic, no live Magnific/Apify/Zoho anywhere.** Every new/modified test is plain-file/string/date
  computation against temp directories or fixtures — no Space, no MCP, no network call.
- **Always-rules upheld:** ledger-as-source-of-truth (a recorded `brief_path`/`spec_path` still always
  wins; no ledger-writing behavior changes); explicit-attribution (`/log-post` is untouched code,
  proven by a new regression test against a nested bundle); generate-never-publish /
  public-metrics-only / relative-not-absolute (none of those code paths are touched by a pure
  path-derivation slice).
