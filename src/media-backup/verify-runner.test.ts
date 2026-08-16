import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMediaBackup } from "./backup-runner.ts";
import { verifyMediaBackup } from "./verify-runner.ts";

const NOW = "2026-08-16T00:00:00.000Z";

async function touch(path: string, content = "x"): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

async function writeLedger(path: string, ideas: unknown[]): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify({ ideas }, null, 2));
}

async function backupOneFile(): Promise<{ root: string; dest: string; relMediaPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "og-verify-src-"));
  const dest = await mkdtemp(join(tmpdir(), "og-verify-dest-"));
  const brandsRoot = join(root, "data", "brands");
  const relMediaPath = "data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/0-hook.png";
  await touch(join(root, relMediaPath), "hook-bytes");
  await writeLedger(join(brandsRoot, "acme", "ledger.json"), [
    {
      id: "idea-01",
      status: "accepted",
      assets: [{ recipe: "news-carousel", status: "produced", asset_paths: [relMediaPath] }],
    },
  ]);
  await runMediaBackup(dest, { brandsRoot, repoRoot: root, now: () => NOW });
  return { root, dest, relMediaPath };
}

describe("verifyMediaBackup — checks the manifest against the backup destination (issue #197)", () => {
  it("reports zero mismatches for a fresh, untouched backup", async () => {
    const { root, dest } = await backupOneFile();
    try {
      const result = await verifyMediaBackup(dest);
      assert.equal(result.totalEntries, 1);
      assert.deepEqual(result.mismatches, []);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("reports checksum-mismatch when a backed-up file's content changes", async () => {
    const { root, dest, relMediaPath } = await backupOneFile();
    try {
      await writeFile(join(dest, relMediaPath), "corrupted-bytes");
      const result = await verifyMediaBackup(dest);
      assert.equal(result.mismatches.length, 1);
      assert.equal(result.mismatches[0]?.reason, "checksum-mismatch");
      assert.equal(result.mismatches[0]?.path, relMediaPath);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("reports missing-at-destination when a backed-up file is deleted from the destination", async () => {
    const { root, dest, relMediaPath } = await backupOneFile();
    try {
      await rm(join(dest, relMediaPath));
      const result = await verifyMediaBackup(dest);
      assert.equal(result.mismatches.length, 1);
      assert.equal(result.mismatches[0]?.reason, "missing-at-destination");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("throws a clear, named error when no manifest exists at the destination", async () => {
    const dest = await mkdtemp(join(tmpdir(), "og-verify-empty-"));
    try {
      await assert.rejects(() => verifyMediaBackup(dest), /no manifest found/);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("verifies an empty manifest (zero entries) as zero mismatches", async () => {
    const dest = await mkdtemp(join(tmpdir(), "og-verify-empty-manifest-"));
    try {
      await writeFile(
        join(dest, "manifest.json"),
        JSON.stringify({ generatedAt: NOW, destination: dest, entries: [], missingLedgerPaths: [] }),
      );
      const result = await verifyMediaBackup(dest);
      assert.equal(result.totalEntries, 0);
      assert.deepEqual(result.mismatches, []);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });
});
