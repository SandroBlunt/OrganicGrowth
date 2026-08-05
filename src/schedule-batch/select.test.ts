import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadScheduleBatchIdeas } from "./select.ts";

async function withLedger(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-schedule-select-"));
  const path = join(dir, "ledger.json");
  try {
    await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("select — reads a run's Ideas scoped to (format, run) from the raw ledger (issue #145)", () => {
  it("returns only Ideas matching BOTH the given format and run", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-2026-W32-01",
          title: "In scope",
          format: "unhypped-news",
          run: "2026-W32",
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced" }],
        },
        {
          id: "idea-2026-W32-02",
          title: "Wrong format",
          format: "other-format",
          run: "2026-W32",
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced" }],
        },
        {
          id: "idea-2026-W30-01",
          title: "Wrong run",
          format: "unhypped-news",
          run: "2026-W30",
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced" }],
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadScheduleBatchIdeas(path, "straw-motion", "unhypped-news", "2026-W32");
      assert.equal(ideas.length, 1);
      assert.equal(ideas[0]!.id, "idea-2026-W32-01");
      assert.equal(ideas[0]!.title, "In scope");
      assert.equal(ideas[0]!.run, "2026-W32");
      assert.equal(ideas[0]!.format, "unhypped-news");
      assert.equal(ideas[0]!.assets.length, 1);
    });
  });

  it("falls back to the Idea id when title is missing", async () => {
    const seed = {
      ideas: [
        { id: "idea-01", format: "f", run: "r", status: "accepted", assets: [] },
      ],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadScheduleBatchIdeas(path, "b", "f", "r");
      assert.equal(ideas[0]!.title, "idea-01");
    });
  });

  it("returns [] for a run with no matching Ideas at all", async () => {
    const seed = { ideas: [] };
    await withLedger(seed, async (path) => {
      const ideas = await loadScheduleBatchIdeas(path, "b", "f", "r");
      assert.deepEqual(ideas, []);
    });
  });

  it("normalizes a legacy production-status record onto its Asset grain", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-01",
          format: "f",
          run: "r",
          status: "produced",
          recipes: ["news-carousel"],
          asset_url: "https://example.com/x.png",
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadScheduleBatchIdeas(path, "b", "f", "r");
      assert.equal(ideas[0]!.assets.length, 1);
      assert.equal(ideas[0]!.assets[0]!.recipe, "news-carousel");
      assert.equal(ideas[0]!.assets[0]!.status, "produced");
    });
  });

  it("throws a clear 'unknown Brand' error for a missing ledger file", async () => {
    await assert.rejects(
      () => loadScheduleBatchIdeas("/no/such/ledger.json", "ghost-brand", "f", "r"),
      /unknown Brand "ghost-brand"/,
    );
  });

  it("skips a record with no string id, never invents an identity", async () => {
    const seed = { ideas: [{ format: "f", run: "r", status: "accepted", assets: [] }] };
    await withLedger(seed, async (path) => {
      const ideas = await loadScheduleBatchIdeas(path, "b", "f", "r");
      assert.deepEqual(ideas, []);
    });
  });
});
