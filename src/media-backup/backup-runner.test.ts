import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMediaBackup } from "./backup-runner.ts";
import type { BackupManifest } from "./manifest.ts";

const NOW = "2026-08-16T00:00:00.000Z";

async function touch(path: string, content = "x"): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

async function writeLedger(path: string, ideas: unknown[]): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify({ ideas }, null, 2));
}

describe("runMediaBackup — copies ledger-referenced media UNION the produced-media tree (issue #197)", () => {
  it("copies a ledger-referenced file that exists, and reports the per-Brand count", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-dest-"));
    try {
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

      const result = await runMediaBackup(dest, { brandsRoot, repoRoot: root, now: () => NOW });

      assert.equal(result.brands.length, 1);
      assert.equal(result.brands[0]?.brand, "acme");
      assert.equal(result.brands[0]?.copiedCount, 1);
      assert.deepEqual(result.brands[0]?.missingLedgerPaths, []);

      const copied = await readFile(join(dest, relMediaPath), "utf8");
      assert.equal(copied, "hook-bytes");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("lists a ledger media path pointing at a file that does not exist, rather than skipping it", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-dest-"));
    try {
      const brandsRoot = join(root, "data", "brands");
      const missingPath = "data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/0-hook.png";
      await writeLedger(join(brandsRoot, "acme", "ledger.json"), [
        {
          id: "idea-01",
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced", asset_paths: [missingPath] }],
        },
      ]);

      const result = await runMediaBackup(dest, { brandsRoot, repoRoot: root, now: () => NOW });

      assert.equal(result.brands[0]?.copiedCount, 0);
      assert.equal(result.brands[0]?.missingLedgerPaths.length, 1);
      assert.deepEqual(result.brands[0]?.missingLedgerPaths[0], {
        brand: "acme",
        ideaId: "idea-01",
        recipe: "news-carousel",
        path: missingPath,
      });

      const manifest: BackupManifest = JSON.parse(await readFile(join(dest, "manifest.json"), "utf8"));
      assert.equal(manifest.missingLedgerPaths.length, 1);
      assert.equal(manifest.missingLedgerPaths[0]?.path, missingPath);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("also copies produced-media tree files the ledger does NOT individually reference", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-dest-"));
    try {
      const brandsRoot = join(root, "data", "brands");
      await writeLedger(join(brandsRoot, "acme", "ledger.json"), []);
      // A bundle file present on disk but never referenced by the (empty) ledger.
      await touch(
        join(brandsRoot, "acme", "ideas", "2026-W01", "idea-01.news-carousel.output", "caption.txt"),
        "the caption",
      );

      const result = await runMediaBackup(dest, { brandsRoot, repoRoot: root, now: () => NOW });

      assert.equal(result.brands[0]?.copiedCount, 1);
      const copied = await readFile(
        join(dest, "data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/caption.txt"),
        "utf8",
      );
      assert.equal(copied, "the caption");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("copies a file exactly once when it is referenced by BOTH the ledger and present in the produced-media tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-dest-"));
    try {
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

      const result = await runMediaBackup(dest, { brandsRoot, repoRoot: root, now: () => NOW });
      assert.equal(result.brands[0]?.copiedCount, 1); // not 2
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("backs up every Brand under brandsRoot, discovered via listBrands (not a hardcoded pair)", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-dest-"));
    try {
      const brandsRoot = join(root, "data", "brands");
      for (const brand of ["acme", "beta", "gamma"]) {
        const relPath = `data/brands/${brand}/ideas/r/idea-01.news-carousel.output/x.png`;
        await touch(join(root, relPath));
        await writeLedger(join(brandsRoot, brand, "ledger.json"), []);
      }

      const result = await runMediaBackup(dest, { brandsRoot, repoRoot: root, now: () => NOW });

      assert.deepEqual(
        result.brands.map((b) => b.brand).sort(),
        ["acme", "beta", "gamma"],
      );
      for (const b of result.brands) assert.equal(b.copiedCount, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("does not throw when a Brand directory exists with no ledger.json at all", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-dest-"));
    try {
      const brandsRoot = join(root, "data", "brands");
      await mkdir(join(brandsRoot, "brand-new"), { recursive: true });

      const result = await runMediaBackup(dest, { brandsRoot, repoRoot: root, now: () => NOW });
      assert.equal(result.brands[0]?.copiedCount, 0);
      assert.deepEqual(result.brands[0]?.missingLedgerPaths, []);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("writes a manifest.json with checksum + size per entry, and generatedAt from the injected clock", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-dest-"));
    try {
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

      const manifest: BackupManifest = JSON.parse(await readFile(join(dest, "manifest.json"), "utf8"));
      assert.equal(manifest.generatedAt, NOW);
      assert.equal(manifest.entries.length, 1);
      assert.equal(manifest.entries[0]?.brand, "acme");
      assert.equal(manifest.entries[0]?.path, relMediaPath);
      assert.equal(manifest.entries[0]?.sizeBytes, "hook-bytes".length);
      assert.match(manifest.entries[0]?.sha256 ?? "", /^[0-9a-f]{64}$/);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("copies an ABSOLUTE ledger path that resolves OUTSIDE repoRoot, keyed under external/<brand>/ " +
    "(real-world shape: an older record's absolute path from a different machine/checkout — issue #197)", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-dest-"));
    const elsewhere = await mkdtemp(join(tmpdir(), "og-backup-elsewhere-"));
    try {
      const brandsRoot = join(root, "data", "brands");
      const absMediaPath = join(elsewhere, "some-other-checkout", "0-hook.png");
      await touch(absMediaPath, "hook-bytes-from-elsewhere");
      await writeLedger(join(brandsRoot, "acme", "ledger.json"), [
        {
          id: "idea-01",
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced", asset_paths: [absMediaPath] }],
        },
      ]);

      const result = await runMediaBackup(dest, { brandsRoot, repoRoot: root, now: () => NOW });

      assert.equal(result.brands[0]?.copiedCount, 1);
      assert.deepEqual(result.brands[0]?.missingLedgerPaths, []);

      const manifest: BackupManifest = JSON.parse(await readFile(join(dest, "manifest.json"), "utf8"));
      assert.equal(manifest.entries.length, 1);
      assert.ok(manifest.entries[0]?.path.startsWith("external/acme/"));
      const copied = await readFile(join(dest, manifest.entries[0]?.path ?? ""), "utf8");
      assert.equal(copied, "hook-bytes-from-elsewhere");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("is independent of process.cwd() — a relative brandsRoot anchors to the given repoRoot, not to whatever directory the process happens to be running from", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-dest-"));
    const originalCwd = process.cwd();
    try {
      // A relative brandsRoot, resolved against `repoRoot` explicitly — with the process's actual
      // cwd pointed somewhere else entirely, so this can only pass if brandsRoot/ideasRoot are
      // anchored to repoRoot, not implicitly resolved against process.cwd() by the underlying fs
      // calls.
      const relBrandsRoot = "data/brands";
      const relMediaPath = "data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/0-hook.png";
      await touch(join(root, relMediaPath), "hook-bytes");
      await writeLedger(join(root, relBrandsRoot, "acme", "ledger.json"), [
        {
          id: "idea-01",
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced", asset_paths: [relMediaPath] }],
        },
      ]);
      process.chdir(dest); // somewhere else entirely — must not affect resolution

      const result = await runMediaBackup(dest, {
        brandsRoot: relBrandsRoot,
        repoRoot: root,
        now: () => NOW,
      });

      assert.equal(result.brands[0]?.copiedCount, 1);
      assert.deepEqual(result.brands[0]?.missingLedgerPaths, []);
    } finally {
      process.chdir(originalCwd);
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("returns brands: [] and writes an empty manifest when brandsRoot has no Brands yet", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-backup-src-"));
    const dest = await mkdtemp(join(tmpdir(), "og-backup-dest-"));
    try {
      const brandsRoot = join(root, "data", "brands"); // never created
      const result = await runMediaBackup(dest, { brandsRoot, repoRoot: root, now: () => NOW });
      assert.deepEqual(result.brands, []);
      const manifest: BackupManifest = JSON.parse(await readFile(join(dest, "manifest.json"), "utf8"));
      assert.deepEqual(manifest.entries, []);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });
});
