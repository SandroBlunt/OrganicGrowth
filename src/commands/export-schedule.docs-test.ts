import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite for `/export-schedule` (issue #145). Proves the slash-command doc
 * names the real, code-backed pipeline — not just prose — and is honest about what is/isn't hermetic.
 *
 * Kept OUT of the unit suite (the `npm test` glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts"). Run with `npm run test:docs`. Editing this doc must never break `npm test`.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const EXPORT_SCHEDULE_CMD = join(REPO_ROOT, ".claude", "commands", "export-schedule.md");

describe("export-schedule.md — describes the code-backed Schedule Batch export (issue #145)", () => {
  it("exists and documents all four arguments as required", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /<brand>/);
    assert.match(doc, /<format>/);
    assert.match(doc, /<run>/);
    assert.match(doc, /<start-date>/);
  });

  it("names the real orchestration shell and its pure deep modules, not just prose", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /src\/commands\/export-schedule\.ts/);
    assert.match(doc, /exportScheduleCommand/);
    assert.match(doc, /src\/schedule-batch\/eligibility\.ts/);
    assert.match(doc, /src\/schedule-batch\/schedule\.ts/);
    assert.match(doc, /src\/schedule-batch\/plan\.ts/);
    assert.match(doc, /src\/schedule-batch\/csv\.ts/);
    assert.match(doc, /src\/schedule-batch\/manifest\.ts/);
  });

  it("documents eligibility: only produced, not-yet-posted, not-yet-scheduled news-carousel Assets", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /news-carousel/);
    assert.match(doc, /SKIPPED/);
    assert.match(doc, /schedule NOTHING TWICE|schedule nothing twice/i);
  });

  it("documents the >=1h-future guard as load-bearing (Zoho's silent grey-button failure)", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /1 hour/);
    assert.match(doc, /grey/i);
  });

  it("documents the X 4-slide cap vs every other platform's full 7 slides", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /\bX\b.*first 4|first 4.*\bX\b/s);
    assert.match(doc, /all 7 slides/);
  });

  it("documents the LinkedIn unresolved-mentions note as stripped from captions, surfaced elsewhere", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /NEVER embedded in an exported caption/);
    assert.match(doc, /manifest and the summary/);
  });

  it("documents scheduled_at as written via AssetStore.writeAsset with status unchanged (ADR-0011)", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /AssetStore\.writeAsset/);
    assert.match(doc, /status stays "produced"/);
  });

  it("is honest that tests always inject a FAKE Media Host — never live S3, hermetic build", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /FAKE Media Host/);
    assert.match(doc, /never live S3/);
    assert.match(doc, /hermetic/i);
  });

  it("documents that cleanup runs FIRST, automatically, before this run is touched (issue #147)", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /cleanup FIRST, automatically/);
    assert.match(doc, /src\/schedule-batch\/cleanup-runner\.ts/);
    assert.match(doc, /cleanup-schedule-media/);
  });

  it("states the Publish gate stays human — this command never publishes (ADR-0002)", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /Publish gate stays human/);
    assert.match(doc, /ADR-0002/);
    assert.doesNotMatch(doc, /\bpublish(es|ing)? (the|a|this) (post|asset)\b/i);
  });
});
