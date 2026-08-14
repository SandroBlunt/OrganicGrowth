import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite for `/cleanup-schedule-media` (issue #147). Proves the slash-command
 * doc names the real, code-backed pipeline — not just prose — and is honest about what is/isn't
 * hermetic.
 *
 * Kept OUT of the unit suite (the `npm test` glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts"). Run with `npm run test:docs`. Editing this doc must never break `npm test`.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLEANUP_CMD = join(REPO_ROOT, ".agents", "skills", "cleanup-schedule-media", "SKILL.md");

describe("cleanup-schedule-media.md — describes the code-backed manifest cleanup (issue #147)", () => {
  it("exists and documents <brand> as the one required argument", async () => {
    const doc = await readFile(CLEANUP_CMD, "utf8");
    assert.match(doc, /<brand>/);
  });

  it("names the real orchestration shell, the I/O shell, and the pure decision module", async () => {
    const doc = await readFile(CLEANUP_CMD, "utf8");
    assert.match(doc, /src\/commands\/cleanup-schedule-media\.ts/);
    assert.match(doc, /cleanupScheduleMediaCommand/);
    assert.match(doc, /src\/schedule-batch\/cleanup-runner\.ts/);
    assert.match(doc, /src\/schedule-batch\/cleanup\.ts/);
  });

  it("documents the delete-late-never-early rule and the 1-day cutoff", async () => {
    const doc = await readFile(CLEANUP_CMD, "utf8");
    assert.match(doc, /[Dd]elete late, never early/);
    assert.match(doc, /more than 1 day/);
    assert.match(doc, /less than or exactly 1 day/);
    assert.match(doc, /is never touched/);
  });

  it("documents the 30-day bucket lifecycle rule as a documented setup step, not code", async () => {
    const doc = await readFile(CLEANUP_CMD, "utf8");
    assert.match(doc, /30-day/);
    assert.match(doc, /not code/);
  });

  it("documents that cleanup records removal via cleaned_at, making a re-run safe (idempotent)", async () => {
    const doc = await readFile(CLEANUP_CMD, "utf8");
    assert.match(doc, /cleaned_at/);
    assert.match(doc, /never double-delete|[Ii]dempotent/);
  });

  it("is honest that tests always inject a FAKE Media Host — never live S3, hermetic build", async () => {
    const doc = await readFile(CLEANUP_CMD, "utf8");
    assert.match(doc, /FAKE Media Host/);
    assert.match(doc, /never live S3/);
    assert.match(doc, /hermetic/i);
  });

  it("states this command never publishes and never touches the ledger", async () => {
    const doc = await readFile(CLEANUP_CMD, "utf8");
    assert.match(doc, /ADR-0002/);
    assert.match(doc, /[Nn]ever touches the ledger/);
    assert.doesNotMatch(doc, /\bpublish(es|ing)? (the|a|this) (post|asset)\b/i);
  });
});
