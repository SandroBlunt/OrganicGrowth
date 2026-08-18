/**
 * Tests for the Library screen's pure filter/sort logic (issue #210) — no database, no socket: plain
 * `LibraryAssetRow[]` fixtures in, plain arrays out.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyLibraryFilter, deriveFilterOptions, sortLibraryRows, topAssetsByPerformance } from "./filter-sort.ts";
import type { LibraryAssetRow } from "./types.ts";

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

describe("matchesLibraryFilter / applyLibraryFilter", () => {
  it("an empty filter matches every row", () => {
    const rows = [row({ assetId: "a" }), row({ assetId: "b", hookType: "irony" })];
    assert.equal(applyLibraryFilter(rows, {}).length, 2);
  });

  it("filters on hookType, theme, recipe, format, and status independently", () => {
    const rows = [
      row({ assetId: "a", hookType: "reframe", theme: "product_or_tool", recipeSlug: "news-carousel", formatSlug: "unhypped-news", status: "produced" }),
      row({ assetId: "b", hookType: "irony", theme: "safety_or_risk", recipeSlug: "character-explainer-with-cast", formatSlug: "other-format", status: "posted" }),
    ];
    assert.deepEqual(applyLibraryFilter(rows, { hookType: "irony" }).map((r) => r.assetId), ["b"]);
    assert.deepEqual(applyLibraryFilter(rows, { theme: "product_or_tool" }).map((r) => r.assetId), ["a"]);
    assert.deepEqual(applyLibraryFilter(rows, { recipe: "character-explainer-with-cast" }).map((r) => r.assetId), ["b"]);
    assert.deepEqual(applyLibraryFilter(rows, { format: "unhypped-news" }).map((r) => r.assetId), ["a"]);
    assert.deepEqual(applyLibraryFilter(rows, { status: "posted" }).map((r) => r.assetId), ["b"]);
  });

  it("combines several filter fields (AND, not OR)", () => {
    const rows = [
      row({ assetId: "a", hookType: "irony", theme: "safety_or_risk" }),
      row({ assetId: "b", hookType: "irony", theme: "product_or_tool" }),
    ];
    assert.deepEqual(applyLibraryFilter(rows, { hookType: "irony", theme: "safety_or_risk" }).map((r) => r.assetId), ["a"]);
  });

  it("a filter value present on no row returns []", () => {
    const rows = [row({ assetId: "a" })];
    assert.deepEqual(applyLibraryFilter(rows, { hookType: "irony" }), []);
  });
});

describe("deriveFilterOptions — only offers values actually present, never a fixed static list", () => {
  it("derives distinct, sorted hookTypes/themes/recipes/formats/statuses from the given rows", () => {
    const rows = [
      row({ assetId: "a", hookType: "reframe", theme: "product_or_tool", recipeSlug: "news-carousel", recipeName: "News Carousel", formatSlug: "unhypped-news", formatName: "Unhypped News", status: "produced" }),
      row({ assetId: "b", hookType: "irony", theme: "safety_or_risk", recipeSlug: "character-explainer-with-cast", recipeName: "Character Explainer with Cast", formatSlug: "unhypped-news", formatName: "Unhypped News", status: "posted" }),
    ];
    const options = deriveFilterOptions(rows);
    assert.deepEqual(options.hookTypes, ["irony", "reframe"]);
    assert.deepEqual(options.themes, ["product_or_tool", "safety_or_risk"]);
    assert.deepEqual(options.recipes, [
      { slug: "character-explainer-with-cast", name: "Character Explainer with Cast" },
      { slug: "news-carousel", name: "News Carousel" },
    ]);
    assert.deepEqual(options.formats, [{ slug: "unhypped-news", name: "Unhypped News" }]);
    assert.deepEqual(options.statuses, ["posted", "produced"]);
  });

  it("returns every field empty for an empty row set", () => {
    const options = deriveFilterOptions([]);
    assert.deepEqual(options, { hookTypes: [], themes: [], recipes: [], formats: [], statuses: [] });
  });
});

describe("sortLibraryRows — never fabricates a missing value as 0 (rule 8 applied to ordering)", () => {
  it("sort=performance: scored rows first, HIGH to LOW; unscored rows always last", () => {
    const rows = [
      row({ assetId: "unscored-1", ideaTitle: "Unscored One" }),
      row({ assetId: "low", ideaTitle: "Low", bestPerformanceScore: 0.3 }),
      row({ assetId: "high", ideaTitle: "High", bestPerformanceScore: 0.9 }),
      row({ assetId: "unscored-2", ideaTitle: "Unscored Two" }),
    ];
    const sorted = sortLibraryRows(rows, "performance");
    assert.deepEqual(sorted.map((r) => r.assetId), ["high", "low", "unscored-1", "unscored-2"]);
  });

  it("sort=performance: EVERY row tied at the same score stays in a stable, deterministic order (not left to chance)", () => {
    const rows = [
      row({ assetId: "z", ideaTitle: "Zeta", bestPerformanceScore: 0.5 }),
      row({ assetId: "a", ideaTitle: "Alpha", bestPerformanceScore: 0.5 }),
      row({ assetId: "m", ideaTitle: "Mid", bestPerformanceScore: 0.5 }),
    ];
    const sorted = sortLibraryRows(rows, "performance");
    // All tied at 0.5 -> falls through to the title tie-break, alphabetically.
    assert.deepEqual(sorted.map((r) => r.assetId), ["a", "m", "z"]);
    // Running it again produces the IDENTICAL order — no flicker across renders.
    assert.deepEqual(sortLibraryRows(rows, "performance").map((r) => r.assetId), ["a", "m", "z"]);
  });

  it("sort=fit: same missing-last behavior, keyed on fitScore", () => {
    const rows = [
      row({ assetId: "no-fit", ideaTitle: "No Fit" }),
      row({ assetId: "fit-hi", ideaTitle: "Fit Hi", fitScore: 0.8 }),
      row({ assetId: "fit-lo", ideaTitle: "Fit Lo", fitScore: 0.2 }),
    ];
    assert.deepEqual(sortLibraryRows(rows, "fit").map((r) => r.assetId), ["fit-hi", "fit-lo", "no-fit"]);
  });

  it("sort=produced: most recently produced first; never-produced last", () => {
    const rows = [
      row({ assetId: "never", ideaTitle: "Never" }),
      row({ assetId: "old", ideaTitle: "Old", producedAt: "2026-07-01T00:00:00.000Z" }),
      row({ assetId: "new", ideaTitle: "New", producedAt: "2026-08-01T00:00:00.000Z" }),
    ];
    assert.deepEqual(sortLibraryRows(rows, "produced").map((r) => r.assetId), ["new", "old", "never"]);
  });

  it("sort=title: plain alphabetical by Idea title", () => {
    const rows = [row({ assetId: "b", ideaTitle: "Banana" }), row({ assetId: "a", ideaTitle: "Apple" })];
    assert.deepEqual(sortLibraryRows(rows, "title").map((r) => r.assetId), ["a", "b"]);
  });

  it("never mutates the input array", () => {
    const rows = [row({ assetId: "b", ideaTitle: "Banana" }), row({ assetId: "a", ideaTitle: "Apple" })];
    const before = rows.map((r) => r.assetId);
    sortLibraryRows(rows, "title");
    assert.deepEqual(rows.map((r) => r.assetId), before);
  });
});

describe("topAssetsByPerformance — Question 1: 'the top 5 Assets by Performance Score'", () => {
  it("returns the top n SCORED assets, excluding unscored ones entirely (never padded)", () => {
    const rows = [
      row({ assetId: "s1", ideaTitle: "S1", bestPerformanceScore: 0.9 }),
      row({ assetId: "s2", ideaTitle: "S2", bestPerformanceScore: 0.7 }),
      row({ assetId: "unscored", ideaTitle: "Unscored" }),
    ];
    const top = topAssetsByPerformance(rows, 5);
    assert.deepEqual(top.map((r) => r.assetId), ["s1", "s2"]);
  });

  it("returns [] when nothing is scored yet — the real state of today's imported database", () => {
    const rows = [row({ assetId: "a" }), row({ assetId: "b" })];
    assert.deepEqual(topAssetsByPerformance(rows, 5), []);
  });

  it("every tied top score still resolves to a stable order", () => {
    const rows = [
      row({ assetId: "b", ideaTitle: "Bravo", bestPerformanceScore: 0.5 }),
      row({ assetId: "a", ideaTitle: "Alpha", bestPerformanceScore: 0.5 }),
    ];
    assert.deepEqual(topAssetsByPerformance(rows, 5).map((r) => r.assetId), ["a", "b"]);
  });
});
