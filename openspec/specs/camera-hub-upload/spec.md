# camera-hub-upload Specification

## Purpose
TBD - created by archiving change issue-189-camera-hub-teleprompter-upload. Update Purpose after archive.
## Requirements
### Requirement: splitChapters splits a script's body text into Camera Hub's Texts/<GUID>.json chapters array

`splitChapters(bodyText)` (`src/camera-hub/chapters.ts`) SHALL split `bodyText` into an ordered array of
paragraph chapters: split on any run of blank-line whitespace between paragraphs, then within EACH
resulting paragraph collapse every internal newline (and its surrounding whitespace) to a single space,
then trim. Empty chunks (from leading/trailing blank lines, or multiple consecutive blank lines) SHALL be
dropped — the result SHALL NEVER contain an empty-string chapter. This module SHALL be Recipe-agnostic —
it SHALL NOT reference the News Short Script Recipe, `NEXT_SHOT_MARKER`, or any Asset shape.

#### Scenario: A single blank line splits into one chapter per paragraph

- **GIVEN** `"First paragraph.\n\nSecond paragraph.\n\nThird paragraph."`
- **WHEN** `splitChapters` is called
- **THEN** it returns `["First paragraph.", "Second paragraph.", "Third paragraph."]`

#### Scenario: Internal newlines within one paragraph collapse to a single space

- **GIVEN** `"Line one\nline two\nline three"` (no blank line)
- **WHEN** `splitChapters` is called
- **THEN** it returns `["Line one line two line three"]`

#### Scenario: Multiple consecutive blank lines collapse to one split point

- **GIVEN** `"Para one.\n\n\n\nPara two."`
- **WHEN** `splitChapters` is called
- **THEN** it returns `["Para one.", "Para two."]` — never an empty chapter between them

#### Scenario: Leading/trailing blank lines never produce an empty first/last chapter

- **GIVEN** `"\n\nPara one.\n\nPara two.\n\n"`
- **WHEN** `splitChapters` is called
- **THEN** it returns `["Para one.", "Para two."]`

#### Scenario: Empty or whitespace-only input yields zero chapters

- **GIVEN** `""` or a string of only spaces/newlines
- **WHEN** `splitChapters` is called
- **THEN** it returns `[]`

### Requirement: library.ts defines the Texts/<GUID>.json record shape and the AppSettings.json pointer-list read/append logic

`src/camera-hub/library.ts` SHALL export: `LIBRARY_LIST_KEY` (the exact string
`"applogic.prompter.libraryList"`, the `AppSettings.json` key that makes a script actually appear in
Camera Hub's teleprompter panel); `newScriptGuid()`, which SHALL always return a fresh, uppercase,
hyphenated 8-4-4-4-12 UUID; `isValidTeleprompterGuid(value)`, a pure predicate for that same shape;
`buildScriptRecord(guid, friendlyName, bodyText, index)`, which SHALL return `{ GUID: guid, chapters:
splitChapters(bodyText), friendlyName, index }`; `existingLibraryGuids(raw)`, which SHALL read the flat
GUID array off an already-parsed `AppSettings.json` value, returning `[]` for any missing/malformed shape
(a non-object `raw`, a missing key, a non-array value, or non-string array entries) rather than throwing;
and `appendLibraryGuids(raw, guids)`, which SHALL return a NEW object with `guids` appended to the
EXISTING pointer list, preserving every other key of `raw` untouched, degrading a non-object/malformed
`raw` to a fresh object rather than throwing, and NEVER mutating its `raw` argument.

#### Scenario: newScriptGuid always returns a fresh, valid, uppercase GUID

- **WHEN** `newScriptGuid()` is called repeatedly
- **THEN** every result matches `isValidTeleprompterGuid`, is uppercase, and no two calls return the
  same value

#### Scenario: buildScriptRecord derives chapters via splitChapters

- **GIVEN** a guid, a friendly name, and body text containing two blank-line-separated paragraphs
- **WHEN** `buildScriptRecord` is called
- **THEN** the result's `chapters` equals `splitChapters(bodyText)`, and `GUID`/`friendlyName`/`index`
  match the arguments exactly

#### Scenario: appendLibraryGuids preserves every other key and never mutates its input

- **GIVEN** a raw settings object with an existing pointer list and an unrelated key
- **WHEN** `appendLibraryGuids(raw, newGuids)` is called
- **THEN** the result's pointer list is the existing list followed by `newGuids`, the unrelated key is
  unchanged, and the original `raw` object is unchanged afterward

#### Scenario: existingLibraryGuids and appendLibraryGuids degrade a malformed raw value rather than throwing

- **GIVEN** `raw` is `undefined`, `null`, a string, an array, or an object whose pointer-list value is
  not an array
- **WHEN** `existingLibraryGuids(raw)` / `appendLibraryGuids(raw, guids)` are called
- **THEN** neither throws; `existingLibraryGuids` returns `[]` and `appendLibraryGuids` returns a fresh
  object carrying exactly `guids` under `LIBRARY_LIST_KEY`

### Requirement: The CameraHubAppLifecyclePort carries no quit method at all — quitting Camera Hub is never scripted

`src/camera-hub/app-lifecycle.ts`'s `CameraHubAppLifecyclePort` interface SHALL declare EXACTLY two
methods — `isRunning(): Promise<boolean>` and `launch(): Promise<void>` — and SHALL NOT declare any
method that quits or terminates the app. This is a structural guarantee (ADR-0027: quit is semi-manual,
never automated — the smoke test's own `osascript` quit attempt failed on a confirmation dialog Camera
Hub shows). `createDefaultCameraHubAppLifecycle(options?)` SHALL return the one real implementation:
`isRunning` SHALL run `pgrep -f "<processPattern>"` (default pattern `"Camera Hub"`) and resolve `true`
on exit code 0, `false` on exit code 1, and reject on any other outcome; `launch` SHALL run `open -a
"<appName>"` (default `"Elgato Camera Hub"`). No test in this repository SHALL ever call `isRunning()` or
`launch()` on the object this function returns.

#### Scenario: The port's real implementation exposes only isRunning/launch, structurally no quit method

- **GIVEN** `createDefaultCameraHubAppLifecycle()`'s returned port
- **WHEN** its own keys are inspected
- **THEN** `isRunning` and `launch` are functions, and no `quit` property exists on it

### Requirement: uploadTeleprompterScripts is the one tested capability — quit-verify, per-script write, backup, rewrite, relaunch, batched

`uploadTeleprompterScripts(root, lifecycle, scripts, options?)` (`src/camera-hub/upload.ts`) SHALL, for a
non-empty `scripts` batch: call `lifecycle.isRunning()` EXACTLY ONCE; if it resolves `true`, return `{
ok: false, reason: "camera_hub_still_running", uploaded: [] }` WITHOUT writing any file or calling
`lifecycle.launch()`; otherwise, for EACH script in order, write `<root>/Texts/<GUID>.json` (a fresh GUID
per script, `index` continuing from the existing pointer list's length); THEN, ONLY IF `<root>/
AppSettings.json` already exists, back it up VERBATIM (its exact original bytes, unmodified) to a
timestamped `<root>/AppSettings.json.bak-<ts>` sibling BEFORE it is rewritten; THEN rewrite `<root>/
AppSettings.json` with every new GUID appended to the existing pointer list (preserving every other
existing key); THEN call `lifecycle.launch()` EXACTLY ONCE. `isRunning`/`launch` SHALL each be called
EXACTLY ONCE per call to `uploadTeleprompterScripts`, regardless of how many scripts are in the batch. An
empty `scripts` array SHALL immediately return `{ ok: true, uploaded: [] }` WITHOUT ever calling
`isRunning`. `uploadTeleprompterScripts` SHALL NEVER throw: `lifecycle.isRunning()` rejecting, an
unparseable or non-object existing `AppSettings.json` (checked and refused BEFORE any Texts file is
written), or any write failure SHALL each be caught and returned as `{ ok: false, reason, uploaded: []
}`.

#### Scenario: An empty batch is a no-op success and never checks isRunning

- **GIVEN** `scripts` is `[]`
- **WHEN** `uploadTeleprompterScripts` is called
- **THEN** it returns `{ ok: true, uploaded: [] }`, and `lifecycle.isRunning()` was never called

#### Scenario: Camera Hub still running refuses, touches no file, never relaunches

- **GIVEN** a `lifecycle.isRunning()` that resolves `true`, and a non-empty `scripts` batch
- **WHEN** `uploadTeleprompterScripts` is called
- **THEN** it returns `{ ok: false, reason: "camera_hub_still_running", uploaded: [] }`; no `Texts/`
  directory and no `AppSettings.json` are created at `root`; `lifecycle.launch()` is never called

#### Scenario: A fresh root writes one Texts/<GUID>.json per script plus the pointer list, with no backup

- **GIVEN** `lifecycle.isRunning()` resolves `false`, `root` has no pre-existing `AppSettings.json`, and
  a batch of 2 scripts
- **WHEN** `uploadTeleprompterScripts` is called
- **THEN** it returns `{ ok: true, uploaded: [<2 entries>] }`; `<root>/Texts/` contains exactly 2 JSON
  files matching `buildScriptRecord`'s shape (indices 0 and 1); `<root>/AppSettings.json`'s pointer list
  contains exactly the 2 new GUIDs, in order; no `.bak-` file exists anywhere under `root`

#### Scenario: An existing AppSettings.json is backed up verbatim before being rewritten, and its pointer list is appended to

- **GIVEN** `root` already has an `AppSettings.json` with an existing pointer list and an unrelated key,
  and `lifecycle.isRunning()` resolves `false`
- **WHEN** `uploadTeleprompterScripts` uploads one new script
- **THEN** a `<root>/AppSettings.json.bak-<ts>` sibling appears whose content is byte-identical to the
  ORIGINAL file; the rewritten `AppSettings.json`'s pointer list is the ORIGINAL GUIDs followed by the
  new one (never replaced); the unrelated key is preserved; the new script's `index` continues from the
  existing pointer list's length

#### Scenario: Batching — isRunning and launch are each called exactly once across a multi-script batch

- **GIVEN** `lifecycle.isRunning()` resolves `false` and a batch of 3 or more scripts
- **WHEN** `uploadTeleprompterScripts` is called
- **THEN** `lifecycle.isRunning()` was called exactly once and `lifecycle.launch()` was called exactly
  once — never once per script

#### Scenario: An unparseable or non-object AppSettings.json refuses before writing anything

- **GIVEN** `root`'s existing `AppSettings.json` is not valid JSON, OR parses to something other than a
  JSON object (e.g. an array)
- **WHEN** `uploadTeleprompterScripts` is called with `lifecycle.isRunning()` resolving `false`
- **THEN** it returns `{ ok: false, reason, uploaded: [] }`; no `Texts/` directory is created; the
  original `AppSettings.json` is left byte-for-byte unchanged; no backup file is created

#### Scenario: The isRunning check itself failing degrades to a reported failure, never throws

- **GIVEN** a `lifecycle.isRunning()` that rejects
- **WHEN** `uploadTeleprompterScripts` is called
- **THEN** it returns `{ ok: false, reason, uploaded: [] }` (never throws), and `lifecycle.launch()` is
  never called

### Requirement: The sweep is scoped to the news-short-script Recipe only and covers the whole ledger, not one Run

`selectUnuploadedNewsShortScripts(ideas)` (`src/camera-hub/news-short-script.ts`) SHALL, PURELY (no I/O,
no clock), return every Asset across `ideas` whose `recipe` is EXACTLY `"news-short-script"`
(`SUPPORTED_RECIPE`), whose `status` is NOT `"queued"` or `"in_production"`, and which carries no
`camera_hub_uploaded_at`. It SHALL NOT filter by, or require, any Run or Format field — an Asset at
`"posted"`, `"tracking"`, or `"scored"` SHALL be included exactly the same as one at `"produced"` (ADR-
0027's "no silent drops": a leftover Asset from an earlier Run is swept identically to one produced this
session). Each result SHALL pair the Asset with its owning Idea's `id`.

#### Scenario: Includes a produced news-short-script Asset with no upload marker

- **GIVEN** one Idea with one `news-short-script` Asset at `status: "produced"`, no
  `camera_hub_uploaded_at`
- **WHEN** `selectUnuploadedNewsShortScripts` is called
- **THEN** it returns exactly that one Asset, paired with its Idea's id

#### Scenario: Excludes an Asset already carrying camera_hub_uploaded_at

- **GIVEN** a `news-short-script` Asset with `camera_hub_uploaded_at` already set
- **WHEN** `selectUnuploadedNewsShortScripts` is called
- **THEN** it is excluded from the result

#### Scenario: Excludes queued/in_production Assets, and any other Recipe's Asset

- **GIVEN** a `news-short-script` Asset at `status: "queued"`, one at `status: "in_production"`, and a
  `news-carousel` Asset at `status: "produced"`
- **WHEN** `selectUnuploadedNewsShortScripts` is called
- **THEN** none of the three appear in the result

#### Scenario: Includes posted/tracking/scored Assets too — no Run scoping, no silent drops

- **GIVEN** three separate Ideas, each with one `news-short-script` Asset at `status: "posted"`,
  `"tracking"`, and `"scored"` respectively, none carrying `camera_hub_uploaded_at`
- **WHEN** `selectUnuploadedNewsShortScripts` is called
- **THEN** all three are included in the result

### Requirement: outputDirFromSpecPath and stripNextShotMarkers turn one swept Asset into upload-ready input

`outputDirFromSpecPath(specPath, recipe)` (`src/camera-hub/news-short-script.ts`) SHALL derive an
Asset's `.output/` bundle directory from its OWN recorded `spec_path` by replacing the
`.<recipe>.spec.json` suffix with `.<recipe>.output` — never by reconstructing a path from the Idea's
Run/Format. `stripNextShotMarkers(scriptText)` SHALL remove every `NEXT_SHOT_MARKER` block
(`src/asset/news-short-script-output.ts`'s `"[Next shot]"`, surrounded by its rendered blank lines) from
a produced `script.txt`'s text, leaving the original beats' text, still blank-line-separated, so
`splitChapters` recovers exactly the original beat texts as chapters. A marker-free input SHALL round-
trip unchanged.

#### Scenario: outputDirFromSpecPath swaps the .spec.json suffix for .output

- **GIVEN** a `spec_path` ending in `.news-short-script.spec.json`
- **WHEN** `outputDirFromSpecPath(specPath, "news-short-script")` is called
- **THEN** it returns the same path with that suffix replaced by `.news-short-script.output`

#### Scenario: stripNextShotMarkers recovers the original beats from a real rendered script.txt

- **GIVEN** a well-formed Spec's `scriptText(spec)` rendering (which contains the `[Next shot]` marker
  between beats)
- **WHEN** `stripNextShotMarkers` is applied, then `splitChapters` is applied to the result
- **THEN** the resulting chapters equal the Spec's own beats' `text` values, in order, with no `[Next
  shot]` marker anywhere in the output

### Requirement: uploadCameraHubScriptsCommand orchestrates sweep -> read -> batch-upload -> stamp, never blocking, preserving status

`uploadCameraHubScriptsCommand(brand, options?)` (`src/commands/upload-camera-hub-scripts.ts`) SHALL:
sweep the Brand's WHOLE ledger via `selectUnuploadedNewsShortScripts`; for each swept Asset, read its
`script.txt` from `outputDirFromSpecPath(asset.spec_path, "news-short-script")` and, on success, build a
`{ title, bodyText }` input (`title` from the Asset's `copy.title` when present, else the Idea's id;
`bodyText` from `stripNextShotMarkers` of the file's contents) — a missing `spec_path` or an unreadable
`script.txt` SHALL be a non-fatal, individually-reported skip that does not prevent any OTHER swept
Asset's upload; drive EXACTLY ONE call to `uploadTeleprompterScripts` covering every successfully-read
script; and, ONLY when that call succeeds, stamp EACH uploaded Asset's `camera_hub_uploaded_at` (ISO-8601)
via `AssetStore.writeAsset`, passing that Asset's OWN existing `status` UNCHANGED (never regressing a
`posted`/`tracking`/`scored` Asset back to `produced`). When the batch call itself fails (including
`"camera_hub_still_running"`), the ledger SHALL be left completely unchanged for every affected Idea, and
the returned report SHALL name the reason and list the affected Idea ids. When nothing is swept (or every
swept Asset's `script.txt` could not be read), the function SHALL report as much and SHALL NOT call
`lifecycle.isRunning()` at all. `defaultCameraHubRoot()` SHALL return the real macOS path (only used when
`options.root` is omitted); `options.root`/`options.lifecycle` SHALL be the ONLY seams a test needs to
stay hermetic. This module SHALL export a directly-runnable `main()` CLI entry with NO corresponding
`npm run` alias and NO `.claude/commands/*.md` doc (ADR-0027: no standalone command for the Operator).

#### Scenario: Nothing to upload — never checks isRunning

- **GIVEN** a ledger with no `news-short-script` Assets, or where all of them already carry
  `camera_hub_uploaded_at`
- **WHEN** `uploadCameraHubScriptsCommand` is called
- **THEN** it reports nothing to upload, and the injected `lifecycle.isRunning()` is never called

#### Scenario: The happy path uploads every swept Asset in one batch and preserves each Asset's status

- **GIVEN** two Ideas, each with one un-uploaded, readable `news-short-script` Asset — one at `status:
  "produced"`, the other at `status: "posted"` — and `lifecycle.isRunning()` resolving `false`
- **WHEN** `uploadCameraHubScriptsCommand` is called
- **THEN** both Assets are uploaded in ONE batch (`isRunning`/`launch` each called exactly once); both
  Assets' ledger records gain `camera_hub_uploaded_at`; the FIRST Asset's `status` is still `"produced"`
  and the SECOND's is still `"posted"` — neither is regressed

#### Scenario: A missing spec_path or missing script.txt is a non-fatal, reported skip

- **GIVEN** one Idea whose Asset carries no `spec_path`, and a sibling Idea with a valid, readable
  Asset
- **WHEN** `uploadCameraHubScriptsCommand` is called
- **THEN** the first Idea is reported as skipped and its ledger record gains no `camera_hub_uploaded_at`;
  the sibling Idea still uploads successfully

#### Scenario: Camera Hub still running refuses, changes nothing on the ledger

- **GIVEN** one swept, readable Asset and `lifecycle.isRunning()` resolving `true`
- **WHEN** `uploadCameraHubScriptsCommand` is called
- **THEN** the report names `camera_hub_still_running` and lists the affected Idea; the ledger's
  `camera_hub_uploaded_at`/`status` are both unchanged; `lifecycle.launch()` is never called; the
  Idea's `script.txt` on disk is untouched

### Requirement: producer.md documents the Camera Hub upload offer as approval-gated, scoped, semi-manual-quit, batched, and non-blocking

`.claude/agents/producer.md` SHALL document a "Camera Hub teleprompter upload offer" step, scoped
EXPLICITLY to the `news-short-script` Recipe only, with NO standalone command (the Operator never runs it
directly). It SHALL state that the offer sweeps the WHOLE ledger (not just the current Run), that the
producer runs it only after the Operator's explicit approval in the same conversation, that quitting
Camera Hub is the Operator's OWN manual action which the documented code only VERIFIES (never scripts) —
naming `camera_hub_still_running` as the signal to ask again rather than proceed — that relaunching IS
automatic, that the upload is BATCHED (one quit-verify and one relaunch across the whole batch, never one
pair per script), that a failed upload never blocks anything else and `script.txt` remains available for
manual copy-paste, and that the `camera_hub_uploaded_at` marker introduces no new `AssetStatus`. It SHALL
name the real code this sequence follows: `selectUnuploadedNewsShortScripts`
(`src/camera-hub/news-short-script.ts`), `uploadCameraHubScriptsCommand`
(`src/commands/upload-camera-hub-scripts.ts`), and `uploadTeleprompterScripts`
(`src/camera-hub/upload.ts`). The Guardrails section SHALL carry a matching bullet so the rule survives a
skim of that section alone.

#### Scenario: producer.md names the real code and states the offer is scoped, approval-gated, with no standalone command

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `selectUnuploadedNewsShortScripts`, `uploadCameraHubScriptsCommand`, and
  `uploadTeleprompterScripts` with their file paths
- **AND** it states the offer is scoped to the `news-short-script` Recipe only
- **AND** it states there is no standalone command

#### Scenario: producer.md states quit is semi-manual and never proceeds while Camera Hub is still running

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states quitting Camera Hub is the Operator's own manual step, that the code only verifies
  it, and that a `camera_hub_still_running` result means asking the Operator again rather than proceeding

#### Scenario: producer.md states the upload is batched and a failure never blocks anything else

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states one quit-verify and one relaunch cover the whole batch, never one pair per script
- **AND** it states a failed upload never blocks anything else and `script.txt` remains for manual
  copy-paste

#### Scenario: The Guardrails section carries a matching bullet

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** the `## Guardrails` section is read on its own
- **THEN** it states the Camera Hub upload is News-Short-Script-only, offer-gated, and that quit is
  never scripted

