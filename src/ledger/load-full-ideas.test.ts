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

import { loadFullIdeas, countRawIdeaRecords } from "./ledger.ts";

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

  it("falls back to MundoTip's `trend` short-code field when trend_id is absent", async () => {
    const seed = {
      ideas: [{ id: "idea-2026-W22-01", run: "2026-W22", status: "accepted", trend: "T01" }],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadFullIdeas(path);
      assert.equal(ideas[0]!.trendId, "T01");
      assert.equal(ideas[0]!.trendLabel, undefined);
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

describe("countRawIdeaRecords — the raw ideas array length, for detecting a loadFullIdeas drop (issue #204 QA round 1's Defect 2)", () => {
  it("matches loadFullIdeas's own length for a well-formed ledger (nothing dropped)", async () => {
    const seed = { ideas: [{ id: "idea-01", run: "2026-W29", status: "suggested" }, { id: "idea-02", run: "2026-W29", status: "suggested" }] };
    await withLedger(seed, async (path) => {
      const rawCount = await countRawIdeaRecords(path);
      const ideas = await loadFullIdeas(path);
      assert.equal(rawCount, 2);
      assert.equal(rawCount, ideas.length);
    });
  });

  it("is GREATER than loadFullIdeas's length when a record was silently dropped (a missing string id)", async () => {
    const seed = { ideas: [{ status: "suggested" }, { id: "idea-01", run: "2026-W29", status: "suggested" }] };
    await withLedger(seed, async (path) => {
      const rawCount = await countRawIdeaRecords(path);
      const ideas = await loadFullIdeas(path);
      assert.equal(rawCount, 2);
      assert.equal(ideas.length, 1);
      assert.notEqual(rawCount, ideas.length, "the mismatch is exactly what a caller checks for");
    });
  });

  it("returns 0 for a ledger with no ideas array at all, never throws", async () => {
    await withLedger({ notIdeas: [] }, async (path) => {
      assert.equal(await countRawIdeaRecords(path), 0);
    });
  });

  it("counts the real straw-motion and mundotip ledgers with zero drops (no record anywhere lacks a string id)", async () => {
    const mundotipRaw = await countRawIdeaRecords("data/brands/mundotip/ledger.json", "mundotip");
    const mundotipParsed = await loadFullIdeas("data/brands/mundotip/ledger.json", "mundotip");
    assert.equal(mundotipRaw, mundotipParsed.length);

    const strawMotionRaw = await countRawIdeaRecords("data/brands/straw-motion/ledger.json", "straw-motion");
    const strawMotionParsed = await loadFullIdeas("data/brands/straw-motion/ledger.json", "straw-motion");
    assert.equal(strawMotionRaw, strawMotionParsed.length);
  });
});
