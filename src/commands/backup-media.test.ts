import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { backupMediaCommand, main } from "./backup-media.ts";

const NOW = "2026-08-16T00:00:00.000Z";

async function touch(path: string, content = "x"): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

async function writeLedger(path: string, ideas: unknown[]): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify({ ideas }, null, 2));
}

describe("/backup-media — orchestration shell (issue #197)", () => {
  it("backs up and reports per-Brand counts and missing ledger paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-cmd-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-cmd-dest-"));
    try {
      const brandsRoot = join(root, "data", "brands");
      const existingPath = "data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/0-hook.png";
      const missingPath = "data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/1-then.png";
      await touch(join(root, existingPath));
      await writeLedger(join(brandsRoot, "acme", "ledger.json"), [
        {
          id: "idea-01",
          status: "accepted",
          assets: [
            { recipe: "news-carousel", status: "produced", asset_paths: [existingPath, missingPath] },
          ],
        },
      ]);

      const output = await backupMediaCommand([dest], { brandsRoot, repoRoot: root, now: () => NOW });

      assert.match(output, /acme: 1 file\(s\) copied/);
      assert.match(output, /1 ledger media path\(s\) point at a file that no longer exists/);
      assert.match(output, new RegExp(missingPath.replace(/\//g, "\\/")));
      assert.match(output, new RegExp(dest.replace(/\//g, "\\/")));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("reports nothing to back up when there are no Brands", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-cmd-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-cmd-dest-"));
    try {
      const brandsRoot = join(root, "data", "brands");
      const output = await backupMediaCommand([dest], { brandsRoot, repoRoot: root, now: () => NOW });
      assert.match(output, /No Brands found/);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("--verify checks an existing backup and reports zero mismatches", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-cmd-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-cmd-dest-"));
    try {
      const brandsRoot = join(root, "data", "brands");
      const relPath = "data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/0-hook.png";
      await touch(join(root, relPath));
      await writeLedger(join(brandsRoot, "acme", "ledger.json"), [
        {
          id: "idea-01",
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced", asset_paths: [relPath] }],
        },
      ]);
      await backupMediaCommand([dest], { brandsRoot, repoRoot: root, now: () => NOW });

      const verifyOutput = await backupMediaCommand([dest, "--verify"], {});
      assert.match(verifyOutput, /0 mismatches/);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("--verify reports a mismatch when a backed-up file is corrupted", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-cmd-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-cmd-dest-"));
    try {
      const brandsRoot = join(root, "data", "brands");
      const relPath = "data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/0-hook.png";
      await touch(join(root, relPath), "original");
      await writeLedger(join(brandsRoot, "acme", "ledger.json"), [
        {
          id: "idea-01",
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced", asset_paths: [relPath] }],
        },
      ]);
      await backupMediaCommand([dest], { brandsRoot, repoRoot: root, now: () => NOW });
      await writeFile(join(dest, relPath), "corrupted");

      const verifyOutput = await backupMediaCommand([dest, "--verify"], {});
      assert.match(verifyOutput, /1 mismatch/);
      assert.match(verifyOutput, /checksum-mismatch/);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("resolves the destination from MEDIA_BACKUP_DEST when no positional argument is given", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-cmd-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-cmd-dest-"));
    try {
      const brandsRoot = join(root, "data", "brands");
      const output = await backupMediaCommand([], {
        brandsRoot,
        repoRoot: root,
        now: () => NOW,
        env: { MEDIA_BACKUP_DEST: dest },
        homeDir: "/should-not-be-used",
      });
      assert.match(output, new RegExp(dest.replace(/\//g, "\\/")));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("main() runs against real process.argv and prints to stdout without throwing", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-cmd-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-cmd-dest-"));
    const originalArgv = process.argv;
    const originalCwd = process.cwd();
    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      const brandsRoot = join(root, "data", "brands");
      await mkdir(brandsRoot, { recursive: true });
      process.chdir(root);
      process.argv = ["node", "backup-media.ts", dest];
      await main();
      assert.ok(chunks.join("").includes("Media backup written to"));
    } finally {
      process.stdout.write = originalWrite;
      process.argv = originalArgv;
      process.chdir(originalCwd);
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });
});
