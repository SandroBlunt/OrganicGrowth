## Why

Parent #140 (the Schedule Batch spec) decided the manifest each `/export-schedule` run writes IS the
cleanup contract: per Asset, its scheduled time and its hosted S3 object keys, so a later pass knows
exactly what to delete and when it is safe. Issue #145 built the export that writes that manifest; #147
is the cleanup itself — a manifest-driven pass that deletes hosted media once its Asset's scheduled time
is more than a day past, running automatically at the start of the next export and standalone on demand,
so published media never lingers on S3 without the Operator having to remember a separate step.

## What Changes

- **Add a pure decision module** (`src/schedule-batch/cleanup.ts`): `isDueForCleanup(scheduledAt, nowMs)`
  — an Asset entry is due only when `nowMs` is STRICTLY more than `CLEANUP_AFTER_MS` (1 day) past its
  `scheduled_at`; an entry scheduled less than or exactly 1 day ago, or still in the future, is never
  due. `planManifestCleanup(targets, nowMs)` — given already-loaded manifest cleanup views, returns
  exactly the entries that are due AND not already recorded as cleaned. Both are PURE: no I/O, no clock
  read (`nowMs` is always the caller's explicit argument, mirroring `schedule.ts`'s
  `validateSlotsFuture`).
- **Add the cleanup runner** (`src/schedule-batch/cleanup-runner.ts`), the thin I/O shell shared by both
  callers below: `runScheduleCleanup(brand, options)` recursively finds every `zoho-manifest.json` under
  a Brand's `ideas/` tree (covering both Format-namespaced runs and any legacy pre-Format run — CLAUDE.md's
  "Legacy layout note"), extracts each manifest's cleanup-relevant view defensively (a missing/garbled
  manifest, or a garbled individual entry, is skipped rather than crashing the scan — data-handling rule
  4), decides what's due via `planManifestCleanup`, deletes each due entry's hosted keys through the
  injected `MediaHostPort` (issue #144's fake in every test), and records the removal by patching ONLY
  that entry's raw JSON with a `cleaned_at` (ISO-8601) timestamp — every other field, and every other
  manifest, left byte-for-byte untouched (mirrors `AssetStore.writeAsset`'s own raw-merge write style).
  Each due entry is recorded immediately after its own keys are deleted (never batched across a whole
  manifest), so a Media Host failure partway through a batch never loses the record of entries that
  already, genuinely, succeeded.
- **Extend the manifest shape** (`src/schedule-batch/manifest.ts`): `ScheduleManifestAssetEntry` gains an
  optional `cleaned_at?: string` field — written ONLY by the cleanup runner, never by `buildManifest`
  (an export never writes an already-cleaned entry).
- **Add the standalone command** `/cleanup-schedule-media <brand>`
  (`src/commands/cleanup-schedule-media.ts`) — a thin orchestration shell wrapping
  `runScheduleCleanup`, reporting how many manifests were scanned and, per removed Asset, its Idea/
  Recipe, scheduled time, and object count. Its default (unconfigured) Media Host THROWS only if
  actually invoked (mirrors `/export-schedule`'s own `DEFAULT_MEDIA_HOST` — never reached when nothing
  is due).
- **Wire `/export-schedule` to run cleanup FIRST, automatically** (`src/commands/export-schedule.ts`):
  before loading the run's own Ideas at all, it now calls `runScheduleCleanup` for the WHOLE Brand
  (every run, every Format — not just the one being exported), using the SAME injected `MediaHostPort`
  and clock. A non-empty cleanup result is prepended to the report; an empty one adds no noise to
  routine output.
- **Add the command doc** (`.claude/commands/cleanup-schedule-media.md`) plus its doc-check
  (`src/commands/cleanup-schedule-media.docs-test.ts`), matching the existing command-layer pattern.
  Extend `.claude/commands/export-schedule.md` (+ its existing docs-test) to document the automatic
  cleanup step.
- **Add the `cleanup-schedule-media` npm script** (`package.json`), mirroring every other granular
  command.
- **Extend the `schedule-batch-export` capability**: MODIFIED Requirement ("The command writes CSVs + a
  manifest...") for `/export-schedule` running cleanup first, automatically, before touching this run —
  the same Requirement text also notes a freshly-written manifest entry never itself carries
  `cleaned_at` (that field is written ONLY by cleanup).
- **Extend the `brand-commands` capability**: `/cleanup-schedule-media` joins the list of granular
  commands that require an explicit `<brand>` first argument.

## Non-Goals (explicitly deferred — PRD #140 scope notes)

- **The 30-day S3 bucket lifecycle rule** stays a documented one-time setup step (already live on the
  bucket, PRD #140's own record) — the backstop for an abandoned batch, never reimplemented as code here.
- **Automating the Zoho upload itself** — unaffected; the Publish gate stays human (ADR-0002).
- **Any ledger/Asset-status change from cleanup** — hosted-media cleanup is infrastructure housekeeping
  about S3 objects and the manifest, entirely separate from an Asset's `status` lifecycle (ADR-0011);
  this slice never touches `ledger.json`.
- **A live default `MediaHostPort` wiring** — mirrors `/export-schedule`'s own deferred default; a
  caller wires `LiveMediaHost` (issue #144) explicitly. Every test injects the fake.

## Capabilities

### Added Capabilities

- `schedule-batch-cleanup`: the pure cleanup decision module, the cleanup runner I/O shell, and the
  standalone `/cleanup-schedule-media` command.

### Modified Capabilities

- `schedule-batch-export`: `/export-schedule` now runs the Brand's manifest cleanup first, automatically,
  before touching the run being exported; a freshly-written manifest entry never itself carries the new
  `cleaned_at` field (written only by cleanup).
- `brand-commands`: `/cleanup-schedule-media` joins the granular-command list requiring an explicit
  `<brand>`.

## Impact

- **New code:** `src/schedule-batch/cleanup.ts` (+ `.test.ts`), `src/schedule-batch/cleanup-runner.ts`
  (+ `.test.ts`), `src/commands/cleanup-schedule-media.ts` (+ `.test.ts`, `.docs-test.ts`),
  `.claude/commands/cleanup-schedule-media.md`.
- **Modified code:** `src/schedule-batch/manifest.ts` (adds the optional `cleaned_at` field only, no
  behavior change to `buildManifest`), `src/commands/export-schedule.ts` (+ `.test.ts`,
  `.docs-test.ts` — wires the automatic cleanup call), `.claude/commands/export-schedule.md`,
  `package.json` (new `cleanup-schedule-media` script only).
- **Not touched:** `src/asset/**`, `src/ledger/**`, `src/production-spec/**`, `src/space-driver/**`,
  `src/media-host/port.ts`/`fixtures/**`/`live/**` (consumed read-only via the already-merged
  `MediaHostPort`), `data/**`.
- **Hermetic:** no live `spaces_*`/`creations_*` calls (no Magnific involvement — this slice has nothing
  to do with Magnific); no live S3/AWS CLI call in `npm test` — every test injects `FakeMediaHost`; no
  live network call anywhere in the suite.
- **Always-rules upheld:** generate-never-publish (cleanup only deletes previously-hosted media and
  writes the cleanup record; it never calls Zoho/Facebook/any platform API and never marks anything
  `posted`); public-metrics-only (N/A — no metrics in this slice); relative-not-absolute (N/A — no
  scoring in this slice); explicit-attribution (each recorded action is keyed to its own already-known
  `(idea, recipe)` manifest entry, never inferred); ledger-as-source-of-truth (cleanup deliberately
  never writes to `ledger.json` — hosted-media cleanup is infrastructure housekeeping about S3 objects
  and the manifest, not an Asset status change).
