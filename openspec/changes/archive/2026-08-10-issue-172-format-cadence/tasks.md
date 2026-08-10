## 1. Run-id deep module: guard + cadence-derived default naming (test-first)

- [x] 1.1 Write failing tests (`src/format/run-id.test.ts`): `RUN_ID_PATTERN`/`isValidRunId` accept
  every real Run id shape on disk (`2026-W22`, `2026-W29`, `2026-W1`, a daily `2026-08-11`) and reject
  traversal/garbled shapes (`../..`, `a/b`, `a\b`, a dot); `assertValidRunId` throws naming the
  offending value; `isoWeek` reproduces the exact behavior of the function being moved out of
  `run-pipeline.ts`; `isoDateString` formats a UTC date as `YYYY-MM-DD`; `defaultRunId("weekly", date)`
  equals `isoWeek(date)` and `defaultRunId("daily", date)` equals `isoDateString(date)`.
- [x] 1.2 Implement `src/format/run-id.ts`: the guard (mirroring `FORMAT_SLUG_PATTERN`'s shape but
  permitting uppercase `W`), `isoWeek` (moved verbatim from `run-pipeline.ts`), `isoDateString`,
  `defaultRunId`. Confirm all tests from 1.1 pass.

## 2. FormatFile.cadence (test-first)

- [x] 2.1 Write failing tests (`src/format/store.test.ts`): a fully-populated raw object with
  `cadence: "daily"` parses to `format.cadence === "daily"`; the SAME object with no `cadence` key
  parses to `"weekly"`; `parseCadence` is case-insensitive/trims/defaults-to-weekly for any garbled
  value (`null`, `42`, `"monthly"`, an array); the empty-object default test asserts `cadence ===
  "weekly"`; both real Brands' loaded Formats (`mundotip/life-hacks`, `straw-motion/unhypped-news`)
  assert `cadence === "weekly"` (AC1 — unchanged behavior, no Format file edited).
- [x] 2.2 Implement `FormatCadence` type + `cadence` field on `FormatFile`, `parseCadence`, and wire it
  into `parseFormatFile` (`src/format/store.ts`). Confirm all tests from 2.1 pass, and the FULL
  existing `store.test.ts` suite still passes unmodified in behavior.

## 3. Wire the Run-id guard into every Run-scoped WRITE path (test-first)

- [x] 3.1 Write failing tests: `specPathFor` (`src/production-spec/store.test.ts`), `outputDirFor`
  (`src/asset/output-bundle.test.ts`), `castCandidatesDirFor` (`src/asset/cast-candidates.test.ts`)
  each throw, naming the offending value, for a path-traversal Run id — BEFORE returning any path.
- [x] 3.2 Implement: each function calls `assertValidRunId(run)` as its first statement. Confirm 3.1's
  tests pass and every pre-existing test in each file still passes unmodified.
- [x] 3.3 Write a failing test (`src/commands/export-schedule.test.ts`): `exportScheduleCommand` with a
  path-traversal `run` argument rejects (throws) before hosting any media or writing any file (assert
  zero `mediaHost.convertCalls`/`uploadCalls`).
- [x] 3.4 Implement: `exportScheduleCommand` calls `assertValidRunId(run)` as its first statement, before
  resolving any Brand path. Confirm 3.3 passes.
- [x] 3.5 Write a failing test (`src/format/brief-path.test.ts`): `resolveBriefPathCandidates` with a
  path-traversal `idea.run` (and no `brief_path`) returns `[]` without throwing (preserving its
  documented "never throws" contract while never returning a dangerous path).
- [x] 3.6 Implement: `resolveBriefPathCandidates` checks `isValidRunId(idea.run)` right after the
  `briefPath` short-circuit and returns `[]` early when it fails. Confirm 3.5 passes and the file's
  existing real-straw-motion-2026-W29 regression tests still pass unmodified.

## 4. Dedupe isoWeek into the shared module (no behavior change)

- [x] 4.1 Move `isoWeek`'s implementation from `src/commands/run-pipeline.ts` into
  `src/format/run-id.ts` (task 1.2); re-export it from `run-pipeline.ts` (`export { isoWeek }` after a
  local `import`) so the existing `run-pipeline.test.ts` import path (`from "./run-pipeline.ts"`) and
  the `/rename`-hint call site are both unchanged. Confirm `run-pipeline.test.ts`'s `isoWeek` describe
  block still passes unmodified — proof this is a pure relocation, not a behavior change.

## 5. Docs alignment (test-first for the core AC2 behavior; docs-test for incidental wording)

- [x] 5.1 Write failing assertions in `src/format/format-docs.test.ts` (a REGULAR `.test.ts`, since
  AC2 — "`/run-trends` on a daily Format defaults the Run name to today's date" — is a core acceptance
  criterion, mirroring this file's own existing convention for prompt-driven-agent behavior): pin that
  `run-trends.md` names `defaultRunId`/`src/format/run-id.ts`, states the weekly-ISO-week /
  daily-ISO-date defaults with a concrete `2026-08-11` example, and names `assertValidRunId` running
  BEFORE any directory is created.
- [x] 5.2 Update `.claude/commands/run-trends.md`'s usage line, Step 2, and guardrails to match; update
  its front-matter `description`. Confirm 5.1 passes.
- [x] 5.3 Update `.claude/commands/run-pipeline.md`'s guardrail list: replace "One week at a time" with
  a note that the `/rename` hint is a Brand-level ISO-week suggestion (not the per-Format Run id),
  since it prints before any Format/cadence is known.
- [x] 5.4 Write a new `.docs-test.ts` (`src/format/cadence-rules-wording.docs-test.ts`, run only via
  `npm run test:docs` — incidental documentation-wording conformance, not a core AC on its own) pinning
  that `.claude/rules/always/organicgrowth-rules.md`'s rule 10 and `CLAUDE.md`'s pipeline intro both
  read "one Run per cadence period per Format" / "per cadence period", cite ADR-0022, and no longer
  carry the old flat "one Run per week" sentence verbatim.
- [x] 5.5 Update `.claude/rules/always/organicgrowth-rules.md` rule 10 and CLAUDE.md's pipeline intro
  sentence. Confirm 5.4 passes.

## 6. Full-suite green + self-review + Build Report

- [x] 6.1 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --strict` for this change; all green.
- [x] 6.2 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #172
  acceptance criterion maps to a specific test.
- [x] 6.3 Write the Build Report into `handoff.md`.
