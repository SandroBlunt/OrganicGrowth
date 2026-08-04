## Why

Parent #140 (the Schedule Batch spec) decided the shape of a run-scoped Zoho bulk export; three blocker
slices landed the seams it needs — #141 (the ledger round-trips `scheduled_at` and a Copy variant's
`unresolvedMentions`), #143 (per-Brand Zoho Social Brand config on the Brand Profile), and #144 (the
Media Host port: JPG convert + S3 upload/delete, with a fake and a live adapter). Issue #145 is the
tracer bullet: the actual `/export-schedule` command that turns a run's produced News Carousel Assets
into the two Zoho-ready CSVs, a manifest, and a stamped ledger — end to end, hermetically tested against
the Media Host fake. Nothing yet reads a Brand's produced Assets and turns them into Zoho's own bulk
upload dialect; this slice builds that.

## What Changes

- **Add the `/export-schedule <brand> <format> <run> <start-date>` command**
  (`src/commands/export-schedule.ts`) — a thin orchestration shell over new, pure deep modules under
  `src/schedule-batch/`:
  - `eligibility.ts` — which of a run's Assets qualify: `recipe: "news-carousel"`,
    `status: "produced"`, no `scheduled_at` yet. A non-`news-carousel` Asset (today: the wired
    *Character Explainer with Cast* Reel) is skipped with a note (Zoho's bulk path is images-only); an
    already-`scheduled_at` Asset is skipped too — this is what makes a re-run schedule nothing twice.
  - `select.ts` — the thin I/O shell reading a run's Ideas scoped to `(format, run)` off the raw ledger
    (`src/ledger/ledger.ts`'s `loadIdeas` does not expose `run`/`title`, which this export needs).
  - `timezone.ts` — pure zoned-time <-> UTC math (`Intl.DateTimeFormat` only, no new dependency): convert
    a named zone's wall-clock time to an absolute UTC instant, and format an instant back into Zoho's
    `MM/DD/YYYY HH:mm` dialect for any zone.
  - `schedule.ts` — deterministic schedule derivation: one Asset per calendar day from the start date,
    hour varying across the 7:00-22:00 US-Eastern targeting window, always off the round minute, via a
    fixed rotation (no randomness, no clock read inside). Plus the load-bearing `>=1 hour in the future`
    guard (`validateSlotsFuture`) — `now` is always the caller's explicit argument.
  - `csv.ts` — the live-verified Zoho bulk-scheduler CSV dialect: no header row; bare unquoted
    `MM/DD/YYYY HH:mm`; quoted Channels/Post Content with literal `\n` line breaks; one bare UNQUOTED
    field per media URL (ragged row width — a quoted, comma-joined media cell parses as no media at
    all); empty Link/GMB columns; a 350-row cap per file. Also derives each Zoho Social Brand grouping's
    output filename from its own config (first grouping is `zoho-main.csv`; every other is named by its
    own sorted platform slugs, e.g. `zoho-linkedin-x.csv`) — never a hardcoded per-Brand literal.
  - `media-key.ts` — the S3 object key a hosted slide lives under:
    `<brand>/<run>/<idea-short-name>/<slide-base-name>.jpg`.
  - `plan.ts` — `validateAssetsForExport` (the PURE preflight pass: a missing composed Copy, a missing
    platform Copy variant, or a wrong slide count fails the whole export loudly, naming the Idea, BEFORE
    any I/O) and `buildSchedulePlan` (the PURE assembly of the CSV files, the manifest, the
    Operator-facing summary, and the ledger `scheduled_at` stamps, from already-resolved inputs).
  - `manifest.ts` — the cleanup contract: per Asset, its scheduled time, hosted S3 keys, and public URLs
    (plus every stripped LinkedIn unresolved-mentions note, both per-Asset and flattened at the top).
- **The orchestration shell** resolves the Brand's paths, loads the run's Ideas, decides eligibility,
  loads the Brand's Zoho Social Brand config (`loadZohoConfig`, issue #143; a Brand not configured
  refuses with a clear message and writes nothing), preflight-validates, derives + validates the
  schedule, hosts every eligible Asset's slides ONCE via the injected `MediaHostPort` (issue #144 — the
  fake in every test, never live S3), writes the CSVs + manifest into the run folder next to the output
  bundles, and stamps `scheduled_at` on each exported Asset via `AssetStore.writeAsset` — `status` stays
  `"produced"` (ADR-0011's lifecycle is unchanged).
- **Add the command doc** (`.claude/commands/export-schedule.md`) plus its doc-check
  (`src/commands/export-schedule.docs-test.ts`), matching the existing command-layer pattern
  (`track-performance.md`/`.docs-test.ts`).
- **Add the `export-schedule` npm script** (`package.json`), mirroring every other granular command.
- **Extend the `brand-commands` capability**: `/export-schedule` joins the list of granular commands
  that require an explicit `<brand>` first argument (MODIFIED Requirement, reproducing the existing
  Requirement text in full with the addition, per OpenSpec convention).

## Non-Goals (explicitly deferred — PRD #140's user stories 22-27 and beyond)

- **Cleanup** (deleting hosted media whose scheduled time is >1 day past, the S3 lifecycle-rule setup
  doc) — the manifest this slice writes is exactly the cleanup contract a later slice will consume.
- **Automating the Zoho upload itself** — deliberately manual; the Publish gate stays human (ADR-0002).
- **A live default `MediaHostPort` wiring** — this command's default port THROWS a clear "not
  configured" error rather than silently no-op'ing (worse: a CSV with broken image links); a caller
  wires `LiveMediaHost` (issue #144) explicitly. Every test injects the fake.
- **The Zoho `@handle` bulk-file auto-bind open question** (PRD #140's own "test pending" note) — out of
  scope; this slice emits the composed `@handle` text as-is, unchanged either way.
- **MundoTip wiring** — this export is Brand-generic; configuring MundoTip's own Zoho grouping is a
  separate, later task (PRD #140's own scope note).

## Capabilities

### Added Capabilities

- `schedule-batch-export`: the `/export-schedule` command and its pure deep modules (eligibility,
  schedule derivation, CSV dialect, media-key derivation, plan assembly, manifest).

### Modified Capabilities

- `brand-commands`: `/export-schedule` joins the granular-command list requiring an explicit `<brand>`.

## Impact

- **New code:** `src/commands/export-schedule.ts` (+ `.test.ts`, `.docs-test.ts`),
  `src/schedule-batch/{eligibility,select,timezone,schedule,csv,media-key,plan,manifest}.ts` (+ a
  `.test.ts` each), `.claude/commands/export-schedule.md`.
- **Modified code:** `package.json` (new `export-schedule` script only).
- **Not touched:** `src/space-driver/**`, `src/production-spec/**` (read-only via `loadZohoConfig`,
  already merged by #143), `src/asset/**` (read-only/write via the already-existing `AssetStore`,
  already merged by #141), `src/media-host/**` (consumed, not modified, via the already-merged
  `MediaHostPort`), `data/**`.
- **Hermetic:** no live `spaces_*`/`creations_*` calls (no Magnific involvement — this slice has nothing
  to do with Magnific); no live S3/AWS CLI call in `npm test` — every test injects `FakeMediaHost`
  (`src/media-host/fixtures/fake-media-host.ts`, issue #144); no live network call anywhere in the suite.
- **Always-rules upheld:** generate-never-publish (this command hosts media on an unlisted public URL
  and writes files for the Operator to review — it never calls Zoho, Facebook, or any platform API, and
  never marks an Asset `posted`); public-metrics-only (N/A — no metrics scraping in this slice);
  relative-not-absolute (N/A — no scoring in this slice); explicit-attribution (each CSV row and each
  manifest entry is keyed to its own `(Idea, Recipe)` Asset, never inferred); ledger-as-source-of-truth
  (`scheduled_at` is written via `AssetStore.writeAsset`, scoped to the ONE named Recipe's Asset — a
  sibling Asset of the same Idea is never touched).
