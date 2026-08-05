## 1. Cleanup decision (test-first, pure)

- [x] 1.1 Write failing tests (`schedule-batch/cleanup.test.ts`): `isDueForCleanup` is due when more
  than 1 day past, NOT due exactly at 1 day (boundary), NOT due less than 1 day past, NOT due for a
  future time, NOT due for a garbled/unparseable `scheduled_at` (never fabricate); `planManifestCleanup`
  returns exactly the due/not-yet-cleaned entries, never touches an already-cleaned entry even if due,
  judges every manifest independently, returns `[]` for empty input, is pure.
- [x] 1.2 Implement `CLEANUP_AFTER_MS`/`isDueForCleanup`/`planManifestCleanup`
  (`schedule-batch/cleanup.ts`).

## 2. Manifest shape — the cleanup record (test-first)

- [x] 2.1 Extend `ScheduleManifestAssetEntry` with optional `cleaned_at?: string` (`schedule-batch/
  manifest.ts`), documented as written ONLY by cleanup, never `buildManifest`. Existing
  `manifest.test.ts` continues to pass unchanged (the field is optional, `buildManifest` never sets it).

## 3. Cleanup runner — the I/O shell (test-first)

- [x] 3.1 Write failing tests (`schedule-batch/cleanup-runner.test.ts`) against fixture manifest trees
  (temp dirs, a `FakeMediaHost`): deletes exactly the more-than-1-day-past objects and leaves the
  boundary (exactly 1 day), the less-than-1-day, and the future entries untouched; records `cleaned_at`
  on the cleaned entry only; a re-run never re-deletes an already-cleaned entry (idempotent, no
  double-delete); scans recursively across BOTH Format-namespaced and legacy (un-namespaced) run
  folders; a garbled manifest file never crashes the scan (other manifests still get cleaned); returns
  zero scanned/zero actions for no manifests at all, and for a not-yet-existing ideas root; every OTHER
  field of a cleaned manifest entry (and every other manifest) stays byte-for-byte untouched.
- [x] 3.2 Implement `findManifestFiles`/`readCleanupTarget`/`recordManifestCleanup`/
  `runScheduleCleanup` (`schedule-batch/cleanup-runner.ts`), reusing `cleanup.ts`'s pure decision logic
  — never re-implementing it.

## 4. The standalone command — `/cleanup-schedule-media` (test-first)

- [x] 4.1 Write failing tests (`commands/cleanup-schedule-media.test.ts`): scans, deletes the due
  objects, and reports what was removed (naming the Idea, not the not-due one); reports "nothing to
  clean" when nothing is due; reports "no manifests found" when there are none at all; `main()` prints a
  usage error and exits non-zero when `<brand>` is missing; the default (unconfigured) Media Host is
  never invoked when nothing is due, and DOES throw when something is (cross-check).
- [x] 4.2 Implement `cleanupScheduleMediaCommand`/`main` (`commands/cleanup-schedule-media.ts`): a thin
  shell over `runScheduleCleanup`, with its own deferred-default `MediaHostPort` placeholder (mirrors
  `/export-schedule`'s `DEFAULT_MEDIA_HOST`).
- [x] 4.3 Add the `cleanup-schedule-media` npm script (`package.json`).

## 5. Wire the automatic cleanup into `/export-schedule` (test-first)

- [x] 5.1 Write failing tests (extend `commands/export-schedule.test.ts`): cleanup runs FIRST,
  automatically — a stale PRIOR run's manifest (elsewhere under the Brand's ideas tree) gets its hosted
  media removed before this run's own export logic does anything, using the SAME injected Media Host;
  a prior run's entry scheduled less than or exactly 1 day ago, or in the future, is never touched by
  the auto-cleanup step.
- [x] 5.2 Implement the wiring in `exportScheduleCommand` (`commands/export-schedule.ts`): compute the
  Brand-level ideas root to scan (the parent of the run-scoped `ideasRoot`, or `resolveBrand(...)
  .ideasRoot`), call `runScheduleCleanup` before loading this run's Ideas, and prepend a non-empty
  cleanup summary to the report (an empty result adds no noise).

## 6. Docs

- [x] 6.1 Write `.claude/commands/cleanup-schedule-media.md`, matching the `export-schedule.md` pattern.
- [x] 6.2 Write failing tests (`commands/cleanup-schedule-media.docs-test.ts`) proving the doc names the
  real code (shell + runner + pure module), documents the delete-late-never-early rule + the 1-day
  cutoff, the 30-day bucket lifecycle rule as a documented setup step (not code), the `cleaned_at`
  recording/idempotency, the hermetic FAKE Media Host, and that this command never publishes/never
  touches the ledger — then make the doc satisfy them.
- [x] 6.3 Extend `.claude/commands/export-schedule.md` to document the automatic cleanup step; extend
  `commands/export-schedule.docs-test.ts` with a test proving it.

## 7. OpenSpec

- [x] 7.1 Author `proposal.md`, this `tasks.md`, and the spec deltas: ADDED `schedule-batch-cleanup`,
  MODIFIED `schedule-batch-export` (auto-cleanup-first + the manifest's `cleaned_at` field), MODIFIED
  `brand-commands` (adds `/cleanup-schedule-media` to the explicit-`<brand>`-required list).
- [x] 7.2 `npx openspec validate issue-147-s3-cleanup --strict` green.

## 8. Self-review

- [x] 8.1 `npm test` green (type-check + full suite); `npm run build` green; `npm run test:docs` green.
- [x] 8.2 Simplify / dead-code pass; confirm every issue #147 acceptance criterion maps to a named test;
  confirm no live `spaces_*`/`creations_*`/S3/AWS-CLI call anywhere in the new test suite.
- [x] 8.3 Write the Build Report into `handoff.md`.
