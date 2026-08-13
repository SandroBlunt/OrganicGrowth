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
