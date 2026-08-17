---
name: cleanup-schedule-media
description: "Manifest-driven cleanup of a Brand's hosted Schedule Batch media: delete objects whose scheduled time is more than a day past, and record what was removed."
---

# /cleanup-schedule-media

Usage: `/cleanup-schedule-media <brand>`

The **standalone trigger** for the Schedule Batch's manifest-driven S3 cleanup (issue #147, parent
#140). Wraps the SAME `runScheduleCleanup` function `/export-schedule` runs automatically, first, before
it does anything else (`src/schedule-batch/cleanup-runner.ts`) — this command exists so the Operator can
also purge on demand, without running a fresh export. `<brand>` is required — omitting it is a usage
error, never a silent default.

**Delete late, never early.** Whether Zoho fetches media at CSV-upload or at posting time is
unconfirmed, so cleanup assumes posting time: an Asset's hosted media is removed only once its
manifest's `scheduled_at` is MORE THAN 1 day in the past. Media scheduled less than or exactly 1 day
ago, or still in the future, is never touched. The 30-day S3 bucket lifecycle rule (already live on the
bucket) stays the backstop for an abandoned batch — a documented one-time setup step, not code; this
command is the everyday path.

**Code-backed (issue #147).** `src/commands/cleanup-schedule-media.ts` (the orchestration shell) is a
thin layer over `src/schedule-batch/cleanup-runner.ts` (the I/O shell: recursively scans a Brand's
`ideas/` tree for every `zoho-manifest.json`, both Format-namespaced runs and any legacy pre-Format run)
and `src/schedule-batch/cleanup.ts` (the PURE decision module: `isDueForCleanup`,
`planManifestCleanup`). Tests ALWAYS inject a FAKE Media Host
(`src/media-host/fixtures/fake-media-host.ts`, issue #144) — never live S3, never live Magnific, no
credits, hermetic build.

## Steps

1. **Resolve the Brand.** Slugify `<brand>` and derive its paths via the resolver. State the active
   Brand: "Schedule Batch cleanup for Brand: `<brand>`."
2. **Run** `npm run cleanup-schedule-media <brand>` (or call `cleanupScheduleMediaCommand()` in
   `src/commands/cleanup-schedule-media.ts`). It:
   - **Scans** every `zoho-manifest.json` under the Brand's own `ideas/` tree (`resolveBrand(brand)`,
     `src/brand/resolver.ts`), recursively, across every Run and every Format — the manifest is the
     cleanup contract (PRD #140).
   - **Decides**, per Asset entry, whether it is due: not already recorded as cleaned (no `cleaned_at`
     yet) AND its `scheduled_at` is more than 1 day in the past.
   - **Deletes** each due entry's hosted S3 keys through the injected Media Host.
   - **Records** the removal by writing `cleaned_at` (ISO-8601) back onto that entry, IN ITS OWN
     manifest file — every other field of that manifest is left untouched. This is what makes a re-run
     never double-delete.
3. **Report:** how many manifests were scanned and, per removed Asset, its Idea/Recipe, its scheduled
   time, and how many objects were removed. A manifest with nothing due, or a Brand with no manifests at
   all, reports that clearly — never a silent no-op.

## Guardrails

- **Brand is explicit** — the one required argument; never a silent default.
- **Never fabricates.** A missing or garbled manifest file is skipped defensively (never crashes the
  scan); a genuinely unparseable `scheduled_at` is treated as never due, never guessed at.
- **Idempotent, safe to re-run.** An already-recorded (`cleaned_at`) entry is never re-planned or
  re-deleted, even on a fresh run.
- **Generate-never-publish (ADR-0002).** This command only deletes previously-hosted media and writes
  the cleanup record; it never calls Zoho, Facebook, or any other platform API, and never touches an
  Asset's `status`.
- **Never touches the ledger.** Hosted-media cleanup is infrastructure housekeeping about S3 objects and
  the manifest — entirely separate from the Asset lifecycle (ADR-0011); `ledger.json` is untouched.
