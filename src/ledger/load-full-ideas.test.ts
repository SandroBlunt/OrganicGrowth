/**
 * Tests for `loadFullIdeas` (`src/ledger/ledger.ts`) — issue #204.
 *
 * `loadIdeas`'s existing `LedgerIdea` projection (id/status/assets/recipes/format) is too narrow for
 * the one-shot importer: it needs `title`/`trend_id`/`trend_label`/`fit_score`/`rejection_reason`/
 * `brief_path`/`run`/`created_at`/`declined_recipes` too, to build a full `idea`/`idea_recipe` row. This
 * is an ADDITIVE extension of the SAME module, reusing the SAME `normalizeIdeaStatus` normalizer
 * `loadIdeas`/`loadReport` already call — never a second, raw-JSON reader.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadFullIdeas } from "./ledger.ts";

async function withLedger(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-ledger-full-"));
  const path = join(dir, "ledger.json");
  try {
    await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("loadFullIdeas — the richer per-Idea projection the importer needs", () => {
  it("carries every extra field a real accepted Idea record has", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-01",
          run: "2026-W29",
          title: "AI just got a job",
          trend_id: "trend-01",
          trend_label: "Agentic AI moves into real work",
          format: "unhypped-news",
          fit_score: 0.73,
          fit_basis: "some prose",
          status: "accepted",
          brief_path: "data/brands/straw-motion/ideas/2026-W29/idea-01.md",
          created_at: "2026-07-13T16:15:56Z",
          assets: [{ recipe: "news-carousel", status: "produced" }],
          recipes: ["news-carousel"],
          declined_recipes: [],
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadFullIdeas(path);
      assert.equal(ideas.length, 1);
      const idea = ideas[0]!;
      assert.equal(idea.id, "idea-01");
      assert.equal(idea.run, "2026-W29");
      assert.equal(idea.title, "AI just got a job");
      assert.equal(idea.trendId, "trend-01");
      assert.equal(idea.trendLabel, "Agentic AI moves into real work");
      assert.equal(idea.format, "unhypped-news");
      assert.equal(idea.fitScore, 0.73);
      assert.equal(idea.status, "accepted");
      assert.equal(idea.briefPath, "data/brands/straw-motion/ideas/2026-W29/idea-01.md");
      assert.equal(idea.createdAt, "2026-07-13T16:15:56Z");
      assert.deepEqual(idea.recipes, ["news-carousel"]);
      assert.deepEqual(idea.declinedRecipes, []);
      assert.equal(idea.assets.length, 1);
    });
  });

  it("carries declined_recipes with their reasons", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-01",
          run: "2026-W30",
          status: "accepted",
          recipes: ["news-carousel"],
          declined_recipes: [{ recipe: "news-short-script", reason: "Not enough footage this week" }],
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadFullIdeas(path);
      assert.deepEqual(ideas[0]!.declinedRecipes, [{ recipe: "news-short-script", reason: "Not enough footage this week" }]);
    });
  });

  it("degrades missing optional fields to absent, never a fabricated value (MundoTip's pre-Format shape)", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-2026-W22-01",
          run: "2026-W22",
          title: "El truco de los primeros 10 minutos",
          status: "accepted",
          trend: "T01",
          fit_score: 0.66,
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadFullIdeas(path);
      const idea = ideas[0]!;
      assert.equal(idea.format, undefined);
      assert.equal(idea.briefPath, undefined);
      assert.equal(idea.trendId, undefined);
      assert.equal(idea.createdAt, undefined);
      assert.equal(idea.recipes, undefined);
      assert.equal(idea.declinedRecipes, undefined);
    });
  });

  it("carries rejection_reason for a rejected Idea", async () => {
    const seed = {
      ideas: [{ id: "idea-2026-W32-02", run: "2026-W32", status: "rejected", rejection_reason: "Too close to last week's Idea" }],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadFullIdeas(path);
      assert.equal(ideas[0]!.rejectionReason, "Too close to last week's Idea");
    });
  });

  it("still runs every record through normalizeIdeaStatus (a legacy production status still folds Assets)", async () => {
    const seed = {
      ideas: [{ id: "idea-01", run: "2026-W29", status: "produced", asset_url: "https://x/asset.mp4" }],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadFullIdeas(path);
      // normalizeIdeaStatus's own existingAssets===0 branch maps a legacy scalar-shaped record to
      // status "accepted" plus one folded Asset (see ledger.ts's own doc comment).
      assert.equal(ideas[0]!.status, "accepted");
      assert.equal(ideas[0]!.assets.length, 1);
      assert.equal(ideas[0]!.assets[0]!.asset_url, "https://x/asset.mp4");
    });
  });

  it("carries a top-level status straight through unchanged when Assets are already populated (idea-2026-08-11-12's real shape)", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-2026-08-11-12",
          run: "2026-08-11",
          status: "produced",
          assets: [{ recipe: "news-carousel", status: "produced" }],
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadFullIdeas(path);
      // normalizeIdeaStatus passes a non-canonical status through unchanged when assets already exist —
      // resolving THIS to a legal idea.status is src/importer/idea-status.ts's job, not this loader's.
      assert.equal(ideas[0]!.status, "produced");
      assert.equal(ideas[0]!.assets.length, 1);
    });
  });

  it("skips a record with no string id, same as loadIdeas", async () => {
    const seed = { ideas: [{ status: "suggested" }, { id: "idea-01", run: "2026-W29", status: "suggested" }] };
    await withLedger(seed, async (path) => {
      const ideas = await loadFullIdeas(path);
      assert.equal(ideas.length, 1);
      assert.equal(ideas[0]!.id, "idea-01");
    });
  });
});
