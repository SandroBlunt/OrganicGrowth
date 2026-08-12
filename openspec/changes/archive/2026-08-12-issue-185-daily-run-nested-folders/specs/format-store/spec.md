## MODIFIED Requirements

### Requirement: A suggested Idea's Brief path is resolved by trusting the ledger's own brief_path first

The system SHALL provide `resolveBriefPathCandidates(idea, brand, brandsRoot?)`
(`src/format/brief-path.ts`), returning an ORDERED list of candidate Brief paths for a
`status: suggested` ledger Idea. When the Idea record carries a non-empty `brief_path`, that value
SHALL be returned VERBATIM as the ONLY candidate (ledger-as-source-of-truth, always-rules #7) — it
SHALL NOT be second-guessed or overridden by reconstructing a path from the Idea's `format`/`run`,
because a record's `format` field is not a reliable indicator of where its Brief physically lives
(pre-existing records may carry the retired media-sense value, or even a genuinely correct Format
slug, while their Brief still sits at the pre-Format-namespacing path). Only when `brief_path` is
absent SHALL the system reconstruct candidates. When `format` is a valid slug AND `idea.run` is
SHAPED like a daily Run id (a genuine `YYYY-MM-DD` calendar date — `isDailyRunIdShape`,
`src/format/run-id.ts`, ADR-0023), the FIRST candidate SHALL be the nested week+weekday path
(`runIdeasDirFor(brand, format, run, "daily", brandsRoot)`/`idea-NN.md`) — the current convention
going forward for any Run this shape actually belongs to. Next comes the flat Format-namespaced path
`data/brands/<slug>/ideas/<format>/<run>/idea-NN.md`, then the legacy Brand-level path
`data/brands/<slug>/ideas/<run>/idea-NN.md`. A weekly-SHAPED `run` (e.g. `2026-W32`) NEVER matches the
daily-shape check, so a weekly Format's candidate list is completely unaffected by this Requirement —
still exactly `[flat, legacy]`. `/review-ideas` SHALL use this resolver instead of hand-building the
Brief path itself.

#### Scenario: A recorded brief_path is trusted exclusively, even when the Idea's format is stale or wrong

- **GIVEN** a ledger Idea record with `brief_path: "data/brands/straw-motion/ideas/2026-W29/idea-01.md"`
  and `format: "reel"` (the retired media-sense value)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it returns exactly `["data/brands/straw-motion/ideas/2026-W29/idea-01.md"]` — the
  recorded path, verbatim, and nothing else

#### Scenario: The real, currently-pending straw-motion Ideas resolve to their actual Brief files

- **GIVEN** the real `data/brands/straw-motion/ledger.json`'s 7 `status: suggested` Ideas (run
  `2026-W29`), each carrying a real `brief_path`
- **WHEN** `resolveBriefPathCandidates` is called for each
- **THEN** every returned candidate path exists on disk (proven against the real files, not a
  synthetic fixture)

#### Scenario: A record with no brief_path falls back to the Format-namespaced path, then the legacy path

- **GIVEN** an Idea record with no `brief_path` and `format: "life-hacks"`, `run: "2026-W30"` (a
  weekly-shaped run)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it returns `[<Format-namespaced path>, <legacy Brand-level path>]`, in that order — exactly
  two candidates, unaffected by the nested-daily candidate below

#### Scenario: A garbled format value never crashes the resolver

- **GIVEN** an Idea record with no `brief_path` and a `format` value that is not a valid Format slug
  (e.g. contains a path-traversal sequence)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it does not throw — it degrades to the legacy Brand-level path candidate

#### Scenario: A daily-shaped run with no brief_path gains a nested-daily candidate FIRST (ADR-0023)

- **GIVEN** an Idea record with no `brief_path`, `format: "unhypped-daily"`, and `run: "2026-08-12"`
  (a genuine `YYYY-MM-DD` calendar date)
- **WHEN** `resolveBriefPathCandidates` is called for it, for Brand `straw-motion`
- **THEN** it returns exactly three candidates, in this order:
  `["data/brands/straw-motion/ideas/unhypped-daily/2026-W33/wednesday-12-august/idea-01.md",
  "data/brands/straw-motion/ideas/unhypped-daily/2026-08-12/idea-01.md",
  "data/brands/straw-motion/ideas/2026-08-12/idea-01.md"]`

#### Scenario: The real 2026-08-11 launch run's recorded brief_path still wins exclusively

- **GIVEN** an Idea record with `format: "unhypped-daily"`, `run: "2026-08-11"` (daily-shaped), AND a
  recorded `brief_path: "data/brands/straw-motion/ideas/unhypped-daily/2026-08-11/idea-01.md"` (the
  OLD flat shape, left in place — ADR-0023's Non-Goal)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it returns exactly `["data/brands/straw-motion/ideas/unhypped-daily/2026-08-11/idea-01.md"]`
  — the recorded flat path, verbatim, never the nested reconstruction

#### Scenario: A syntactically date-shaped but calendar-invalid run never gains a nested candidate

- **GIVEN** an Idea record with no `brief_path`, `format: "unhypped-daily"`, and `run: "2026-02-30"`
  (matches `YYYY-MM-DD` syntactically but is not a real calendar date)
- **WHEN** `resolveBriefPathCandidates` is called for it
- **THEN** it returns exactly `[<Format-namespaced flat path>, <legacy path>]` — no nested candidate

## ADDED Requirements

### Requirement: A daily-cadence Format's Run ideas directory nests under its ISO week + a weekday-named leaf (ADR-0023)

`src/format/run-id.ts` SHALL export `runPathSegments(runId, cadence)` and `runIdeasDirFor(brand,
formatSlug, runId, cadence, brandsRoot?)` — the ONE deep function every module that reconstructs
`ideas/<format>/<run>/...` routes through (directly, or via its shared `runPathSegments` helper).
`runPathSegments` SHALL return `[runId]` for `"weekly"` cadence, UNCHANGED from every shape this
codebase used before this Requirement existed — a weekly Format's ideas directory stays
BYTE-IDENTICAL. For `"daily"` cadence it SHALL return TWO segments: the ISO week containing the Run
id's own date, then a weekday-day-month leaf — weekday and month spelled out in lowercase English, the
day zero-padded (e.g. `["2026-W33", "wednesday-12-august"]`) — computed from the Run id's OWN date.
This is the ONE function ADR-0023 authorizes to parse date semantics out of an otherwise-opaque Run
id, for path derivation only; every other reader of a Run id in this codebase keeps treating it as a
fully opaque, exact-match label. A `"daily"`-cadence Run id that does NOT parse as a real calendar
date (a hand-typed, non-standard id) SHALL degrade to the flat `[runId]` shape rather than throwing or
guessing (data-handling rule 4). `runIdeasDirFor` SHALL validate `runId` (`assertValidRunId`) before
joining it into any path, and SHALL return `join(formatIdeasRoot(brand, formatSlug, brandsRoot),
...runPathSegments(runId, cadence))`.

A companion pure predicate, `isDailyRunIdShape(runId)`, SHALL return whether `runId` is shaped like a
genuine `YYYY-MM-DD` calendar date (the ONLY shape `isoDateString`/`defaultRunId` ever produce for a
daily Run) — for use by modules (`resolveBriefPathCandidates`) that need to recognize a daily-shaped
Run id structurally, without loading the owning Format's `cadence`.

#### Scenario: A weekly Format's ideas directory is byte-identical to the pre-ADR-0023 flat shape

- **GIVEN** `brand: "straw-motion"`, `formatSlug: "unhypped-news"`, `runId: "2026-W32"`,
  `cadence: "weekly"`
- **WHEN** `runIdeasDirFor(brand, formatSlug, runId, cadence, "data/brands")` is called
- **THEN** it returns `"data/brands/straw-motion/ideas/unhypped-news/2026-W32"` — identical to
  `join(formatIdeasRoot(...), runId)`

#### Scenario: A daily Format's ideas directory nests under ISO week + weekday-DD-month (issue #185 AC1)

- **GIVEN** `brand: "straw-motion"`, `formatSlug: "unhypped-daily"`, `runId: "2026-08-12"`,
  `cadence: "daily"`
- **WHEN** `runIdeasDirFor(brand, formatSlug, runId, cadence, "data/brands")` is called
- **THEN** it returns `"data/brands/straw-motion/ideas/unhypped-daily/2026-W33/wednesday-12-august"`

#### Scenario: The ADR-0023 worked example for 2026-08-11 matches exactly

- **GIVEN** `runId: "2026-08-11"`, `cadence: "daily"`
- **WHEN** `runPathSegments(runId, cadence)` is called
- **THEN** it returns `["2026-W33", "tuesday-11-august"]`

#### Scenario: A daily-cadence Run id that isn't a real calendar date degrades to the flat shape

- **GIVEN** `runId: "smoke-test"`, `cadence: "daily"`
- **WHEN** `runPathSegments(runId, cadence)` is called
- **THEN** it returns `["smoke-test"]` without throwing

#### Scenario: A path-traversal Run id is rejected before any path join

- **GIVEN** `runId: "../../evil"`, `cadence: "daily"`
- **WHEN** `runIdeasDirFor` is called with it
- **THEN** it throws an error naming the offending Run id, before touching the filesystem

#### Scenario: isDailyRunIdShape recognizes a genuine calendar date and rejects everything else

- **GIVEN** the run ids `"2026-08-11"` (daily), `"2026-W32"` (weekly), `"2026-02-30"`
  (syntactically-shaped but calendar-invalid), and `"smoke-test"` (garbled)
- **WHEN** `isDailyRunIdShape` is called on each
- **THEN** only `"2026-08-11"` returns `true`
