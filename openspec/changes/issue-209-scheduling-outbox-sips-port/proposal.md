## Why

The worker (issue #208, not yet built) has two outside edges, and both are unsafe or non-portable today.

**Scheduling.** The current order is call Zoho, then write. A crash between the two means a retry
double-posts publicly — the same content appearing twice on a real Channel where people can see it, not
merely a lost local record.

**Image conversion.** `sips` is a macOS-only shell-out. It already sits behind `MediaHostPort`, so
replacing it is a one-file swap — but until it happens the worker can only ever run on this specific Mac,
blocking any later move to CI or another host.

## What Changes

- **A Schedule Outbox** (`src/schedule-outbox/`, genuinely new — mirrors `src/production-queue/
  job-store.ts`'s own "prove the primitive against the schema, not yet wired to a live command" posture,
  issue #203): reserve the idempotency key BEFORE calling Zoho, call Zoho, confirm AFTER.
  `reserveScheduleOutboxEntry` is insert-or-find, keyed on a UNIQUE `idempotency_key` — a retry after a
  crash finds the SAME row rather than creating a second one. `confirmScheduleOutboxEntry` atomically
  moves `'reserved'` -> `'confirmed'`, idempotently.
- **Reconciliation, not guessing.** A `'reserved'`-but-unconfirmed entry is ambiguous by construction —
  this system genuinely does not know whether Zoho accepted the earlier `createSchedule` call.
  `reconcileScheduleOutboxEntry` asks Zoho (`ZohoSchedulePort.listSchedules`, a NEW method — the real,
  already-granted `ZohoSocial_listSocialSchedules` MCP tool was simply unused until now) whether a
  schedule matching the exact content + local schedule time already exists
  (`src/schedule-outbox/reconcile.ts`'s pure `findMatchingSchedule`), and confirms from THAT match rather
  than calling `createSchedule` again. `runScheduleOutboxEntry` composes the whole sequence: a BRAND NEW
  reservation goes straight to `createSchedule` (nothing could have reached Zoho yet); a RESUMED one
  reconciles first and only calls `createSchedule` when Zoho confirms it does not already have it; an
  ALREADY-CONFIRMED key short-circuits, calling Zoho zero times.
- **Proven by a genuine crash, not an asserted intermediate state.** `crash-recovery.test.ts` spawns a
  REAL, separate OS process (`fixtures/crash-schedule-worker.ts`, mirroring
  `src/production-queue/fixtures/claim-worker.ts`'s own issue #203 precedent) that reserves, optionally
  calls a REAL (file-backed) fake Zoho, then calls `process.exit(1)` WITHOUT ever confirming — a genuine
  crash between reserve and confirm. A separate call in the parent test process then retries and proves
  BOTH failure modes are avoided: Zoho is never called twice for the same post (no double-post), and a
  post that was never actually sent still gets sent exactly once (no silent drop).
- **`schedule_outbox`** — one additive migration (`MIGRATION_3`, `src/db/schema.ts`), `MIGRATION_1`/
  `MIGRATION_2` untouched byte-for-byte. Deliberately NOT one of `ENTITY_TABLES` (it is engineering
  infrastructure, not a `CONTEXT.md`-named domain entity) — a new `OUTBOX_TABLES` constant instead, with
  its own direct tests proving it still carries `id`/`created_at`/`updated_at`/`schema_version`.
- **The command surface gains `scheduleViaOutbox`/`reconcileScheduleOutbox`** (`src/command-surface/
  schedule-outbox.ts`) — a new capability beyond issue #205's original eight operations, not a companion
  to them. Thin shells over the Schedule Outbox; not wired to any production caller by this ticket (the
  worker, issue #208, is what will actually call it).
- **`sips` is replaced by a pure-JS PNG->JPG converter** behind the SAME `MediaHostPort` interface
  (unchanged — only the implementation moves). `src/media-host/live/png-decode.ts` is a hand-rolled,
  zero-new-dependency PNG decoder (`node:zlib`'s `inflateSync` only, mirroring
  `src/media-host/fixtures/tiny-png.ts`'s own zero-dependency PNG *encoder*) — bounded to exactly the two
  PNG shapes this codebase's own real carousel-slide PNGs actually use (8-bit, non-interlaced,
  `colorType` 2 or 6; verified against all 36 `.png` files under `data/`), refusing anything else with a
  named error rather than silently mis-decoding. `src/media-host/live/jpeg-encode.ts` wraps the ONE new
  runtime dependency this ticket adds, `jpeg-js` (pure JS, zero dependencies of its own, BSD-3-Clause) —
  justified in the Build Report: hand-rolling a correct JPEG encoder for a REAL, publicly-posted image is
  a codec-correctness gamble this repo's "stay dependency-free" default should not be stretched to cover.
  `src/media-host/live/png-to-jpg.ts` composes the two into the same `(sourcePath, destPath, options)`
  contract `convertPngToJpgViaSips` (deleted) had, including the "never rewrite the source in place"
  refusal.
- **No other macOS-only shell-out found behind any production code path** — audited directly (grepped
  every `node:child_process` use in `src/`). One SIBLING macOS-only shell-out DOES exist —
  `src/camera-hub/app-lifecycle.ts`'s `open -a`/`pgrep` — explicitly reported, NOT touched: Camera Hub
  teleprompter upload is epic #195's own named exception ("drives a desktop app on this specific Mac...
  stays a local companion step"), unrelated to `MediaHostPort` or the worker.
- **`MediaHostPort`'s interface is unchanged** — only `LiveMediaHost`'s implementation of `convertToJpg`
  moves; `sipsCommand` (an option for a binary that no longer exists) is replaced by an optional
  `jpegQuality`. The media-host FAKE (`fixtures/fake-media-host.ts`) is untouched, and every EXISTING
  media-host test still passes — the one test that was inherently sips-specific
  (`sips.test.ts`/`adapter.test.ts`'s sips-argv assertion) is replaced by an equivalent proof against the
  new implementation, not silently dropped. The formerly-`skip`-on-non-macOS real-conversion test now
  ALWAYS runs — cross-platform by construction, proven directly.

## Capabilities

### Added Capabilities

- `schedule-outbox`: `src/schedule-outbox/` — reserve/confirm/reconcile, proven against a real crash.

### Modified Capabilities

- `media-host`: `convertToJpg`'s live implementation moves from `sips` to a pure-JS converter; the build
  stays hermetic with no skip/exception at all (previously one, on non-macOS).
- `sqlite-foundation`: migration 3 adds `schedule_outbox`, additive, migrations 1/2 unchanged.
- `command-surface`: gains `scheduleViaOutbox`/`reconcileScheduleOutbox`.

## Impact

- **New code:** `src/schedule-outbox/store.ts`, `reconcile.ts`, `run.ts` (+`.test.ts` each),
  `crash-recovery.test.ts`, `fixtures/db-backed-fake-zoho.ts`, `fixtures/crash-schedule-worker.ts`;
  `src/command-surface/schedule-outbox.ts` (+`.test.ts`); `src/media-host/live/png-decode.ts`,
  `jpeg-encode.ts`, `png-to-jpg.ts` (+`.test.ts` each); `openspec/changes/
  issue-209-scheduling-outbox-sips-port/` (this change).
- **Modified code:** `src/db/schema.ts` (+`MIGRATION_3`, `OUTBOX_TABLES`), `src/db/schema.test.ts`,
  `src/db/migrate.test.ts` (`CURRENT_SCHEMA_VERSION` 2 -> 3, plus a migration-3-is-additive test),
  `src/schedule-batch/mcp-schedule-port.ts` (+`listSchedules`, +`ZohoScheduleRecord`),
  `src/schedule-batch/fixtures/fake-zoho-schedule-port.ts` (+`listSchedules`, +`created`) and its test,
  `src/schedule-batch/mcp-schedule.test.ts` (a `call.kind` guard widened for the new `"list"` call kind),
  `src/media-host/live/adapter.ts` (+`.test.ts`), `src/media-host/live/command-runner.ts`,
  `src/media-host/live/smoke.ts`, `src/media-host/port.ts` (doc comments only), `src/command-surface/
  index.ts`, `src/fs-boundary/allow-list.ts` (+`png-to-jpg.ts`, audited), `package.json`/
  `package-lock.json` (+`jpeg-js`).
- **Removed code:** `src/media-host/live/sips.ts`, `src/media-host/live/sips.test.ts`.
- **Hermetic, no live Zoho MCP or AWS call.** Every new test opens a REAL, throwaway SQLite file per
  test (`withTempDb`, never `:memory:`). The Zoho fake (`FakeZohoSchedulePort`, in-process) and the
  crash test's disk-backed fake (`DbBackedFakeZohoSchedulePort`) both stand in for Zoho — no MCP tool is
  imported or called by anything this slice touches. The live media-host smoke script (AC7) is documented
  in the Build Report as an Operator action; never run, never wired into `npm test`.
- **Always-rules upheld:** generate-never-publish is untouched by construction (this slice touches no
  content-generation or publication code — the Schedule Outbox SCHEDULES via the same `ZohoSchedulePort`
  ADR-0020 already established, never publishes immediately, and `ZohoSocial_publishSocialPost`/
  `updateSocialPostApprovalStatus` remain uncalled). Public-metrics-only and relative-not-absolute are
  unaffected. Explicit-attribution is unaffected (no Post logging here). Ledger-as-source-of-truth is
  preserved: the Schedule Outbox is additive infrastructure, not yet wired to any live command — the
  live, file-based `scheduleViaZohoMcpCommand` (`src/commands/schedule-via-zoho-mcp.ts`) is untouched
  except for the `listSchedules` interface addition it must still type-check against.
