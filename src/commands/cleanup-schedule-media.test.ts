import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanupScheduleMediaCommand, main as cleanupMain } from "./cleanup-schedule-media.ts";
import { FakeMediaHost } from "../media-host/fixtures/fake-media-host.ts";

const NOW = "2026-08-10T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isoAt(offsetMs: number): string {
  return new Date(NOW_MS + offsetMs).toISOString();
}

async function writeManifest(
  path: string,
  ideas: readonly { idea: string; recipe: string; scheduled_at: string; s3_keys: readonly string[] }[],
): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const manifest = {
    batch: "test-batch",
    brand: "straw-motion",
    format: "unhypped-news",
    run: "2026-W32",
    created_at: NOW,
    csv_files: ["zoho-main.csv"],
    stripped_notes: [],
    ideas: ideas.map((a) => ({ ...a, urls: a.s3_keys.map((k) => `https://x/${k}`), rows: {}, stripped_notes: [] })),
  };
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

describe("/cleanup-schedule-media <brand> — the standalone cleanup trigger (issue #147)", () => {
  it("scans, deletes the due objects, and reports what was removed", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-cleanup-cmd-"));
    try {
      const ideasRoot = join(root, "ideas");
      await writeManifest(join(ideasRoot, "unhypped-news", "2026-W32", "zoho-manifest.json"), [
        { idea: "idea-01", recipe: "news-carousel", scheduled_at: isoAt(-ONE_DAY_MS - 1), s3_keys: ["k1", "k2"] },
        { idea: "idea-02", recipe: "news-carousel", scheduled_at: isoAt(ONE_DAY_MS), s3_keys: ["k3"] },
      ]);

      const mediaHost = new FakeMediaHost();
      const output = await cleanupScheduleMediaCommand("straw-motion", { ideasRoot, now: () => NOW, mediaHost });

      assert.match(output, /straw-motion/);
      assert.match(output, /idea-01/);
      assert.doesNotMatch(output, /idea-02/);
      assert.equal(mediaHost.deleteCalls.length, 2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports nothing to clean when no manifest is due", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-cleanup-cmd-"));
    try {
      const ideasRoot = join(root, "ideas");
      await writeManifest(join(ideasRoot, "unhypped-news", "2026-W32", "zoho-manifest.json"), [
        { idea: "idea-01", recipe: "news-carousel", scheduled_at: isoAt(ONE_DAY_MS), s3_keys: ["k1"] },
      ]);

      const mediaHost = new FakeMediaHost();
      const output = await cleanupScheduleMediaCommand("straw-motion", { ideasRoot, now: () => NOW, mediaHost });

      assert.match(output, /nothing/i);
      assert.equal(mediaHost.deleteCalls.length, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports nothing to clean when there are no manifests at all", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-cleanup-cmd-"));
    try {
      const ideasRoot = join(root, "ideas");
      const mediaHost = new FakeMediaHost();
      const output = await cleanupScheduleMediaCommand("straw-motion", { ideasRoot, now: () => NOW, mediaHost });
      assert.match(output, /No Schedule Batch manifests found/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("main() prints a usage error and exits non-zero when <brand> is missing", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const stderrChunks: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      stderrChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      process.exitCode = 0;
      process.argv = ["node", "cleanup-schedule-media.ts"];
      await cleanupMain();
      assert.notEqual(process.exitCode, 0);
      assert.match(stderrChunks.join(""), /usage: npm run cleanup-schedule-media/);
    } finally {
      process.stderr.write = originalWrite;
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });

  it("uses the real Media Host default and throws only when actually invoked (never reached with nothing due)", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-cleanup-cmd-"));
    try {
      const ideasRoot = join(root, "ideas");
      // No manifests at all — the default (unconfigured) Media Host must never be called.
      const output = await cleanupScheduleMediaCommand("straw-motion", { ideasRoot });
      assert.match(output, /No Schedule Batch manifests found/);

      // Cross-check: fixture with a DUE entry does throw when relying on the default host.
      await writeManifest(join(ideasRoot, "unhypped-news", "2026-W32", "zoho-manifest.json"), [
        { idea: "idea-01", recipe: "news-carousel", scheduled_at: isoAt(-ONE_DAY_MS - 1), s3_keys: ["k1"] },
      ]);
      await assert.rejects(() => cleanupScheduleMediaCommand("straw-motion", { ideasRoot, now: () => NOW }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
