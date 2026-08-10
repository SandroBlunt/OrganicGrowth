## Why

**ADR-0022** (`docs/adr/0022-cadence-is-a-format-property.md`): a Format owns its cadence — `weekly`
(the default) or `daily`. Straw Motion's new **Unhypped Daily** Format runs once per day, its Runs
named by date (`2026-08-11`), not by ISO week. Exploration for this issue confirmed no code parses
week semantics out of a Run id anywhere in the codebase — it is an opaque label, used only for exact-
match filters (`record.run === run`, `src/schedule-batch/select.ts`) and path segments — so this is a
small, contained slice: a schema field, a cadence-derived default-Run-naming function, a safety guard
that was already missing regardless of ADR-0022, and doc alignment.

## What Changes

- **`FormatFile.cadence` (`src/format/store.ts`)**: a new `"weekly" | "daily"` field, defaulting to
  `"weekly"` when the key is absent, garbled, or any value other than the exact string `"daily"`
  (case-insensitive, trimmed) — so every Format that predates this field (both real Formats today,
  `mundotip/life-hacks` and `straw-motion/unhypped-news`) parses byte-identically to before.
- **A new deep module, `src/format/run-id.ts`**, colocated with the Format module because a Run's
  DEFAULT name is a Format-cadence property (ADR-0022):
  - `RUN_ID_PATTERN` / `isValidRunId` / `assertValidRunId` — the safe-path-segment guard for a Run id,
    mirroring `BRAND_SLUG_PATTERN` (`src/brand/resolver.ts`) and `FORMAT_SLUG_PATTERN`
    (`src/format/store.ts`), but permitting the uppercase `W` a real weekly Run id carries
    (`2026-W32`). Rejects anything containing `.` (what makes `..` dangerous), `/`, `\`, or whitespace.
  - `isoWeek` (moved here from `src/commands/run-pipeline.ts`, re-exported there unchanged, so
    `/run-trends`'s weekly default and `/run-pipeline`'s `/rename` hint share ONE implementation) and
    a new sibling `isoDateString` (the ISO calendar-date string, e.g. `"2026-08-11"`) for the daily case.
  - `defaultRunId(cadence, date)` — the single function that turns a Format's `cadence` + a clock
    reading into the default Run name: the current ISO week for `"weekly"`, the current ISO date for
    `"daily"`.
- **The Run-id safety guard is wired into every place a Run id is joined into a filesystem path for
  WRITING**, before any I/O: `specPathFor` (`src/production-spec/store.ts`), `outputDirFor`
  (`src/asset/output-bundle.ts`), `castCandidatesDirFor` (`src/asset/cast-candidates.ts`), and
  `exportScheduleCommand` (`src/commands/export-schedule.ts`). One READ-only, already-documented
  "never throws" pure resolver, `resolveBriefPathCandidates` (`src/format/brief-path.ts`), instead
  DEGRADES a path-traversal `run` to `[]` (no reconstructed candidate) rather than throwing, preserving
  its existing no-throw contract while still never returning a dangerous path.
- **`/run-trends`'s documentation** (`.claude/commands/run-trends.md`) is updated to state the
  cadence-derived default Run naming and the Run-id guard explicitly, so the prompt-driven agent that
  executes this command (there is no compiled TS entry point for it — mirrors issue #53's own
  prompt-conformance testing approach) actually follows ADR-0022. `/run-pipeline`'s doc
  (`.claude/commands/run-pipeline.md`) gets one guardrail note clarifying its `/rename` hint stays a
  Brand-level (not per-Format) ISO-week suggestion, since it prints before any Format — and therefore
  any cadence — is chosen.
- **Doc wording**: always-rule 10 (`.claude/rules/always/organicgrowth-rules.md`) and CLAUDE.md's
  pipeline intro both change "one Run per week" to "one Run per cadence period per Format", citing
  ADR-0022.

## Non-Goals (explicitly out of scope for this slice)

- Creating the actual Unhypped Daily Format file (`data/brands/straw-motion/formats/unhypped-daily.yaml`)
  or setting its `lookback_days: 1` — that is real Brand configuration data, a follow-up ticket in the
  Unhypped Daily launch map, not this schema/infra slice.
- Making `/run-pipeline`'s `/rename` hint (step 3) cadence-aware — it prints BEFORE any Format is
  resolved (a Brand may run several Formats of different cadences at once), so there is no single "the"
  cadence for it to derive from; it stays a Brand-level ISO-week suggestion, documented as such.
- Guarding every string that happens to contain a Run id (e.g. `scheduleMediaKey`'s S3 object key,
  `src/schedule-batch/media-key.ts`) — that is plain string interpolation into a flat S3 namespace, not
  a `path.join` onto a local filesystem, so it carries no traversal risk; only genuine `path.join` call
  sites are guarded here.

## Capabilities

### Modified Capabilities

- `format-store`: `FormatFile` gains `cadence` (ADR-0022); a new Requirement documents the Run-id
  safety guard (`src/format/run-id.ts`), which — while it protects several modules outside this
  capability — is colocated with FormatStore because Run naming is a Format-cadence property.
- `format-scoped-trend-research`: a new Requirement documents `/run-trends`'s cadence-derived default
  Run naming (ADR-0022).

## Impact

- **New code:** `src/format/run-id.ts` (+ `src/format/run-id.test.ts`),
  `src/format/cadence-rules-wording.docs-test.ts`.
- **Modified code:** `src/format/store.ts` (+`.test.ts`) — `cadence` field + `parseCadence`;
  `src/commands/run-pipeline.ts` (+ no test changes needed — `isoWeek`'s existing import path is
  preserved via re-export) — `isoWeek` now delegates to `../format/run-id.ts`;
  `src/production-spec/store.ts` (+`.test.ts`), `src/asset/output-bundle.ts` (+`.test.ts`),
  `src/asset/cast-candidates.ts` (+`.test.ts`), `src/commands/export-schedule.ts` (+`.test.ts`) — each
  gains an `assertValidRunId` call before its Run-scoped path join; `src/format/brief-path.ts`
  (+`.test.ts`) — degrades a path-traversal `run` to `[]` instead of a dangerous path;
  `src/format/format-docs.test.ts` — a new describe block pinning `/run-trends.md`'s cadence prose;
  `.claude/commands/run-trends.md`, `.claude/commands/run-pipeline.md`,
  `.claude/rules/always/organicgrowth-rules.md`, `CLAUDE.md` — doc wording.
- **Not touched:** either real Brand's Format file (both stay weekly, unchanged — AC1),
  `CONTEXT.md` (already documents ADR-0022's cadence concept and Run-naming convention from the
  ADR-authoring commit; nothing here contradicts it), `data/queue.json` / the Production Queue shape
  (a Run id was never part of a queue job's key), any Magnific Space driver code.
- **Hermetic, no live Magnific/Apify/Zoho anywhere.** This slice touches only plain-file/string
  computation (a YAML field parse, a regex guard, a date formatter) — no Space, no MCP, no network
  call is exercised by any new or modified test.
- **Always-rules upheld:** ledger-as-source-of-truth (no ledger-writing code path is touched);
  generate-never-publish / public-metrics-only / relative-not-absolute / explicit-attribution (none of
  those code paths are touched by a Run-id-naming/validation slice).
