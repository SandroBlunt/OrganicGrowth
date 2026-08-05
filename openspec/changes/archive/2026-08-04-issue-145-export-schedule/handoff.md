# Slice Handoff — issue #145: Schedule Batch: /export-schedule — run-scoped Zoho bulk export (tracer bullet)

## Build Report (developer, Round 1)

### What changed and why

Parent #140 (the Schedule Batch spec) and its three blocker slices (#141 ledger `scheduled_at`
round-trip, #143 per-Brand Zoho Social Brand config, #144 the Media Host port) built every seam this
export needs. Issue #145 is the tracer bullet: the actual `/export-schedule <brand> <format> <run>
<start-date>` command that turns a run's produced News Carousel Assets into the two Zoho-ready CSVs, a
manifest, and stamped `scheduled_at` fields — end to end, hermetically tested against the Media Host
fake.

The command is a thin orchestration shell (`src/commands/export-schedule.ts`) over eight new, pure deep
modules under `src/schedule-batch/`:

- `eligibility.ts` — which Assets qualify (`recipe: "news-carousel"`, `status: "produced"`, no
  `scheduled_at` yet); a video Asset (any other Recipe) is skipped with a note; an already-scheduled
  Asset is skipped too (this is what makes a re-run schedule nothing twice).
- `select.ts` — reads a run's Ideas off the raw ledger, scoped to `(format, run)` (`ledger.ts`'s
  `loadIdeas` doesn't expose `run`/`title`, which this export needs).
- `timezone.ts` — pure zoned-time <-> UTC math via `Intl.DateTimeFormat` only (no new dependency): the
  classic two-pass "guess, measure the offset, correct" technique, DST-aware.
- `schedule.ts` — deterministic one-Asset-per-day derivation across the 7:00-22:00 US-Eastern targeting
  window (a fixed rotation, off the round minute), plus the load-bearing `>=1h`-future guard.
- `csv.ts` — the live-verified Zoho bulk-scheduler CSV dialect (no header row, bare `MM/DD/YYYY HH:mm`,
  quoted Channels/Post Content with literal `\n`, ragged unquoted media fields, empty Link/GMB columns,
  350-row cap) plus the per-Zoho-Social-Brand CSV filename derivation.
- `media-key.ts` — the S3 object key layout: `<brand>/<run>/<idea-short-name>/<slide-base-name>.jpg`.
- `plan.ts` — `validateAssetsForExport` (the pure preflight pass — never fabricate) and
  `buildSchedulePlan` (the pure assembly of CSVs + manifest + summary + ledger stamps).
- `manifest.ts` — the cleanup contract (per Asset: scheduled time, hosted S3 keys, public URLs, stripped
  notes).

The orchestration shell wires these together, hosts each eligible Asset's slides once via the injected
`MediaHostPort` (issue #144 — the fake in every test, never live S3), writes the CSVs + manifest into the
run folder next to the output bundles, and stamps `scheduled_at` via `AssetStore.writeAsset` — `status`
stays `"produced"` (ADR-0011's lifecycle is unchanged).

### Files touched

New:
- `src/commands/export-schedule.ts` (+ `export-schedule.test.ts`, `export-schedule.docs-test.ts`)
- `src/schedule-batch/eligibility.ts` (+ `.test.ts`)
- `src/schedule-batch/select.ts` (+ `.test.ts`)
- `src/schedule-batch/timezone.ts` (+ `.test.ts`)
- `src/schedule-batch/schedule.ts` (+ `.test.ts`)
- `src/schedule-batch/csv.ts` (+ `.test.ts`)
- `src/schedule-batch/media-key.ts` (+ `.test.ts`)
- `src/schedule-batch/plan.ts` (+ `.test.ts`)
- `src/schedule-batch/manifest.ts` (+ `.test.ts`)
- `.claude/commands/export-schedule.md`
- `openspec/changes/issue-145-export-schedule/{proposal.md,tasks.md,handoff.md,specs/schedule-batch-export/spec.md,specs/brand-commands/spec.md}`

Modified:
- `package.json` — added the `export-schedule` npm script only.

Nothing else was touched: `git status --short` shows exactly the above plus `M package.json` — no file
under `src/space-driver/**`, `src/production-spec/**`, `src/asset/**`, `src/ledger/**`,
`src/media-host/**`, or `data/**` was modified (this slice reads/consumes those already-merged seams
read-only, via their existing typed store/port boundaries).

### How to run

- Full suite (type-check + tests): `npm test` — **1836 passing / 0 failing / 476 suites** (baseline
  before this slice: 1745 passing / 452 suites — this slice adds **91 tests across 24 new `describe`
  suites**, confirmed standalone via
  `node --import tsx --test "src/schedule-batch/**/*.test.ts" "src/commands/export-schedule.test.ts"`
  → **91 passing / 0 failing / 24 suites**, exactly matching the full-suite delta — see the
  per-module counts below).
- Docs tests: `npm run test:docs` — **147 passing / 0 failing / 37 suites** (this slice's own
  `export-schedule.docs-test.ts` contributes 9 of those, 1 new suite).
- Build: `npm run build` — clean.
- OpenSpec: `npx openspec validate issue-145-export-schedule --strict` — valid.
- Single-module runs (test-first granularity):
  - `node --import tsx --test src/schedule-batch/timezone.test.ts` — 12 passing
  - `node --import tsx --test src/schedule-batch/schedule.test.ts` — 12 passing
  - `node --import tsx --test src/schedule-batch/eligibility.test.ts` — 8 passing
  - `node --import tsx --test src/schedule-batch/select.test.ts` — 6 passing
  - `node --import tsx --test src/schedule-batch/media-key.test.ts` — 6 passing
  - `node --import tsx --test src/schedule-batch/csv.test.ts` — 20 passing
  - `node --import tsx --test src/schedule-batch/manifest.test.ts` — 3 passing
  - `node --import tsx --test src/schedule-batch/plan.test.ts` — 17 passing
  - `node --import tsx --test src/commands/export-schedule.test.ts` — 7 passing
  - `node --import tsx --test src/commands/export-schedule.docs-test.ts` — 9 passing (run via
    `npm run test:docs`, not `npm test`)

### Acceptance-criteria self-assessment

1. **"Running against a fixture run produces the two CSVs byte-exact in the verified dialect, the
   manifest, `scheduled_at` stamps readable back through the store, and the expected upload calls on the
   fake Media Host — with the original PNGs untouched."**
   - Dialect byte-exactness (unit level): `csv.test.ts`'s "matches the live-verified dialect
     byte-for-byte for a 7-slide carousel row" and "produces a RAGGED row with only 4 media fields for X
     (never quoted or comma-joined)" assert the EXACT string, character for character, against the
     live-verified column order/quoting/newline-encoding rules.
   - End-to-end (command level): `export-schedule.test.ts`'s "exports a happy-path run: two CSVs
     (byte-exact dialect), a manifest, readable scheduled_at, and the expected Media Host calls —
     original PNGs untouched" — asserts both CSVs' actual on-disk content (no header row, correct
     schedule time in each file's OWN Zoho Social Brand clock, all-7-slides vs X's-first-4, `.jpg` not
     `.png` in the URLs), the manifest's on-disk JSON shape (`ideas[].s3_keys`/`urls` length 7,
     `stripped_notes`), `scheduled_at` re-read through `loadIdeaAssets` (the real `AssetStore` reader)
     and confirmed to be a well-formed ISO-8601 string, the `FakeMediaHost`'s recorded `convertCalls`/
     `uploadCalls` (exactly 7 of each, correct source path, correct `.jpg`-ending key), and a
     byte-for-byte `Buffer` comparison of the source PNGs before vs after the export.

2. **"Only eligible Assets are included; video Assets are skipped with a note; an empty run stops with a
   clear message and writes no files."**
   - Eligibility rules (unit level): `eligibility.test.ts`'s full suite (includes a produced/un-posted/
     un-scheduled Asset; skips a video Asset with a note naming the Idea+Recipe; skips a not-yet-produced
     or already-posted Asset; skips an already-scheduled Asset; judges each Asset of an Idea
     independently; empty input -> empty output).
   - End-to-end: `export-schedule.test.ts`'s "skips a video (non-news-carousel) Asset with a note, and
     only exports the eligible news-carousel one" (asserts the returned report names the skipped
     Recipe and says "images-only", and that only 3 rows — the eligible Asset's — land in the CSV) and
     "stops with a clear message and writes nothing for an empty run (no eligible Assets at all)"
     (asserts the message, an empty run folder via `readdir`, and zero Media Host calls).

3. **"Schedule derivation is pure and deterministic; any row less than 1 hour in the future in its Zoho
   Brand's clock fails the whole export loudly."**
   - Purity/determinism (unit level): `schedule.test.ts`'s "is pure — calling it twice with the same
     inputs returns the same output", "schedules one Asset per day, strictly increasing calendar days",
     "every slot's Eastern-local time falls within the 7:00-22:00 targeting window, off the round
     minute", and `validateSlotsFuture`'s "is pure — no clock read inside; 'now' is always the explicit
     argument".
   - The 1-hour guard (unit level): `schedule.test.ts`'s "fails loudly, naming every violating slot,
     when any slot is less than 1 hour away", "fails when a slot is exactly at or after now", "passes at
     exactly the 1-hour boundary", "reports every violating slot, not just the first".
   - End-to-end: `export-schedule.test.ts`'s "refuses the WHOLE export loudly, writing nothing, when a
     schedule time is less than 1 hour away" — asserts the "EXPORT REFUSED"/"at least 1 hour" message,
     that the run folder gained no new file, that the Media Host recorded zero upload calls, and that
     `scheduled_at` stayed unset.
   - Note: the check compares ABSOLUTE instants (`utcMs - nowMs < MIN_LEAD_MS`), which is
     timezone-invariant — "its Zoho Brand's clock" only changes how the SAME instant is *displayed*
     (`formatZohoScheduleTime`), never whether it passes the guard. Documented in `schedule.ts`'s module
     doc.

4. **"LinkedIn mention notes never appear in exported captions and always appear in the summary."**
   - `plan.test.ts`'s "never puts the LinkedIn unresolved-mentions note inside the exported caption" and
     "surfaces the stripped LinkedIn note in the manifest and the summary instead".
   - End-to-end: `export-schedule.test.ts`'s happy-path test asserts the on-disk `zoho-linkedin-x.csv`
     row does NOT contain "Unresolved", the on-disk manifest's `stripped_notes` DOES name the companies,
     and the returned report text also names them.

5. **"Re-running the export after a successful one schedules nothing twice."**
   - `eligibility.test.ts`'s "skips a news-carousel Asset that is already scheduled (re-running the
     export is a no-op)".
   - End-to-end: `export-schedule.test.ts`'s "re-running the export after a successful one schedules
     nothing twice" — runs the command twice with identical arguments; asserts the second run reports
     "No eligible Assets", the already-written `zoho-main.csv`'s bytes are UNCHANGED, `scheduled_at` is
     unchanged, and the Media Host's call counts stay exactly at the first run's totals (7 converts, 7
     uploads — zero more).

6. **"The command doc exists with a doc-check pinned to the code."**
   - `.claude/commands/export-schedule.md` exists, matching the `track-performance.md` pattern.
   - `src/commands/export-schedule.docs-test.ts` (9 tests, all passing via `npm run test:docs`) pins the
     doc to: all 4 required arguments, every named module (shell + all 6 deep modules referenced),
     eligibility rules + the "schedule nothing twice" wording, the 1-hour guard + Zoho's silent
     grey-button failure, the X-4-vs-7 slide split, the stripped LinkedIn note behavior, the
     `AssetStore.writeAsset`/unchanged-status write, the hermetic FAKE Media Host claim, and the
     "Publish gate stays human" ADR-0002 statement (with a `doesNotMatch` guard against ever claiming
     this command itself publishes).

### Fakes / fixtures used

- **`FakeMediaHost` (`src/media-host/fixtures/fake-media-host.ts`, issue #144) — THE MEDIA HOST FAKE.**
  Used in every `plan.ts`-adjacent and `export-schedule.test.ts` test that exercises hosting. It performs
  NO real file I/O and NO network call — it only records `(sourcePath, destPath)` / `(localPath, key)` /
  `key` arguments and returns a deterministic `https://fake-media-host.example/<key>` URL.
  `grep -rn "spaces_\|creations_\|FakeSpace\|SpaceMcpPort" src/schedule-batch/ src/commands/
  export-schedule*.ts` matches NOTHING — this slice has nothing to do with Magnific. `grep -rln
  "execFileRunner\|LiveMediaHost\|aws s3" src/schedule-batch/ src/commands/export-schedule*.ts` matches
  only ONE line, inside `export-schedule.ts`'s deferred-default error MESSAGE (documentation text
  pointing at where a caller would wire the live adapter) — `LiveMediaHost` is never imported or called
  anywhere in this slice's code or tests.
- Temp-directory ledger/brand-profile/output-bundle fixtures (`mkdtemp` + real, tiny on-disk files),
  mirroring `track-performance.test.ts`'s/`log-post.test.ts`'s own fixture style — no shared/global
  state, each test gets its own isolated directory tree, cleaned up in a `finally` block.
- Real, tiny on-disk PNG-named files (dummy byte content — not real PNGs, since nothing in this slice's
  code path decodes image bytes) at the exact `.output/` bundle layout the real pipeline produces, used
  to prove the "original PNGs untouched" acceptance criterion via a `Buffer` equality check before vs
  after the export.

### Self-review notes

- Merged two separate `import ... from "node:path"` statements in `export-schedule.ts` into one.
- Considered giving `validateAssetsForExport` a bespoke error-code union (like `LogPostRefusalReason`)
  instead of a flat `{ ideaId, message }[]`. Kept it flat: unlike `/log-post` (which branches on ONE
  refusal reason), this preflight can report MANY simultaneous problems across MANY Assets — a flat,
  already-worded list is what the caller (and the Operator reading the CLI output) actually needs, and
  it is what `openspec`'s own Requirement asks for ("collects EVERY problem, never stopping at the
  first").
- Re-checked the CSV filename derivation rule (`zohoCsvFileName`: first grouping is always
  `"zoho-main.csv"`, every other is named by its own sorted platform slugs) against the ONLY piece of
  hard evidence available — the issue's own live-verified gold reference filenames
  (`zoho-main.csv`/`zoho-linkedin-x.csv`) for straw-motion's exact two-grouping config (facebook/
  instagram/tiktok first, linkedin/x second) — and confirmed it reproduces them exactly, while staying
  derived from configuration (index + platform list) rather than a hardcoded Brand-specific string, per
  the issue's own instruction ("derive grouping/names from the #143 config, not hardcoded").
- Deliberately did NOT add a same-platform-in-two-Zoho-Brands fallback to `findCopyVariant` (e.g. reusing
  the primary `copy.caption` when a variant is missing) — a silent fallback risks writing an X row over
  X's own 280-char cap (issue #142 enforces that cap only on the composed X VARIANT, not the primary
  caption). `validateAssetsForExport` refuses loudly instead — never a best-effort guess.

### Known limits

- **No live default `MediaHostPort` wiring.** `exportScheduleCommand`'s default port THROWS a clear
  "not configured" error the moment it would actually be called (never reached when there are zero
  eligible Assets) — mirroring `track-performance.ts`'s deferred `DEFAULT_PERFORMANCE_SCRAPE_PORT`
  placeholder, but with a hard throw rather than a soft "no data" return, because a Media Host that
  silently no-ops would produce a CSV with broken image links (worse than refusing outright). Wiring
  `LiveMediaHost` (already built, issue #144) into a real run is a caller-supplied `options.mediaHost`
  today — a follow-up slice could add a `--live` flag or an env-driven default once the Brand-level S3
  bucket/region configuration question is decided (out of scope for #145; not specified anywhere in
  #140/#143's shipped config shape).
- **Cleanup (deleting hosted media whose scheduled time is >1 day past) is NOT built** — explicitly
  deferred (PRD #140 stories 22-24; the manifest this slice writes IS the cleanup contract a later slice
  will consume).
- **The Zoho `@handle` bulk-file auto-bind open question** (whether a bulk-CSV-arriving `@Name` mention
  auto-binds into a real LinkedIn tag, or only interactively) is unresolved upstream (PRD #140's own
  "test pending" note) and out of scope here; this export emits the composed caption text as-is, whatever
  it says, unaffected either way.
- **MundoTip is not wired** — this export is Brand-generic (reads `loadZohoConfig` for whichever Brand
  is named) but MundoTip's own Zoho Social Brand grouping is not configured in `data/brands/mundotip/
  brand-profile.yaml` yet — an explicit PRD #140 scope note, not a gap in this slice's code.
- **Eligibility scopes to exactly one Recipe slug (`"news-carousel"`)** rather than a generic
  "images-based Recipe" predicate — today's registry has exactly one images-based Recipe and one video
  Recipe, so this is a faithful, minimal reading of the issue ("turns a run's produced News Carousel
  Assets"); extending to a hypothetical SECOND images-based Recipe is explicitly out of scope (documented
  in `eligibility.ts`'s module doc) and would be a small, isolated follow-up change to that one module.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npx openspec validate issue-145-export-schedule --strict` → `Change 'issue-145-export-schedule' is
  valid`. PASS.
- `npm test` (type-check via `tsc --noEmit` + full Node-test-runner suite) →
  **1836 passing / 0 failing / 476 suites**, `duration_ms 3912.87`. Matches the Build Report's claimed
  counts exactly. PASS.
- `npm run test:docs` → **147 passing / 0 failing / 37 suites**. Matches claimed counts exactly. PASS.
- `npm run build` (`tsc -p tsconfig.build.json`) → clean, no output/errors. PASS.
- Standalone module run: `node --import tsx --test "src/schedule-batch/**/*.test.ts"
  "src/commands/export-schedule.test.ts"` → **91 passing / 0 failing / 24 suites** — exactly the
  full-suite delta over the pre-slice baseline (1745→1836, 452→476). PASS.
- `node --import tsx --test src/commands/export-schedule.docs-test.ts` → **9 passing / 0 failing**.
  PASS.

All commands were actually executed by QA in this session (not taken on the developer's word); every
count above is a real, reproduced result.

### Per-criterion results

1. **CSVs byte-exact, manifest, readable `scheduled_at`, expected Media Host calls, PNGs untouched —
   PASS.** `src/schedule-batch/csv.test.ts`'s "matches the live-verified dialect byte-for-byte for a
   7-slide carousel row" and "produces a RAGGED row with only 4 media fields for X" assert the exact
   string against the dialect (bare unquoted media fields, ragged width, literal `\n`, `MM/DD/YYYY HH:mm`
   dates, empty Link/GMB columns) — confirmed by direct read of `csv.ts`/`csv.test.ts` and cross-checked
   byte-for-byte against the read-only gold fixtures at
   `.../scratchpad/w32-gold/{zoho-main.csv,zoho-linkedin-x.csv}` (column order, quoting, ragged X-row
   width, and month-first date format all match). `src/commands/export-schedule.test.ts`'s happy-path
   test additionally proves the end-to-end command writes both on-disk CSVs correctly (no header row,
   correct per-file Zoho-Brand-clock time, all-7 vs first-4 slides, `.jpg` not `.png`), the manifest
   exists with `s3_keys`/`urls` of length 7, `scheduled_at` re-read through the real `loadIdeaAssets`
   store reader as a well-formed ISO-8601 string, `FakeMediaHost`'s 7 converts + 7 uploads recorded with
   correct source/dest paths, and a `Buffer`-equality check of the source PNGs before vs after the
   export (verified: original PNG bytes are genuinely re-read from disk post-export and compared,
   `deepEqual` per slide).

2. **Only eligible Assets included; video Assets skipped with a note; empty run stops with a clear
   message, writes nothing — PASS.** `eligibility.ts`/`eligibility.test.ts` cover every branch (video
   skip naming Idea+Recipe, not-produced skip for both in-flight and already-posted/tracking/scored
   statuses, already-scheduled skip, independent per-Asset judgment, empty input). End-to-end:
   `export-schedule.test.ts`'s video-skip test confirms the sibling video Asset is skipped with an
   "images-only" note while its news-carousel sibling still exports (only 3 rows land in the CSV); the
   empty-run test confirms the "No eligible Assets" message, an empty run folder (`readdir` returns
   `[]`), and zero Media Host calls.

3. **Schedule derivation pure/deterministic; any row <1h in the future fails the WHOLE export loudly —
   PASS.** `schedule.ts`/`schedule.test.ts` prove purity (`deepEqual` on repeated calls), one-per-day
   strictly-increasing dates, the 7:00-21:xx Eastern window off the round minute, and the 1-hour guard's
   boundary behavior (fails at 30 min, fails exactly at "now", passes exactly at `MIN_LEAD_MS`, reports
   EVERY violating slot's index not just the first). `neither deriveScheduleSlots` nor
   `validateSlotsFuture` reads `Date.now()` internally (confirmed by direct source read — `nowMs`/`now`
   are always parameters). End-to-end: the "refuses the WHOLE export loudly..." test sets `now` 5 minutes
   before the first derived slot and confirms "EXPORT REFUSED"/"at least 1 hour" is returned, the run
   folder gains no new file, zero Media Host upload calls happen, and `scheduled_at` stays `undefined` on
   the ledger. The absolute-instant comparison (`utcMs - nowMs < MIN_LEAD_MS`) is timezone-invariant by
   construction, which correctly satisfies "in its Zoho Brand's clock" (any zone's "1 hour from now" is
   the same absolute duration) — confirmed correct, not a defect.

4. **LinkedIn mention notes never in exported captions, always in the summary — PASS.**
   `plan.test.ts`'s "never puts the LinkedIn unresolved-mentions note inside the exported caption" and
   "surfaces the stripped LinkedIn note in the manifest and the summary instead" prove this at the pure
   layer. End-to-end: the happy-path test's on-disk `zoho-linkedin-x.csv` LinkedIn row is asserted to NOT
   contain `"Unresolved"`, while the manifest's `stripped_notes` and the returned report text both DO
   name the unresolved companies. Minor observation (not a defect — see Defect list note below): the
   manifest's per-Asset stripped-note text omits the all-caps `"LINKEDIN: "` prefix the hand-made W32
   gold manifest carries; the acceptance criterion and the issue text only require CSV byte-exactness,
   not manifest byte-exactness, so this is not scored as a failure.

5. **Re-running after a successful export schedules nothing twice — PASS.**
   `eligibility.test.ts`'s "skips a news-carousel Asset that is already scheduled" plus the end-to-end
   "re-running the export after a successful one schedules nothing twice" test, which runs the command
   twice with identical arguments and asserts: second run reports "No eligible Assets"; the already-
   written `zoho-main.csv`'s on-disk bytes are byte-identical before/after; `scheduled_at` is unchanged;
   and the shared `FakeMediaHost`'s call counts stay at exactly 7 converts / 7 uploads (no growth on the
   second, no-op run).

6. **Command doc exists with a doc-check pinned to the code — PASS.** `.claude/commands/
   export-schedule.md` exists, follows the `track-performance.md` pattern, and names every real module
   (`export-schedule.ts`, `eligibility.ts`, `select.ts`, `schedule.ts`, `plan.ts`, `csv.ts`,
   `manifest.ts`). `src/commands/export-schedule.docs-test.ts` (9 tests, run via `npm run test:docs`,
   correctly excluded from `npm test`'s glob) pins the doc to the 4 required args, every named module,
   eligibility + "schedule nothing twice" wording, the 1-hour guard + Zoho's silent grey-button failure,
   the X 4-vs-7 slide split, the stripped-LinkedIn-note behavior, the `AssetStore.writeAsset`/
   unchanged-status wording, the hermetic FAKE Media Host claim, and the "Publish gate stays human"
   ADR-0002 statement (with a `doesNotMatch` guard against ever claiming this command itself publishes).
   All 9 verified passing directly.

### Per-scenario results (spec deltas)

`schedule-batch-export` (ADDED), `specs/schedule-batch-export/spec.md`:

- "A produced, un-posted, un-scheduled news-carousel Asset is eligible" — PASS —
  `eligibility.test.ts` "includes a produced, un-posted, un-scheduled news-carousel Asset".
- "A non-news-carousel (video) Asset is skipped with a note naming the Idea and Recipe" — PASS —
  `eligibility.test.ts` "skips a video (non-news-carousel) Asset with a note...".
- "An already-scheduled Asset is skipped, making a re-run schedule nothing twice" — PASS —
  `eligibility.test.ts` "skips a news-carousel Asset that is already scheduled...".
- "An empty run (no Ideas at all) yields an empty eligibility result" — PASS —
  `eligibility.test.ts` "returns an empty result for an empty run".
- "Only Ideas matching BOTH the given format and run are returned" — PASS — `select.test.ts` "returns
  only Ideas matching BOTH the given format and run".
- "A missing ledger file throws a clear, Brand-naming error" — PASS — `select.test.ts` "throws a clear
  'unknown Brand' error for a missing ledger file".
- "deriveScheduleSlots schedules one Asset per day, strictly increasing from the start date" — PASS —
  `schedule.test.ts` "schedules one Asset per day, strictly increasing calendar days...".
- "Every derived slot's Eastern-local time is within the targeting window, off the round minute" —
  PASS — `schedule.test.ts` "every slot's Eastern-local time falls within the 7:00-22:00 targeting
  window...".
- "A schedule time less than 1 hour in the future fails validation, naming the violation" — PASS —
  `schedule.test.ts` "fails loudly, naming every violating slot...".
- "A schedule time at least 1 hour in the future passes validation" — PASS — `schedule.test.ts`
  "passes at exactly the 1-hour boundary or later".
- "A 7-slide carousel row matches the live-verified dialect byte-for-byte" — PASS — `csv.test.ts`
  "matches the live-verified dialect byte-for-byte for a 7-slide carousel row" (verified against the
  gold fixture's own column layout).
- "An X row is ragged — only 4 bare media fields, never a quoted comma-joined cell" — PASS —
  `csv.test.ts` "produces a RAGGED row with only 4 media fields for X...".
- "A CSV file exceeding 350 rows throws, naming the actual row count" — PASS — `csv.test.ts` "throws,
  naming the row count, past MAX_ZOHO_ROWS (350)".
- "The first Zoho Social Brand grouping is always named zoho-main.csv" — PASS — `csv.test.ts` "names
  the FIRST Zoho Social Brand grouping zoho-main.csv".
- "A second grouping is named by its own sorted platform slugs" — PASS — `csv.test.ts` "names a SECOND
  grouping by its sorted platform slugs" — cross-checked: reproduces `zoho-linkedin-x.csv` exactly for
  straw-motion's real config.
- "A fully well-formed eligible Asset has no problems" — PASS — `plan.test.ts` "returns no problems for
  a fully well-formed eligible Asset".
- "An Asset with no composed Copy at all is flagged, naming the Idea" — PASS — `plan.test.ts` "flags an
  Asset with no composed Copy at all...".
- "A missing platform Copy variant is flagged, naming both the Idea and the platform" — PASS —
  `plan.test.ts` "flags a missing platform Copy variant...".
- "A wrong slide count is flagged, naming the Idea and the expected count" — PASS — `plan.test.ts`
  "flags an Asset that doesn't have exactly 7 downloaded slides".
- "A carousel-capable platform's row carries all 7 slide URLs in order" — PASS — `plan.test.ts` "writes
  carousel-capable platforms with all 7 slide URLs, X with only the first 4".
- "An X row carries only the first 4 slide URLs" — PASS — same test, other half of the assertion.
- "A LinkedIn row's caption never contains the unresolved-mentions note" — PASS — `plan.test.ts` "never
  puts the LinkedIn unresolved-mentions note inside the exported caption".
- "The stripped note appears in both the manifest and the summary" — PASS — `plan.test.ts` "surfaces
  the stripped LinkedIn note in the manifest and the summary instead".
- "A happy-path run writes both CSVs, the manifest, and a readable scheduled_at" — PASS —
  `export-schedule.test.ts` happy-path test.
- "An empty run stops with a clear message and writes no files" — PASS — `export-schedule.test.ts`
  "stops with a clear message and writes nothing for an empty run...".
- "A Brand with no Zoho Social Brand config refuses and writes nothing" — PASS —
  `export-schedule.test.ts` "refuses loudly and writes nothing when the Brand has no Zoho Social Brand
  config".
- "A schedule time inside the 1-hour lead window refuses the WHOLE export" — PASS —
  `export-schedule.test.ts` "refuses the WHOLE export loudly, writing nothing...".
- "Re-running the export after a successful one schedules nothing twice" — PASS —
  `export-schedule.test.ts` "re-running the export after a successful one schedules nothing twice".

`brand-commands` (MODIFIED), `specs/brand-commands/spec.md`:

- "/export-schedule requires all four positional arguments, including an explicit Brand" — PASS —
  `export-schedule.test.ts`'s "main() prints a usage error and exits non-zero when any of the 4
  arguments is missing" exercises `main()` directly with only 2 of 4 args supplied and confirms a
  non-zero exit code plus a usage message on stderr; `exportScheduleCommand` itself is invoked with an
  explicit `brand` in every test via `resolveBrand(brand, ...)`, never a default.
- Pre-existing `/report`/`/pick-cast` scenarios in this same file are unaffected by this slice (no code
  touched under those commands) — confirmed via the file scope check below.

### Always-rules + Magnific-fake checks

- **Generate-never-publish — PASS.** `grep -rn "spaces_\|creations_\|FakeSpace\|SpaceMcpPort"
  src/schedule-batch/ src/commands/export-schedule*.ts` → no matches. `grep -rn "fetch(\|http.request\|
  https.request\|aws-sdk\|S3Client" src/schedule-batch/ src/commands/export-schedule*.ts` → no matches.
  The command never calls Zoho/Facebook/any platform API and never sets a Post's status to `posted`; it
  only writes local CSV/manifest files and hosts media through the injected `MediaHostPort`.
- **Public-metrics-only — N/A, confirmed no metric fabrication.** This slice performs no metrics
  scraping; nothing in `src/schedule-batch/` or `export-schedule.ts` reads or writes a `metrics` field.
- **Relative-not-absolute — N/A.** No scoring logic in this slice.
- **Explicit-attribution — PASS.** Every CSV row and manifest entry is keyed to its own already-known
  `(ideaId, recipe)` Asset (`eligibility.ts`'s `EligibleAsset`, threaded through `plan.ts` unchanged);
  nothing infers which Post/Idea a row belongs to.
- **Ledger-as-source-of-truth — PASS.** `scheduled_at` is written via the existing, unmodified
  `AssetStore.writeAsset` (`src/asset/store.ts`, confirmed untouched by `git status --short`), scoped by
  `(ideaId, recipe)`; `upsertAsset` (`src/asset/asset.ts`) spreads `{ ...existing, ...patch, recipe }`,
  so sibling fields (`copy`, `asset_paths`, etc.) are never wiped. Confirmed ISO-8601: the end-to-end
  test asserts `new Date(scheduled_at).toISOString() === scheduled_at`. Status stays `"produced"` in
  every test (ADR-0011 unchanged) — confirmed by direct assertion in the happy-path and refusal tests.
- **Magnific-fake / hermetic — PASS.** All of the above `spaces_*`/`creations_*` grep plus the Media
  Host grep (`grep -rln "execFileRunner\|LiveMediaHost\|aws s3" src/schedule-batch/
  src/commands/export-schedule*.ts` → exactly one match, a documentation string inside
  `noMediaHostConfigured()`'s thrown error message pointing at where a caller would wire the live
  adapter — never imported, never called) confirm every test in this slice is hermetic: `FakeMediaHost`
  performs no real file I/O and no network call (confirmed by direct source read of
  `src/media-host/fixtures/fake-media-host.ts` — it only pushes call records and returns a synthetic
  URL).

### File-scope check (issue 4)

`git status --short` at the repo root shows exactly: `M package.json` (one line, the `export-schedule`
npm script only, confirmed via `git diff package.json`) plus the new, untracked
`.claude/commands/export-schedule.md`, `openspec/changes/issue-145-export-schedule/`,
`src/commands/export-schedule.{ts,test.ts,docs-test.ts}`, and `src/schedule-batch/`. No file under
`src/asset/**`, `src/ledger/**`, `src/media-host/**`, `src/production-spec/**`, `src/space-driver/**`,
or `data/**` was modified — matches the Build Report's own claim exactly.

### Spec fidelity (issue 3)

- The proposal and spec deltas were read against the issue text (`gh issue view 145`) line by line: every
  bullet in the issue's "What to build" section (Eligibility, Schedule, Media, Files, Copy, Ledger,
  Summary, Docs) and every one of the 6 acceptance criteria maps to a named Requirement with Scenarios in
  `specs/schedule-batch-export/spec.md`. No requirement was silently dropped.
- "Video Assets are explicitly skipped with a note" was interpreted as "any Asset whose `recipe` is not
  `"news-carousel"`" (`SUPPORTED_RECIPE`), rather than a Recipe-registry lookup for a `mediaType`/
  `video` flag. Checked against today's actual `src/recipe/registry.ts`: exactly two Recipes exist
  (`news-carousel`, images; `character-explainer-with-cast`, video) — so this binary reading is currently
  equivalent to a true "is this Recipe video-based" check, and is honestly documented as a known,
  deliberate scoping limit (not silently baked in) in both `eligibility.ts`'s module doc and the
  handoff's Known Limits. This is a faithful reading of the issue's own framing ("turns a run's produced
  News Carousel Assets into...") — not a misread. Confirmed acceptable; flagged here per the QA
  instructions but not scored as a defect.
- CSV filename/grouping derivation was checked against hardcoding: `zohoCsvFileName(index, platforms)`
  takes `index` and the ZohoSocialBrand's own `channels`-derived platform list as arguments and derives
  the name purely from those — confirmed by direct source read, no straw-motion-specific string
  literal appears anywhere in `csv.ts`/`plan.ts`. The only place `"zoho-main.csv"`/`"zoho-linkedin-x.csv"`
  literals appear is in tests (fixture expectations) and the doc, never in the derivation logic itself.
- Cross-checked terminology (`Zoho Social Brand` vs OrganicGrowth `Brand`, `LinkedInProfile` vs
  `LinkedIn`) against the already-archived `openspec/specs/production-spec/spec.md` /
  `openspec/changes/archive/2026-08-04-issue-143-zoho-brand-config/specs/production-spec/spec.md` — this
  slice's spec deltas use the same vocabulary consistently, no contradiction found.
- The `brand-commands` MODIFIED delta reproduces the full existing Requirement text (per OpenSpec
  convention) and adds `/export-schedule` to the explicit-`<brand>`-required command list plus its own
  new Scenario — consistent with how every other granular command is documented there; no existing
  Scenario was altered or dropped.
- No contradiction found against `CONTEXT.md`, ADR-0002 (generate-never-publish), ADR-0011 (Asset
  lifecycle/`scheduled_at` carries no status meaning), or the always-rules.

### Defect list

None. No defects found in Round 1.

Non-blocking observation (informational only, not a defect — does not fail any acceptance criterion or
spec Scenario): the manifest's per-Asset `stripped_notes` text (`[Unresolved <platform> mentions - no
committed handle, review before publishing: ...]`, `src/schedule-batch/plan.ts`'s
`strippedMentionNotes`) omits the all-caps `"LINKEDIN: "` platform-name prefix that appears in the
hand-made W32 gold reference manifest
(`.../scratchpad/w32-gold/zoho-manifest.json`'s `stripped_notes[0]`). The issue and spec deltas only
require CSV byte-exactness against the dialect, not manifest byte-exactness, and the manifest content is
otherwise complete and correct (names the platform via `variant.platform` inside the bracketed text
itself, e.g. "Unresolved linkedin mentions..."), so this is not scored as a failure. If byte-parity with
the gold manifest text is desired, a trivial follow-up could prefix each note with
`${variant.platform.toUpperCase()}: `.

### Overall

**PASS.** Suite green (real, reproduced counts matching the Build Report exactly), all 6 acceptance
criteria proven by tests that genuinely exercise them, all spec-delta Scenarios covered, spec faithfully
matches the issue with no dropped or misread requirement, file scope matches the claimed touch-list
exactly, and every always-rule + the Magnific-fake/hermetic requirement holds with direct grep/source
evidence. Ready to proceed to PR.
