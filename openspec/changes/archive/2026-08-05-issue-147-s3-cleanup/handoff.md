# Slice Handoff — issue #147: Schedule Batch: manifest-driven S3 cleanup (auto at next export + standalone)

## Build Report (developer, Round 1)

### What changed and why

Parent #140 (the Schedule Batch spec) decided the manifest `/export-schedule` writes (issue #145) IS the
cleanup contract: per Asset, its scheduled time and its hosted S3 object keys. Issue #147 builds the
cleanup itself: a manifest-driven pass that deletes hosted media once its Asset's scheduled time is more
than a day past — delete late, never early, since whether Zoho fetches media at CSV-upload or at posting
time is unconfirmed (PRD #140's own note) — running automatically at the start of the next
`/export-schedule` and standalone via a new `/cleanup-schedule-media <brand>` command.

Three new modules, plus two small extensions to the existing #145 code:

- `src/schedule-batch/cleanup.ts` — the PURE decision module: `isDueForCleanup(scheduledAt, nowMs)`
  (strictly more than 1 day past only — exactly 1 day, less, or future is never due; a genuinely
  unparseable `scheduledAt` is never due either, never fabricated) and `planManifestCleanup(targets,
  nowMs)` (returns exactly the due, not-yet-cleaned entries across every given manifest, judged
  independently — an already-`cleaned_at` entry is never re-planned even if it would otherwise be due).
  No I/O, no clock read — `nowMs` is always the caller's explicit argument, mirroring `schedule.ts`'s
  `validateSlotsFuture`.
- `src/schedule-batch/cleanup-runner.ts` — the thin I/O shell, `runScheduleCleanup(brand, options)`:
  recursively finds every `zoho-manifest.json` under a Brand's `ideas/` tree (covering both
  Format-namespaced runs and any legacy pre-Format run), reads each manifest's cleanup-relevant view
  defensively (a missing/garbled manifest, or one garbled entry, is skipped rather than crashing the
  whole scan), decides what's due via the pure module, deletes each due entry's hosted keys through the
  injected `MediaHostPort`, and records the removal by patching ONLY that entry's `cleaned_at`
  (ISO-8601) onto its own manifest file's raw JSON — every other field/entry stays byte-for-byte as-is
  (mirrors `AssetStore.writeAsset`'s own raw-merge write style). Never writes to the ledger — cleanup is
  infrastructure housekeeping about S3 objects/the manifest, entirely separate from an Asset's `status`
  lifecycle (ADR-0011).
- `src/commands/cleanup-schedule-media.ts` — the standalone `/cleanup-schedule-media <brand>` command: a
  thin orchestration shell wrapping `runScheduleCleanup`, with its own deferred-default
  (throws-only-if-actually-invoked) `MediaHostPort` placeholder mirroring `/export-schedule`'s own
  `DEFAULT_MEDIA_HOST`.
- `src/schedule-batch/manifest.ts` — extended `ScheduleManifestAssetEntry` with an optional
  `cleaned_at?: string`, written only by cleanup, never by `buildManifest`.
- `src/commands/export-schedule.ts` — wired to run `runScheduleCleanup` for the WHOLE Brand (every run,
  every Format, not just the one being exported) FIRST, automatically, before loading this run's own
  Ideas at all — using the SAME injected Media Host and clock. A non-empty cleanup result is prepended
  to the report; an empty one adds no noise to routine output.

### Files touched

New:
- `src/schedule-batch/cleanup.ts` (+ `cleanup.test.ts`)
- `src/schedule-batch/cleanup-runner.ts` (+ `cleanup-runner.test.ts`)
- `src/commands/cleanup-schedule-media.ts` (+ `.test.ts`, `.docs-test.ts`)
- `.claude/commands/cleanup-schedule-media.md`
- `openspec/changes/issue-147-s3-cleanup/{proposal.md,tasks.md,handoff.md,specs/schedule-batch-cleanup/spec.md,specs/schedule-batch-export/spec.md,specs/brand-commands/spec.md}`

Modified:
- `src/schedule-batch/manifest.ts` — adds the optional `cleaned_at` field only; `buildManifest`'s
  behavior is unchanged (confirmed: its existing `manifest.test.ts` passes unmodified).
- `src/commands/export-schedule.ts` (+ `.test.ts`, `.docs-test.ts`) — wires the automatic cleanup call.
- `.claude/commands/export-schedule.md` — documents the new automatic cleanup step.
- `package.json` — adds the `cleanup-schedule-media` npm script only.

`git status --short` confirms exactly this list; no file under `src/asset/**`, `src/ledger/**`,
`src/media-host/**`, `src/production-spec/**`, `src/space-driver/**`, or `data/**` was touched (this
slice consumes `MediaHostPort`/`AssetStore` read-only, via their existing typed boundaries).

### How to run

- Full suite (type-check + tests): `npm test` — **1861 passing / 0 failing / 480 suites** (baseline
  before this slice: 1836 passing / 476 suites — this slice adds **25 tests across 4 new suites**, plus
  2 new tests inside the pre-existing `export-schedule.test.ts` suite).
- Docs tests: `npm run test:docs` — **155 passing / 0 failing / 38 suites** (baseline: 147/37 — this
  slice's `cleanup-schedule-media.docs-test.ts` adds 7 tests in 1 new suite, plus 1 new test inside the
  pre-existing `export-schedule.docs-test.ts` suite).
- Build: `npm run build` — clean.
- OpenSpec: `npx openspec validate issue-147-s3-cleanup --strict` — valid.
- Single-module runs (test-first granularity):
  - `node --import tsx --test src/schedule-batch/cleanup.test.ts` — 11 passing (2 suites:
    `isDueForCleanup`, `planManifestCleanup`)
  - `node --import tsx --test src/schedule-batch/cleanup-runner.test.ts` — 7 passing
  - `node --import tsx --test src/commands/cleanup-schedule-media.test.ts` — 5 passing
  - `node --import tsx --test src/commands/export-schedule.test.ts` — 9 passing (7 pre-existing + 2 new)
  - `node --import tsx --test src/commands/cleanup-schedule-media.docs-test.ts` — 7 passing (via
    `npm run test:docs`, not `npm test`)

### Acceptance-criteria self-assessment

1. **"Given fixture manifests with a mix of past and future scheduled times, exactly the
   more-than-1-day-past objects are deleted on the fake Media Host, and the removals are recorded."**
   - Unit level (the decision): `cleanup.test.ts`'s "returns exactly the more-than-1-day-past,
     not-yet-cleaned entries" (mixed past/future/boundary entries, only the due one comes back) and
     "is due when scheduled more than 1 day in the past" / boundary tests.
   - I/O-shell level: `cleanup-runner.test.ts`'s "deletes exactly the more-than-1-day-past objects and
     leaves the rest untouched" — a fixture manifest with 4 entries (more-than-1-day-past,
     exactly-1-day-past, less-than-1-day-past, future) asserts the `FakeMediaHost`'s `deleteCalls` is
     EXACTLY the due entry's 2 keys, and re-reads the manifest file from disk to confirm ONLY that
     entry gained `cleaned_at` — the other 3 entries' records are unchanged (this IS "the removals are
     recorded": a durable, on-disk `cleaned_at` timestamp plus the returned `CleanupAction` list).
   - End-to-end (both callers): `cleanup-schedule-media.test.ts`'s "scans, deletes the due objects, and
     reports what was removed" and `export-schedule.test.ts`'s "runs cleanup FIRST, automatically: a
     stale prior run's hosted media is removed before this export does anything" (asserts the exact
     `deleteCalls` array and the re-read `cleaned_at` on-disk).

2. **"Media scheduled less than or exactly 1 day ago, or in the future, is never touched."**
   - `cleanup.test.ts`'s "is NOT due when scheduled exactly 1 day in the past (boundary — never
     touched)", "is NOT due when scheduled less than 1 day in the past", "is NOT due when scheduled in
     the future".
   - `cleanup-runner.test.ts`'s same happy-path test asserts the exactly-1-day / less-than-1-day /
     future entries' keys never appear in `deleteCalls` and their manifest records stay
     `cleaned_at: undefined`.
   - `export-schedule.test.ts`'s "auto-cleanup never touches a prior run's manifest entry scheduled
     less than or exactly 1 day ago, or in the future" — asserts zero delete calls and no `cleaned_at`
     written for that entry.

3. **"The export runs cleanup first automatically; the standalone trigger works on its own."**
   - Automatic: `export-schedule.test.ts`'s "runs cleanup FIRST, automatically" test proves a STALE
     PRIOR run's manifest (elsewhere under the same Brand's ideas tree) gets cleaned as part of a call
     to `exportScheduleCommand` for a DIFFERENT, unrelated (empty) run — the cleanup demonstrably ran
     even though this run itself had nothing to export, and used the SAME injected Media Host/clock.
   - Standalone: `cleanup-schedule-media.test.ts`'s full suite (scans/deletes/reports; "nothing to
     clean" when nothing is due; "no manifests found" for an empty Brand; `main()`'s usage-error path)
     proves `/cleanup-schedule-media <brand>` runs the identical `runScheduleCleanup` function entirely
     on its own, with no dependency on `/export-schedule` ever having been called in the same process.

### Fakes / fixtures used

- **`FakeMediaHost` (`src/media-host/fixtures/fake-media-host.ts`, issue #144) — THE MAGNIFIC-ADJACENT
  FAKE FLAG: NOT APPLICABLE — this is the Media Host fake, not a Magnific fake.** No Magnific
  interaction of any kind exists in this slice. Confirmed:
  `grep -rn "spaces_\|creations_\|FakeSpace\|SpaceMcpPort" src/schedule-batch/cleanup*.ts
  src/commands/cleanup-schedule-media*.ts` → NO matches. `FakeMediaHost` performs no real file I/O and
  no network call — it only records `(sourcePath, destPath)`/`(localPath, key)`/`key` arguments; used in
  every test in this slice that exercises deletion.
- **Real, tiny on-disk manifest JSON fixtures** (`mkdtemp` + real files, mirroring #145's own fixture
  style) — each test builds its own isolated temp directory tree of `zoho-manifest.json` files at the
  exact on-disk shape `/export-schedule` produces, with hand-set `scheduled_at` values computed relative
  to a fixed `NOW` so every boundary (exactly-1-day, just-over, just-under, future) is deterministic and
  never depends on the host machine's real wall-clock time.
- `grep -rln "execFileRunner\|LiveMediaHost\|aws s3" src/schedule-batch/cleanup*.ts
  src/commands/cleanup-schedule-media*.ts src/commands/export-schedule.ts` → matches only inside
  `noMediaHostConfigured()`'s thrown error MESSAGE text (a pointer for a future live caller) in
  `export-schedule.ts` and `cleanup-schedule-media.ts` — `LiveMediaHost` is never imported or called
  anywhere in this slice's code or tests. Fully hermetic: no live S3/AWS-CLI call anywhere in the suite.

### Self-review notes

- Considered giving `runScheduleCleanup` a batched (per-manifest, not per-action) write-back to reduce
  read-modify-write round-trips when a single manifest has multiple due entries. Kept it PER-ACTION
  (immediate, right after that action's own deletes) instead: it makes the failure story trivially safe
  — if a Media Host call throws partway through a batch, every entry that had ALREADY, genuinely,
  succeeded is ALREADY recorded, and nothing is lost; a later retry only re-processes what's left
  (safe, since `delete` is documented idempotent). Documented this trade-off directly in the module doc.
- Considered folding the manifest's cleanup-relevant read (`readCleanupTarget`) through the SAME typed
  `ScheduleManifest`/`ScheduleManifestAssetEntry` shape `manifest.ts` already exports, via a full
  `parseManifest` round-trip. Deliberately did NOT: the write-back (`recordManifestCleanup`) patches the
  RAW JSON directly (mirroring `AssetStore.writeAsset`'s own style) specifically so that fields this
  module doesn't know about (`rows`, `urls`, `stripped_notes`, …) are NEVER at risk of being dropped by
  a lossy typed round-trip; keeping the READ side narrow too (`CleanupCandidateEntry`, only the 5 fields
  cleanup actually needs) keeps both sides of that boundary honest about what they touch.
- Re-read `export-schedule.ts`'s existing `ExportScheduleOptions.ideasRoot` doc comment carefully before
  wiring cleanup's scan root: that option is documented as "the run folder's PARENT directory (normally
  `<brand ideas root>/<format>`)" — one level BELOW the Brand-wide root cleanup needs to scan. Computed
  `dirname(options.ideasRoot)` for the override case (this is provably equal to
  `resolveBrand(...).ideasRoot` in the non-overridden case too — confirmed by the existing test
  fixtures' own directory layout) rather than adding a second, easily-confused `ideasRoot`-shaped option
  to `ExportScheduleOptions` itself.
- Verified the empty-cleanup-result report line is OMITTED entirely (not "Cleanup: 0 removed") so the
  overwhelming common case (nothing due yet) never adds noise to every routine `/export-schedule` run's
  output — confirmed by the pre-existing `export-schedule.test.ts` scenarios (happy path, empty run, no
  Zoho config, 1-hour-lead refusal, re-run no-op) all still passing UNCHANGED with no new assertions
  needed against a "Cleanup:" line that isn't there.

### Known limits

- **No live default `MediaHostPort` wiring**, for both `/cleanup-schedule-media` and the cleanup call
  inside `/export-schedule` — mirrors `/export-schedule`'s own already-accepted, already-documented
  limit (issue #145's Known Limits). A caller wires `LiveMediaHost` (issue #144) explicitly via
  `options.mediaHost`.
- **The 30-day S3 bucket lifecycle rule is NOT code** — deliberately, per the issue's own instruction
  ("stays a documented one-time setup step... not code"). It is documented (already live on the bucket,
  per PRD #140's own record) as the backstop for an abandoned batch; this slice's cleanup is the everyday
  path, not a replacement for it.
- **Cleanup never touches the ledger** — by design (hosted-media cleanup is infrastructure housekeeping,
  not an Asset status change; ADR-0011's lifecycle is untouched). If a future need arises to surface
  "this Asset's hosted media has been cleaned up" on the ledger itself, that would be a separate,
  deliberate decision — not silently introduced here.
- **A garbled individual manifest ENTRY inside an otherwise-good manifest is silently skipped** (never
  invented, never crashes) — consistent with data-handling rule 4, but means a hand-corrupted single
  entry produces no explicit warning in the returned report today. Not required by the issue's
  acceptance criteria; a future slice could add an explicit "N entries skipped as unreadable" note if
  that visibility is wanted.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (type-check via `tsc --noEmit` then the full `node --test` suite): **1861 passing / 0
  failing / 480 suites**, `duration_ms ≈ 6949`. Matches the Build Report's claimed baseline-plus-25-tests
  exactly.
- `npm run test:docs`: **155 passing / 0 failing / 38 suites**. Matches the Build Report's claim.
- `npx openspec validate issue-147-s3-cleanup --strict` → `Change 'issue-147-s3-cleanup' is valid`.
- `npm run build` → clean, no errors.
- Also re-ran the 4 new/changed suites in isolation
  (`src/schedule-batch/cleanup.test.ts`, `src/schedule-batch/cleanup-runner.test.ts`,
  `src/commands/cleanup-schedule-media.test.ts`, `src/commands/export-schedule.test.ts`) —
  **32 passing / 0 failing / 5 suites**.
- Blocker check: issue #145 (`/export-schedule` tracer bullet) is `CLOSED` on GitHub — pre-flight
  condition satisfied.

All commands were run exactly as documented in the Build Report's "How to run" section; every result was
actually green, not assumed.

### Per-criterion results (issue #147 acceptance criteria)

1. **"Given fixture manifests with a mix of past and future scheduled times, exactly the
   more-than-1-day-past objects are deleted on the fake Media Host, and the removals are recorded."**
   **PASS.** Proven at three levels: `src/schedule-batch/cleanup.test.ts` ("returns exactly the
   more-than-1-day-past, not-yet-cleaned entries" — mixed past/less-than-1-day/future entries, asserts
   only the due one is returned); `src/schedule-batch/cleanup-runner.test.ts` ("deletes exactly the
   more-than-1-day-past objects and leaves the rest untouched" — a 4-entry fixture manifest
   more-than-1-day/exactly-1-day/less-than-1-day/future, asserts `FakeMediaHost.deleteCalls` is EXACTLY
   the due entry's 2 keys, and re-reads the manifest file from disk confirming ONLY that entry gained
   `cleaned_at`); `src/commands/cleanup-schedule-media.test.ts` and the new tests in
   `src/commands/export-schedule.test.ts` prove the same end-to-end through both callers. "Recorded"
   is satisfied concretely: a durable on-disk `cleaned_at` ISO timestamp plus the returned
   `CleanupAction[]` used for the report.
2. **"Media scheduled less than or exactly 1 day ago, or in the future, is never touched."** **PASS.**
   `cleanup.test.ts`'s three dedicated boundary tests ("NOT due exactly 1 day", "NOT due less than 1
   day", "NOT due in the future") plus a `CLEANUP_AFTER_MS`-equals-1-day sanity test; the
   `isDueForCleanup` implementation uses strict `>` (not `>=`), verified by reading
   `src/schedule-batch/cleanup.ts:29`. `cleanup-runner.test.ts`'s happy-path test asserts the boundary/
   less-than/future entries' keys never appear in `deleteCalls` and their `cleaned_at` stays `undefined`.
   `export-schedule.test.ts`'s "auto-cleanup never touches a prior run's manifest entry scheduled less
   than or exactly 1 day ago, or in the future" asserts zero delete calls and no `cleaned_at` written.
3. **"The export runs cleanup first automatically; the standalone trigger works on its own."** **PASS.**
   Automatic: `export-schedule.ts` calls `runScheduleCleanup` as step 0, before loading this run's own
   Ideas at all (confirmed by reading the diff — the cleanup call sits above "1. Load this run's Ideas");
   `export-schedule.test.ts`'s "runs cleanup FIRST, automatically" test proves a STALE PRIOR run's
   manifest (a sibling run folder under the same Brand's ideas tree) gets cleaned during a call to
   `exportScheduleCommand` for a different, empty run, using the SAME injected Media Host/clock.
   Standalone: `cleanup-schedule-media.test.ts`'s full suite proves `/cleanup-schedule-media <brand>`
   invokes `runScheduleCleanup` directly with no dependency on `/export-schedule` ever having run in the
   same process.

### Per-scenario results (spec deltas)

**`schedule-batch-cleanup` (ADDED)** — all Scenarios pass, each traced to a real, executed test:
- "An entry scheduled more than 1 day in the past is due" → `cleanup.test.ts` line 15-17. PASS.
- "…exactly 1 day in the past is NOT due (boundary)" → `cleanup.test.ts` line 19-21. PASS.
- "…less than 1 day in the past is NOT due" → `cleanup.test.ts` line 23-25. PASS.
- "…in the future is NOT due" → `cleanup.test.ts` line 27-29. PASS.
- "A garbled, unparseable scheduled_at is NOT due" → `cleanup.test.ts` line 31-34 (also confirmed
  `Number.isFinite(scheduledMs)` guard in `cleanup.ts:28`). PASS.
- "Returns exactly the due, not-yet-cleaned entries across mixed inputs" → `cleanup.test.ts` line 42-79.
  PASS.
- "An already-cleaned entry is never re-planned, even if it would otherwise be due" →
  `cleanup.test.ts` line 81-100, and `cleanup-runner.test.ts`'s idempotent re-run test. PASS.
- "Every manifest target is judged independently across multiple manifests" → `cleanup.test.ts`
  line 102-134. PASS.
- "Deletes exactly the more-than-1-day-past objects and leaves the rest untouched" →
  `cleanup-runner.test.ts` line 52-112. PASS.
- "A re-run never re-deletes an already-cleaned entry (idempotent)" → `cleanup-runner.test.ts`
  line 114-137. PASS.
- "Scans recursively across both Format-namespaced and legacy run folders" → `cleanup-runner.test.ts`
  line 139-169. PASS.
- "A garbled manifest file never crashes the whole scan" → `cleanup-runner.test.ts` line 171-194. PASS.
- "The Brand's ledger is never written by cleanup" → confirmed by code inspection (no `ledger`/
  `Ledger`/`AssetStore` import anywhere in `cleanup.ts`/`cleanup-runner.ts` — `grep` below) and by
  every runner test never touching a ledger fixture at all. PASS (via inspection; not a dedicated
  assertion, but the module genuinely has no code path that could write the ledger).
- "Reports the removed Assets by Idea, Recipe, scheduled time, and object count" →
  `cleanup-schedule-media.test.ts` line 37-56. PASS.
- "Reports 'nothing to clean' when manifests exist but nothing is due" → `cleanup-schedule-media.test.ts`
  line 58-74. PASS.
- "Reports no manifests found for a Brand with none at all" → `cleanup-schedule-media.test.ts`
  line 76-86. PASS.
- "The CLI entry requires an explicit Brand" → `cleanup-schedule-media.test.ts` line 88-109. PASS.

**`schedule-batch-export` (MODIFIED)** — all pre-existing Scenarios still pass unchanged (happy path,
empty run, no Zoho config, 1-hour-lead refusal, re-run no-op — re-ran individually, all green); the two
new Scenarios ("runs cleanup first, automatically" and "auto-cleanup never touches a not-due entry") are
proven by the two new tests in `export-schedule.test.ts` line 372-475. PASS.

**`brand-commands` (MODIFIED)** — "`/cleanup-schedule-media` requires an explicit Brand argument" →
`cleanup-schedule-media.test.ts`'s `main()` usage-error test. PASS. The other Scenarios in this spec
delta (`/report`, `/pick-cast`, `/export-schedule`) are pre-existing and unaffected by this slice; spot
checked they still pass in the full suite run above.

### Always-rules + Magnific-fake checks

- **Magnific fake / no live Space calls.** `grep -rn "spaces_\|creations_\|FakeSpace\|SpaceMcpPort"
  src/schedule-batch/cleanup*.ts src/commands/cleanup-schedule-media*.ts src/commands/export-schedule.ts
  src/commands/export-schedule.test.ts src/commands/export-schedule.docs-test.ts` → **no matches**. This
  slice has no Magnific involvement at all (it is Media-Host-only, issue #144's port). PASS.
- **No live Media Host / AWS CLI call.** `grep -rn "execFileRunner\|LiveMediaHost\|aws s3"
  src/schedule-batch/cleanup*.ts src/commands/cleanup-schedule-media*.ts src/commands/export-schedule.ts`
  → only matches inside a thrown error MESSAGE string (`noMediaHostConfigured()`), never an actual
  import/call. `FakeMediaHost` (`src/media-host/fixtures/fake-media-host.ts`) is confirmed in-memory only
  (no `fs`/`child_process`/network import) and is what every test in this slice injects. PASS.
- **Generate-never-publish (ADR-0002).** Cleanup only deletes previously-hosted S3 objects and patches a
  manifest's own `cleaned_at` field; it never calls Zoho/Facebook/any platform API, never marks an Asset
  `posted`, never writes `ledger.json`. Confirmed by code inspection of `cleanup.ts`/`cleanup-runner.ts`/
  `cleanup-schedule-media.ts` (no `ledger`, no `AssetStore`, no platform-API import anywhere) and by the
  docs-test asserting the command doc states this. PASS.
- **Public-metrics-only.** N/A — no metrics code path in this slice. PASS (vacuously).
- **Relative-not-absolute.** N/A — no scoring/comparison in this slice. PASS (vacuously).
- **Explicit-attribution.** Every cleanup action is keyed to its own already-known `(idea, recipe)`
  manifest entry (read straight off the manifest `runScheduleCleanup` scans), never inferred or
  guessed — confirmed in `readCleanupTarget`/`planManifestCleanup`/`CleanupAction`. PASS.
- **Ledger-as-source-of-truth.** Confirmed `ledger.json` is never opened by any file this slice adds or
  touches (`grep -rln "ledger" src/schedule-batch/cleanup*.ts src/commands/cleanup-schedule-media*.ts` →
  matches only inside docstrings/doc-test assertions stating the ledger is NOT touched, never an actual
  read/write call). This is by design and consistent with ADR-0011 (hosted-media cleanup is
  infrastructure housekeeping about S3 objects/the manifest, not an Asset status transition) — not a
  violation of the rule. PASS.

### OpenSpec-vs-issue faithfulness (job c)

Read `proposal.md`, `tasks.md`, and all three spec deltas
(`schedule-batch-cleanup`/`schedule-batch-export`/`brand-commands`) against the issue body. The 1-day
strict-inequality cutoff, "delete late never early", "runs automatically at the start of the next export
and standalone", and "removals are recorded" are all faithfully carried from the issue into the
Requirements/Scenarios, with no scope drift. The issue's explicit non-goal ("the 30-day bucket expiry
rule stays a documented one-time setup step... not code") is correctly honored — no bucket-lifecycle code
was added; the proposal's own "Non-Goals" section states this explicitly and no test/spec Scenario
contradicts it. No misread or self-consistent-but-wrong spec found: the ADDED capability's Requirements
map 1:1 onto the three acceptance criteria, and the MODIFIED `schedule-batch-export`/`brand-commands`
deltas correctly scope the change to "auto-cleanup wiring" and "one more command needs an explicit Brand"
without altering any pre-existing, unrelated behavior (confirmed the five pre-existing `export-schedule`
Scenarios' tests are untouched and still green).

### Defect list

None.

### Notes

- One minor observation (not a defect): the "ledger is never written" Scenario in the
  `schedule-batch-cleanup` spec has no single dedicated assertion of "no ledger.json write occurred" in
  a test (it is proven by the complete absence of any ledger-writing code path, verified by code
  inspection/grep rather than a runtime assertion). This is adequate given the module genuinely imports
  nothing ledger-related, but a future slice could add a belt-and-suspenders assertion (e.g. asserting a
  ledger fixture file's mtime/content is unchanged across a `runScheduleCleanup` call) if stronger
  regression protection is wanted. Does not affect the PASS verdict.
