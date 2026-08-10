import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { nextAttributedStatus, writeAttributedPost } from "./attribution.ts";
import { loadIdeaAssets } from "./store.ts";
import type { PostJson } from "./output-bundle.ts";

const RECIPE = "news-carousel";
const URL = "https://facebook.com/permalink/999";
const POSTED_AT = "2026-08-10T12:00:00.000Z";

// === nextAttributedStatus — advances forward, never regresses ==========================================

describe("nextAttributedStatus — advances a produced Asset to posted, never regresses", () => {
  it("advances produced to posted", () => {
    assert.equal(nextAttributedStatus("produced"), "posted");
  });

  it("leaves queued/in_production/posted/tracking/scored unchanged", () => {
    for (const status of ["queued", "in_production", "posted", "tracking", "scored"] as const) {
      assert.equal(nextAttributedStatus(status), status);
    }
  });
});

// === writeAttributedPost — the ONE shared write both /log-post and confirmed-live use ==================

describe("writeAttributedPost — shared attribution write (issue #162)", () => {
  it("writes post_url/posted_at and the advanced status onto the named (idea, recipe) Asset", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-attribution-"));
    const ledgerPath = join(dir, "ledger.json");
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    try {
      await writeAttributedPost(
        "straw-motion",
        { ideaId: "idea-A", recipe: RECIPE, nextStatus: "posted", postUrl: URL, postedAt: POSTED_AT },
        { ledgerPath },
      );
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      const asset = assets!.find((a) => a.recipe === RECIPE)!;
      assert.equal(asset.status, "posted");
      assert.equal(asset.post_url, URL);
      assert.equal(asset.posted_at, POSTED_AT);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refreshes the Asset's output-bundle post.json when a local bundle directory is known (issue #112)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-attribution-bundle-"));
    const bundleDir = join(dir, "idea-01.news-carousel.output");
    await mkdir(bundleDir, { recursive: true });
    const ledgerPath = join(dir, "ledger.json");
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [{ recipe: RECIPE, status: "produced", asset_paths: [join(bundleDir, "1.jpg")] }],
        },
      ],
    };
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    try {
      await writeAttributedPost(
        "straw-motion",
        { ideaId: "idea-A", recipe: RECIPE, nextStatus: "posted", postUrl: URL, postedAt: POSTED_AT },
        { ledgerPath },
      );
      const postJson = JSON.parse(await readFile(join(bundleDir, "post.json"), "utf8")) as PostJson;
      assert.equal(postJson.post_url, URL);
      assert.equal(postJson.posted_at, POSTED_AT);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("an Asset with no local bundle directory yet never throws — the refresh is skipped cleanly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-attribution-nobundle-"));
    const ledgerPath = join(dir, "ledger.json");
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    try {
      await assert.doesNotReject(
        writeAttributedPost(
          "straw-motion",
          { ideaId: "idea-A", recipe: RECIPE, nextStatus: "posted", postUrl: URL, postedAt: POSTED_AT },
          { ledgerPath },
        ),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
