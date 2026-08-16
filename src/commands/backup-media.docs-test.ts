import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite for `/backup-media` (issue #197, QA Round 1 Defect 2). Proves the
 * slash-command doc registered at its REAL path (`.claude/commands/backup-media.md`) names the real,
 * code-backed pipeline — not just prose — and is honest about what is/isn't hermetic. Mirrors
 * `cleanup-schedule-media.docs-test.ts`'s own pattern: every assertion reads the actual shipped file
 * at its real path and pins against real identifiers/substrings, never a free-floating description
 * that isn't checked against what ships.
 *
 * Kept OUT of the unit suite (the `npm test` glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts"). Run with `npm run test:docs`. Editing this doc must never break `npm test`.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BACKUP_MEDIA_CMD = join(REPO_ROOT, ".claude", "commands", "backup-media.md");

describe("backup-media.md — describes the code-backed media backup (issue #197)", () => {
  it("exists and documents both the destination argument and --verify as optional", async () => {
    const doc = await readFile(BACKUP_MEDIA_CMD, "utf8");
    assert.match(doc, /<destination>/);
    assert.match(doc, /--verify/);
    assert.match(doc, /OPTIONAL/);
  });

  it("names the real orchestration shell and every real deep module it wraps", async () => {
    const doc = await readFile(BACKUP_MEDIA_CMD, "utf8");
    assert.match(doc, /src\/commands\/backup-media\.ts/);
    assert.match(doc, /backupMediaCommand/);
    assert.match(doc, /src\/media-backup\/ledger-media-refs\.ts/);
    assert.match(doc, /src\/media-backup\/path-resolve\.ts/);
    assert.match(doc, /src\/media-backup\/produced-media-tree\.ts/);
    assert.match(doc, /src\/media-backup\/checksum\.ts/);
    assert.match(doc, /src\/media-backup\/copy\.ts/);
    assert.match(doc, /src\/media-backup\/manifest\.ts/);
    assert.match(doc, /src\/media-backup\/destination\.ts/);
    assert.match(doc, /runMediaBackup/);
    assert.match(doc, /verifyMediaBackup/);
  });

  it("documents that every Brand is discovered via listBrands, never a hardcoded pair", async () => {
    const doc = await readFile(BACKUP_MEDIA_CMD, "utf8");
    assert.match(doc, /listBrands/);
    assert.match(doc, /never a hardcoded pair|not a fixed pair|not a hardcoded pair/i);
  });

  it("documents the destination precedence and the no-hardcoded-personal-path rule", async () => {
    const doc = await readFile(BACKUP_MEDIA_CMD, "utf8");
    assert.match(doc, /MEDIA_BACKUP_DEST/);
    assert.match(doc, /OrganicGrowth-Backups/);
    assert.match(doc, /never a hardcoded personal path/i);
  });

  it("documents that a missing ledger media path is listed, never silently skipped", async () => {
    const doc = await readFile(BACKUP_MEDIA_CMD, "utf8");
    assert.match(doc, /LISTED in the report|listed in the report/i);
    assert.match(doc, /never silently skip/i);
  });

  it("documents the manifest's checksum + size shape", async () => {
    const doc = await readFile(BACKUP_MEDIA_CMD, "utf8");
    assert.match(doc, /manifest\.json/);
    assert.match(doc, /SHA-256/);
  });

  it("documents --verify's three mismatch reasons", async () => {
    const doc = await readFile(BACKUP_MEDIA_CMD, "utf8");
    assert.match(doc, /missing-at-destination/);
    assert.match(doc, /checksum-mismatch/);
    assert.match(doc, /size-mismatch/);
  });

  it("is honest that tests always use temp directories and fixture ledgers — never the real corpus", async () => {
    const doc = await readFile(BACKUP_MEDIA_CMD, "utf8");
    assert.match(doc, /temp directories/);
    assert.match(doc, /never the real/i);
    assert.match(doc, /hermetic/i);
  });

  it("states this command never publishes and never writes to the ledger", async () => {
    const doc = await readFile(BACKUP_MEDIA_CMD, "utf8");
    assert.match(doc, /ADR-0002/);
    assert.match(doc, /never writes to a Brand's `?ledger\.json`?/i);
    assert.doesNotMatch(doc, /\bpublish(es|ing)? (the|a|this) (post|asset)\b/i);
  });

  it("warns that a fresh worktree's report of missing files is a filesystem-locality fact, not a bug", async () => {
    const doc = await readFile(BACKUP_MEDIA_CMD, "utf8");
    assert.match(doc, /worktree/);
    assert.match(doc, /gitignored/);
  });
});
