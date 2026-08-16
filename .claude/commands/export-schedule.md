---
name: export-schedule
description: "Turn a run's produced News Carousel Assets into everything the Zoho Social Bulk Scheduler needs: hosted JPGs, two upload-ready CSVs, and a manifest."
---

# /export-schedule

Usage: `/export-schedule <brand> <format> <run> <start-date> [posts-per-day]`

The **Schedule Batch** export (issue #145, parent #140). Turns a Run's produced **News Carousel**
Assets into everything the Operator needs to bulk-upload to Zoho Social: each Asset's slides converted
to JPG and hosted on S3, one CSV per configured **Zoho Social Brand** grouping (Zoho's own container of
connected accounts — one OrganicGrowth Brand's Channels can span several), and a manifest recording the
cleanup contract. `<brand>`, `<format>`, `<run>`, and `<start-date>` (`YYYY-MM-DD`) are all required —
omitting any one is a usage error, never a silent default. `[posts-per-day]` is OPTIONAL and defaults to
**1** — every existing weekly Format's schedule is unaffected; a high-volume Format (e.g. Unhypped
Daily's ~6 Assets/day) passes a higher value so several Assets share one calendar day instead of each
falling a day further behind (issue #171).

**The Publish gate stays human (ADR-0002).** This command writes files and hosts media behind signed,
expiring S3 links (private bucket, unguessable keys — issue #198) — hosting is not publishing. The
Operator reviews the CSVs, uploads them to Zoho Social, and inspects the queued posts inside Zoho before
they go live.

**The CSV/S3 FALLBACK path (ADR-0020).** Zoho's MCP tools (`scheduleViaZohoMcpCommand`,
`src/commands/schedule-via-zoho-mcp.ts`) are the PRIMARY way a Run's produced News Carousel Assets get
scheduled for Facebook/Instagram/TikTok/LinkedIn — this command is retained only for when Zoho MCP is
unavailable, and always for X (Twitter), which the MCP path never schedules (Zoho's own guidance: doing
so risks the connected account being flagged as a bot). When this command IS the path taken, the whole
remaining step is the Operator's own, by hand — there is no silent, automatic switch between the two.

**Normally offered by the `producer`, behind an in-conversation approval (issue #148),
MCP-primary/CSV-fallback (ADR-0020).** Once a Run's eligible Assets are produced, `producer`
(`.claude/agents/producer.md`) offers Schedule Batch scheduling and runs it only after the Operator approves —
in the same conversation — every one of that Run's generated outputs and captions; that
approval is conversational only and is never written to the ledger. `producer` reaches for the Zoho MCP
path first, and offers THIS export explicitly as the fallback only when Zoho MCP is unavailable, and
always for X. This command also stays directly runnable on its own — a granular power-tool, like
`/cleanup-schedule-media` — for the Operator to re-run or run standalone.

**Code-backed (issue #145).** `src/commands/export-schedule.ts` (the orchestration shell) is a thin
layer over pure deep modules: `src/schedule-batch/eligibility.ts` (which Assets qualify),
`src/schedule-batch/select.ts` (reads the run's Ideas), `src/schedule-batch/schedule.ts` (deterministic
schedule derivation + the >=1h-future guard), `src/schedule-batch/plan.ts` (`validateAssetsForExport` +
`buildSchedulePlan`), `src/schedule-batch/csv.ts` (the live-verified Zoho CSV dialect),
`src/schedule-batch/manifest.ts`, and `src/schedule-batch/cleanup-runner.ts` (the automatic manifest
cleanup, issue #147, shared with the standalone `/cleanup-schedule-media`). Tests ALWAYS inject a FAKE Media Host
(`src/media-host/fixtures/fake-media-host.ts`, issue #144) — never live S3, never live Magnific, no
credits, hermetic build.

## Steps

1. **Resolve the Brand.** Slugify `<brand>` and derive its paths via the resolver. State the active
   Brand: "Exporting Schedule Batch for Brand: `<brand>`, Format: `<format>`, Run: `<run>`."
2. **Runs cleanup FIRST, automatically** (issue #147, parent #140). Before touching this run at all,
   `runScheduleCleanup` (`src/schedule-batch/cleanup-runner.ts`) scans the WHOLE Brand's Schedule Batch
   manifest tree — every Run, every Format, not just this one — and deletes any hosted object more than
   1 day past its `scheduled_at` through the SAME injected Media Host, recording the removal onto each
   manifest it touches. Media scheduled less than or exactly 1 day ago, or still in the future, is never
   touched (delete late, never early — whether Zoho fetches media at CSV-upload or posting time is
   unconfirmed, so this assumes posting time). This same cleanup is also runnable on its own via
   `/cleanup-schedule-media <brand>`.
3. **Run** `npm run export-schedule <brand> <format> <run> <start-date> [posts-per-day]` (or call
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
   - **Derives** a deterministic schedule (`deriveScheduleSlots`): by default, one Asset per calendar
     day from `<start-date>`, hour varying across the 7:00-22:00 US-Eastern targeting window, always off
     the round minute — no randomness, no clock read inside the derivation. `[posts-per-day]` (issue
     #171, default 1) places that many CONSECUTIVE Assets on the same calendar day before advancing to
     the next — the SAME fixed hour/minute rotation, just spread across fewer days; this is the ONE
     shared derivation both this command and the Zoho MCP path (`schedule-via-zoho-mcp.ts`) use, never a
     per-mechanism reimplementation. **Validates** every derived time
     is at least 1 hour in the future (`validateSlotsFuture`) — a past or too-soon time REFUSES the
     WHOLE export loudly (Zoho would otherwise silently grey out its own upload button, live-verified).
   - **Hosts** every eligible Asset's slides ONCE via the injected Media Host (`convertToJpg` then
     `upload`, per slide, each under an unguessable key and a signed link expiring shortly after that
     Asset's own scheduled time — issue #198) — the resulting links are shared across that Asset's rows.
     Original PNGs are never touched (a copy-and-convert, never in-place).
   - **Writes** two CSVs — one per configured Zoho Social Brand grouping, in the live-verified dialect
     (no header row; `MM/DD/YYYY HH:mm`; quoted Channels/Post Content with literal `\n` breaks; one bare
     UNQUOTED field per media URL, ragged row width; empty Link/GMB columns; max 350 rows) — plus
     `zoho-manifest.json` (the cleanup contract: per Asset, its scheduled time, hosted S3 keys, and
     signed URLs), into the run folder next to the output bundles.
   - Carousel-capable platforms (Facebook, Instagram, TikTok, LinkedIn) carry all 7 slides in narrative
     order; **X** rows carry only the first 4.
   - Each row carries that platform's OWN composed Copy variant (issue #129). The bracketed LinkedIn
     "unresolved mentions" reviewer note is NEVER embedded in an exported caption — it is surfaced in
     the manifest and the summary instead (issue #130).
   - **Stamps** `scheduled_at` (ISO-8601) onto each exported Asset via `AssetStore.writeAsset` — the
     Asset's status stays "produced" (ADR-0011's lifecycle is unchanged; `/log-post` is still what
     moves it to `posted`).
4. **Report:** any cleanup that ran (Assets/manifests touched), which files were written and where, a
   per-Asset summary (day/timestamp in each Zoho Social Brand's own clock, platforms, any stripped
   notes), and every skipped Asset with its reason.

## Guardrails
- **Brand/Format/Run/start-date are all explicit** — every one of the 4 required arguments is required;
  never a silent default. `[posts-per-day]` is the one optional argument and defaults to 1 (issue #171).
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
- **This is the FALLBACK path (ADR-0020).** `src/commands/schedule-via-zoho-mcp.ts` is the primary path
  for Facebook/Instagram/TikTok/LinkedIn — this command exists for when Zoho MCP is unavailable, and
  always for X. It writes no `zoho_schedule_reference` (that field is MCP-only, issue #161) — an Asset
  exported here is confirmed live the ordinary way, via the Operator's own `/log-post`.
