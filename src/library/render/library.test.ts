import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderLibraryBody } from "./library.ts";
import { deriveFilterOptions } from "../filter-sort.ts";
import type { LibraryAssetRow, LibraryFilter } from "../types.ts";

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

describe("renderLibraryBody", () => {
  it("renders one table row per Asset, with the Idea title, hook type, theme, and a link to the Asset page", () => {
    const rows = [row({ assetId: "a1", ideaTitle: "AI shakeup", hookType: "irony" })];
    const options = deriveFilterOptions(rows);
    const html = renderLibraryBody(rows, options, {}, "performance", rows.length);
    assert.match(html, /AI shakeup/);
    assert.match(html, /irony/);
    assert.match(html, /href="\/assets\/a1"/);
  });

  it("shows a Performance Score as 'not yet tracked', never '0%', when undefined", () => {
    const rows = [row({ assetId: "a1" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /not yet tracked/);
  });

  it("shows a real Performance Score as a percentage", () => {
    const rows = [row({ assetId: "a1", bestPerformanceScore: 0.5 })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /50%/);
  });

  it("renders a friendly empty state when no rows match the filter, without throwing", () => {
    const html = renderLibraryBody([], { hookTypes: [], themes: [], recipes: [], formats: [] }, { hookType: "irony" } as LibraryFilter, "performance", 5);
    assert.match(html, /No Assets match this filter/);
  });

  it("states the filtered-vs-total count when a filter narrows the rows", () => {
    const rows = [row({ assetId: "a1" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), { hookType: "reframe" }, "performance", 5);
    assert.match(html, /1 of 5 Asset/);
  });

  it("never emits a <form method=\"post\">", () => {
    const rows = [row({ assetId: "a1" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.doesNotMatch(html.toLowerCase(), /method="post"/);
    assert.match(html, /method="get"/);
  });

  it("escapes an Idea title containing markup", () => {
    const rows = [row({ assetId: "a1", ideaTitle: `<script>alert(1)</script>` })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.doesNotMatch(html, /<script>alert/);
  });
});
