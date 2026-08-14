---
name: cleanup-schedule-media
description: >-
  Manifest-driven cleanup of a Brand's hosted Schedule Batch media: delete objects whose scheduled time is more than a day past.
---

# Cleanup Schedule Media Workflow

Usage: `cleanup-schedule-media <brand>`

Standalone trigger for the Schedule Batch's manifest-driven S3 cleanup.

## Rules
- **Delete late, never early:** Deletes media only when `scheduled_at` is MORE THAN 1 day in the past.
- **Idempotent:** Stamped `cleaned_at` records prevent double-deletion.
- **Never touches ledger:** S3 cleanup only.

## Steps
1. Resolve Brand: `data/brands/<slug>/ideas/`.
2. Run `npm run cleanup-schedule-media <brand>` (or call `cleanupScheduleMediaCommand()`).
3. Scans manifests, purges expired S3 media, stamps `cleaned_at` onto manifest entries, and reports summary.
