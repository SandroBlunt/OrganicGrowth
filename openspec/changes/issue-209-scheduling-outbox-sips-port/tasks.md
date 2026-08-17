## 1. Scope audit — before writing any code

- [x] 1.1 Read the issue's two blockers (#198, #205) — confirm merged/closed.
- [x] 1.2 Read `src/schedule-batch/mcp-schedule.ts`/`mcp-schedule-port.ts`/`schedule-via-zoho-mcp.ts` end
  to end — confirm the CURRENT live scheduling order is genuinely "call Zoho (loop over every Channel),
  THEN write the ledger" (issue #209's own framing), and that `ZohoSchedulePort` is the seam to extend,
  not replace.
- [x] 1.3 Read `src/production-queue/job-store.ts` + `claim-concurrency.test.ts` + `fixtures/
  claim-worker.ts` end to end (issue #203) — this is the "prove the primitive against the schema, real
  separate-process crash test" bar to match, and the precedent for NOT wiring a new primitive into a
  live command within the same ticket.
- [x] 1.4 Confirm epic #195/#208: the worker itself is a LATER, still-open ticket (#208), blocked by
  #203/#205/#207 but NOT by #209 — so this ticket builds and proves the outbox primitive, it does not
  wire it into a live command.
- [x] 1.5 Read `src/media-host/port.ts`, `live/adapter.ts`, `live/sips.ts` + tests end to end. Grep every
  `node:child_process`/`execFile`/`spawn` use across `src/` for OTHER macOS-only shell-outs — found one
  sibling (`src/camera-hub/app-lifecycle.ts`'s `open -a`/`pgrep`), confirmed out of scope (epic #195's
  own named exception) and reported rather than touched.
- [x] 1.6 Verify every real `.png` file under `data/` (36 files) is 8-bit, non-interlaced, `colorType` 2
  or 6 — scopes the hand-rolled PNG decoder to exactly what real production data needs, nothing more.

## 2. The sips half — cross-platform PNG->JPG behind MediaHostPort (test-first)

- [x] 2.1 Write failing tests for a hand-rolled `decodePng` (`png-decode.test.ts`): round-trips
  `tiny-png.ts`'s own fixture; round-trips a 3x3 image built with an INDEPENDENT test-only encoder for
  EACH of PNG's five scanline filter types (0-4); round-trips an RGBA (`colorType: 6`) image with a real
  alpha channel; decodes a REAL repo PNG (`brand-logo.png`) to the correct dimensions/buffer size; refuses
  (named `PngDecodeError`) a bad signature, a CRC mismatch, an unsupported color type, a 16-bit depth, an
  interlaced image, and a missing IDAT.
- [x] 2.2 Implement `src/media-host/live/png-decode.ts` (zero new dependencies — `node:zlib` only).
- [x] 2.3 Write failing tests for `encodeJpeg` (`jpeg-encode.test.ts`): JPEG magic bytes; a full
  encode-then-`jpeg-js`-decode round trip on a 4-quadrant test image, checking each quadrant's dominant
  color survives lossy compression; quality default (90) and quality affecting output.
- [x] 2.4 Add the ONE new runtime dependency (`jpeg-js`, pure JS, zero deps of its own,
  BSD-3-Clause) and implement `src/media-host/live/jpeg-encode.ts`.
- [x] 2.5 Write failing tests for `convertPngToJpg` (`png-to-jpg.test.ts`): real tiny-PNG conversion
  (ALWAYS runs now — no platform skip), in-place refusal (before any read), relative-path resolution,
  a real repo-PNG (RGBA) conversion, a quality override.
- [x] 2.6 Implement `src/media-host/live/png-to-jpg.ts`; wire `LiveMediaHost.convertToJpg` onto it;
  replace `sipsCommand` with `jpegQuality` on `LiveMediaHostOptions`.
- [x] 2.7 Delete `src/media-host/live/sips.ts` + `sips.test.ts`. Update `adapter.test.ts`'s one
  sips-specific test (now proves convertToJpg makes ZERO `CommandRunner` calls, using a real PNG fixture)
  and add a `jpegQuality` override test. Update doc comments in `command-runner.ts`, `smoke.ts`,
  `port.ts` that named `sips` specifically.
- [x] 2.8 Add `src/media-host/live/png-to-jpg.ts` to `src/fs-boundary/allow-list.ts` (audited: reads a
  slide's source PNG, writes the converted JPG — the same media-staging category as `carousel-real-
  media.ts`/`download.ts`/etc.).
- [x] 2.9 Confirm `fixtures/fake-media-host.ts` and every OTHER existing media-host test file are
  BYTE-UNCHANGED; run the full `src/media-host/**` suite green.

## 3. The scheduling half — the outbox primitive (test-first)

- [x] 3.1 Add `MIGRATION_3` to `src/db/schema.ts`: `schedule_outbox` (`idempotency_key` UNIQUE, `asset_id`
  FK, `platform` CHECKed against `KNOWN_PLATFORMS`, `request_json`, `status` CHECKed
  `'reserved'|'confirmed'`, `reference_json`, `reserved_at`/`confirmed_at`). Deliberately NOT added to
  `ENTITY_TABLES` (not a `CONTEXT.md` domain entity) — a new `OUTBOX_TABLES` constant instead, documented
  inline. `MIGRATION_1`/`MIGRATION_2` untouched.
- [x] 3.2 Update `src/db/migrate.test.ts`'s `CURRENT_SCHEMA_VERSION` assertion (2 -> 3); add a test
  proving migration 3 adds ONLY `schedule_outbox` on top of an already-1+2-applied database (mirrors the
  existing migration-2-is-additive test). Add direct `schedule_outbox` shape/constraint tests to
  `schema.test.ts` (FK, UNIQUE, CHECK x2, carries id/created_at/updated_at/schema_version).
- [x] 3.3 Extend `ZohoSchedulePort` (`src/schedule-batch/mcp-schedule-port.ts`) with `listSchedules` +
  `ZohoScheduleRecord` — maps to the real, ALREADY-granted `ZohoSocial_listSocialSchedules` MCP tool,
  simply unused by this port until now. Extend `FakeZohoSchedulePort` (+tests) with `listSchedules`
  reading from a new public `created` array; widen the one `mcp-schedule.test.ts` `call.kind` guard the
  new `"list"` call kind requires.
- [x] 3.4 Write failing tests (`src/schedule-outbox/store.test.ts`): `reserveScheduleOutboxEntry` is
  insert-or-find (fresh key inserts, a repeat key returns the SAME row, `alreadyReserved` distinguishes
  them, no second row); FOREIGN KEY on an unknown `assetId`; `confirmScheduleOutboxEntry` atomically
  moves reserved -> confirmed, is idempotent (a second confirm does not overwrite the first reference),
  preserves array-vs-string reference shape, returns `null` for an unknown key;
  `listReservedScheduleOutboxEntries` returns only `'reserved'` rows, oldest first.
- [x] 3.5 Implement `src/schedule-outbox/store.ts`.
- [x] 3.6 Write failing tests (`reconcile.test.ts`, PURE): `matchesRequest`/`findMatchingSchedule` match
  on content + local schedule time, never on Zoho's own reference, never on "the only one returned".
- [x] 3.7 Implement `src/schedule-outbox/reconcile.ts`.
- [x] 3.8 Write failing tests (`run.test.ts`, against the in-process `FakeZohoSchedulePort`): a brand-new
  reservation calls `createSchedule` exactly once, WITHOUT calling `listSchedules` first; an
  already-CONFIRMED key short-circuits to zero port calls; a resumed reservation Zoho already has is
  confirmed via reconciliation WITHOUT a second `createSchedule` call; a resumed reservation Zoho never
  received reconciles to "nothing found" then schedules exactly once;
  `reconcileScheduleOutboxEntry` alone never calls `createSchedule`, ever.
- [x] 3.9 Implement `src/schedule-outbox/run.ts`.
- [x] 3.10 Write the GENUINE crash-recovery test (`crash-recovery.test.ts`), mirroring
  `claim-concurrency.test.ts`'s real-separate-process bar: `fixtures/db-backed-fake-zoho.ts` (a
  `ZohoSchedulePort` backed by an ad-hoc SQLite table in the SAME file, so a crashed child process's own
  Zoho call is durably visible to a later, separate process); `fixtures/crash-schedule-worker.ts`
  (reserves, optionally calls the real fake Zoho, then `process.exit(1)` WITHOUT confirming). Two
  scenarios: crash AFTER Zoho accepted it (retry must NOT double-post — proves via reconciliation, zero
  new `createSchedule` calls, `fake_zoho_schedule` row count stays 1); crash BEFORE Zoho was ever called
  (retry must still schedule exactly once — proves the post is never silently dropped).
- [x] 3.11 BREAK `runScheduleOutboxEntry` locally (swap the reconcile-first branch for the ORIGINAL bug
  this ticket fixes: call Zoho unconditionally, then write) and confirm the double-post crash test goes
  RED; restore the real implementation and confirm green again. Ran the crash suite 5x back to back with
  zero flakes. Recorded in the Build Report.
- [x] 3.12 Expose `scheduleViaOutbox`/`reconcileScheduleOutbox` on the command surface
  (`src/command-surface/schedule-outbox.ts`, +`.test.ts`); re-export from `index.ts`.

## 4. OpenSpec + full-suite green + self-review + Build Report

- [x] 4.1 Author spec deltas: `schedule-outbox` (ADDED, new capability), `media-host` (MODIFIED x3 —
  titles kept byte-identical to the live spec, only bodies/scenarios changed), `sqlite-foundation`
  (ADDED — migration 3's own new Requirement, `ENTITY_TABLES`'s existing Requirement left untouched),
  `command-surface` (ADDED — the new capability, the existing "exactly three companions" Requirement left
  untouched). Run `openspec validate --strict` until green.
- [x] 4.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test` — all green, at/above the 3100/800/0-fail
  baseline.
- [x] 4.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #209
  acceptance criterion maps to a specific test.
- [x] 4.4 Write the Build Report into `handoff.md`.
