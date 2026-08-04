---
name: export-schedule
description: "Turn a run's produced News Carousel Assets into everything the Zoho Social Bulk Scheduler needs: hosted JPGs, two upload-ready CSVs, and a manifest."
---

# /export-schedule

Usage: `/export-schedule <brand> <format> <run> <start-date>`

The **Schedule Batch** export (issue #145, parent #140). Turns a Run's produced **News Carousel**
Assets into everything the Operator needs to bulk-upload to Zoho Social: each Asset's slides converted
to JPG and hosted on S3, one CSV per configured **Zoho Social Brand** grouping (Zoho's own container of
connected accounts — one OrganicGrowth Brand's Channels can span several), and a manifest recording the
cleanup contract. `<brand>`, `<format>`, `<run>`, and `<start-date>` (`YYYY-MM-DD`) are all required —
omitting any one is a usage error, never a silent default.

**The Publish gate stays human (ADR-0002).** This command writes files and hosts media on unlisted
public S3 URLs — hosting is not publishing. The Operator reviews the CSVs, uploads them to Zoho Social,
and inspects the queued posts inside Zoho before they go live.

**Code-backed (issue #145).** `src/commands/export-schedule.ts` (the orchestration shell) is a thin
layer over pure deep modules: `src/schedule-batch/eligibility.ts` (which Assets qualify),
`src/schedule-batch/select.ts` (reads the run's Ideas), `src/schedule-batch/schedule.ts` (deterministic
schedule derivation + the >=1h-future guard), `src/schedule-batch/plan.ts` (`validateAssetsForExport` +
`buildSchedulePlan`), `src/schedule-batch/csv.ts` (the live-verified Zoho CSV dialect), and
`src/schedule-batch/manifest.ts`. Tests ALWAYS inject a FAKE Media Host
(`src/media-host/fixtures/fake-media-host.ts`, issue #144) — never live S3, never live Magnific, no
credits, hermetic build.

## Steps

1. **Resolve the Brand.** Slugify `<brand>` and derive its paths via the resolver. State the active
   Brand: "Exporting Schedule Batch for Brand: `<brand>`, Format: `<format>`, Run: `<run>`."
2. **Run** `npm run export-schedule <brand> <format> <run> <start-date>` (or call
   `exportScheduleCommand()` in `src/commands/export-schedule.ts`). It:
   - **Loads** every Idea in `<format>`'s `<run>` from `data/brands/<slug>/ledger.json`
     (`src/schedule-batch/select.ts`).
   - **Selects eligible Assets**: only `recipe: "news-carousel"`, `status: "produced"`, with no
     `scheduled_at` yet. A non-`news-carousel` Asset (e.g. the wired *Character Explainer with Cast*
     Reel) is SKIPPED with a note — Zoho's bulk path is images-only. An already-`scheduled_at` Asset is
     SKIPPED too — this is what makes re-running the export schedule nothing twice. An empty selection
     stops here with a clear message; NO file is written.
   - **Reads** this Brand's Zoho Social Brand config (`loadZohoConfig`, issue #143). A Brand not yet
     configured for Schedule Batch REFUSES with a clear message; no file is written.
   - **Preflight-validates** every eligible Asset BEFORE any I/O (`validateAssetsForExport`): it must
     carry a composed Copy, that Copy must have a variant for every platform any configured Zoho Social
     Brand targets, and it must have exactly 7 downloaded slides. ANY problem REFUSES the WHOLE export,
     naming every Idea/problem found — never a partial write.
   - **Derives** a deterministic schedule (`deriveScheduleSlots`): one Asset per calendar day from
     `<start-date>`, hour varying across the 7:00-22:00 US-Eastern targeting window, always off the
     round minute — no randomness, no clock read inside the derivation. **Validates** every derived time
     is at least 1 hour in the future (`validateSlotsFuture`) — a past or too-soon time REFUSES the
     WHOLE export loudly (Zoho would otherwise silently grey out its own upload button, live-verified).
   - **Hosts** every eligible Asset's slides ONCE via the injected Media Host (`convertToJpg` then
     `upload`, per slide) — the resulting links are shared across that Asset's rows. Original PNGs are
     never touched (a copy-and-convert, never in-place).
   - **Writes** two CSVs — one per configured Zoho Social Brand grouping, in the live-verified dialect
     (no header row; `MM/DD/YYYY HH:mm`; quoted Channels/Post Content with literal `\n` breaks; one bare
     UNQUOTED field per media URL, ragged row width; empty Link/GMB columns; max 350 rows) — plus
     `zoho-manifest.json` (the cleanup contract: per Asset, its scheduled time, hosted S3 keys, and
     public URLs), into the run folder next to the output bundles.
   - Carousel-capable platforms (Facebook, Instagram, TikTok, LinkedIn) carry all 7 slides in narrative
     order; **X** rows carry only the first 4.
   - Each row carries that platform's OWN composed Copy variant (issue #129). The bracketed LinkedIn
     "unresolved mentions" reviewer note is NEVER embedded in an exported caption — it is surfaced in
     the manifest and the summary instead (issue #130).
   - **Stamps** `scheduled_at` (ISO-8601) onto each exported Asset via `AssetStore.writeAsset` — the
     Asset's status stays "produced" (ADR-0011's lifecycle is unchanged; `/log-post` is still what
     moves it to `posted`).
3. **Report:** which files were written and where, a per-Asset summary (day/timestamp in each Zoho
   Social Brand's own clock, platforms, any stripped notes), and every skipped Asset with its reason.

## Guardrails
- **Brand/Format/Run/start-date are all explicit** — every one of the 4 arguments is required; never a
  silent default.
- **Never fabricates.** A missing composed Copy, a missing platform variant, or a wrong slide count
  REFUSES the whole export, naming the Idea — nothing is half-written.
- **The 1-hour-future guard is load-bearing.** A schedule time inside that window refuses the WHOLE
  export, before any file is written or any media is hosted.
- **Re-running is safe.** An already-`scheduled_at` Asset is excluded from eligibility — nothing is ever
  scheduled twice.
- **Generate-never-publish (ADR-0002).** This command hosts media and writes files for the Operator to
  review; it never calls Zoho, Facebook, or any other platform API, and never marks anything `posted`.
- **Ledger is source of truth** — `scheduled_at` is written via `AssetStore.writeAsset`, scoped to the
  ONE named Recipe's Asset; sibling Assets of the same Idea are untouched.
