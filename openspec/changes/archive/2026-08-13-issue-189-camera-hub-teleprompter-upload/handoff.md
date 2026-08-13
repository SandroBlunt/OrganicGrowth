# Slice Handoff — issue #189: Camera Hub teleprompter upload

Bidirectional channel between `developer` and `qa` for this slice. Developer writes the Build Report;
`qa` appends its Verdict below (nothing is overwritten); a retry appends a new Round-N Build block.

---

## Build Report (developer, Round 1)

### What changed

Automates uploading a produced `news-short-script` Asset's teleprompter script into Elgato Camera Hub's
own content library, so the Operator no longer copy-pastes it by hand before recording. Builds
`docs/adr/0027-producer-offers-camera-hub-teleprompter-upload.md`'s accepted design:

- A new, Recipe-agnostic Camera Hub teleprompter-library primitive (`src/camera-hub/`): paragraph-
  splitting into chapters, the `Texts/<GUID>.json` record shape + the `AppSettings.json` pointer-list
  read/append logic, and an app-lifecycle port that is deliberately just `isRunning`/`launch` — no `quit`
  method exists anywhere in this codebase (quit is semi-manual, per ADR-0027).
- `uploadTeleprompterScripts` — the ONE tested capability: given an injectable Camera Hub root directory
  and an injectable app-lifecycle port, it verifies the app is quit (once), writes each script's
  `Texts/<GUID>.json`, backs up `AppSettings.json` to a timestamped `.bak-<ts>` sibling (always, before
  rewriting it, only when a prior file exists), rewrites the pointer list, and relaunches (once) — a
  single quit-verify and a single relaunch across the whole batch, never one pair per script. Never
  throws.
- `news-short-script`-scoped glue: a pure sweep (`selectUnuploadedNewsShortScripts`) over the WHOLE Brand
  ledger — no Run/Format scoping — finding every `news-short-script` Asset that is produced-or-later and
  not yet uploaded (ADR-0027's "no silent drops"), plus two pure helpers turning one swept Asset into
  upload-ready input.
- The orchestration shell (`uploadCameraHubScriptsCommand`): sweeps, reads each Asset's `script.txt`,
  drives one batched upload call, and — only on success — stamps `camera_hub_uploaded_at` while
  preserving each Asset's existing `status` exactly (never regressing a `posted`/`tracking`/`scored`
  Asset back to `produced`). A directly-runnable CLI entry exists for the producer's own `Bash` tool;
  there is deliberately no `npm run` alias and no `.claude/commands/*.md` doc (ADR-0027: "no standalone
  command" — the Operator never runs this directly).
- `LedgerAssetRecord` gains an optional `camera_hub_uploaded_at: string` field — the exact same pattern
  as `scheduled_at`: it carries no lifecycle meaning of its own and introduces no new `AssetStatus`. The
  issue's own last acceptance criterion ("No new Asset lifecycle status or ledger field is introduced")
  is read, per ADR-0027 (which post-dates and refines the issue), as "no new lifecycle STATUS, no field
  carrying lifecycle MEANING" — not "no field at all"; a plain marker is structurally required for the
  sweep's own "never re-upload" behavior, exactly like `scheduled_at` makes a re-run of the Schedule
  Batch export converge to "nothing eligible" instead of double-scheduling. This reasoning is spelled out
  explicitly in `proposal.md`'s "Why" section and in the `asset-store` spec delta.
- `.claude/agents/producer.md` documents the offer (a new section + a matching Guardrails bullet),
  mirroring exactly how the Schedule Batch offer (issue #148) was wired: approval-gated, in-conversation,
  never unprompted, naming the real code by file path and function name.
- `CONTEXT.md` gains a **Camera Hub Upload** glossary entry, scoped explicitly to the *News Short Script*
  Recipe.

### Files touched

**New:**
- `src/camera-hub/chapters.ts` (+ `.test.ts`)
- `src/camera-hub/library.ts` (+ `.test.ts`)
- `src/camera-hub/app-lifecycle.ts` (+ `.test.ts`)
- `src/camera-hub/upload.ts` (+ `.test.ts`)
- `src/camera-hub/news-short-script.ts` (+ `.test.ts`)
- `src/camera-hub/fixtures/fake-app-lifecycle.ts` — THE Camera Hub fake (see "Fakes / fixtures used").
- `src/commands/upload-camera-hub-scripts.ts` (+ `.test.ts`, + `.docs-test.ts`)
- `docs/adr/0027-producer-offers-camera-hub-teleprompter-upload.md` (was an untracked draft in the working
  tree at task start; committed as part of this slice, since it is this change's accepted design record).
- `openspec/changes/issue-189-camera-hub-teleprompter-upload/` (proposal.md, tasks.md, spec deltas, this
  file).

**Modified:**
- `src/asset/asset.ts` (+ `asset.test.ts` additions) — `LedgerAssetRecord.camera_hub_uploaded_at`,
  defensively parsed.
- `.claude/agents/producer.md` — new "Camera Hub teleprompter upload offer" section + a matching
  Guardrails bullet.
- `CONTEXT.md` — new **Camera Hub Upload** glossary entry.

**Deliberately NOT touched:** `package.json` (no `npm run` alias — ADR-0027's "no standalone command");
`.claude/commands/` (no new slash-command doc, for the same reason).

### How to run

```
cd /Users/CaxtonTaylor/Developer/OrganicGrowth
npx tsc -p tsconfig.json --noEmit          # type-check
npm test                                    # full unit suite (type-checks first)
npm run test:docs                           # producer.md / ADR-0027 doc-conformance suite
openspec validate issue-189-camera-hub-teleprompter-upload --strict
openspec validate --strict --all            # whole-repo check (also green)
```

Run a single new file directly, e.g.:
```
node --import tsx --test src/camera-hub/upload.test.ts
node --import tsx --test src/camera-hub/news-short-script.test.ts
node --import tsx --test src/commands/upload-camera-hub-scripts.test.ts
node --import tsx --test src/commands/upload-camera-hub-scripts.docs-test.ts
```

The producer would run the real command via its own Bash tool, e.g.:
```
npx tsx src/commands/upload-camera-hub-scripts.ts <brand>
```
(never during a test — every test injects `options.root`/`options.lifecycle`).

### Acceptance-criteria self-assessment

| # | Issue #189 acceptance criterion | Proven by |
|---|---|---|
| 1 | `addTeleprompterScript`-shaped capability exists, handles quit -> write -> backup -> rewrite -> relaunch, and supports batching (single quit/relaunch across multiple scripts) | `src/camera-hub/upload.test.ts` — "writes one Texts/<GUID>.json per script, the pointer list, and relaunches exactly once" (order + single-batch write/rewrite/relaunch) and "Batching: isRunning and launch are each called exactly once across a multi-script batch" (via `lifecycle.isRunningCalls`/`launchCalls` assertions); `src/commands/upload-camera-hub-scripts.test.ts`'s "uploads every swept Asset in ONE batch" (2 Ideas, one `isRunning`/one `launch` call) |
| 2 | `AppSettings.json` is always backed up (timestamped `.bak-<ts>`) before it's rewritten | `upload.test.ts`'s "backs up the ORIGINAL AppSettings.json verbatim before rewriting, and appends to (never replaces) the existing pointer list" (asserts the `.bak-<ts>` filename shape and byte-identical original content) and "writes one Texts/<GUID>.json per script..." (asserts NO backup file when there was nothing to back up yet — a fresh root) |
| 3 | Once a Run's `news-short-script` Asset(s) are produced, the producer offers the Camera Hub upload conversationally and runs it only after the Operator approves in that same conversation — never unprompted | `.claude/agents/producer.md`'s new "Camera Hub teleprompter upload offer" section, pinned by `src/commands/upload-camera-hub-scripts.docs-test.ts` ("names the offer section, scoped to news-short-script only, with no standalone command"; "states the sweep covers the WHOLE ledger, no silent drops"; the matching Guardrails-bullet test). The approval gate itself is conversational producer behavior (not typed code) — mirrors exactly how issue #148's Schedule Batch offer was proven (its own approval step has no unit test either; `schedule-batch-approval-gate`'s spec is docs-only) |
| 4 | A failed upload (app won't quit, Camera Hub not installed, schema mismatch, etc.) never fails the Asset's produce/save step — reported, `script.txt` remains for manual paste | `upload.test.ts`'s "Camera Hub still running: refuses, touches NO file, never relaunches", "the running check itself failing degrades to a reported failure, never throws", "refuses (and touches nothing) when AppSettings.json is not valid JSON" / "...non-object"; `upload-camera-hub-scripts.test.ts`'s "Camera Hub still running (issue #189, ADR-0027)" describe block (ledger untouched, `script.txt` still readable with its original content) and the "non-fatal skips" describe block (a missing `spec_path`/unreadable `script.txt` never blocks a sibling Asset) |
| 5 | Tests run against an injectable/fake Camera Hub root directory and a fake app-lifecycle — never the real `~/Library/Application Support/Elgato/Camera Hub/`, never actually quit/relaunch the real app | EVERY test in `src/camera-hub/upload.test.ts` and `src/commands/upload-camera-hub-scripts.test.ts` uses a freshly `mkdtemp`'d temp directory as the Camera Hub root and `FakeCameraHubAppLifecycle` (`src/camera-hub/fixtures/fake-app-lifecycle.ts`) as the lifecycle port; `src/camera-hub/app-lifecycle.test.ts` proves the ONE real implementation's shape (`isRunning`/`launch` exist as functions, no `quit` method) WITHOUT ever invoking either method — see "Fakes / fixtures used" below |
| 6 | No new Asset lifecycle status or ledger field carrying lifecycle meaning is introduced — a convenience step, same pattern as `scheduled_at` | `src/asset/asset.test.ts`'s new `camera_hub_uploaded_at` describe block, specifically "adding camera_hub_uploaded_at does not add a new AssetStatus — the six-stage vocabulary is unchanged"; `upload-camera-hub-scripts.test.ts`'s "preserves status" assertions (a `posted` Asset stays `posted`); the `asset-store` spec delta's own "introduces no new AssetStatus" scenario. See `proposal.md`'s "Why" section for the explicit reasoning on why a PLAIN marker field (no lifecycle meaning) satisfies this criterion, per ADR-0027 |

### Fakes / fixtures used

- **THE Camera Hub fake — `src/camera-hub/fixtures/fake-app-lifecycle.ts`'s `FakeCameraHubAppLifecycle`.**
  Entirely in-memory: `isRunning()`/`launch()` are recorded (call counts) and driven by an injectable
  `running` boolean the test sets directly — no real process is ever spawned, checked, quit, or launched
  by any test in this slice. Mirrors `FakeMediaHost`/`FakeZohoSchedulePort`'s own established pattern.
- **The Camera Hub root directory** is a fresh `mkdtemp`'d OS temp directory in every test (never
  `~/Library/Application Support/Elgato/Camera Hub/`) — confirmed by grepping the whole `src/camera-hub/`
  and `src/commands/upload-camera-hub-scripts*` tree for that literal path: it appears ONLY inside
  `defaultCameraHubRoot()`'s own implementation and its doc comments, never in a test file.
  `defaultCameraHubRoot()`/`createDefaultCameraHubAppLifecycle()`'s REAL, `pgrep`/`open`-backed default
  implementation is constructed (shape-checked) but its `isRunning`/`launch` methods are NEVER called by
  any test (`app-lifecycle.test.ts`'s own doc comment states this explicitly).
- **News Short Script fixture:** `validNewsShortScriptSpec()` (`src/production-spec/fixtures/
  news-short-script-specs.ts`, pre-existing) is reused, unmodified, in `news-short-script.test.ts` to
  prove `stripNextShotMarkers` against a REAL `scriptText(spec)` rendering rather than a hand-typed
  approximation.
- **No Magnific fake needed.** The News Short Script Recipe is Space-less (ADR-0021, unchanged by this
  slice) — nothing here imports a `SpaceMcpPort`/`FakeSpace`, and no file calls a `spaces_*`/`creations_*`
  tool.

### Self-review notes

- Considered giving `uploadCameraHubScriptsCommand` an `npm run` alias (matching `export-schedule`'s own
  real, working default implementation) but deliberately did NOT — ADR-0027's "there is no standalone
  command" reads as "the Operator never gets a bare CLI entry point that bypasses the conversational
  approval gate", so the only entry point is a directly-runnable `main()` the producer's own `Bash` tool
  invokes, with no `package.json` script and no `.claude/commands/*.md` doc advertising it.
- Considered building `outputDirFromSpecPath`/`stripNextShotMarkers`'s glue by re-loading and re-
  rendering the full saved `NewsShortScriptSpec` JSON (reusing `scriptText(spec)` directly) instead of
  reading the already-produced `script.txt` and stripping its marker. Chose the simpler, already-produced-
  artifact path: it needs no Spec-contract import into the sweep/upload path, degrades gracefully for a
  legacy Asset whose Spec shape might drift over time, and is exactly what the Operator would have
  copy-pasted by hand anyway.
- Removed an initial draft that carried a full `CommandRunner`-abstraction layer (mirroring
  `media-host/live/command-runner.ts`) for the `pgrep`/`open` calls — simplified to two direct, narrow
  `node:child_process.execFile` wrappers inside `app-lifecycle.ts` once it was clear the extra
  abstraction layer bought nothing here (there is only ONE real caller, and it is never exercised by any
  test either way).
- Fixed one collision discovered by `npm run test:docs`: an early draft of the new CONTEXT.md glossary
  entry used the bolded literal `**Schedule Batch**` inside its own body text, which made
  `src/schedule-batch/approval-gate.docs-test.ts`'s `doc.indexOf("**Schedule Batch**")` match the WRONG
  (earlier) occurrence. Reworded to reference Schedule Batch without re-triggering that exact bolded
  string.
- Confirmed the field-vs-criterion tension the task brief flagged (issue #189's last acceptance criterion
  vs. ADR-0027's plain-marker decision) is real and resolved it explicitly in `proposal.md`'s "Why"
  section and in the `asset-store` spec delta's Requirement doc, rather than leaving it implicit.

### Known limits

- **No live Camera Hub verification anywhere in this build.** The schema (`Texts/<GUID>.json` +
  `AppSettings.json`'s `applogic.prompter.libraryList`) is exactly what the 2026-08-12 smoke test
  captured (Camera Hub v2.3.0 / macOS 26.5.2) — a future Camera Hub update could change it without
  notice, which is exactly why every failure here is non-fatal and `script.txt` always stays available.
  Confirming against a REAL install is an Operator-run manual smoke check outside this pipeline (out of
  scope, per ADR-0027/the proposal's Non-Goals).
- **Automated quit and the WebSocket/local-port route are both explicitly out of scope**, per ADR-0027 —
  not attempted, not spiked.
- **Pre-existing, unrelated test failure**, confirmed present on `main` BEFORE this slice's changes (via
  `git stash` + a clean re-run): `src/format/store.test.ts`'s `listFormatSlugs` subtest ("mundotip and
  straw-motion are migrated to their own Format files (issue #53 AC2)"). Not touched or caused by this
  slice.
- The working tree also carries pre-existing, uncommitted content-loop changes under
  `data/brands/straw-motion/` (several `idea-*.spec.json` files and `ledger.json`) that predate this
  session and are NOT part of this slice — left untouched, unstaged, and uncommitted, per the task
  instructions.

---

## QA Verdict — Round 1: PASS

### Suite result

- **Type-check:** `npx tsc -p tsconfig.json --noEmit` — green, no errors.
- **Full unit suite:** `npm test` — **2310 tests, 2309 pass, 1 fail** (575 suites). Command run exactly as
  documented in the Build Report's "How to run" section; output captured directly from this run, not
  assumed.
  - The 1 failure is `src/format/store.test.ts` → `mundotip and straw-motion are migrated to their own
    Format files (issue #53 AC2)` → subtest `listFormatSlugs finds both real Brands' migrated Format`.
  - **Verified independently as pre-existing on `main`**, not caused by this slice: added a read-only
    `git worktree` at `main` (commit `e062b11`), symlinked `node_modules` in (no `npm install`, no
    mutation of the real checkout), and ran `node --import tsx --test src/format/store.test.ts` there
    directly (no build-branch code involved at all). Same subtest fails there too, with the identical
    assertion (`listFormatSlugs` returns `['unhypped-daily', 'unhypped-news']`, expected
    `['unhypped-news']`) — i.e. a real Format directory (`unhypped-daily`) exists on disk that this old
    test's fixture/expectation predates. Confirms the developer's claim; the worktree was removed
    (`git worktree remove --force`) after the check, leaving the main checkout untouched.
  - No NEW failure introduced by this slice. Suite result: **effectively green** (1 confirmed
    pre-existing, unrelated failure — not a defect of this slice).
- **Docs-conformance suite:** `npm run test:docs` — **249 tests, 249 pass, 0 fail** (65 suites),
  including all 11 new Camera Hub docs-test assertions in
  `src/commands/upload-camera-hub-scripts.docs-test.ts`.
- **`openspec validate issue-189-camera-hub-teleprompter-upload --strict`** → `Change
  'issue-189-camera-hub-teleprompter-upload' is valid` (exit 0).
- **`openspec validate --strict --all`** → `Totals: 41 passed, 0 failed (41 items)`, including
  `change/issue-189-camera-hub-teleprompter-upload`.

### Per-criterion results (issue #189 acceptance criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `addTeleprompterScript`-shaped capability, quit → write → backup → rewrite → relaunch order, batched (single quit/relaunch across multiple scripts) | **PASS** | `src/camera-hub/upload.ts`'s `uploadTeleprompterScripts` implements exactly this order (verified by reading the source: `isRunning()` once → per-script `Texts/<GUID>.json` write loop → conditional backup → pointer-list rewrite → `launch()` once). Proven by `src/camera-hub/upload.test.ts`'s "writes one Texts/<GUID>.json per script, the pointer list, and relaunches exactly once" and "Batching: isRunning and launch are each called exactly once across a multi-script batch" (both run, both pass) — asserts `lifecycle.isRunningCalls === 1` and `lifecycle.launchCalls === 1` across a 2-script and 3-script batch respectively. Orchestration-level batching (2 Ideas → 1 quit-check/1 relaunch) additionally proven by `upload-camera-hub-scripts.test.ts`'s "uploads every swept Asset in ONE batch" (ran, passed). |
| 2 | `AppSettings.json` always backed up (`.bak-<ts>`) BEFORE rewrite | **PASS** | Code: `uploadTeleprompterScripts` reads+validates `AppSettings.json` before any write, backs it up verbatim to `backupPath(settingsPath, now())` only `if (settings.exists)`, strictly before the pointer-list rewrite. Test "backs up the ORIGINAL AppSettings.json verbatim before rewriting..." (ran, passed) asserts the `.bak-<ts>` filename regex `AppSettings\.json\.bak-2026-08-13T09-00-00-000Z` and byte-identical content; "writes one Texts/<GUID>.json per script..." (ran, passed) asserts NO backup file on a fresh root (nothing to back up — correct, not a violation of "always"). |
| 3 | Producer offers the upload conversationally after `news-short-script` Assets are produced, runs only on Operator approval, same conversation, never unprompted | **PASS** | `.claude/agents/producer.md` lines 430–464 ("Camera Hub teleprompter upload offer") explicitly states: "you run it yourself, and only after they approve, in the SAME conversation — never unprompted, mirroring the Schedule Batch offer above." Pinned by 7 real, regex-based assertions in `src/commands/upload-camera-hub-scripts.docs-test.ts` (ran, all pass) plus a matching Guardrails bullet (line 489–494), also pinned. No unit test can cover "approval-gated conversational behavior" any more than issue #148's own Schedule Batch offer can (also docs-only) — this is the correct, precedented proof shape for this specific criterion. |
| 4 | Failed upload never fails produce/save; reported; `script.txt` stays usable | **PASS** | Verified the actual error paths in `upload.ts`: (a) app still running → returns `{ ok:false, reason:"camera_hub_still_running" }`, no file touched, `launch()` never called (test "Camera Hub still running: refuses, touches NO file, never relaunches", ran, passed); (b) `isRunning()` itself rejecting → caught, returned as failure, never throws (test "the running check itself failing degrades to a reported failure, never throws", ran, passed); (c) malformed `AppSettings.json` (invalid JSON or non-object) → refuses before any Texts write, original file untouched, no backup (2 tests, ran, passed). At the orchestration layer, missing `spec_path` / unreadable `script.txt` is an individually-reported, non-fatal skip that never blocks a sibling Asset (`upload-camera-hub-scripts.test.ts`'s "non-fatal skips" describe block, ran, passed) and "Camera Hub still running" leaves the ledger and `script.txt` completely untouched (same file's dedicated describe block, ran, passed — explicitly re-reads `script.txt` off disk to confirm it is byte-identical to what was written). `uploadCameraHubScriptsCommand` itself never throws in any exercised path; nothing in the produce/save path (`src/asset/news-short-script-output.ts`) was touched or made to depend on this feature. |
| 5 | Tests use injectable/fake Camera Hub root + fake app-lifecycle; never the real `~/Library/.../Camera Hub/`, never a real quit/relaunch | **PASS** | Grepped the whole `src/camera-hub/` + `src/commands/upload-camera-hub-scripts*` tree for `Library/Application Support`, `pgrep`, `osascript`, `execFile`, `open -a`/`'open'`, `spawn(` — every hit is either inside `app-lifecycle.ts`'s own real-implementation source (never exercised — see below) or inside a doc-comment describing what NOT to do; zero hits inside any `*.test.ts`/`*.docs-test.ts` file's executable code. `src/camera-hub/app-lifecycle.test.ts` is explicitly shape-only: constructs `createDefaultCameraHubAppLifecycle()` and asserts `typeof port.isRunning === "function"`/`typeof port.launch === "function"`/no `quit` property — it never calls either method (confirmed by reading the file in full). Every behavioral test (`upload.test.ts`, `upload-camera-hub-scripts.test.ts`) roots Camera Hub at a fresh `mkdtemp(join(tmpdir(), "og-camera-hub-*"))` directory, cleaned up in a `finally`, and injects `FakeCameraHubAppLifecycle` (`src/camera-hub/fixtures/fake-app-lifecycle.ts` — a plain in-memory class recording call counts, never spawning a process). |
| 6 | No new Asset lifecycle status or ledger field carrying lifecycle meaning | **PASS (as refined by ADR-0027)** | Confirmed `AssetStatus` (`src/asset/asset.ts`) is unchanged — still the same six-stage union (`queued`/`in_production`/`produced`/`posted`/`tracking`/`scored`); `camera_hub_uploaded_at` is a plain optional `string` field, parsed defensively (kept only when non-empty), mirroring `scheduled_at` exactly. Proven by `asset.test.ts`'s new describe block (5 tests, ran, passed — including "adding camera_hub_uploaded_at does not add a new AssetStatus" and "a write to one Asset does not erase a sibling Asset's camera_hub_uploaded_at"), and by `uploadCameraHubScriptsCommand`'s own explicit status-preservation test (below). The literal issue text ("No new... ledger field is introduced") is technically NOT satisfied by a literal reading, but ADR-0027 — the accepted, issue-post-dating triage decision the task brief instructs QA to treat as authoritative where it refines the issue — explicitly decides this field IS the design ("Tracked with a plain field, not a new lifecycle status... same pattern as `scheduled_at`"). `proposal.md`'s "Why" section spells out this exact tension and resolution explicitly, as required. This is a faithful application of "where the ADR refines the issue, the ADR wins" — not a silent contradiction. |

### Per-scenario spot-check (spec deltas)

Spot-checked a representative sample of Scenarios across both delta files against the actual code and
tests (not just re-reading the spec's own prose):

| Spec Requirement / Scenario | Result | Note |
|---|---|---|
| `splitChapters` — blank-line splitting, internal-newline collapsing, multi-blank-line collapse, leading/trailing-blank drop, empty→`[]` | **PASS** | `src/camera-hub/chapters.ts`'s regex-based implementation (`split(/\n\s*\n/)`, `.replace(/\s*\n\s*/g, " ")`, `.filter(len>0)`) matches every scenario; `chapters.test.ts` exercises each one directly. |
| `library.ts` — GUID shape/uniqueness, `buildScriptRecord` derives via `splitChapters`, `appendLibraryGuids` preserves+never mutates, malformed-raw degradation | **PASS** | Read `library.ts` in full; `existingLibraryGuids`/`appendLibraryGuids` both guard with `isPlainObject`/`Array.isArray` and never touch `raw` in place (`{ ...raw }` clone). `library.test.ts` covers all four scenarios. |
| `CameraHubAppLifecyclePort` — exactly `isRunning`/`launch`, no quit method, structural guarantee | **PASS** | Interface literally declares only these two methods; `app-lifecycle.test.ts`'s "has no quit method at all" scenario asserts `Object.hasOwn(port, "quit") === false`. |
| `uploadTeleprompterScripts` — all 6 scenarios (empty-batch no-op, still-running refuses, fresh-root write+no-backup, existing-settings backup+append, batching count, malformed-settings refuses-before-write) | **PASS** | All 6 map 1:1 to a distinct `it(...)` in `upload.test.ts`; ran and passed individually (see Suite result). |
| Sweep scenarios (includes produced, excludes already-uploaded, excludes queued/in_production/other-Recipe, includes posted/tracking/scored, multi-Idea pairing, empty→`[]`) | **PASS** | `news-short-script.test.ts`'s `selectUnuploadedNewsShortScripts` describe block covers all 6+ cases; code correctly excludes only `NOT_YET_PRODUCED = {queued, in_production}` and filters on `recipe === SUPPORTED_RECIPE` and `camera_hub_uploaded_at === undefined`. |
| `outputDirFromSpecPath` — swaps `.spec.json`→`.output` suffix | **PASS, with a verified caveat noted below (not a defect)** | See "Spec faithfulness" section. |
| `stripNextShotMarkers` — recovers original beats from a REAL `scriptText(spec)` rendering | **PASS** | `NEXT_SHOT_MARKER = "[Next shot]"` and `scriptText`'s join separator (`\n\n${NEXT_SHOT_MARKER}\n\n`) in `src/asset/news-short-script-output.ts` match `stripNextShotMarkers`'s `markerBlock` exactly, byte-for-byte; `news-short-script.test.ts` proves the round-trip against the real fixture (`validNewsShortScriptSpec()`), not a hand-typed approximation — ran, passed. |
| Orchestration — nothing-to-do, happy-path batched+status-preserved, non-fatal skip, still-running-refuses-and-changes-nothing | **PASS** | All map to distinct describe/it blocks in `upload-camera-hub-scripts.test.ts`; the status-preservation scenario specifically asserts a `posted` Asset stays `posted` (never regressed to `produced`) — ran, passed. |
| `producer.md` documentation scenarios (names real code, states semi-manual quit, states batching+non-blocking, Guardrails bullet) | **PASS** | All 4 scenario groups map to real regex assertions in `upload-camera-hub-scripts.docs-test.ts`; read `producer.md`'s actual shipped section (lines 430–464, 489–494) and confirmed the quoted prose exists verbatim, not just asserted in the test. |
| `asset-store` delta — round-trips, malformed→omitted-never-fabricated, no new `AssetStatus`, sibling-Asset write isolation | **PASS** | All 4 map directly to `asset.test.ts`'s new describe block; read `parseAssetRecord`'s implementation (`nonEmptyString` guard) and confirmed it matches. |

### Spec faithfulness (issue #189 + ADR-0027 vs. the OpenSpec change)

- **`outputDirFromSpecPath` suffix-swap vs. the real naming convention** — verified directly against
  `src/production-spec/store.ts`'s `specPathFor` (`.../idea-NN.<recipe>.spec.json`) and
  `src/asset/output-bundle.ts`'s `outputDirFor` (`.../idea-NN.<recipe>.output`): both are built from the
  SAME `briefShortName(ideaId, run)}.${recipe}` base, so a plain suffix swap (`.spec.json` → `.output`)
  is exact, not a guess — the code's own doc comment names both real functions correctly. **The
  legacy-`.assets/`-dir caveat is real but does NOT apply here**: `git log` confirms the `news-short-script`
  Recipe was introduced by issue #174 (`commit 11921ab`), which post-dates issue #112's `.assets/` → 
  `.output/` rename entirely — no `news-short-script` Asset has ever existed with the old `.assets/`
  naming, confirmed by `find data/brands -iname "*.news-short-script.assets"` returning zero results
  against the seven real `news-short-script` Assets in `data/brands/straw-motion/`, all of which are
  `.output/`-named. Unlike `refreshPostJson` (which deliberately resolves from `asset.asset_paths` to
  stay correct for pre-#112 Assets of OTHER Recipes), `outputDirFromSpecPath` reconstructing from
  `spec_path` is therefore safe in every case this Recipe can actually produce. This is a defensible,
  verified design choice, not a latent bug — noted for the record, not a defect.
- **The added `main()` CLI entry in `upload-camera-hub-scripts.ts` vs. ADR-0027's "no standalone
  command"** — judged **acceptable, not a violation**. Confirmed: no `npm run` alias in `package.json`
  (grepped, zero hits), no `.claude/commands/*.md` doc for it (checked the directory). The ADR's "no
  standalone command" language, read in context (mirroring issue #148/ADR-0008's Schedule Batch offer
  pattern), is about denying the OPERATOR a bypass around the conversational approval gate — not about
  forbidding the producer's own Bash tool from having a concrete, runnable entry point, which it
  structurally needs here (unlike Zoho scheduling, Camera Hub has no MCP tool surface the producer can
  call natively — file I/O and process checks can only run as a script). `producer.md` names the exact
  invocation (`npx tsx src/commands/upload-camera-hub-scripts.ts <brand>`) only inside its own documented,
  approval-gated sequence, never surfaced to the Operator as a command they'd run themselves. This
  precedent already exists elsewhere in the codebase (e.g. `pick.ts`, `pick-cast.ts`, `log-post.ts` all
  export a `main()` used by their respective slash commands' underlying scripts) — the distinguishing,
  correctly-upheld fact here is the absence of BOTH the npm alias AND the `.claude/commands/*.md` doc,
  which is what actually would have exposed it to the Operator.
- **Status preservation** — ran `upload-camera-hub-scripts.test.ts`'s "uploads every swept Asset in ONE
  batch, stamps camera_hub_uploaded_at, preserves status" test directly: confirms `idea-02`'s Asset,
  seeded at `status: "posted"`, is re-read from the ledger afterward still at `"posted"` (`assert.equal(
  assets2![0]!.status, "posted", "status must be preserved, never regressed to produced")`) — passed.
- **The two-method lifecycle port** — confirmed `CameraHubAppLifecyclePort` (`app-lifecycle.ts`) declares
  exactly `isRunning`/`launch`, structurally no `quit` method exists anywhere in the codebase (grepped
  `src/camera-hub/` for `quit` — zero matches outside doc comments explaining its absence). `upload.ts`'s
  logic only ever reads `isRunning()` and, if `true`, refuses without proceeding — the caller
  (`producer.md`) documents the re-ask loop ("ask the Operator to quit again and re-run, never proceed on
  your own guess that it is closed"), pinned by a docs-test regex match. This is genuinely semi-manual:
  there is no code path in this slice that could ever attempt an automated quit.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | **PASS** | Grepped `src/camera-hub/` + `src/commands/upload-camera-hub-scripts.ts` for `Facebook`/`Zoho`/`post_url`/`publish` — the only hit is a doc-comment mentioning `scheduleViaZohoMcpCommand` as an analogy, not a call. Uploading to a local teleprompter app's own on-disk library is not publication (nothing goes out to a platform); `post_url`/`/log-post` remain the only path to `posted`, untouched by this slice. |
| Public-metrics-only | **PASS (not applicable)** | No metrics code touched; `src/camera-hub/` and `upload-camera-hub-scripts.ts` do not import anything from `src/performance/`. |
| Relative-not-absolute | **PASS (not applicable)** | No scoring/comparison logic in this slice. |
| Explicit-attribution | **PASS** | `post_url`/Idea↔Post linkage is untouched; `camera_hub_uploaded_at` has no relationship to Post attribution. |
| Ledger-as-source-of-truth | **PASS** | `uploadCameraHubScriptsCommand` writes exclusively through `writeAsset` (`src/asset/store.ts`), the existing typed store boundary — read the implementation directly: it loads the ledger JSON, patches the one matching Idea's Asset via `upsertAsset`, and does an atomic file write; no second, hand-maintained store is created. `post.json`'s `PostJson` shape is intentionally NOT extended with `camera_hub_uploaded_at` (it's a publish/tracking view, not an upload-bookkeeping one) — correct, not a defect. |
| No live Magnific calls | **PASS** | Grepped the new tree for `spaces_`/`creations_`/`SpaceMcpPort` — zero executable hits (one doc-comment reference to `SpaceMcpPort` by name, as an analogy for the app-lifecycle port's own design, not a usage). The News Short Script Recipe is Space-less (ADR-0021), confirmed unchanged. |
| Magnific/Camera-Hub fake used, hermetic build | **PASS** | Fully re-verified independently in this Round (see per-criterion #5 above): every behavioral test uses `mkdtemp` + `FakeCameraHubAppLifecycle`; the one real, `pgrep`/`open`-backed implementation (`createDefaultCameraHubAppLifecycle`) is constructed but its methods are never invoked by any test. |

### Hygiene check

- `git log --stat e062b11..HEAD` confirms exactly the three claimed commits
  (`045b48c`/`186b081`/`7d4f612`), touching only the files the Build Report lists — 24 files, all under
  `.claude/agents/`, `CONTEXT.md`, `docs/adr/`, `openspec/changes/issue-189-...`, `src/asset/`,
  `src/camera-hub/`, `src/commands/`. **No `data/brands/` file is included in any of the three commits.**
- `git status --short` at the time of this verdict shows the SAME 6 pre-existing, uncommitted
  `data/brands/straw-motion/` modifications noted in the environment's initial git status (5
  `idea-*.spec.json` files + `ledger.json`) — untouched, unstaged, exactly as the developer's "Known
  limits" section describes. Confirmed this content-loop working-tree state was NOT committed anywhere
  in this slice's history.

### Defect list

None. No blocking, major, or minor defects found in this round.

**Overall: PASS.** All 6 acceptance criteria are satisfied by real, passing tests (or, for criterion 3's
conversational-approval behavior, by the same docs-conformance proof shape already established and
accepted for the precedent Schedule Batch offer). The OpenSpec change faithfully matches issue #189 as
refined by ADR-0027, with the one issue/ADR tension (criterion 6's literal wording vs. the plain-marker
field) explicitly surfaced and resolved in `proposal.md`, as the task required. The suite is green except
for one test independently re-confirmed to be pre-existing and unrelated on `main`. The build is
hermetic — no live Camera Hub process, no live Magnific Space, no publish action anywhere in the new
code.
