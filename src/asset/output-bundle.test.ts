/**
 * Tests for `src/asset/output-bundle.ts` (issue #112).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  outputDirFor,
  generatePostJson,
  captionText,
  writePostJson,
  writeCaptionText,
  refreshPostJson,
  type PostJson,
} from "./output-bundle.ts";
import type { LedgerAssetRecord } from "./asset.ts";
import { downloadAssetFiles } from "./download.ts";
import { writeAsset } from "./store.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-output-bundle-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A hand-rolled fetch stub — never touches the network (mirrors download.test.ts's own helper). */
function stubFetch(byUrl: Record<string, { readonly ok: boolean; readonly status?: number; readonly body?: string }>) {
  return async (url: string | URL | Request): Promise<Response> => {
    const key = String(url);
    const entry = byUrl[key];
    if (entry === undefined) throw new Error(`stubFetch: no entry for ${key}`);
    return {
      ok: entry.ok,
      status: entry.status ?? (entry.ok ? 200 : 500),
      statusText: entry.ok ? "OK" : "Error",
      arrayBuffer: async () => new TextEncoder().encode(entry.body ?? "").buffer,
    } as Response;
  };
}

// ---------------------------------------------------------------------------
// outputDirFor
// ---------------------------------------------------------------------------

describe("outputDirFor — mirrors specPathFor's id/run/recipe convention, with .output in place of .assets", () => {
  it("builds <ideasRoot>/<run>/idea-NN.<recipe>.output for a full ledger id", () => {
    const dir = outputDirFor(
      "idea-2026-W29-01",
      "2026-W29",
      "data/brands/straw-motion/ideas",
      "news-carousel",
    );
    assert.equal(dir, join("data/brands/straw-motion/ideas", "2026-W29", "idea-01.news-carousel.output"));
  });

  it("never returns the retired .assets name", () => {
    const dir = outputDirFor("idea-2026-W22-03", "2026-W22", "data/brands/mundotip/ideas", "character-explainer-with-cast");
    assert.ok(dir.endsWith(".output"));
    assert.ok(!dir.endsWith(".assets"));
  });

  it("handles an already-short idea id (no run prefix) the same way briefShortName does", () => {
    const dir = outputDirFor("idea-01", "2026-W22", "ideas", "news-carousel");
    assert.equal(dir, join("ideas", "2026-W22", "idea-01.news-carousel.output"));
  });
});

// ---------------------------------------------------------------------------
// generatePostJson — the ONE pure ledger -> bundle generator
// ---------------------------------------------------------------------------

describe("generatePostJson — the ONE pure ledger->bundle generator", () => {
  const BRAND = "straw-motion";
  const IDEA = { id: "idea-2026-W29-01", format: "unhypped-news" };

  it("carries every AC4-listed field, with explicit nulls for not-yet-known tracking data", () => {
    const asset: LedgerAssetRecord = {
      recipe: "news-carousel",
      status: "produced",
      asset_paths: [
        "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.output/0-hook.png",
        "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.output/1-then.png",
      ],
      copy: { caption: "Three AI giants shipped agentic tools this week.", hashtags: ["#AInews", "#tech"] },
      produced_at: "2026-07-21T09:00:00.000Z",
    };

    const post = generatePostJson(BRAND, IDEA, asset);

    assert.deepEqual(post, {
      brand: "straw-motion",
      idea_id: "idea-2026-W29-01",
      recipe: "news-carousel",
      format: "unhypped-news",
      copy: { caption: "Three AI giants shipped agentic tools this week.", hashtags: ["#AInews", "#tech"] },
      media: ["0-hook.png", "1-then.png"],
      post_url: null,
      posted_at: null,
      performance_score: null,
      metrics: null,
      tracked_at: null,
    } satisfies PostJson);
  });

  it("media lists ORDERED BASENAMES of asset_paths, never re-sorted, never a full path", () => {
    // Deliberately NOT alphabetical — asset_paths' own order IS post order and must be preserved.
    const asset: LedgerAssetRecord = {
      recipe: "news-carousel",
      status: "produced",
      asset_paths: [
        "data/brands/x/ideas/r/idea-01.news-carousel.output/1-then.png",
        "data/brands/x/ideas/r/idea-01.news-carousel.output/0-hook.png",
      ],
    };
    const post = generatePostJson(BRAND, IDEA, asset);
    assert.deepEqual(post.media, ["1-then.png", "0-hook.png"]);
  });

  it("an Asset with no asset_paths yet has an empty media array", () => {
    const asset: LedgerAssetRecord = { recipe: "news-carousel", status: "in_production" };
    const post = generatePostJson(BRAND, IDEA, asset);
    assert.deepEqual(post.media, []);
  });

  it("carries the tracking fields once they exist on the Asset", () => {
    const asset: LedgerAssetRecord = {
      recipe: "news-carousel",
      status: "scored",
      asset_paths: ["a/idea-01.news-carousel.output/0-hook.png"],
      copy: { caption: "See what changed.", hashtags: [] },
      post_url: "https://facebook.com/permalink/123",
      posted_at: "2026-07-22T00:00:00.000Z",
      performance_score: 0.73,
      metrics: { shares: 5, comments: 10, reactions: 40, views: 900 },
      tracked_at: "2026-07-29T00:00:00.000Z",
    };
    const post = generatePostJson(BRAND, IDEA, asset);
    assert.equal(post.post_url, "https://facebook.com/permalink/123");
    assert.equal(post.posted_at, "2026-07-22T00:00:00.000Z");
    assert.equal(post.performance_score, 0.73);
    assert.deepEqual(post.metrics, { shares: 5, comments: 10, reactions: 40, views: 900 });
    assert.equal(post.tracked_at, "2026-07-29T00:00:00.000Z");
  });

  it("an Idea with no format yields format: null (never fabricated)", () => {
    const asset: LedgerAssetRecord = { recipe: "news-carousel", status: "queued" };
    const post = generatePostJson(BRAND, { id: "idea-01" }, asset);
    assert.equal(post.format, null);
  });

  it("an Asset with no copy yet yields copy: null", () => {
    const asset: LedgerAssetRecord = { recipe: "news-carousel", status: "in_production" };
    const post = generatePostJson(BRAND, IDEA, asset);
    assert.equal(post.copy, null);
  });

  it("is PURE — identical inputs always yield deep-equal output, and never mutate the inputs", () => {
    const asset: LedgerAssetRecord = {
      recipe: "news-carousel",
      status: "produced",
      asset_paths: ["a/idea-01.news-carousel.output/0-hook.png"],
      copy: { caption: "Hi", hashtags: ["#a"] },
    };
    const assetSnapshot = JSON.parse(JSON.stringify(asset)) as unknown;
    const first = generatePostJson(BRAND, IDEA, asset);
    const second = generatePostJson(BRAND, IDEA, asset);
    assert.deepEqual(first, second);
    assert.notEqual(first, second, "each call returns a FRESH object, never a shared reference");
    assert.deepEqual(JSON.parse(JSON.stringify(asset)), assetSnapshot, "the input Asset is never mutated");
  });
});

// ---------------------------------------------------------------------------
// captionText — paste-ready caption + hashtags
// ---------------------------------------------------------------------------

describe("captionText — paste-ready caption + hashtags", () => {
  it("renders caption, a blank line, then space-joined hashtags", () => {
    const text = captionText({
      caption: "Three AI giants shipped agentic tools this week.",
      hashtags: ["#AInews", "#tech"],
    });
    assert.equal(text, "Three AI giants shipped agentic tools this week.\n\n#AInews #tech\n");
  });

  it("renders just the caption, no dangling blank line, when there are zero hashtags", () => {
    const text = captionText({ caption: "See what changed.", hashtags: [] });
    assert.equal(text, "See what changed.\n");
  });
});

// ---------------------------------------------------------------------------
// writePostJson / writeCaptionText — disk writers, idempotent at the file level
// ---------------------------------------------------------------------------

describe("writePostJson — writes pretty JSON + trailing newline; idempotent", () => {
  it("writes post.json into the given directory, creating it if absent", async () => {
    await withTempDir(async (dir) => {
      const bundleDir = join(dir, "idea-01.news-carousel.output");
      const post: PostJson = {
        brand: "straw-motion",
        idea_id: "idea-01",
        recipe: "news-carousel",
        format: "unhypped-news",
        copy: { caption: "Hi", hashtags: ["#a"] },
        media: ["0-hook.png"],
        post_url: null,
        posted_at: null,
        performance_score: null,
        metrics: null,
        tracked_at: null,
      };
      const path = await writePostJson(bundleDir, post);
      assert.equal(path, join(bundleDir, "post.json"));
      const written = await readFile(path, "utf8");
      assert.deepEqual(JSON.parse(written), post);
      assert.ok(written.endsWith("\n"));
    });
  });

  it("writing twice from an unchanged PostJson yields a byte-identical file (AC2, file level)", async () => {
    await withTempDir(async (dir) => {
      const bundleDir = join(dir, "idea-01.news-carousel.output");
      const post: PostJson = {
        brand: "straw-motion",
        idea_id: "idea-01",
        recipe: "news-carousel",
        format: null,
        copy: null,
        media: [],
        post_url: null,
        posted_at: null,
        performance_score: null,
        metrics: null,
        tracked_at: null,
      };
      await writePostJson(bundleDir, post);
      const first = await readFile(join(bundleDir, "post.json"), "utf8");
      await writePostJson(bundleDir, post);
      const second = await readFile(join(bundleDir, "post.json"), "utf8");
      assert.equal(second, first);
    });
  });
});

describe("writeCaptionText — writes caption.txt", () => {
  it("writes the paste-ready caption text into the given directory", async () => {
    await withTempDir(async (dir) => {
      const bundleDir = join(dir, "idea-01.news-carousel.output");
      const path = await writeCaptionText(bundleDir, { caption: "Hi there.", hashtags: ["#a", "#b"] });
      assert.equal(path, join(bundleDir, "caption.txt"));
      const written = await readFile(path, "utf8");
      assert.equal(written, "Hi there.\n\n#a #b\n");
    });
  });
});

// ---------------------------------------------------------------------------
// refreshPostJson — the shell every lifecycle step calls
// ---------------------------------------------------------------------------

async function seedLedger(dir: string, ideas: unknown[]): Promise<string> {
  const ledgerPath = join(dir, "ledger.json");
  await writeFile(ledgerPath, JSON.stringify({ ideas }, null, 2) + "\n", "utf8");
  return ledgerPath;
}

describe("refreshPostJson — resolves an Asset's OWN bundle directory; never fabricates", () => {
  it("a NEW Asset's post.json lands inside its .output/ directory (resolved from asset_paths)", async () => {
    await withTempDir(async (dir) => {
      const bundleDir = join(dir, "ideas", "2026-W29", "idea-01.news-carousel.output");
      await mkdir(bundleDir, { recursive: true });
      const ledgerPath = await seedLedger(dir, [
        {
          id: "idea-01",
          status: "accepted",
          format: "unhypped-news",
          assets: [
            {
              recipe: "news-carousel",
              status: "produced",
              asset_paths: [join(bundleDir, "0-hook.png"), join(bundleDir, "1-then.png")],
              copy: { caption: "Hi", hashtags: ["#a"] },
            },
          ],
        },
      ]);

      const result = await refreshPostJson("straw-motion", "idea-01", "news-carousel", { ledgerPath });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.dir, bundleDir);
      assert.equal(result.path, join(bundleDir, "post.json"));
      assert.deepEqual(result.postJson.media, ["0-hook.png", "1-then.png"]);

      const onDisk = JSON.parse(await readFile(join(bundleDir, "post.json"), "utf8")) as PostJson;
      assert.deepEqual(onDisk, result.postJson);
    });
  });

  it("AC5 — a LEGACY .assets/-named Asset resolves and refreshes IN THAT SAME folder, never renamed", async () => {
    await withTempDir(async (dir) => {
      const legacyDir = join(dir, "ideas", "2026-W29", "idea-01.news-carousel.assets");
      await mkdir(legacyDir, { recursive: true });
      await writeFile(join(legacyDir, "0-hook.png"), "pretend-image-bytes", "utf8");

      const ledgerPath = await seedLedger(dir, [
        {
          id: "idea-01",
          status: "accepted",
          format: "unhypped-news",
          assets: [
            {
              recipe: "news-carousel",
              status: "posted",
              asset_paths: [join(legacyDir, "0-hook.png")],
              copy: { caption: "Hi", hashtags: ["#a"] },
              post_url: "https://facebook.com/permalink/999",
              posted_at: "2026-07-15T00:00:00.000Z",
            },
          ],
        },
      ]);

      const result = await refreshPostJson("straw-motion", "idea-01", "news-carousel", { ledgerPath });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.dir, legacyDir, "the bundle dir is the EXISTING .assets/ folder, never a new .output/ one");
      assert.ok(!result.dir.endsWith(".output"));

      // The pre-existing media file is completely untouched.
      assert.equal(await readFile(join(legacyDir, "0-hook.png"), "utf8"), "pretend-image-bytes");

      const onDisk = JSON.parse(await readFile(join(legacyDir, "post.json"), "utf8")) as PostJson;
      assert.equal(onDisk.post_url, "https://facebook.com/permalink/999");

      // Nothing outside the legacy folder was created — no sibling .output/ dir appeared.
      const siblingEntries = await readdir(join(dir, "ideas", "2026-W29"));
      assert.deepEqual(siblingEntries.sort(), ["idea-01.news-carousel.assets"]);
    });
  });

  it("regenerating post.json from an UNCHANGED ledger yields a byte-identical file (AC2, shell level)", async () => {
    await withTempDir(async (dir) => {
      const bundleDir = join(dir, "ideas", "2026-W29", "idea-01.news-carousel.output");
      await mkdir(bundleDir, { recursive: true });
      const ledgerPath = await seedLedger(dir, [
        {
          id: "idea-01",
          status: "accepted",
          format: "unhypped-news",
          assets: [
            {
              recipe: "news-carousel",
              status: "scored",
              asset_paths: [join(bundleDir, "0-hook.png")],
              copy: { caption: "Hi", hashtags: ["#a"] },
              post_url: "https://facebook.com/permalink/1",
              posted_at: "2026-07-01T00:00:00.000Z",
              performance_score: 0.6,
              metrics: { shares: 1, comments: 2, reactions: 3, views: 4 },
              tracked_at: "2026-07-10T00:00:00.000Z",
            },
          ],
        },
      ]);

      const first = await refreshPostJson("straw-motion", "idea-01", "news-carousel", { ledgerPath });
      assert.equal(first.ok, true);
      const firstBytes = await readFile(join(bundleDir, "post.json"), "utf8");

      const second = await refreshPostJson("straw-motion", "idea-01", "news-carousel", { ledgerPath });
      assert.equal(second.ok, true);
      const secondBytes = await readFile(join(bundleDir, "post.json"), "utf8");

      assert.equal(secondBytes, firstBytes, "regenerating from an unchanged ledger must be byte-identical");
      if (first.ok && second.ok) {
        assert.deepEqual(second.postJson, first.postJson);
      }
    });
  });

  it("returns ok:false / unknown-idea and writes nothing for an unknown Idea", async () => {
    await withTempDir(async (dir) => {
      const ledgerPath = await seedLedger(dir, [{ id: "idea-01", status: "accepted", assets: [] }]);
      const result = await refreshPostJson("straw-motion", "idea-ZZZ", "news-carousel", { ledgerPath });
      assert.deepEqual(result, { ok: false, reason: "unknown-idea" });
    });
  });

  it("returns ok:false / unknown-recipe and writes nothing when the Idea has no such Recipe Asset", async () => {
    await withTempDir(async (dir) => {
      const ledgerPath = await seedLedger(dir, [
        { id: "idea-01", status: "accepted", assets: [{ recipe: "character-explainer-with-cast", status: "produced" }] },
      ]);
      const result = await refreshPostJson("straw-motion", "idea-01", "news-carousel", { ledgerPath });
      assert.deepEqual(result, { ok: false, reason: "unknown-recipe" });
    });
  });

  it("returns ok:false / no-local-media and writes nothing when the Asset has no asset_paths yet", async () => {
    await withTempDir(async (dir) => {
      const ledgerPath = await seedLedger(dir, [
        { id: "idea-01", status: "accepted", assets: [{ recipe: "news-carousel", status: "in_production" }] },
      ]);
      const result = await refreshPostJson("straw-motion", "idea-01", "news-carousel", { ledgerPath });
      assert.deepEqual(result, { ok: false, reason: "no-local-media" });
    });
  });

  it("never throws for any of the skip cases", async () => {
    await withTempDir(async (dir) => {
      const ledgerPath = await seedLedger(dir, []);
      await assert.doesNotReject(refreshPostJson("straw-motion", "idea-ZZZ", "news-carousel", { ledgerPath }));
    });
  });
});

// ---------------------------------------------------------------------------
// AC1 — the full produce-flow composition, hermetic (no Magnific fake needed: media download is
// already decoupled from the Space driver at THIS boundary — downloadAssetFiles only needs URLs).
// ---------------------------------------------------------------------------

describe("produce-flow composition (AC1) — outputDirFor -> downloadAssetFiles -> writeAsset -> refreshPostJson + writeCaptionText", () => {
  it("writes media (in post order) + caption.txt + post.json into the .output/ bundle", async () => {
    await withTempDir(async (dir) => {
      const ideasRoot = join(dir, "ideas");
      const ledgerPath = join(dir, "ledger.json");
      const ideaId = "idea-2026-W29-01";
      const run = "2026-W29";
      const recipe = "news-carousel";

      await writeFile(
        ledgerPath,
        JSON.stringify(
          { ideas: [{ id: ideaId, status: "accepted", format: "unhypped-news", assets: [{ recipe, status: "in_production" }] }] },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const outputDir = outputDirFor(ideaId, run, ideasRoot, recipe);
      assert.equal(outputDir, join(ideasRoot, run, "idea-01.news-carousel.output"));

      const fetchImpl = stubFetch({
        "https://example.com/hook.png": { ok: true, body: "hook-bytes" },
        "https://example.com/then.png": { ok: true, body: "then-bytes" },
        "https://example.com/shift.png": { ok: true, body: "shift-bytes" },
      });
      const downloaded = await downloadAssetFiles(
        outputDir,
        [
          { url: "https://example.com/hook.png", filename: "0-hook.png" },
          { url: "https://example.com/then.png", filename: "1-then.png" },
          { url: "https://example.com/shift.png", filename: "2-shift.png" },
        ],
        fetchImpl,
      );

      const copy = { caption: "Three AI giants shipped agentic tools this week.", hashtags: ["#AInews", "#tech"] };
      await writeCaptionText(outputDir, copy);

      // Mirrors the real "Save phase": the ledger write happens BEFORE the bundle refresh, so
      // refreshPostJson always reads the Asset's OWN just-saved truth.
      await writeAsset(
        ideaId,
        recipe,
        {
          status: "produced",
          spec_path: join(ideasRoot, run, "idea-01.news-carousel.spec.json"),
          asset_paths: downloaded.map((d) => d.path),
          produced_at: "2026-07-21T09:10:00.000Z",
          copy,
        },
        { ledgerPath },
      );

      const refreshed = await refreshPostJson("straw-motion", ideaId, recipe, { ledgerPath });
      assert.equal(refreshed.ok, true);

      const entries = (await readdir(outputDir)).sort();
      assert.deepEqual(entries, ["0-hook.png", "1-then.png", "2-shift.png", "caption.txt", "post.json"]);

      const postJson = JSON.parse(await readFile(join(outputDir, "post.json"), "utf8")) as PostJson;
      assert.deepEqual(postJson.media, ["0-hook.png", "1-then.png", "2-shift.png"], "post order preserved end to end");
      assert.equal(postJson.brand, "straw-motion");
      assert.equal(postJson.idea_id, ideaId);
      assert.equal(postJson.recipe, recipe);
      assert.equal(postJson.format, "unhypped-news");
      assert.deepEqual(postJson.copy, copy);
      assert.equal(postJson.post_url, null, "not yet published — still null at produce time");

      const caption = await readFile(join(outputDir, "caption.txt"), "utf8");
      assert.equal(caption, "Three AI giants shipped agentic tools this week.\n\n#AInews #tech\n");
    });
  });
});
