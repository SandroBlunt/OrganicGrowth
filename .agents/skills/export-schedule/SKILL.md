---
name: export-schedule
description: >-
  Turn a run's produced News Carousel Assets into everything the Zoho Social Bulk Scheduler needs:
  hosted JPGs, two upload-ready CSVs, and a manifest.
---

# Export Schedule Workflow

Usage: `export-schedule <brand> <format> <run> <start-date> [posts-per-day]`

The **Schedule Batch** export (issue #145). Turns a Run's produced **News Carousel** Assets into everything the Operator needs to bulk-upload to Zoho Social: each Asset's slides converted to JPG and hosted on S3, one CSV per configured **Zoho Social Brand** grouping, and a manifest recording the cleanup contract.

**The Publish gate stays human (ADR-0002).** Hosting is not publishing. The Operator reviews CSVs and uploads them to Zoho Social.

## Steps

1. **Resolve Brand:** Slugify `<brand>` and derive paths.
2. **Runs cleanup FIRST automatically:** Deletes any hosted object more than 1 day past its `scheduled_at` across the Brand manifest tree.
3. **Run export command:** `npm run export-schedule <brand> <format> <run> <start-date> [posts-per-day]` (or `exportScheduleCommand()`).
   - Selects eligible `recipe: "news-carousel"`, `status: "produced"` Assets.
   - Preflight validates Copy, platform variants, and slide count.
   - Derives deterministic schedule and verifies `>= 1h` future guard.
   - Converts slides to JPG and uploads to S3.
   - Writes two Zoho-ready CSVs + `zoho-manifest.json`.
   - Stamps `scheduled_at` onto each exported Asset (status stays `produced`).
4. **Report:** Summary of written files, scheduled slots, and skipped items.

## Guardrails
- 1-hour future guard is mandatory.
- Generate-never-publish: files are written for Operator review.
