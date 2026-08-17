import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderTopBody } from "./top.ts";
import type { LibraryAssetRow, TopAssetEntry } from "../types.ts";

function row(overrides: Partial<LibraryAssetRow> & { readonly assetId: string }): LibraryAssetRow {
  return {
    ideaId: `idea-${overrides.assetId}`,
    ideaTitle: overrides.assetId,
    hookType: "reframe",
    theme: "product_or_tool",
    recipeSlug: "news-carousel",
    recipeName: "News Carousel",
    formatSlug: "unhypped-news",
    formatName: "Unhypped News",
    brandSlug: "straw-motion",
    brandName: "Straw Motion",
    status: "produced",
    hasSpec: true,
    mediaCount: 7,
    posts: [],
    ...overrides,
  };
}

describe("renderTopBody — Question 1: top 5 by Performance Score, Specs side by side", () => {
  it("says nothing is scored yet, for an empty entry list — today's real corpus", () => {
    const html = renderTopBody([], 0);
    assert.match(html, /No Asset has a Performance Score yet/);
  });

  it("renders one spec-grid column per Asset, each with its own Production Spec printed", () => {
    const entries: TopAssetEntry[] = [
      { row: row({ assetId: "a1", ideaTitle: "Winner", bestPerformanceScore: 0.9 }), spec: { slides: [{ role: "hook" }] } },
      { row: row({ assetId: "a2", ideaTitle: "Runner up", bestPerformanceScore: 0.7 }), spec: null },
    ];
    const html = renderTopBody(entries, 2);
    assert.match(html, /Winner/);
    assert.match(html, /Runner up/);
    assert.match(html, /&quot;role&quot;: &quot;hook&quot;/);
    assert.match(html, /No Production Spec saved/);
    assert.equal((html.match(/class="spec-col"/g) ?? []).length, 2);
  });

  it("states plainly when fewer than 5 are shown, never padding to look like five", () => {
    const entries: TopAssetEntry[] = [{ row: row({ assetId: "a1", bestPerformanceScore: 0.9 }), spec: null }];
    const html = renderTopBody(entries, 1);
    assert.match(html, /Only 1 of a possible 5 shown/);
  });
});
