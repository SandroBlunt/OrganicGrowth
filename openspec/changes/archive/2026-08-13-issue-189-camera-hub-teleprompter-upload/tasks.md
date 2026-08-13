## 1. The Recipe-agnostic teleprompter-library primitive (test-first)

- [x] 1.1 Write failing tests (`chapters.test.ts`) for `splitChapters`: blank-line paragraph splitting,
  internal newlines collapsed to a single space, multiple consecutive blank lines collapse to one split
  point, leading/trailing blank lines dropped, a single no-blank-line paragraph yields one chapter, empty/
  whitespace-only input yields zero chapters, each chapter is trimmed.
- [x] 1.2 Implement `src/camera-hub/chapters.ts`.
- [x] 1.3 Write failing tests (`library.test.ts`) for `newScriptGuid`/`isValidTeleprompterGuid` (always a
  fresh, valid, uppercase 8-4-4-4-12 GUID), `buildScriptRecord` (the exact `Texts/<GUID>.json` shape,
  chapters via `splitChapters`), `existingLibraryGuids`/`appendLibraryGuids` (reads/appends the
  `applogic.prompter.libraryList` pointer array, preserving every other key, degrading a malformed/absent
  value to `[]`/a fresh object rather than throwing, never mutating the input).
- [x] 1.4 Implement `src/camera-hub/library.ts`.
- [x] 1.5 Write a SHAPE-ONLY test (`app-lifecycle.test.ts`) for `createDefaultCameraHubAppLifecycle`:
  returns a port exposing `isRunning`/`launch` as functions; carries NO `quit` method at all. Never
  invokes either method (no real process touched by any test).
- [x] 1.6 Implement `src/camera-hub/app-lifecycle.ts` — the `CameraHubAppLifecyclePort` interface (just
  `isRunning`/`launch`) and its one real, `pgrep`/`open`-backed default implementation.
- [x] 1.7 Implement `src/camera-hub/fixtures/fake-app-lifecycle.ts` (`FakeCameraHubAppLifecycle`) —
  in-memory, records `isRunning`/`launch` call counts, injectable initial running state.

## 2. `uploadTeleprompterScripts` — the one tested capability (test-first)

- [x] 2.1 Write failing tests (`upload.test.ts`) against a temp-directory root + `FakeCameraHubAppLifecycle`:
  an empty batch is a no-op success and never checks `isRunning`; Camera Hub still running refuses,
  touches NO file, and never relaunches; the running check itself failing degrades to a reported failure,
  never throws; a fresh root writes one `Texts/<GUID>.json` per script (correct `GUID`/`chapters`/
  `friendlyName`/`index`) plus the `AppSettings.json` pointer list, with NO backup file (nothing to back
  up yet), and calls `isRunning`/`launch` EXACTLY ONCE each across a multi-script batch (the batching
  contract); an existing `AppSettings.json` is backed up VERBATIM to a timestamped `.bak-<ts>` sibling
  BEFORE being rewritten, its pointer list is APPENDED to (never replaced), unrelated keys preserved, and
  the index hint continues from the existing library's length; an unparseable or non-object
  `AppSettings.json` refuses BEFORE writing any Texts file and leaves the original untouched.
- [x] 2.2 Implement `src/camera-hub/upload.ts`'s `uploadTeleprompterScripts` — quit-verify (once) -> per-
  script write -> backup (once, only if a prior file exists) -> rewrite the pointer list (once) ->
  relaunch (once); never throws.

## 3. The `news-short-script` Recipe's own glue: the sweep + path/text helpers (test-first)

- [x] 3.1 Write failing tests (`news-short-script.test.ts`) for `selectUnuploadedNewsShortScripts`:
  includes a produced `news-short-script` Asset with no `camera_hub_uploaded_at`; excludes one that
  already carries it; excludes `queued`/`in_production` Assets; excludes a different Recipe's Asset
  entirely; INCLUDES `posted`/`tracking`/`scored` Assets too (proving the sweep is not scoped to any one
  Run or to `produced` alone — "no silent drops"); sweeps correctly across multiple Ideas, pairing each
  swept Asset with its own Idea id; empty input yields `[]`.
- [x] 3.2 Write failing tests for `outputDirFromSpecPath` (swaps the `.spec.json` suffix for `.output`)
  and `stripNextShotMarkers` (removes the `[Next shot]` marker block from a REAL `scriptText(spec)`
  rendering, recovering exactly the original beats via `splitChapters`; a marker-free input round-trips
  unchanged).
- [x] 3.3 Implement `src/camera-hub/news-short-script.ts`.

## 4. The orchestration shell (test-first)

- [x] 4.1 Write failing tests (`upload-camera-hub-scripts.test.ts`) against a temp ledger + temp Camera
  Hub root + `FakeCameraHubAppLifecycle`: an empty/fully-uploaded ledger reports nothing to do, never
  checks `isRunning`; the happy path uploads every swept Asset in ONE batch (one `isRunning` call, one
  `launch` call across 2 Ideas), stamps `camera_hub_uploaded_at`, and PRESERVES each Asset's existing
  `status` (a `posted` Asset stays `posted`, never regressed to `produced`); the `[Next shot]` marker
  never leaks into the uploaded chapters; a missing `spec_path` or missing `script.txt` is a non-fatal,
  reported skip that never blocks a sibling Asset's upload; Camera Hub still running refuses, changes
  NOTHING on the ledger, and leaves `script.txt` untouched.
- [x] 4.2 Implement `src/commands/upload-camera-hub-scripts.ts`'s `uploadCameraHubScriptsCommand` +
  `defaultCameraHubRoot` + a directly-runnable `main()` CLI entry (no `npm run` alias, no
  `.claude/commands/*.md` doc — ADR-0027's "no standalone command").

## 5. `LedgerAssetRecord.camera_hub_uploaded_at` (test-first)

- [x] 5.1 Write failing tests (`asset.test.ts` additions): parses a well-formed ISO-8601
  `camera_hub_uploaded_at`; omits it when absent; drops a malformed (blank/non-string) value rather than
  crashing; adding it introduces NO new `AssetStatus`; a write to one Asset does not erase a sibling
  Asset's `camera_hub_uploaded_at`.
- [x] 5.2 Implement the field + its defensive parse in `src/asset/asset.ts`.

## 6. Wire the offer into the producer's documented behavior (docs + a real-document test)

- [x] 6.1 Add a "Camera Hub teleprompter upload offer" section to `.claude/agents/producer.md` (mirroring
  the Schedule Batch offer section's own style): scoped to `news-short-script` only, no standalone
  command, sweeps the whole ledger, waits for explicit approval, the semi-manual quit sequence (ask ->
  verify -> if still running, ask again, never proceed), the batching contract, the non-fatal failure
  posture, and the `camera_hub_uploaded_at` marker's no-new-lifecycle-meaning contract. Add a matching
  Guardrails bullet.
- [x] 6.2 Add a **Camera Hub Upload** glossary entry to `CONTEXT.md`, next to **Shot List**/**Curiosity
  Queries**, explicitly scoped to the *News Short Script* Recipe.
- [x] 6.3 Write `src/commands/upload-camera-hub-scripts.docs-test.ts` (kept OUT of `npm test`, run via
  `npm run test:docs`) pinning the shipped prose in `producer.md` and `docs/adr/0027-...md` against real,
  quoted regex assertions — not asserted by fiat.

## 7. OpenSpec + full-suite green + self-review + Build Report

- [x] 7.1 Author spec deltas (`specs/camera-hub-upload`, `specs/asset-store`) as Requirements +
  Scenarios; run `openspec validate --strict` until green.
- [x] 7.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs` — all green except the
  confirmed pre-existing, unrelated `src/format/store.test.ts` `listFormatSlugs` failure (stale since
  commit `eb76882`, verified present on `main` before this slice's changes too).
- [x] 7.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #189
  acceptance criterion maps to a specific test.
- [x] 7.4 Write the Build Report into `handoff.md`.
