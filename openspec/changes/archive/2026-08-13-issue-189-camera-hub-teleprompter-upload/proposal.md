## Why

The `news-short-script` Recipe (ADR-0021, Space-less) already produces a clean, copy-paste-ready
`script.txt` for every Straw Motion Unhypped Daily story. Today the Operator still opens that file and
pastes it into Elgato Camera Hub's teleprompter panel by hand, every time, before recording. A 2026-08-12
smoke test proved Camera Hub reads its teleprompter library from two on-disk files under
`~/Library/Application Support/Elgato/Camera Hub/`: one JSON file per script (`Texts/<GUID>.json`) and a
flat GUID pointer list in `AppSettings.json` (`applogic.prompter.libraryList`) — writing the Texts file
alone does nothing; a script only appears once its GUID is ALSO appended to that pointer list, and the app
must be fully quit before `AppSettings.json` is edited (it holds its own settings in memory and can
silently clobber an on-disk edit on its next save/quit). `docs/adr/0027` (captured 2026-08-12, alongside
this ticket) settles the issue's own open questions and is the accepted design this slice builds:

- **Quit is semi-manual**, never scripted — the smoke test's own `osascript` quit attempt failed on a
  confirmation dialog Camera Hub shows. The producer asks the Operator to quit Camera Hub themselves,
  then VERIFIES it via a process check before touching any file; if it is still running, it asks again —
  never proceeds on a guess. Relaunch, by contrast, is a plain, automatable app launch.
- **The proven file-edit approach ships now**; the two local WebSocket ports the smoke test noticed are
  explicitly deferred (unexplored, not part of this decision).
- **The offer sweeps ALL un-uploaded `news-short-script` Assets**, not only ones produced this session —
  there is no manual fallback command, so no silent drops.
- **Upload time is tracked with a new plain, optional field** (`camera_hub_uploaded_at`) — the SAME
  pattern as `scheduled_at` (issue #140/#141): it carries no lifecycle meaning of its own, and no new
  `AssetStatus` is introduced. This is the one place this slice's own reading of the issue's last
  acceptance criterion ("No new Asset lifecycle status or ledger field is introduced") differs from a
  literal reading: ADR-0027 post-dates and refines the issue, and explicitly decided this plain marker
  field IS the design — read the criterion as "no new lifecycle STATUS, no field carrying lifecycle
  MEANING", not "no field at all" (the sweep's own "never re-upload an already-uploaded script" behavior
  is impossible without SOME durable marker, exactly like `scheduled_at` makes a re-run of the Schedule
  Batch export converge to "nothing eligible" rather than double-scheduling).
- **Scoped to the `news-short-script` Recipe only** — not built as a generic hook for any Recipe.
- **One tested capability**, driven by an injectable Camera Hub root directory and an injectable
  app-lifecycle port — the real Camera Hub install and the real app process are NEVER touched by a test,
  mirroring the fake-Magnific-Space convention this build pipeline already uses.

## What Changes

- **A new, Recipe-agnostic teleprompter-library primitive** (`src/camera-hub/`): `splitChapters`
  (`chapters.ts`, the smoke test's own blank-line-paragraph-splitting rule), the `Texts/<GUID>.json`
  record shape + the `AppSettings.json` pointer-list read/append logic (`library.ts`), and the
  `CameraHubAppLifecyclePort` seam (`app-lifecycle.ts`) — deliberately just `isRunning`/`launch`, with NO
  `quit` method at all (a structural guarantee this module can never script an automated quit).
- **`uploadTeleprompterScripts`** (`src/camera-hub/upload.ts`) — the ONE tested capability behind the
  whole feature: given a Camera Hub root directory, an app-lifecycle port, and a BATCH of `{ title,
  bodyText }` scripts, it verifies the app is quit (once), writes each script's `Texts/<GUID>.json`,
  backs up `AppSettings.json` to a timestamped `.bak-<ts>` sibling (ALWAYS, before rewriting it, and only
  when a prior settings file actually exists), rewrites the pointer list, and relaunches the app (once) —
  a single quit-verify and a single relaunch across the whole batch, never one pair per script. Never
  throws; every failure degrades to a returned `{ ok: false, reason, uploaded: [] }`.
- **The `news-short-script` Recipe's own glue** (`src/camera-hub/news-short-script.ts`): the sweep
  (`selectUnuploadedNewsShortScripts`, a pure fold over the WHOLE Brand ledger — no Run/Format scoping —
  finding every `news-short-script` Asset that is produced-or-later and carries no
  `camera_hub_uploaded_at` yet), plus two pure helpers turning one swept Asset into upload-ready input:
  `outputDirFromSpecPath` (derives the `.output/` bundle directory from the Asset's own recorded
  `spec_path` — never reconstructed from the Idea/Run/Format) and `stripNextShotMarkers` (removes the
  document-only `[Next shot]` marker `scriptText` renders between beats before the text is split into
  Camera Hub chapters).
- **The orchestration shell** (`src/commands/upload-camera-hub-scripts.ts`,
  `uploadCameraHubScriptsCommand`): sweeps the ledger, reads each swept Asset's `script.txt`, drives ONE
  batched `uploadTeleprompterScripts` call, and — only on success — stamps `camera_hub_uploaded_at` via
  `AssetStore.writeAsset`, preserving each Asset's existing `status` EXACTLY (never regressing a
  `posted`/`tracking`/`scored` Asset back to `produced`). A directly-runnable CLI entry (`npx tsx
  src/commands/upload-camera-hub-scripts.ts <brand>`) exists so the producer's own `Bash` tool has a
  concrete way to run it; there is deliberately NO `npm run` alias and NO `.claude/commands/*.md` doc
  (ADR-0027: "there is no standalone command" — the Operator never runs this directly).
- **`LedgerAssetRecord` gains `camera_hub_uploaded_at?: string`** (`src/asset/asset.ts`), parsed
  defensively (kept only when a non-empty string) and surviving every ledger load -> write -> load cycle,
  exactly like `scheduled_at`/`zoho_schedule_reference`/`has_video_slide` before it. Introduces NO new
  `AssetStatus`.
- **`.claude/agents/producer.md` documents the offer**: once one or more `news-short-script` Assets exist
  without an upload marker (any Run), the producer offers the upload and runs it only after the Operator
  approves, in the same conversation — mirroring the Schedule Batch offer's own approval-gated pattern
  (issue #148, ADR-0008). Names the real code (`selectUnuploadedNewsShortScripts`,
  `uploadCameraHubScriptsCommand`, `uploadTeleprompterScripts`), the semi-manual quit sequence, the
  batching contract, and the non-fatal failure posture. A matching Guardrails bullet keeps the rule
  visible on a skim.
- **`CONTEXT.md`** gains a **Camera Hub Upload** glossary entry, next to **Shot List**/**Curiosity
  Queries** (its closest domain-vocabulary neighbors), scoped explicitly to the *News Short Script*
  Recipe.

## Non-Goals (explicitly out of scope for this slice)

- **Automated quit.** ADR-0027 deliberately does not pursue an Accessibility-permission workaround for
  Camera Hub's confirmation dialog — quit stays a manual Operator action, only VERIFIED by code.
- **The WebSocket/local-port route.** Camera Hub's two local ports (1835, 1854) are unexplored and
  explicitly deferred to a possible future spike (ADR-0027) — not built here.
- **Any other Recipe.** This is not a generic "upload to a third-party teleprompter app" hook — it is
  wired to `news-short-script` alone. A future second script-producing Recipe would need its own,
  separate wiring decision.
- **Live Camera Hub verification.** No test in this repository (or in CI) launches, quits, or writes into
  the real Camera Hub install — every test uses a temp-directory root and a fake app-lifecycle. Confirming
  against a REAL Camera Hub install is a manual, Operator-run smoke check outside this build pipeline
  (mirroring how the live Magnific Space and the live Zoho MCP tools are both outside `npm test`'s reach).

## Capabilities

### Added Capabilities

- `camera-hub-upload`: the whole teleprompter-library primitive (chapters, the `Texts/<GUID>.json` +
  `AppSettings.json` shapes, the app-lifecycle port), the one tested `uploadTeleprompterScripts`
  capability, the `news-short-script`-scoped sweep + glue, the orchestration shell, and the producer's
  documented offer.

### Modified Capabilities

- `asset-store`: `LedgerAssetRecord` gains the optional `camera_hub_uploaded_at` field, parsed
  defensively and surviving every ledger round-trip; introduces no new `AssetStatus`.

## Impact

- **New code:** `src/camera-hub/chapters.ts` (+`.test.ts`), `src/camera-hub/library.ts` (+`.test.ts`),
  `src/camera-hub/app-lifecycle.ts` (+`.test.ts`), `src/camera-hub/upload.ts` (+`.test.ts`),
  `src/camera-hub/news-short-script.ts` (+`.test.ts`), `src/camera-hub/fixtures/fake-app-lifecycle.ts`,
  `src/commands/upload-camera-hub-scripts.ts` (+`.test.ts`, +`.docs-test.ts`),
  `docs/adr/0027-producer-offers-camera-hub-teleprompter-upload.md`.
- **Modified code:** `src/asset/asset.ts` (+`.test.ts` additions) — the new optional field;
  `.claude/agents/producer.md` — the new offer section + a matching Guardrails bullet; `CONTEXT.md` — the
  new **Camera Hub Upload** glossary entry.
- **Hermetic, no live Space anywhere, and no live Camera Hub anywhere.** This Recipe already has no
  Magnific Space (ADR-0021); this slice adds one more class of external system (a real desktop app) and
  keeps it exactly as hermetic — every test injects a temp-directory root and a fake app-lifecycle
  (`FakeCameraHubAppLifecycle`), never the real `~/Library/Application Support/Elgato/Camera Hub/` and
  never a real process.
- **Always-rules upheld:** generate-never-publish (this is a library-upload convenience step, not a
  publish — the Operator still records and publishes the video themselves); public-metrics-only/
  relative-not-absolute (no metrics code touched); explicit-attribution (`/log-post` untouched);
  ledger-as-source-of-truth (the new field is written through `AssetStore.writeAsset`, exactly like every
  other Asset field).
