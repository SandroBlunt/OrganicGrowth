import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadIdeas,
  loadReport,
  loadBaseline,
  writeBaseline,
  applyIdeaRecipeSelection,
  writeIdeaRecipeSelection,
  type LedgerIdeaWithRecipes,
  type LedgerDeclinedRecipe,
} from "./ledger.ts";
import { DEFAULT_ASSET_RECIPE } from "../asset/migrate.ts";

describe("loadIdeas / loadReport — unknown-brand and corrupt-file errors (C40, C13)", () => {
  async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-err-"));
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("loadIdeas: a missing ledger with a named Brand fails as 'unknown Brand', not a raw ENOENT", async () => {
    await withDir(async (dir) => {
      const missing = join(dir, "acme", "ledger.json");
      await assert.rejects(loadIdeas(missing, "acme"), (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /unknown Brand "acme"/);
        assert.match(err.message, /\/queue --all/); // recovery hint
        assert.notEqual((err as { code?: string }).code, "ENOENT"); // not a raw errno
        return true;
      });
    });
  });

  it("loadReport: a missing ledger with a named Brand fails as 'unknown Brand'", async () => {
    await withDir(async (dir) => {
      const missing = join(dir, "acme", "ledger.json");
      await assert.rejects(loadReport(missing, "acme"), (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /unknown Brand "acme"/);
        return true;
      });
    });
  });

  it("loadReport: a missing ledger without a Brand names the path (no bare ENOENT stack)", async () => {
    await withDir(async (dir) => {
      const missing = join(dir, "ledger.json");
      await assert.rejects(loadReport(missing), (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /no ledger found at/);
        assert.ok(err.message.includes(missing));
        return true;
      });
    });
  });

  it("loadIdeas: a truncated ledger fails with a parse error that names the path", async () => {
    await withDir(async (dir) => {
      const path = join(dir, "ledger.json");
      await writeFile(path, '{"ideas":[', "utf8"); // truncated mid-write
      await assert.rejects(loadIdeas(path, "acme"), (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes(path));
        assert.match(err.message, /Cannot parse JSON/);
        return true;
      });
    });
  });
});

// === loadIdeas — the Idea status vocabulary narrows to suggested/accepted/rejected (ADR-0011) ========

describe("loadIdeas — status narrows to suggested/accepted/rejected; assets is always populated", () => {
  async function withLedger(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-ideas-"));
    const path = join(dir, "ledger.json");
    try {
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
      await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("a canonical suggested/accepted/rejected Idea passes through with assets: []", async () => {
    const seed = {
      ideas: [
        { id: "i1", status: "suggested" },
        { id: "i2", status: "accepted" },
        { id: "i3", status: "rejected" },
      ],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadIdeas(path);
      assert.deepEqual(ideas, [
        { id: "i1", status: "suggested", assets: [] },
        { id: "i2", status: "accepted", assets: [] },
        { id: "i3", status: "rejected", assets: [] },
      ]);
    });
  });

  it("a legacy un-migrated 'casting' Idea is transparently normalized to accepted + one Asset (reader tolerance)", async () => {
    const seed = { ideas: [{ id: "i1", status: "casting", cast: [{ identifier: "c1", url: "https://x/1.png" }] }] };
    await withLedger(seed, async (path) => {
      const ideas = await loadIdeas(path);
      assert.equal(ideas.length, 1);
      assert.equal(ideas[0]!.status, "accepted");
      assert.equal(ideas[0]!.assets!.length, 1);
      assert.equal(ideas[0]!.assets![0]!.status, "in_production");
      assert.equal(ideas[0]!.assets![0]!.pending_gate, "cast");
      assert.equal(ideas[0]!.assets![0]!.recipe, DEFAULT_ASSET_RECIPE);
    });
  });

  it("a legacy un-migrated 'produced' Idea is transparently normalized to accepted + one produced Asset", async () => {
    const seed = { ideas: [{ id: "i1", status: "produced", asset_url: "https://x/asset.mp4" }] };
    await withLedger(seed, async (path) => {
      const ideas = await loadIdeas(path);
      assert.equal(ideas[0]!.status, "accepted");
      assert.equal(ideas[0]!.assets![0]!.status, "produced");
      assert.equal(ideas[0]!.assets![0]!.asset_url, "https://x/asset.mp4");
    });
  });

  it("a record with no status at all is never dropped — degrades to suggested, no assets", async () => {
    const seed = { ideas: [{ id: "i1" }] };
    await withLedger(seed, async (path) => {
      const ideas = await loadIdeas(path);
      assert.deepEqual(ideas, [{ id: "i1", status: "suggested", assets: [] }]);
    });
  });

  it("an already-migrated Idea's assets array is read through unchanged", async () => {
    const seed = {
      ideas: [
        {
          id: "i1",
          status: "accepted",
          assets: [{ recipe: "character-explainer-with-cast", status: "posted", post_url: "https://facebook.com/p/1" }],
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const ideas = await loadIdeas(path);
      assert.equal(ideas[0]!.status, "accepted");
      assert.deepEqual(ideas[0]!.assets, [
        { recipe: "character-explainer-with-cast", status: "posted", post_url: "https://facebook.com/p/1" },
      ]);
    });
  });

  it("loadIdeas never mutates the on-disk file (read-only)", async () => {
    const seed = { ideas: [{ id: "i1", status: "casting" }] };
    await withLedger(seed, async (path) => {
      const before = await readFile(path, "utf8");
      await loadIdeas(path);
      const after = await readFile(path, "utf8");
      assert.equal(after, before);
    });
  });
});

// === loadReport — status is the DERIVED roll-up (ADR-0011) ============================================

describe("loadReport — status is the derived roll-up across an Idea's Assets", () => {
  async function withLedger(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-report-"));
    const path = join(dir, "ledger.json");
    try {
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
      await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("an accepted Idea with an in_production Asset reports status 'in_production'", async () => {
    const seed = {
      ideas: [
        {
          id: "i1",
          title: "T1",
          status: "accepted",
          assets: [{ recipe: "character-explainer-with-cast", status: "in_production", pending_gate: "cast" }],
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const report = await loadReport(path);
      assert.equal(report.ideas[0]!.status, "in_production");
    });
  });

  it("an accepted Idea with NO Assets yet still reports 'accepted' (today's real-ledger shape)", async () => {
    const seed = { ideas: [{ id: "i1", title: "T1", status: "accepted" }] };
    await withLedger(seed, async (path) => {
      const report = await loadReport(path);
      assert.equal(report.ideas[0]!.status, "accepted");
    });
  });

  it("a legacy un-migrated 'produced' Idea still reports status 'produced' via the roll-up", async () => {
    const seed = { ideas: [{ id: "i1", title: "T1", status: "produced" }] };
    await withLedger(seed, async (path) => {
      const report = await loadReport(path);
      assert.equal(report.ideas[0]!.status, "produced");
    });
  });

  it("suggested/rejected Ideas pass through unchanged", async () => {
    const seed = {
      ideas: [
        { id: "i1", title: "T1", status: "suggested" },
        { id: "i2", title: "T2", status: "rejected" },
      ],
    };
    await withLedger(seed, async (path) => {
      const report = await loadReport(path);
      assert.equal(report.ideas[0]!.status, "suggested");
      assert.equal(report.ideas[1]!.status, "rejected");
    });
  });
});

// === applyIdeaRecipeSelection / writeIdeaRecipeSelection (issue #54 — unaffected by this slice) ======

describe("applyIdeaRecipeSelection — pure recipe/declined set (issue #54)", () => {
  const ideas: LedgerIdeaWithRecipes[] = [
    { id: "idea-A", status: "accepted" },
    { id: "idea-B", status: "accepted" },
  ];
  const declined: LedgerDeclinedRecipe[] = [
    { recipe: "carousel", reason: "not wired yet, skip for now" },
  ];

  it("sets the target Idea's recipes + declined_recipes and leaves others unchanged", () => {
    const after = applyIdeaRecipeSelection(ideas, "idea-A", ["character-explainer-with-cast"], declined);
    const a = after.find((i) => i.id === "idea-A")!;
    assert.deepEqual(a.recipes, ["character-explainer-with-cast"]);
    assert.deepEqual(a.declined_recipes, declined);
    const b = after.find((i) => i.id === "idea-B")!;
    assert.equal(b.recipes, undefined);
    assert.equal(b.declined_recipes, undefined);
  });

  it("is pure: it never mutates the input array or its records", () => {
    const snapshot = JSON.stringify(ideas);
    applyIdeaRecipeSelection(ideas, "idea-A", ["character-explainer-with-cast"], declined);
    assert.equal(JSON.stringify(ideas), snapshot);
  });

  it("returns the array unchanged for an unknown Idea", () => {
    const after = applyIdeaRecipeSelection(ideas, "idea-ZZZ", ["character-explainer-with-cast"], declined);
    assert.deepEqual(after, ideas);
  });

  it("records an empty recipes list with a declined default (the Operator declined everything)", () => {
    const after = applyIdeaRecipeSelection(ideas, "idea-A", [], declined);
    const a = after.find((i) => i.id === "idea-A")!;
    assert.deepEqual(a.recipes, []);
    assert.deepEqual(a.declined_recipes, declined);
  });
});

describe("writeIdeaRecipeSelection — records the chosen + declined Recipes on the Idea record (issue #54)", () => {
  async function withLedger(fn: (path: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-recipes-"));
    const path = join(dir, "ledger.json");
    try {
      await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("writes recipes + declined_recipes for the target Idea, preserving unrelated fields", async () => {
    await withLedger(async (path) => {
      const seed = {
        baseline: { note: "seed" },
        ideas: [
          { id: "idea-A", run: "2026-W22", status: "accepted", title: "A", post_url: null },
          { id: "idea-B", run: "2026-W22", status: "accepted", title: "B", post_url: null },
        ],
      };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");

      await writeIdeaRecipeSelection(
        "idea-A",
        ["character-explainer-with-cast"],
        [{ recipe: "carousel", reason: "not ready to try that format yet" }],
        { ledgerPath: path },
      );

      const after = JSON.parse(await readFile(path, "utf8")) as {
        baseline: { note: string };
        ideas: Array<{
          id: string;
          title: string;
          recipes?: string[];
          declined_recipes?: LedgerDeclinedRecipe[];
        }>;
      };
      const a = after.ideas.find((i) => i.id === "idea-A")!;
      const b = after.ideas.find((i) => i.id === "idea-B")!;
      assert.deepEqual(a.recipes, ["character-explainer-with-cast"]);
      assert.deepEqual(a.declined_recipes, [
        { recipe: "carousel", reason: "not ready to try that format yet" },
      ]);
      assert.equal(b.recipes, undefined);
      // unrelated fields preserved
      assert.equal(a.title, "A");
      assert.equal(after.baseline.note, "seed");
    });
  });

  it("declined reasons are stored VERBATIM, never altered or summarized", async () => {
    await withLedger(async (path) => {
      const seed = { ideas: [{ id: "idea-A", status: "accepted" }] };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");

      const verbatimReason = "Not this week — want to see the Cast Reel land first before trying a second Recipe.";
      await writeIdeaRecipeSelection(
        "idea-A",
        [],
        [{ recipe: "character-explainer-with-cast", reason: verbatimReason }],
        { ledgerPath: path },
      );

      const after = JSON.parse(await readFile(path, "utf8")) as {
        ideas: Array<{ id: string; declined_recipes?: LedgerDeclinedRecipe[] }>;
      };
      assert.equal(after.ideas[0]!.declined_recipes![0]!.reason, verbatimReason);
    });
  });

  it("leaves the ledger untouched for an unknown Idea", async () => {
    await withLedger(async (path) => {
      const seed = { ideas: [{ id: "idea-A", status: "accepted" }] };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
      await writeIdeaRecipeSelection("idea-ZZZ", ["character-explainer-with-cast"], [], { ledgerPath: path });
      const after = JSON.parse(await readFile(path, "utf8")) as {
        ideas: Array<{ id: string; recipes?: unknown }>;
      };
      assert.equal(after.ideas[0]!.recipes, undefined);
    });
  });
});

// === loadIdeas carries `recipes` through read-only (issue #56 — re-enqueue needs the ORIGINAL pick) ===

describe("loadIdeas — recipes (issue #54) is carried through read-only", () => {
  async function withLedger(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-recipes-read-"));
    const path = join(dir, "ledger.json");
    try {
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
      await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("an Idea with a recorded recipes selection carries it through", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", recipes: ["character-explainer-with-cast"] }] };
    await withLedger(seed, async (path) => {
      const ideas = await loadIdeas(path);
      assert.deepEqual(ideas[0]!.recipes, ["character-explainer-with-cast"]);
    });
  });

  it("an Idea with no recipes field omits it entirely (never fabricated)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted" }] };
    await withLedger(seed, async (path) => {
      const ideas = await loadIdeas(path);
      assert.equal(ideas[0]!.recipes, undefined);
    });
  });

  it("an empty recipes array omits the field too (nothing to carry)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", recipes: [] }] };
    await withLedger(seed, async (path) => {
      const ideas = await loadIdeas(path);
      assert.equal(ideas[0]!.recipes, undefined);
    });
  });

  it("a garbled recipes field (not an array of strings) degrades to omitted, never crashes", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", recipes: [1, null, "ok-one"] }] };
    await withLedger(seed, async (path) => {
      const ideas = await loadIdeas(path);
      assert.deepEqual(ideas[0]!.recipes, ["ok-one"]);
    });
  });
});

// === loadReport — per-Recipe Asset breakdown + best-of-N Performance (issue #56, ADR-0011) ============

describe("loadReport — per-Recipe assets and the best-of-N Performance summary", () => {
  async function withLedger(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-report-assets-"));
    const path = join(dir, "ledger.json");
    try {
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
      await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("surfaces every chosen Recipe's Asset as its own row, keyed (Idea, Recipe)", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          title: "Two Recipes",
          status: "accepted",
          fit_score: 0.7,
          assets: [
            { recipe: "character-explainer-with-cast", status: "posted", post_url: "https://facebook.com/p/1", performance_score: 0.9 },
            { recipe: "carousel", status: "produced" },
          ],
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const report = await loadReport(path);
      const idea = report.ideas[0]!;
      assert.equal(idea.assets.length, 2);
      const first = idea.assets.find((a) => a.recipe === "character-explainer-with-cast")!;
      assert.equal(first.post_url, "https://facebook.com/p/1");
      assert.equal(first.performance_score, 0.9);
      const second = idea.assets.find((a) => a.recipe === "carousel")!;
      assert.equal(second.post_url, null);
      assert.equal(second.performance_score, null);
    });
  });

  it("best_performance_score is the BEST among the Idea's Assets, not the first or the sum", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [
            { recipe: "r1", status: "scored", performance_score: 0.4 },
            { recipe: "r2", status: "scored", performance_score: 0.85 },
          ],
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const report = await loadReport(path);
      assert.equal(report.ideas[0]!.best_performance_score, 0.85);
    });
  });

  it("best_performance_score is null when no Asset has been measured yet", async () => {
    const seed = {
      ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: "r1", status: "posted" }] }],
    };
    await withLedger(seed, async (path) => {
      const report = await loadReport(path);
      assert.equal(report.ideas[0]!.best_performance_score, null);
    });
  });

  it("an Idea with no Assets yet reports an empty assets array and a null best score", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted" }] };
    await withLedger(seed, async (path) => {
      const report = await loadReport(path);
      assert.deepEqual(report.ideas[0]!.assets, []);
      assert.equal(report.ideas[0]!.best_performance_score, null);
    });
  });

  it("a legacy un-migrated Idea's top-level post_url/performance_score fold onto its one Asset", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "scored",
          post_url: "https://facebook.com/p/legacy",
          performance_score: 0.55,
        },
      ],
    };
    await withLedger(seed, async (path) => {
      const report = await loadReport(path);
      const idea = report.ideas[0]!;
      assert.equal(idea.assets.length, 1);
      assert.equal(idea.assets[0]!.post_url, "https://facebook.com/p/legacy");
      assert.equal(idea.best_performance_score, 0.55);
    });
  });

  it("preserves the single Channel baseline unchanged (never per-Recipe)", async () => {
    const seed = {
      ideas: [{ id: "idea-A", status: "accepted" }],
      baseline: { updated_at: "2026-06-04T09:00:00.000Z" },
    };
    await withLedger(seed, async (path) => {
      const report = await loadReport(path);
      assert.deepEqual(report.baseline, { updated_at: "2026-06-04T09:00:00.000Z" });
    });
  });
});

// === loadBaseline / writeBaseline — the ONE Channel baseline (per-metric medians, issue #84) ==========

describe("loadBaseline — reads the Brand's ONE Channel baseline, defensively", () => {
  async function withLedger(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-baseline-"));
    const path = join(dir, "ledger.json");
    try {
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
      await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("reads a fully-populated baseline", async () => {
    const seed = {
      ideas: [],
      baseline: { shares: 5, comments: 12, reactions: 80, views: 900, updated_at: "2026-06-10T00:00:00.000Z" },
    };
    await withLedger(seed, async (path) => {
      const baseline = await loadBaseline(path);
      assert.deepEqual(baseline, seed.baseline);
    });
  });

  it("returns an all-null baseline when the ledger has none yet", async () => {
    await withLedger({ ideas: [] }, async (path) => {
      const baseline = await loadBaseline(path);
      assert.deepEqual(baseline, { shares: null, comments: null, reactions: null, views: null, updated_at: null });
    });
  });

  it("returns an all-null baseline for a missing ledger — never throws (defensive)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-baseline-missing-"));
    try {
      const baseline = await loadBaseline(join(dir, "does-not-exist", "ledger.json"));
      assert.deepEqual(baseline, { shares: null, comments: null, reactions: null, views: null, updated_at: null });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("degrades a garbled baseline field to null rather than crashing", async () => {
    const seed = { ideas: [], baseline: { shares: "not-a-number", updated_at: 42 } };
    await withLedger(seed, async (path) => {
      const baseline = await loadBaseline(path);
      assert.deepEqual(baseline, { shares: null, comments: null, reactions: null, views: null, updated_at: null });
    });
  });
});

describe("writeBaseline — overwrites the ONE Channel baseline, preserving every other field", () => {
  async function withLedger(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-write-baseline-"));
    const path = join(dir, "ledger.json");
    try {
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
      await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("writes a fresh baseline and it round-trips via loadBaseline", async () => {
    await withLedger({ ideas: [{ id: "idea-A", status: "accepted" }] }, async (path) => {
      const fresh = { shares: 2, comments: 6, reactions: 40, views: 500, updated_at: "2026-06-13T00:00:00.000Z" };
      await writeBaseline(fresh, { ledgerPath: path });
      assert.deepEqual(await loadBaseline(path), fresh);
    });
  });

  it("never touches the ideas array", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted" }] };
    await withLedger(seed, async (path) => {
      await writeBaseline(
        { shares: 1, comments: 1, reactions: 1, views: 1, updated_at: "2026-06-13T00:00:00.000Z" },
        { ledgerPath: path },
      );
      const raw = JSON.parse(await readFile(path, "utf8"));
      assert.deepEqual(raw.ideas, seed.ideas);
    });
  });

  it("overwrites a PRIOR baseline entirely (not a merge)", async () => {
    const seed = { ideas: [], baseline: { shares: 99, comments: 99, reactions: 99, views: 99, updated_at: "old" } };
    await withLedger(seed, async (path) => {
      const fresh = { shares: 1, comments: 2, reactions: 3, views: 4, updated_at: "2026-06-13T00:00:00.000Z" };
      await writeBaseline(fresh, { ledgerPath: path });
      assert.deepEqual(await loadBaseline(path), fresh);
    });
  });
});
