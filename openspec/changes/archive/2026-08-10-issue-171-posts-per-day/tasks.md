## 1. Shared derivation — `deriveScheduleSlots` gains `postsPerDay` (test-first, pure)

- [x] 1.1 Write failing tests (`schedule-batch/schedule.test.ts`, new `postsPerDay` describe block):
  omitting the argument is byte-identical to passing `1` explicitly; `postsPerDay = 6` places 6
  consecutive slots on the SAME calendar day, then rolls over on the 7th; N=7 at postsPerDay=6 spans
  exactly `ceil(7/6) = 2` distinct calendar days; N=18 at postsPerDay=6 spans exactly 3 days, 6 per day;
  same-day slots are drawn from `HOUR_MINUTE_ROTATION` in the SAME overall-index order postsPerDay=1
  already proves (rotation order preserved — compared via each slot's own Eastern-local hour/minute, not
  the differing UTC instants); pure (same inputs -> same output); a non-positive or non-integer
  `postsPerDay` throws a clear, `postsPerDay`-naming error, never silently guessing.
- [x] 1.2 Implement: add the optional third parameter, defaulting to `1`; validate it
  (`assertValidPostsPerDay`); change the day-offset from `i` to `Math.floor(i / postsPerDay)` while
  keeping the rotation index as `i % HOUR_MINUTE_ROTATION.length` (unchanged) — the ONLY behavioral
  change, and a no-op at the default.
- [x] 1.3 Update the module + function docstrings to describe `postsPerDay` and the issue #171 volume
  problem it solves.

## 2. MCP plan — `buildMcpSchedulePlan` passes `postsPerDay` through (test-first, pure)

- [x] 2.1 Write failing tests (`schedule-batch/mcp-plan.test.ts`): `postsPerDay: 6` schedules several
  eligible Assets to the SAME calendar day, matching exactly what `deriveScheduleSlots(startDate, count,
  6)` returns directly (parity assertion, mirroring the file's existing style); omitting `postsPerDay` is
  byte-identical to passing `1`.
- [x] 2.2 Implement: add the optional `postsPerDay` field to `BuildMcpSchedulePlanInput` (default `1`),
  pass it straight through to `deriveScheduleSlots` — no re-implementation.
- [x] 2.3 Update the module docstring to note `postsPerDay` is passed through, never re-implemented.

## 3. CSV/S3 fallback path — `exportScheduleCommand` + its CLI wrapper (test-first)

- [x] 3.1 Write failing tests (`commands/export-schedule.test.ts`): 7 eligible Assets at
  `options.postsPerDay: 6` schedule across exactly `ceil(7/6) = 2` distinct calendar days, each Asset's
  stamped `scheduled_at` matching `deriveScheduleSlots(startDate, 7, 6)` exactly, in Idea-number order;
  omitting `postsPerDay` reproduces the existing happy-path test's exact byte-for-byte schedule time.
- [x] 3.2 Implement: add optional `options.postsPerDay` to `ExportScheduleOptions` (default `1`), thread
  to `deriveScheduleSlots`.
- [x] 3.3 Write failing tests for the CLI boundary: a new pure, exported `parsePostsPerDayArg` helper —
  omitted -> `1`; a valid digit string -> that integer; `"0"`, a negative, a non-integer, or a
  non-numeric string -> `null`; `main()` prints a clear usage error and exits non-zero for a malformed
  5th argument, without changing the existing "missing one of the first 4 arguments" usage-error test.
- [x] 3.4 Implement `parsePostsPerDayArg` and wire it into `main()`; update the usage message to show the
  optional 5th argument.
- [x] 3.5 Update `.claude/commands/export-schedule.md`'s usage line and derivation description; confirm
  `commands/export-schedule.docs-test.ts` stays green, unmodified.

## 4. MCP-primary path — `scheduleViaZohoMcpCommand` (test-first)

- [x] 4.1 Write a failing integration test (`commands/schedule-via-zoho-mcp.test.ts`): 3 eligible Assets
  at `options.postsPerDay: 6` all schedule to the SAME calendar day, at exactly the same slots
  `deriveScheduleSlots(startDate, 3, 6)` returns directly — proving the MCP path honors the SAME shared
  derivation as the CSV path, never a second, independently-computed schedule.
- [x] 4.2 Implement: add optional `options.postsPerDay` to `ScheduleViaZohoMcpOptions` (default `1`),
  thread to `buildMcpSchedulePlan`.
- [x] 4.3 Update the module docstring.

## 5. OpenSpec

- [x] 5.1 Author `proposal.md`, this `tasks.md`, and the MODIFIED spec deltas for `schedule-batch-export`,
  `schedule-batch-mcp-plan`, and `schedule-batch-mcp-scheduling` (each reproducing its existing
  Requirement's exact name verbatim from `openspec/specs/`, per the repo's archive convention).
- [x] 5.2 `npx openspec validate issue-171-posts-per-day --strict` green.

## 6. Self-review

- [x] 6.1 `npm test` green (type-check + full unit suite); `npm run test:docs` green; `npm run build`
  green.
- [x] 6.2 Simplify / dead-code pass; confirm every issue #171 acceptance criterion maps to a named test;
  confirm no live `spaces_*`/`creations_*`/Zoho-MCP call anywhere in the new/changed tests (fakes only:
  `FakeMediaHost`, `FakeZohoSchedulePort`).
- [x] 6.3 Write the Build Report into `handoff.md`.
