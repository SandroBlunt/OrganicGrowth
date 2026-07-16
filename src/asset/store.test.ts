/**
 * Tests for the AssetStore I/O shell (`src/asset/store.ts`) — issue #55 / ADR-0011 / ADR-0014.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadIdeaAssets, writeAsset } from "./store.ts";

async function withLedger(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-asset-store-"));
  const path = join(dir, "ledger.json");
  try {
    await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// loadIdeaAssets
// ---------------------------------------------------------------------------

describe("loadIdeaAssets — reads one Idea's Assets, normalized (tolerant of un-migrated records)", () => {
  it("returns the canonical assets array for an already-migrated Idea", async () => {
    const seed = {
      ideas: [
        { id: "idea-A", status: "accepted", assets: [{ recipe: "character-explainer-with-cast", status: "queued" }] },
      ],
    };
    await withLedger(seed, async (path) => {
      const assets = await loadIdeaAssets("idea-A", path);
      assert.deepEqual(assets, [{ recipe: "character-explainer-with-cast", status: "queued" }]);
    });
  });

  it("normalizes an UN-MIGRATED legacy 'casting' Idea on read (reader tolerance)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast: [{ identifier: "c1", url: "https://x/1.png" }] }] };
    await withLedger(seed, async (path) => {
      const assets = await loadIdeaAssets("idea-A", path);
      assert.equal(assets?.length, 1);
      assert.equal(assets?.[0]!.status, "in_production");
      assert.equal(assets?.[0]!.pending_gate, "cast");
      assert.deepEqual(assets?.[0]!.cast, [{ identifier: "c1", url: "https://x/1.png" }]);
    });
  });

  it("returns null for an unknown Idea", async () => {
    await withLedger({ ideas: [{ id: "idea-A", status: "accepted" }] }, async (path) => {
      assert.equal(await loadIdeaAssets("idea-ZZZ", path), null);
    });
  });

  it("returns [] for a known Idea with no Assets", async () => {
    await withLedger({ ideas: [{ id: "idea-A", status: "accepted" }] }, async (path) => {
      assert.deepEqual(await loadIdeaAssets("idea-A", path), []);
    });
  });
});

// ---------------------------------------------------------------------------
// writeAsset
// ---------------------------------------------------------------------------

describe("writeAsset — upserts one Recipe's Asset on the target Idea, preserving everything else", () => {
  it("creates a NEW Asset for a Recipe the Idea has none of yet", async () => {
    await withLedger({ ideas: [{ id: "idea-A", status: "accepted" }] }, async (path) => {
      await writeAsset("idea-A", "character-explainer-with-cast", { status: "queued" }, { ledgerPath: path });
      const after = JSON.parse(await readFile(path, "utf8")) as {
        ideas: Array<{ id: string; assets?: Array<{ recipe: string; status: string }> }>;
      };
      assert.deepEqual(after.ideas[0]!.assets, [{ recipe: "character-explainer-with-cast", status: "queued" }]);
    });
  });

  it("UPDATES an existing Asset in place (merge), leaving other Assets/fields untouched", async () => {
    const seed = {
      baseline: { note: "seed" },
      ideas: [
        {
          id: "idea-A",
          title: "A",
          status: "accepted",
          assets: [
            { recipe: "character-explainer-with-cast", status: "queued" },
            { recipe: "carousel", status: "produced" },
          ],
        },
      ],
    };
    await withLedger(seed, async (path) => {
      await writeAsset(
        "idea-A",
        "character-explainer-with-cast",
        { status: "in_production", pending_gate: "cast" },
        { ledgerPath: path },
      );
      const after = JSON.parse(await readFile(path, "utf8")) as {
        baseline: { note: string };
        ideas: Array<{ id: string; title: string; assets: Array<Record<string, unknown>> }>;
      };
      const a = after.ideas[0]!;
      assert.equal(a.assets.length, 2, "the unrelated carousel Asset must be preserved");
      const wired = a.assets.find((x) => x.recipe === "character-explainer-with-cast")!;
      assert.deepEqual(wired, { recipe: "character-explainer-with-cast", status: "in_production", pending_gate: "cast" });
      const carousel = a.assets.find((x) => x.recipe === "carousel")!;
      assert.deepEqual(carousel, { recipe: "carousel", status: "produced" });
      // unrelated fields preserved
      assert.equal(a.title, "A");
      assert.equal(after.baseline.note, "seed");
    });
  });

  it("leaves the ledger untouched for an unknown Idea", async () => {
    await withLedger({ ideas: [{ id: "idea-A", status: "accepted" }] }, async (path) => {
      await writeAsset("idea-ZZZ", "character-explainer-with-cast", { status: "queued" }, { ledgerPath: path });
      const after = JSON.parse(await readFile(path, "utf8")) as { ideas: Array<{ id: string; assets?: unknown }> };
      assert.equal(after.ideas[0]!.assets, undefined);
    });
  });

  it("normalizes an un-migrated Idea's legacy status/scalars onto assets[] BEFORE upserting", async () => {
    // Writing an Asset onto a not-yet-migrated Idea must not silently drop its legacy production data.
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast: [{ identifier: "c1", url: "https://x/1.png" }] }] };
    await withLedger(seed, async (path) => {
      await writeAsset("idea-A", "carousel", { status: "queued" }, { ledgerPath: path });
      const after = JSON.parse(await readFile(path, "utf8")) as {
        ideas: Array<{ id: string; status: string; assets: Array<Record<string, unknown>> }>;
      };
      const a = after.ideas[0]!;
      assert.equal(a.status, "accepted");
      assert.equal(a.assets.length, 2, "the legacy-folded Asset plus the newly-written one");
      const wired = a.assets.find((x) => x.recipe === "character-explainer-with-cast")!;
      assert.equal(wired.status, "in_production");
      const carousel = a.assets.find((x) => x.recipe === "carousel")!;
      assert.deepEqual(carousel, { recipe: "carousel", status: "queued" });
    });
  });
});
