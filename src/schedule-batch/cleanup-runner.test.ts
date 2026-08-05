import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runScheduleCleanup } from "./cleanup-runner.ts";
import { FakeMediaHost } from "../media-host/fixtures/fake-media-host.ts";

const NOW = "2026-08-10T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isoAt(offsetMs: number): string {
  return new Date(NOW_MS + offsetMs).toISOString();
}

interface ManifestFixtureAsset {
  readonly idea: string;
  readonly recipe: string;
  readonly scheduled_at: string;
  readonly s3_keys: readonly string[];
  readonly urls: readonly string[];
  readonly cleaned_at?: string;
}

async function writeManifest(path: string, ideas: readonly ManifestFixtureAsset[]): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const manifest = {
    batch: "test-batch",
    brand: "straw-motion",
    format: "unhypped-news",
    run: "2026-W32",
    created_at: NOW,
    csv_files: ["zoho-main.csv"],
    stripped_notes: [],
    ideas: ideas.map((a) => ({ ...a, rows: {}, stripped_notes: [] })),
  };
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "og-cleanup-runner-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("runScheduleCleanup — manifest-driven S3 cleanup (issue #147)", () => {
  it("deletes exactly the more-than-1-day-past objects and leaves the rest untouched", async () => {
    await withRoot(async (root) => {
      const ideasRoot = join(root, "ideas");
      const manifestPath = join(ideasRoot, "unhypped-news", "2026-W32", "zoho-manifest.json");
      await writeManifest(manifestPath, [
        {
          idea: "idea-01",
          recipe: "news-carousel",
          scheduled_at: isoAt(-ONE_DAY_MS - 1), // more than 1 day past — due
          s3_keys: ["straw-motion/2026-W32/idea-01/0-hook.jpg", "straw-motion/2026-W32/idea-01/1-then.jpg"],
          urls: ["https://x/0-hook.jpg", "https://x/1-then.jpg"],
        },
        {
          idea: "idea-02",
          recipe: "news-carousel",
          scheduled_at: isoAt(-ONE_DAY_MS), // exactly 1 day past — NOT due (boundary)
          s3_keys: ["straw-motion/2026-W32/idea-02/0-hook.jpg"],
          urls: ["https://x/idea-02/0-hook.jpg"],
        },
        {
          idea: "idea-03",
          recipe: "news-carousel",
          scheduled_at: isoAt(-ONE_DAY_MS + 60_000), // less than 1 day past — NOT due
          s3_keys: ["straw-motion/2026-W32/idea-03/0-hook.jpg"],
          urls: ["https://x/idea-03/0-hook.jpg"],
        },
        {
          idea: "idea-04",
          recipe: "news-carousel",
          scheduled_at: isoAt(ONE_DAY_MS * 3), // future — NOT due
          s3_keys: ["straw-motion/2026-W32/idea-04/0-hook.jpg"],
          urls: ["https://x/idea-04/0-hook.jpg"],
        },
      ]);

      const mediaHost = new FakeMediaHost();
      const result = await runScheduleCleanup("straw-motion", {
        ideasRoot,
        now: () => NOW,
        mediaHost,
      });

      assert.equal(result.manifestsScanned, 1);
      assert.equal(result.actions.length, 1);
      assert.equal(result.actions[0]!.ideaId, "idea-01");

      assert.deepEqual(mediaHost.deleteCalls, [
        "straw-motion/2026-W32/idea-01/0-hook.jpg",
        "straw-motion/2026-W32/idea-01/1-then.jpg",
      ]);

      const written = JSON.parse(await readFile(manifestPath, "utf8")) as {
        readonly ideas: readonly { readonly idea: string; readonly cleaned_at?: string }[];
      };
      const byIdea = new Map(written.ideas.map((a) => [a.idea, a.cleaned_at]));
      assert.equal(byIdea.get("idea-01"), NOW);
      assert.equal(byIdea.get("idea-02"), undefined);
      assert.equal(byIdea.get("idea-03"), undefined);
      assert.equal(byIdea.get("idea-04"), undefined);
    });
  });

  it("never touches an already-cleaned entry again on a re-run (idempotent, no double-delete)", async () => {
    await withRoot(async (root) => {
      const ideasRoot = join(root, "ideas");
      const manifestPath = join(ideasRoot, "unhypped-news", "2026-W32", "zoho-manifest.json");
      await writeManifest(manifestPath, [
        {
          idea: "idea-01",
          recipe: "news-carousel",
          scheduled_at: isoAt(-ONE_DAY_MS - 1),
          s3_keys: ["k1"],
          urls: ["https://x/k1"],
        },
      ]);

      const mediaHost = new FakeMediaHost();
      const first = await runScheduleCleanup("straw-motion", { ideasRoot, now: () => NOW, mediaHost });
      assert.equal(first.actions.length, 1);
      assert.equal(mediaHost.deleteCalls.length, 1);

      const second = await runScheduleCleanup("straw-motion", { ideasRoot, now: () => NOW, mediaHost });
      assert.equal(second.actions.length, 0);
      assert.equal(mediaHost.deleteCalls.length, 1); // no additional delete call
    });
  });

  it("scans recursively across both Format-namespaced and legacy (un-namespaced) run folders", async () => {
    await withRoot(async (root) => {
      const ideasRoot = join(root, "ideas");
      const namespacedManifest = join(ideasRoot, "unhypped-news", "2026-W32", "zoho-manifest.json");
      const legacyManifest = join(ideasRoot, "2026-W23", "zoho-manifest.json"); // legacy layout note
      await writeManifest(namespacedManifest, [
        {
          idea: "idea-01",
          recipe: "news-carousel",
          scheduled_at: isoAt(-ONE_DAY_MS - 1),
          s3_keys: ["k-namespaced"],
          urls: ["https://x/k-namespaced"],
        },
      ]);
      await writeManifest(legacyManifest, [
        {
          idea: "idea-legacy-01",
          recipe: "news-carousel",
          scheduled_at: isoAt(-ONE_DAY_MS - 1),
          s3_keys: ["k-legacy"],
          urls: ["https://x/k-legacy"],
        },
      ]);

      const mediaHost = new FakeMediaHost();
      const result = await runScheduleCleanup("straw-motion", { ideasRoot, now: () => NOW, mediaHost });

      assert.equal(result.manifestsScanned, 2);
      assert.deepEqual(mediaHost.deleteCalls.sort(), ["k-legacy", "k-namespaced"]);
    });
  });

  it("a garbled manifest file never crashes the scan — other manifests still get cleaned", async () => {
    await withRoot(async (root) => {
      const ideasRoot = join(root, "ideas");
      const goodManifest = join(ideasRoot, "unhypped-news", "2026-W32", "zoho-manifest.json");
      const garbledManifest = join(ideasRoot, "unhypped-news", "2026-W31", "zoho-manifest.json");
      await writeManifest(goodManifest, [
        {
          idea: "idea-01",
          recipe: "news-carousel",
          scheduled_at: isoAt(-ONE_DAY_MS - 1),
          s3_keys: ["k-good"],
          urls: ["https://x/k-good"],
        },
      ]);
      await mkdir(join(ideasRoot, "unhypped-news", "2026-W31"), { recursive: true });
      await writeFile(garbledManifest, "{ this is not valid json", "utf8");

      const mediaHost = new FakeMediaHost();
      const result = await runScheduleCleanup("straw-motion", { ideasRoot, now: () => NOW, mediaHost });

      assert.equal(result.manifestsScanned, 2);
      assert.deepEqual(mediaHost.deleteCalls, ["k-good"]);
    });
  });

  it("returns zero manifests scanned and zero actions when there are no manifests at all", async () => {
    await withRoot(async (root) => {
      const ideasRoot = join(root, "ideas");
      const mediaHost = new FakeMediaHost();
      const result = await runScheduleCleanup("straw-motion", { ideasRoot, now: () => NOW, mediaHost });
      assert.equal(result.manifestsScanned, 0);
      assert.deepEqual(result.actions, []);
      assert.equal(mediaHost.deleteCalls.length, 0);
    });
  });

  it("returns zero manifests scanned when the Brand's ideas root does not exist yet", async () => {
    await withRoot(async (root) => {
      const mediaHost = new FakeMediaHost();
      const result = await runScheduleCleanup("straw-motion", {
        ideasRoot: join(root, "does-not-exist"),
        now: () => NOW,
        mediaHost,
      });
      assert.equal(result.manifestsScanned, 0);
      assert.deepEqual(result.actions, []);
    });
  });

  it("leaves every OTHER field of a cleaned manifest entry byte-for-byte untouched", async () => {
    await withRoot(async (root) => {
      const ideasRoot = join(root, "ideas");
      const manifestPath = join(ideasRoot, "unhypped-news", "2026-W32", "zoho-manifest.json");
      await writeManifest(manifestPath, [
        {
          idea: "idea-01",
          recipe: "news-carousel",
          scheduled_at: isoAt(-ONE_DAY_MS - 1),
          s3_keys: ["k1"],
          urls: ["https://x/k1"],
        },
      ]);

      const mediaHost = new FakeMediaHost();
      await runScheduleCleanup("straw-motion", { ideasRoot, now: () => NOW, mediaHost });

      const written = JSON.parse(await readFile(manifestPath, "utf8")) as {
        readonly batch: string;
        readonly brand: string;
        readonly ideas: readonly { readonly idea: string; readonly s3_keys: readonly string[]; readonly urls: readonly string[] }[];
      };
      assert.equal(written.batch, "test-batch");
      assert.equal(written.brand, "straw-motion");
      assert.deepEqual(written.ideas[0]!.s3_keys, ["k1"]); // s3_keys stays as the historical record
      assert.deepEqual(written.ideas[0]!.urls, ["https://x/k1"]);
    });
  });
});
